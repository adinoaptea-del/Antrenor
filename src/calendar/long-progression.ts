// Auditul v93, A30 (regula 7: progresia urmează execuțiile). Ieșirea / tura lungă din generator e intenția; dacă ultima
// lungă din același sport n-a fost bine tolerată (roșu/portocaliu, durere ≥ 3, sau nefăcută/parțială din oboseală,
// durere, boală), următoarea lungă nu crește peste ea: rămâne la aceeași durată („keep”), cu motivul scris.
// Fără date (fără scor, fără formular) nu se schimbă nimic: lipsa feedbackului nu e nici toleranță, nici eșec.
// Nu coboară sub ce s-a planificat la lunga ratată și nici sub podeaua demonstrată (regula 30): doar oprește creșterea.
import type { PlannedWorkout } from '../types.js';
import type { Execution } from './progression.js';
import { withOriginal } from './actions.js';
import { fitStructure } from './validate.js';

const NOT_TOLERATED = new Set(['oboseala', 'durere', 'boala']);

export function notTolerated(e: Execution): boolean {
  if (e.outcome && NOT_TOLERATED.has(e.outcome.motiv)) return true;
  if (e.pain != null && e.pain >= 3) return true;
  return e.color === 'rosu' || e.color === 'portocaliu';
}

export function holdLongAfterPoorExecution(plan: PlannedWorkout[], executions: Execution[], today: string, at: string): PlannedWorkout[] {
  const exOf = new Map(executions.map((e) => [e.workoutId, e]));
  const out: PlannedWorkout[] = [];
  for (const sport of ['alergare', 'bicicleta'] as const) {
    const longs = plan.filter((w) => w.sport === sport && w.type === 'lung');
    const last = longs.filter((w) => w.date < today && exOf.has(w.id)).sort((a, b) => (a.date < b.date ? 1 : -1))[0];
    if (!last || !notTolerated(exOf.get(last.id)!)) continue;
    const next = longs.filter((w) => w.date >= today && (w.status === 'planificat' || w.status === 'mutat')).sort((a, b) => (a.date < b.date ? -1 : 1))[0];
    if (!next || next.plannedMinutes <= last.plannedMinutes || next.note) continue;
    out.push(withOriginal(next, fitStructure({ ...next, plannedMinutes: last.plannedMinutes, note: `rămâne la ${last.plannedMinutes} min: lunga din ${last.date} n-a fost bine tolerată (crește după una tolerată)` }), at));
  }
  return out;
}
