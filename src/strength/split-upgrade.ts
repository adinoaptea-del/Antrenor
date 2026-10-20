// Planurile deja salvate ale bărbaților: ședințele de forță viitoare „Tot corpul A/B” sau „Push A / Pull A / Legs A…”
// trec la Push → Pull → Picioare cu exerciții care se schimbă (cerința proprietarului, 19.10.2026). Trecutul nu se
// rescrie; ziua, durata din calendar, blocul și săptămâna rămân. Picioarele nu cad în ajunul unei ședințe-cheie și
// deloc în ultimele zile dinaintea cursei (ședința avea deja „fără picioare”).

import type { PlannedWorkout } from '../types.js';
import { addDays, weekStart } from '../util/dates.js';
import { FitnessRotator, LEGACY_FIT, MIN_STRENGTH_MINUTES, isFitnessSession, isMaintenanceSession, isSplitSession, isWideSession, newSplitState, nextSplit, parseStrength, prescribe, splitFamily, strengthStructure, upperLowerWeek, type StrengthSpec } from './ppl.js';

const active = (w: PlannedWorkout) => w.status === 'planificat' || w.status === 'mutat';

/** Ședințele schimbate (copii), în ordinea datelor; gol dacă nu e nimic de schimbat. */
/**
 * `resolve`: pentru planurile vechi al căror text nu se poate citi („Push 1 · …”, „forță”), blocul și săptămâna se
 * recalculează cu aceeași regulă ca generatorul (plan-specs.ts); fără el, acele ședințe ar rămâne „tot corpul”.
 *
 * Structura după frecvența săptămânii (auditul v93, A50; decizia proprietarului, 20.10.2026): o ședință pe săptămână =
 * tot corpul, două = picioare / partea de sus, trei sau mai multe = Push → Pull → Picioare. Planurile salvate înainte
 * (PPL la orice frecvență) se rescriu la deschidere; a doua oară nu mai schimbă nimic.
 */
export function upgradeToSplit(plan: PlannedWorkout[], today: string, resolve?: (w: PlannedWorkout) => StrengthSpec | null): PlannedWorkout[] {
  const strength = plan
    .filter((w) => w.type === 'forta' && active(w) && w.date >= today)
    .map((w) => ({ w, spec: parseStrength(w.structure) ?? resolve?.(w) ?? null }))
    .filter((x): x is { w: PlannedWorkout; spec: NonNullable<typeof x.spec> } => !!x.spec && !isFitnessSession(x.spec.session) && !isMaintenanceSession(x.spec.session))
    .sort((a, b) => (a.w.date < b.w.date ? -1 : 1));
  if (!strength.length) return [];
  // Frecvența săptămânii: ședințele de forță active din săptămâna aceea (și cele de la începutul ei, deja trecute).
  const perWeek = new Map<string, number>();
  for (const w of plan) if (w.type === 'forta' && active(w)) perWeek.set(weekStart(w.date), (perWeek.get(weekStart(w.date)) ?? 0) + 1);
  const familyOf = (w: PlannedWorkout) => splitFamily(perWeek.get(weekStart(w.date)) ?? 1);
  const keyDates = new Set(plan.filter((w) => w.key && active(w)).map((w) => w.date));
  const byWeek = new Map<string, typeof strength>();
  for (const x of strength) byWeek.set(weekStart(x.w.date), [...(byWeek.get(weekStart(x.w.date)) ?? []), x]);
  // Se rescriu doar săptămânile a căror structură nu se potrivește cu frecvența (PPL-ul deja corect nu se reia de la
  // capăt la fiecare deschidere).
  const st = newSplitState();
  const out: PlannedWorkout[] = [];
  for (const [, xs] of byWeek) {
    const f = familyOf(xs[0]!.w);
    const ul = f === 'upper-lower' ? upperLowerWeek(xs.map((x) => keyDates.has(addDays(x.w.date, 1)))) : [];
    const ok = f === 'full' ? xs.every((x) => x.spec.session === 'full') : f === 'upper-lower' ? xs.every((x, k) => x.spec.session === (x.spec.legs === 'fara' && ul[k]!.session === 'fullA' ? 'fullB' : ul[k]!.session)) : xs.every((x) => isSplitSession(x.spec.session));
    if (ok) continue;
    xs.forEach(({ w, spec }, k) => {
      const nearRace = spec.legs === 'fara';
      let next: StrengthSpec;
      if (f === 'full') next = { ...spec, session: 'full', variant: undefined, legs: nearRace ? 'fara' : 'normal' };
      else if (f === 'upper-lower') next = { ...spec, session: nearRace && ul[k]!.session === 'fullA' ? 'fullB' : ul[k]!.session, variant: undefined, legs: nearRace ? 'fara' : ul[k]!.legs };
      else {
        const n = nextSplit(st, keyDates.has(addDays(w.date, 1)) || spec.legs === 'usor', nearRace);
        next = { ...spec, session: n.session, variant: n.variant, legs: nearRace ? 'fara' : n.light ? 'usor' : 'normal' };
      }
      if (next.variant === undefined) delete next.variant;
      const structure = strengthStructure(next);
      if (structure !== w.structure) out.push({ ...w, structure });
    });
  }
  return out;
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
