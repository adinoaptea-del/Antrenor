// Scorul pe culori și bara de pregătire, recalculate după fiecare sincronizare și după fiecare chestionar de seară.
import type { Goal } from '../../src/calendar/phases.js';
import { select, upsert } from './db.js';
import { loadActivities, loadForms, loadPlan, loadZones } from './collect.js';
import { matchActivities } from '../../src/scoring/match.js';
import { scoreMatches, type ScoreFlags, type ScoreMetrics } from '../../src/scoring/score.js';
import { computeBar, type BarResult, type ScoredActivity } from '../../src/bar/bar.js';
import { dedupeActivities } from '../../src/collector/packet.js';
import type { EveningForm, StoredScore } from '../../src/collector/types.js';
import type { Activity, Color } from '../../src/types.js';
import { addDays } from '../../src/util/dates.js';

export interface ScoreSummary {
  scored: number;
  unplanned: string[];
  bar: BarResult | null;
}

/** Potrivește activitățile cu antrenamentele propuse din ultimele 42 de zile, scrie scorurile și bara zilei. */
export async function rescore(userId: string, today: string, goal: Goal): Promise<ScoreSummary> {
  const from = addDays(today, -42);
  const [{ workouts }, acts, forms, zones] = await Promise.all([loadPlan(userId, from, today), loadActivities(userId, from), loadForms(userId, today), loadZones(userId)]);
  const activities: Activity[] = dedupeActivities(acts);
  const planned = workouts.filter((w) => w.status !== 'sters');
  const { matches, unplanned } = matchActivities(planned, activities, today);

  const colors = new Map<string, Color>();
  // O singură funcție de scor (src/scoring/score.ts scoreMatches), aceeași ca în pachetul AI: formularul de seară cu
  // motivul scurtării, compensarea în aceeași zi (auditul v93, T51).
  const rows = scoreMatches(matches, forms.evenings, today).map((m) => {
    const r = m.result;
    colors.set(m.planned.id, r.color);
    return {
      workout_id: m.planned.id,
      user_id: userId,
      activity_id: m.activity?.id ?? null,
      extra_activity_id: m.extraActivity?.id ?? null,
      color: r.color,
      reasons: r.reasons,
      // Evaluarea (făcut / conform scopului / bine tolerat) stă lângă metrice, fără coloană nouă în tabel.
      metrics: { ...r.metrics, evaluare: r.evaluare ?? null },
      flags: r.flags,
      is_final: r.final,
      scored_at: new Date().toISOString(),
    };
  });
  if (rows.length) await upsert('scores', rows, 'workout_id');

  // Bara: activitățile cu culoarea antrenamentului de care s-au legat; neplanificatele sunt albastre.
  const activityColor = new Map<string, Color>();
  for (const m of matches) {
    if (m.activity) activityColor.set(m.activity.id, colors.get(m.planned.id) ?? 'asteptare');
    if (m.extraActivity) activityColor.set(m.extraActivity.id, colors.get(m.planned.id) ?? 'asteptare');
  }
  const scored: ScoredActivity[] = activities.map((a) => ({ ...a, color: activityColor.get(a.id) ?? 'albastru' }));
  const last4 = planned.filter((w) => w.date >= addDays(today, -28) && w.date < today).map((w) => colors.get(w.id) ?? 'rosu');
  const openFlags = await openFlagsFor(userId, today);
  const bar = computeBar({ today, activities: scored, plannedColorsLast4Weeks: last4, cssSecPer100m: zones?.inot.css ?? null, ctl: null, ctlTarget: null, openFlags, goal });
  await upsert('bar_daily', { user_id: userId, date: today, total: bar.total, blocked: bar.blocked, basis: bar.basis, components: bar.components }, 'user_id,date');
  return { scored: rows.length, unplanned: unplanned.map((a) => a.id), bar };
}

/** Scorurile salvate, pe ședință: pachetul AI le citește pe acestea, nu recalculează altă culoare (auditul v93, T51). */
export async function loadStoredScores(userId: string): Promise<Record<string, StoredScore>> {
  const rows = await select<{ workout_id: string; activity_id: string | null; color: Color; reasons: string[]; metrics: (ScoreMetrics & { evaluare?: StoredScore['evaluare'] }) | null; flags: ScoreFlags }>(
    'scores',
    { user_id: `eq.${userId}` },
    { select: 'workout_id,activity_id,color,reasons,metrics,flags', order: 'scored_at.desc', limit: 400 },
  ).catch(() => []);
  const out: Record<string, StoredScore> = {};
  for (const r of rows) {
    if (!r.metrics) continue;
    const { evaluare, ...metrics } = r.metrics;
    out[r.workout_id] = { activityId: r.activity_id, color: r.color, reasons: r.reasons, metrics, flags: r.flags, evaluare: evaluare ?? null };
  }
  return out;
}

/** Semnale deschise care blochează bara: durere ≥ 5 netratată în ultimele 7 zile, febră azi. */
async function openFlagsFor(userId: string, today: string): Promise<string[]> {
  const flags: string[] = [];
  const evenings = await select<{ answers: EveningForm }>('questionnaires', { user_id: `eq.${userId}`, kind: 'eq.seara', for_date: `gte.${addDays(today, -7)}` }, { limit: 50 });
  if (evenings.some((e) => (e.answers.durere.scor ?? 0) >= 5)) flags.push('durere ≥ 5 în ultimele 7 zile, de văzut de fizioterapeut');
  const morning = await select<{ answers: { semnale: { febra: boolean | null } } }>('questionnaires', { user_id: `eq.${userId}`, kind: 'eq.dimineata', for_date: `eq.${today}` }, { limit: 1 });
  if (morning[0]?.answers.semnale.febra) flags.push('febră azi');
  return flags;
}
