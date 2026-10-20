// Migrările planului (auditul v93, A23; decizia proprietarului 20.10.2026): o regulă nouă se aplică planului activ
// O SINGURĂ DATĂ, explicit, versionat și jurnalizat — nu la fiecare deschidere a aplicației. Refresh-ul, login-ul sau
// schimbarea ecranului nu mai modifică ședințele. Cheia: „nume-vN@planId”; un plan nou e generat direct cu regulile curente.
import { insert, upsert } from './db.js';
import { loadPrefs, savePrefs } from './prefs.js';
import { toWorkoutRow } from './collect.js';
import type { PlannedWorkout } from '../../src/types.js';

export const MIGRATIONS = {
  /** Ce a tăiat regula veche „efort în plus” revine în plan, cu sugestie (regula 29). */
  restoreExtraCuts: 'restaurare-taieri-v1',
  /** Ședințele ușoare viitoare urcă la ce a demonstrat sportivul (regula 30). */
  raiseDemonstrated: 'podea-demonstrat-v1',
  /** Forța: PPL la bărbați și regulile de 45 min / 3–4 serii (regula 20). */
  strengthSplit: 'forta-split-v2',
} as const;

/**
 * Rulează `fn` o singură dată pe planul dat. `fn` întoarce ședințele schimbate; se salvează, se notează în jurnal și
 * se marchează migrarea. Întoarce planul cu schimbările aplicate (sau neschimbat dacă migrarea a rulat deja).
 */
export async function runOnce(userId: string, planId: string | null, today: string, name: string, plan: PlannedWorkout[], fn: (plan: PlannedWorkout[]) => PlannedWorkout[] | Promise<PlannedWorkout[]>): Promise<PlannedWorkout[]> {
  if (!planId) return plan;
  const prefs = await loadPrefs(userId);
  const key = `${name}@${planId}`;
  if (prefs.migrari?.[key]) return plan;
  const changed = await fn(plan);
  if (changed.length) await upsert('workouts_planned', changed.map((w) => toWorkoutRow(w, userId, planId)), 'id');
  await savePrefs(userId, { ...prefs, migrari: { ...(prefs.migrari ?? {}), [key]: today } });
  if (changed.length) await insert('journal', { user_id: userId, date: today, entry: `migrare ${name}: ${changed.length} ședințe actualizate o singură dată` }).catch(() => undefined);
  const byId = new Map(changed.map((w) => [w.id, w]));
  return plan.map((w) => byId.get(w.id) ?? w);
}
