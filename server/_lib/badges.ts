// Insignele sportivului: calculate din tot istoricul de la începutul planului, salvate odată câștigate.
import { insertIgnore, select, update } from './db.js';
import { applyOverrides, loadOverrides, loadPlan } from './collect.js';
import { dedupeActivities } from '../../src/collector/packet.js';
import { computeBadges, type BadgesResult } from '../../src/badges/badges.js';
import type { SourceActivity } from '../../src/collector/types.js';
import { addDays } from '../../src/util/dates.js';

export interface MeBadges extends BadgesResult {
  /** Câștigate și încă neanunțate pe Acasă. */
  fresh: string[];
}

interface Row {
  id: string;
  source: SourceActivity['source'];
  external_id: string;
  date: string;
  start_local: string | null;
  sport: SourceActivity['sport'];
  minutes: number;
  distance_km: number | string | null;
  avg_hr: number | null;
  time_in_zones_min: SourceActivity['timeInZonesMin'] | null;
  name: string | null;
}

export async function loadBadges(userId: string, today: string, o: { goal: string | null; planStart: string | null; raceDate: string | null; evaluationWeeks?: number | null; age: number | null; zonesTested: boolean; efficiencyPct: number[] }): Promise<MeBadges | null> {
  const since = o.planStart ?? addDays(today, -365);
  const [rows, ov, plan, red, mornings, evenings, stored] = await Promise.all([
    select<Row>('activities', { user_id: `eq.${userId}`, date: `gte.${since}` }, { select: 'id,source,external_id,date,start_local,sport,minutes,distance_km,avg_hr,time_in_zones_min,name', order: 'date.desc', limit: 3000 }),
    loadOverrides(userId),
    loadPlan(userId, since, o.raceDate ?? today),
    select<{ date: string }>('readiness_daily', { user_id: `eq.${userId}`, verdict: 'in.(rosu,stop)', date: `gte.${since}` }, { select: 'date', limit: 1000 }),
    select<{ for_date: string }>('questionnaires', { user_id: `eq.${userId}`, kind: 'eq.dimineata', for_date: `gte.${since}` }, { select: 'for_date', limit: 1000 }),
    select<{ activity_id: string | null; answers: { tip_neplanificat?: string | null } }>('questionnaires', { user_id: `eq.${userId}`, kind: 'eq.seara', for_date: `gte.${since}` }, { select: 'activity_id,answers', limit: 1000 }),
    select<{ badge_id: string; earned_at: string; seen: boolean }>('badges_earned', { user_id: `eq.${userId}` }, { limit: 500 }).catch(() => null),
  ]);
  const acts = dedupeActivities(
    applyOverrides(
      rows.map((r) => ({ id: r.id, source: r.source, externalId: r.external_id, date: r.date, startLocal: r.start_local, sport: r.sport, minutes: r.minutes, distanceKm: r.distance_km == null ? null : Number(r.distance_km), avgHr: r.avg_hr, timeInZonesMin: r.time_in_zones_min, name: r.name })),
      ov,
    ),
  );
  const raceIds = evenings.filter((e) => e.answers?.tip_neplanificat === 'cursa' && e.activity_id).map((e) => e.activity_id!);
  const result = computeBadges({
    today,
    goal: o.goal,
    planStart: o.planStart,
    raceDate: o.raceDate,
    recoveryEvery: o.age != null && o.age >= 40 ? 3 : 4,
    evaluationWeeks: o.evaluationWeeks ?? null,
    plan: plan.workouts,
    acts,
    redDays: red.map((r) => r.date),
    morningDays: mornings.map((m) => m.for_date),
    raceActivityIds: acts.filter((a) => raceIds.includes(a.id) || raceIds.includes(a.externalId)).map((a) => a.id),
    zonesTested: o.zonesTested,
    efficiencyPct: o.efficiencyPct,
  });

  // Odată câștigată, insigna rămâne: ce e salvat bate calculul de acum.
  // Tabelul lipsește (actualizarea bazei n-a rulat încă): insignele se arată oricum, doar nu se salvează.
  const have = new Map((stored ?? []).map((s) => [s.badge_id, s]));
  const newly = result.badges.filter((b) => b.earnedAt && !have.has(b.id));
  if (newly.length && stored !== null) {
    const rowsIn = await insertIgnore<{ badge_id: string; earned_at: string; seen: boolean }>('badges_earned', newly.map((b) => ({ user_id: userId, badge_id: b.id, earned_at: b.earnedAt, seen: false })), 'user_id,badge_id').catch(() => []);
    for (const r of rowsIn) have.set(r.badge_id, r);
  }
  const badges = result.badges.map((b) => {
    const s = have.get(b.id);
    return s ? { ...b, earnedAt: s.earned_at, progress: { ...b.progress, have: b.progress.target } } : b;
  });
  const fresh = [...have.values()].filter((s) => !s.seen).map((s) => s.badge_id);
  return { ...result, badges, fresh };
}

export async function markBadgesSeen(userId: string): Promise<void> {
  await update('badges_earned', { user_id: `eq.${userId}`, seen: 'eq.false' }, { seen: true });
}
