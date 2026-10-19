// Planurile deja salvate ale bărbaților: ședințele de forță viitoare „Tot corpul A/B” sau „Push A / Pull A / Legs A…”
// trec la Push → Pull → Picioare cu exerciții care se schimbă (cerința proprietarului, 19.10.2026). Trecutul nu se
// rescrie; ziua, durata din calendar, blocul și săptămâna rămân. Picioarele nu cad în ajunul unei ședințe-cheie și
// deloc în ultimele zile dinaintea cursei (ședința avea deja „fără picioare”).

import type { PlannedWorkout } from '../types.js';
import { addDays, weekStart } from '../util/dates.js';
import { FitnessRotator, LEGACY_FIT, MIN_STRENGTH_MINUTES, isFitnessSession, isSplitSession, isWideSession, newSplitState, nextSplit, parseStrength, prescribe, strengthStructure, type StrengthSpec } from './ppl.js';

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

/**
 * Regulile de forță din 19.10.2026, aplicate și planurilor deja salvate (doar viitorul, ziua rămâne):
 *  - nicio ședință sub 45 de minute (durata = prescripția nouă, 3–4 serii pe exercițiu);
 *  - fitness: ședințele vechi care combinau picioarele cu partea de sus (F1/F2, A3/B3/C3) trec la rotația nouă,
 *    picioare / partea de sus alternativ (aceeași ordine ca generatorul);
 *  - numele vechi („Tot corpul A/B”) se rescriu cu ședința de acum (picioare și trunchi / partea de sus și trunchi).
 * Întoarce doar ședințele schimbate (copii).
 */
export function upgradeStrengthRules(plan: PlannedWorkout[], today: string, goal?: string | null): PlannedWorkout[] {
  const future = plan
    .filter((w) => w.type === 'forta' && active(w) && w.date >= today)
    .map((w) => ({ w, spec: parseStrength(w.structure) }))
    .filter((x): x is { w: PlannedWorkout; spec: StrengthSpec } => !!x.spec)
    .sort((a, b) => (a.w.date < b.w.date ? -1 : 1));
  const legacy = future.some((x) => x.spec.session in LEGACY_FIT);
  const rot = new FitnessRotator();
  const byWeek = new Map<string, number>();
  for (const x of future) byWeek.set(weekStart(x.w.date), (byWeek.get(weekStart(x.w.date)) ?? 0) + (isFitnessSession(x.spec.session) && !isWideSession(x.spec.session) ? 1 : 0));
  let curWeek = '';
  let queue: { session: StrengthSpec['session']; variant?: number }[] = [];
  const out: PlannedWorkout[] = [];
  for (const { w, spec } of future) {
    let s2: StrengthSpec = spec;
    if (legacy && isFitnessSession(spec.session) && !isWideSession(spec.session)) {
      const ws = weekStart(w.date);
      if (ws !== curWeek) {
        curWeek = ws;
        queue = rot.week(byWeek.get(ws) ?? 1);
      }
      const n = queue.shift();
      s2 = n ? { ...spec, session: n.session, ...(n.variant != null ? { variant: n.variant } : {}) } : spec;
    }
    // Slăbire: ședința începe cu mers pe bandă înclinată (regula 25); restul obiectivelor, fără schimbare.
    if (goal === 'fit-slabire' && isFitnessSession(s2.session) && !s2.opener) s2 = { ...s2, opener: 'slabire' };
    const structure = strengthStructure(s2);
    const minutes = prescribe(s2, Math.max(MIN_STRENGTH_MINUTES, w.plannedMinutes)).minutes;
    if (structure !== w.structure || minutes !== w.plannedMinutes) out.push({ ...w, structure, plannedMinutes: minutes });
  }
  return out;
}
