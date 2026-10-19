// Bărbații: forța viitoare trece la Push / Pull / Picioare (src/strength/split-upgrade.ts), și pe planurile vechi.
// Rulează la deschiderea aplicației (me.ts) și dimineața înaintea agenților, ca mesajul să descrie aceeași ședință.
import { one, upsert } from './db.js';
import { loadPlan, toWorkoutRow } from './collect.js';
import { upgradeStrengthRules, upgradeToSplit } from '../../src/strength/split-upgrade.js';
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
  if (!p.planId) return p.workouts;
  let workouts = p.workouts;
  const changed = new Map<string, PlannedWorkout>();
  if (await isMale(userId, sex)) {
    const plan = await one<{ start_date: string; race_date: string }>('plans', { id: `eq.${p.planId}` }, { select: 'start_date,race_date' }).catch(() => null);
    for (const w of upgradeToSplit(workouts, today, (x) => strengthSpecFor(workouts, x, plan?.start_date ?? null, plan?.race_date ?? null))) changed.set(w.id, w);
    workouts = workouts.map((w) => changed.get(w.id) ?? w);
  }
  // Regulile de forță (19.10.2026): minimum 45 de minute, 3–4 serii, fără picioare + partea de sus în aceeași ședință.
  for (const w of upgradeStrengthRules(workouts, today)) changed.set(w.id, w);
  if (!changed.size) return p.workouts;
  await upsert('workouts_planned', [...changed.values()].map((w) => toWorkoutRow(w, userId, p.planId!)), 'id');
  return p.workouts.map((w) => changed.get(w.id) ?? w);
}
