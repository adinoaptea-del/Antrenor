// Calendarul de fitness: 26 de săptămâni, 2/3/4 zile de sală alese din ferestrele libere, ședințele din programul
// AIRON pentru femei, potrivite în minutele pe care le are sportiva. Mersul/cardio-ul nu intră în calendar ca ședință
// punctată: e recomandarea săptămânii (src/strength/fitness.ts), ca să nu transforme plimbarea în obligație.

import type { FreeBlock, PlannedWorkout } from '../types.js';
import { addDays, weekStart } from '../util/dates.js';
import { fitnessPlanWeeks, type FitnessProfile } from '../strength/fitness.js';
import { FitnessRotator, MIN_STRENGTH_MINUTES, newSplitState, nextSplit, prescribe, splitFamily, strengthStructure, upperLowerWeek, weekSetTotals, type LegsMode, type Prescription, type SessionId, type StrengthSpec } from '../strength/ppl.js';
import type { GenerateResult, WeekPlan } from './generate.js';

/** Zilele preferate din program, când ferestrele permit: 2 → luni/joi, 3 → luni/miercuri/vineri, 4 → luni/marți/joi/sâmbătă. */
const PATTERN: Record<number, number[]> = { 1: [0], 2: [0, 3], 3: [0, 2, 4], 4: [0, 1, 3, 5] };
// Nicio ședință sub 45 de minute cu încălzirea (regula proprietarului, 19.10.2026).
const MIN_SESSION = MIN_STRENGTH_MINUTES;

/** Cea mai lungă fereastră liberă din fiecare zi (minute). */
function longestByDay(blocks: FreeBlock[]): Map<number, number> {
  const m = new Map<number, number>();
  for (const b of blocks) m.set(b.day, Math.max(m.get(b.day) ?? 0, b.endMin - b.startMin));
  return m;
}

function combos<T>(xs: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (xs.length < k) return [];
  const [h, ...t] = xs;
  return [...combos(t, k - 1).map((c) => [h!, ...c]), ...combos(t, k)];
}

/** Distanța minimă între zile, pe săptămână circulară (duminică → luni contează). */
function minGap(days: number[]): number {
  if (days.length < 2) return 7;
  const s = [...days].sort((a, b) => a - b);
  let g = 7 - s[s.length - 1]! + s[0]!;
  for (let i = 1; i < s.length; i++) g = Math.min(g, s[i]! - s[i - 1]!);
  return g;
}

/**
 * Zilele de sală: cele mai depărtate între ele (cel puțin o zi fără lucru greu pentru aceeași regiune, de regulă),
 * apoi cele din tiparul programului, apoi cele cu fereastra mai lungă.
 */
export function pickFitnessDays(blocks: FreeBlock[], n: number, minutes: number): number[] {
  const free = longestByDay(blocks);
  const ok = [...free.entries()].filter(([, m]) => m >= Math.min(minutes, MIN_SESSION)).map(([d]) => d).sort((a, b) => a - b);
  const k = Math.min(n, ok.length);
  if (!k) return [];
  const pat = PATTERN[k] ?? [];
  let best: number[] = [];
  let bestScore = -Infinity;
  for (const c of combos(ok, k)) {
    const score = minGap(c) * 1000 + c.filter((d) => pat.includes(d)).length * 100 + c.reduce((s, d) => s + Math.min(minutes, free.get(d) ?? 0), 0) / 100;
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best;
}

/**
 * Structura după frecvența reală a săptămânii (auditul v93, A50; decizia proprietarului, 20.10.2026): o zi = tot
 * corpul (excepția „fullBody”); două = picioare / partea de sus; trei sau mai multe = la bărbați Push → Pull →
 * Picioare cu exerciții care se schimbă, la femei structura antrenoarei (FitnessRotator). Varianta amplă A–D rămâne pe
 * tiparul ei.
 */
export function generateFitnessPlan(input: { startDate: string; raceDate: string; freeBlocks: FreeBlock[]; fitness: FitnessProfile; male?: boolean }): GenerateResult {
  const f = input.fitness;
  const first = weekStart(input.startDate);
  // Aceeași structură ca în calendar și în explicații (fitnessPlanWeeks), nu fazele de anduranță.
  const weeks = fitnessPlanWeeks(input.startDate, input.raceDate, f);
  const maxDays = Math.max(...weeks.map((w) => w.days));
  const free = longestByDay(input.freeBlocks);
  const daysAll = pickFitnessDays(input.freeBlocks, maxDays, f.minutes);
  if (!daysAll.length) {
    return { ok: false, reason: `Nu ai nicio fereastră liberă de cel puțin ${MIN_SESSION} de minute. Bifează în program zilele în care poți ajunge la sală.`, budgetHours: 0, minimumHours: 1, options: ['adaugă în program ferestre de 60 de minute (minimum 45) în 2–3 zile'] };
  }
  const out: WeekPlan[] = [];
  let prevSets: number | null = null;
  const rot = new FitnessRotator();
  const split = newSplitState();
  for (const fw of weeks) {
    const ws = addDays(first, (fw.week - 1) * 7);
    // Zilele săptămânii: din zilele alese pentru frecvența maximă, cele mai depărtate pentru frecvența de acum.
    const days = fw.days >= daysAll.length ? daysAll : pickFitnessDays(input.freeBlocks.filter((b) => daysAll.includes(b.day)), fw.days, f.minutes);
    const notes: string[] = [];
    if (days.length < fw.days) notes.push(`programul are ${fw.days} zile în săptămâna asta, dar ai ferestre libere doar în ${days.length}`);
    const family = splitFamily(days.length);
    const order: { session: SessionId; variant?: number; legs?: LegsMode }[] = input.male
      ? family === 'full'
        ? [{ session: 'full' }]
        : family === 'upper-lower'
          ? upperLowerWeek(days.map(() => false))
          : days.map(() => nextSplit(split, false, false))
      : fw.variant === 'ampla'
        ? days.map((_, i) => ({ session: fw.rotation[i % fw.rotation.length]! }))
        : rot.week(days.length);
    const rxs: Prescription[] = [];
    const workouts: PlannedWorkout[] = days.map((d, i) => {
      const spec: StrengthSpec = { session: order[i]!.session, block: fw.block, week: fw.blockWeek, len: fw.blockLen, recovery: fw.recovery, ...(order[i]!.variant != null ? { variant: order[i]!.variant } : {}), ...(fw.transition ? { transition: true } : {}), ...(input.fitness.place === 'acasa' ? { place: 'acasa' as const } : {}), ...(f.postpartum ? { pregnancy: true } : f.goal === 'fit-slabire' ? { opener: 'slabire' as const } : {}) };
      const avail = Math.max(MIN_SESSION, Math.min(Math.max(f.minutes, MIN_SESSION), free.get(d) ?? f.minutes));
      const rx = prescribe(spec, avail);
      rxs.push(rx);
      return {
        id: `${ws}-${i + 1}`,
        date: addDays(ws, d),
        sport: 'forta',
        type: 'forta',
        plannedMinutes: rx.minutes,
        targetZones: [],
        key: false,
        structure: strengthStructure(spec),
        status: 'planificat',
      };
    });
    // Totalul săptămânii (auditul v93, A52), vizibil și spus cinstit la trecerea la o zi în plus: o ședință în plus
    // adaugă serii (fiecare exercițiu rămâne la 3), nu e „aceeași doză distribuită”.
    const sets = weekSetTotals(rxs).total;
    notes.push(`serii de lucru în săptămână: ${sets} (${rxs.length} ședințe; se numără seriile de la fiecare exercițiu, fără încălzire)`);
    if (fw.transition && prevSets != null && sets > prevSets) notes.push(`săptămâna de trecere la ${days.length} zile: seriile cresc de la ${prevSets} la ${sets} (+${Math.round(((sets - prevSets) / prevSets) * 100)}%), cu câte 3 serii pe exercițiu: ședința în plus adaugă serii, nu e aceeași doză distribuită`);
    prevSets = sets;
    const planned = Math.round((workouts.reduce((n, w) => n + w.plannedMinutes, 0) / 60) * 10) / 10;
    out.push({ weekStart: ws, phase: fw.phase, recovery: fw.recovery, targetHours: planned, plannedHours: planned, workouts: workouts.filter((w) => w.date < input.raceDate), notes });
  }
  // Rotunjit în sus: bugetul afișat nu poate fi sub minutele planificate (L-SIM-10).
  const hours = Math.ceil(Math.max(...out.map((w) => w.workouts.reduce((n, x) => n + x.plannedMinutes, 0))) / 6) / 10;
  return { ok: true, weeks: out, budgetHours: hours };
}
