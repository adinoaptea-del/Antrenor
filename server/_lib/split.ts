// Bărbații: forța viitoare trece la Push / Pull / Picioare (src/strength/split-upgrade.ts), și pe planurile vechi.
// Rulează la deschiderea aplicației (me.ts) și dimineața înaintea agenților, ca mesajul să descrie aceeași ședință.
import { one, upsert } from './db.js';
import { loadPlan, toWorkoutRow } from './collect.js';
import { upgradeToSplit } from '../../src/strength/split-upgrade.js';
import { strengthSpecFor } from '../../src/strength/plan-specs.js';
import { addDays } from '../../src/util/dates.js';
import type { PlannedWorkout } from '../../src/types.js';

export async function isMale(userId: string, sex?: string | null): Promise<boolean> {
  if (sex) return sex === 'm';
  const u = await one<{ sex: string | null }>('users', { id: `eq.${userId}` }, { select: 'sex' }).catch(() => null);
  if (u?.sex) return u.sex === 'm';
  const q = await one<{ answers: { sex?: string } }>('questionnaires', { user_id: `eq.${userId}`, kind: 'eq.intrare' }, { order: 'created_at.desc' }).catch(() => null);
  return q?.answers?.sex === 'm';
}

/** Schimbă și salvează ședințele; întoarce planul cu ele aplicate (sau neschimbat). */
export async function ensureSplit(userId: string, today: string, loaded?: { planId: string | null; workouts: PlannedWorkout[] }, sex?: string | null): Promise<PlannedWorkout[]> {
  const p = loaded ?? (await loadPlan(userId, addDays(today, -28), addDays(today, 400)));
  if (!p.planId || !(await isMale(userId, sex))) return p.workouts;
  const plan = await one<{ start_date: string; race_date: string }>('plans', { id: `eq.${p.planId}` }, { select: 'start_date,race_date' }).catch(() => null);
  const up = upgradeToSplit(p.workouts, today, (w) => strengthSpecFor(p.workouts, w, plan?.start_date ?? null, plan?.race_date ?? null));
  if (!up.length) return p.workouts;
  await upsert('workouts_planned', up.map((w) => toWorkoutRow(w, userId, p.planId!)), 'id');
  const byId = new Map(up.map((w) => [w.id, w]));
  return p.workouts.map((w) => byId.get(w.id) ?? w);
}
