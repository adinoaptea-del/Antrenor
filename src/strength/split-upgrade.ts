// Planurile deja salvate ale bărbaților: ședințele de forță viitoare „Tot corpul A/B” sau „Push A / Pull A / Legs A…”
// trec la Push → Pull → Picioare cu exerciții care se schimbă (cerința proprietarului, 19.10.2026). Trecutul nu se
// rescrie; ziua, durata din calendar, blocul și săptămâna rămân. Picioarele nu cad în ajunul unei ședințe-cheie și
// deloc în ultimele zile dinaintea cursei (ședința avea deja „fără picioare”).

import type { PlannedWorkout } from '../types.js';
import { addDays } from '../util/dates.js';
import { isFitnessSession, isSplitSession, newSplitState, nextSplit, parseStrength, strengthStructure, type StrengthSpec } from './ppl.js';

const active = (w: PlannedWorkout) => w.status === 'planificat' || w.status === 'mutat';

/** Ședințele schimbate (copii), în ordinea datelor; gol dacă nu e nimic de schimbat. */
/**
 * `resolve`: pentru planurile vechi al căror text nu se poate citi („Push 1 · …”, „forță”), blocul și săptămâna se
 * recalculează cu aceeași regulă ca generatorul (plan-specs.ts); fără el, acele ședințe ar rămâne „tot corpul”.
 */
export function upgradeToSplit(plan: PlannedWorkout[], today: string, resolve?: (w: PlannedWorkout) => StrengthSpec | null): PlannedWorkout[] {
  const strength = plan
    .filter((w) => w.type === 'forta' && active(w) && w.date >= today)
    .map((w) => ({ w, spec: parseStrength(w.structure) ?? resolve?.(w) ?? null }))
    .filter((x): x is { w: PlannedWorkout; spec: NonNullable<typeof x.spec> } => !!x.spec && !isFitnessSession(x.spec.session))
    .sort((a, b) => (a.w.date < b.w.date ? -1 : 1));
  if (!strength.length || strength.every((x) => isSplitSession(x.spec.session))) return [];
  const keyDates = new Set(plan.filter((w) => w.key && active(w)).map((w) => w.date));
  const st = newSplitState();
  return strength.map(({ w, spec }) => {
    const nearRace = spec.legs === 'fara';
    const n = nextSplit(st, keyDates.has(addDays(w.date, 1)) || spec.legs === 'usor', nearRace);
    return { ...w, structure: strengthStructure({ ...spec, session: n.session, variant: n.variant, legs: nearRace ? 'fara' : 'normal' }) };
  });
}
