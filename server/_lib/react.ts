// Reacția calendarului la fiecare activitate nouă, imediat după sincronizare (cron la 15 min, buton, webhook),
// fără să aștepte agenții de seară. Determinist și o singură dată pe activitate (cheile din agent_events).
//  - ceva în plus față de plan azi (activitate neplanificată sau mult peste ședința ei): efortul se echivalează (TRIMP)
//    cu ziua planificată; dacă a acoperit-o, restul zilei odihnă. Dacă nu, variantele le aleg agenții (mesajul de
//    după antrenament), dintre cele calculate de cod. Zilele următoare NU se ușurează din prima: decid datele de dimineață;
//  - cursă neplanificată: săptămâna următoare nu progresează.
// Agenții (mesajul după antrenament) rulează separat, din cron, când apare o activitate nouă azi.

import { addDays } from '../../src/util/dates.js';
import { dedupeActivities } from '../../src/collector/packet.js';
import type { Execution } from '../../src/calendar/progression.js';
import type { Color } from '../../src/types.js';
import { matchActivities } from '../../src/scoring/match.js';
import { activitySlot, type AdaptEvent } from '../../src/calendar/adapt.js';
import { detectReturn } from '../../src/calendar/pause.js';
import { extraOn } from '../../src/calendar/load.js';
import { loadActivities, loadForms, loadPlan, loadUser } from './collect.js';
import { todayIn } from './auth.js';
import { applyPlanEvents } from './agents.js';
import { select } from './db.js';

export interface Reaction {
  changes: string[];
  /** Activitățile de azi (≥ 20 min) văzute acum: pentru mesajul antrenorului după antrenament. */
  todayIds: string[];
  /** Chei stabile (zi + sport) ale activităților de azi, pentru un singur mesaj pe activitate. */
  todayKeys: string[];
}

export async function reactToActivities(userId: string, today: string): Promise<Reaction> {
  const from = addDays(today, -1);
  const [{ planId, workouts }, rawLong, forms] = await Promise.all([loadPlan(userId, addDays(today, -7), addDays(today, 21)), loadActivities(userId, addDays(today, -80)), loadForms(userId, today)]);
  const all = dedupeActivities(rawLong);
  const acts = all.filter((a) => a.date >= from && a.date <= today);
  const todayIds = acts.filter((a) => a.date === today && a.minutes >= 20).map((a) => a.id);
  const todayKeys = acts.filter((a) => a.date === today && a.minutes >= 20).map((a) => activitySlot(a));
  if (!planId || !acts.length) return { changes: [], todayIds, todayKeys };

  const m = matchActivities(workouts.filter((w) => w.date >= addDays(today, -3) && w.date <= today), acts, today);
  const matchedIds = new Set(m.matches.flatMap((x) => [x.activity?.id, x.extraActivity?.id]).filter(Boolean) as string[]);
  const done = m.matches.filter((x) => x.activity).map((x) => x.planned.id);
  const formOf = (id: string, ext: string) => forms.evenings.find((e) => e.activityId === id || e.activityId === ext) ?? null;

  const events: AdaptEvent[] = [];
  // Prima activitate după o pauză lungă: două săptămâni de revenire, înaintea oricărei alte reguli.
  const back = detectReturn(all, today);
  if (back) events.push({ kind: 'revenire', date: today, zile: back.zile, dela: back.dela });
  for (const a of acts) {
    const f = formOf(a.id, a.externalId);
    const rpe = f?.rpe ?? null;
    const planned = matchedIds.has(a.id);
    if (!planned && a.minutes >= 30 && f?.tip_neplanificat === 'cursa') {
      events.push({ kind: 'neplanificat', activity: a, rpe, tip: 'cursa' });
    }
  }
  // Echivalarea zilei de azi (efort, nu minute). „Altceva” (plimbare, joacă) nu intră.
  const withRpe = all
    .filter((a) => formOf(a.id, a.externalId)?.tip_neplanificat !== 'altceva')
    .map((a) => ({ ...a, rpe: formOf(a.id, a.externalId)?.rpe ?? null }));
  const { extra, coverage } = extraOn(today, workouts, withRpe);
  if (extra && coverage.stare === 'acoperit') events.push({ kind: 'acoperit', date: today, facut: coverage.facut, planificat: coverage.planificat });
  const changes = events.length ? await applyPlanEvents(userId, today, planId, workouts, events, done) : [];
  return { changes, todayIds, todayKeys };
}

/** Pentru webhook-uri: ziua în fusul sportivului, fără să oprească răspunsul la eroare. */
export async function reactNow(userId: string): Promise<void> {
  try {
    const u = await loadUser(userId);
    await reactToActivities(userId, todayIn(u.tz || 'Europe/Bucharest'));
  } catch (e) {
    console.error('react', e instanceof Error ? e.message : e);
  }
}

/**
 * Dimineața: ședințele de sală de ieri (fitness) fără activitate și fără marcaj „făcut” în jurnalul de forță sunt
 * ratate: rotația continuă de unde a rămas (src/calendar/adapt.ts, „forta-ratat”), o singură dată pe ședință.
 */
export async function missedStrength(userId: string, today: string): Promise<string[]> {
  const y = addDays(today, -1);
  const { planId, workouts } = await loadPlan(userId, addDays(today, -7), addDays(today, 7));
  if (!planId) return [];
  const yesterday = workouts.filter((w) => w.date === y && w.type === 'forta' && (w.status === 'planificat' || w.status === 'mutat'));
  if (!yesterday.length) return [];
  const acts = dedupeActivities(await loadActivities(userId, addDays(today, -3)));
  const logged = await select<{ date: string }>('strength_log', { user_id: `eq.${userId}`, date: `eq.${y}` }, { select: 'date', limit: 1 }).catch(() => []);
  if (logged.length || acts.some((a) => a.date === y && a.sport === 'forta')) return [];
  return applyPlanEvents(userId, today, planId, workouts, yesterday.map((w) => ({ kind: 'forta-ratat' as const, workoutId: w.id })));
}

/**
 * Dimineața: treptele modulelor (T1→T2, V10a→V10, sweet spot, seturi CSS) se aleg din execuții (auditul v2, V2-05):
 * scorul ședinței, efortul și durerea din formularul de seară, scurtarea pentru timp. Fără date = fără progres.
 */
export async function moduleProgression(userId: string, today: string): Promise<string[]> {
  const { planId, workouts } = await loadPlan(userId, addDays(today, -42), addDays(today, 14));
  if (!planId) return [];
  const [scores, forms, raw, outs] = await Promise.all([
    select<{ workout_id: string; color: Color }>('scores', { user_id: `eq.${userId}` }, { select: 'workout_id,color', limit: 400 }).catch(() => []),
    loadForms(userId, today),
    loadActivities(userId, addDays(today, -42)),
    // Ședințele declarate nefăcute / parțiale, cu motiv (schema 8; pe o schemă veche lista e goală).
    select<{ workout_id: string; status: 'ratat' | 'partial'; motiv: 'timp' | 'oboseala' | 'durere' | 'boala' | 'altul' }>('workout_outcomes', { user_id: `eq.${userId}`, date: `gte.${addDays(today, -42)}` }, { select: 'workout_id,status,motiv', limit: 200 }).catch(() => []),
  ]);
  const outcome = new Map(outs.map((o) => [o.workout_id, { status: o.status, motiv: o.motiv }]));
  const acts = dedupeActivities(raw);
  const m = matchActivities(workouts.filter((w) => w.date < today), acts, today);
  const actOf = new Map(m.matches.filter((x) => x.activity).map((x) => [x.planned.id, x.activity!]));
  const color = new Map(scores.map((r) => [r.workout_id, r.color]));
  const executions: Execution[] = workouts
    .filter((w) => w.date < today)
    .map((w) => {
      const a = actOf.get(w.id);
      const ev = forms.evenings.find((e) => e.activityId === `plan-${w.id}` || (a && (e.activityId === a.id || e.activityId === (a as { externalId?: string }).externalId)));
      return { workoutId: w.id, color: color.get(w.id) ?? null, rpe: ev?.rpe ?? null, pain: ev?.durere?.scor ?? null, shortenedForTime: /^scurtat la cererea ta/.test(w.note ?? '') || outcome.get(w.id)?.motiv === 'timp', outcome: outcome.get(w.id) ?? null };
    });
  return applyPlanEvents(userId, today, planId, workouts, [{ kind: 'trepte', date: today }], undefined, executions);
}
