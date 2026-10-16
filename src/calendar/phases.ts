// Fazele planului, așezate înapoi de la data cursei. Săptămâna cursei e ultima săptămână de taper.

import type { Phase } from '../types.js';
import { addDays, diffDays, weekStart } from '../util/dates.js';

export type Goal = '70.3' | 'olimpic' | 'sprint' | 'semimaraton' | 'maraton';

/** Obiective doar de alergare: planul are alergare + forță, fără înot și bicicletă. */
export const RUN_GOALS: readonly Goal[] = ['semimaraton', 'maraton'];
export const isRunGoal = (g: string | null | undefined): g is 'semimaraton' | 'maraton' => g === 'semimaraton' || g === 'maraton';
/** Distanța cursei de alergare, km. */
export const RUN_DISTANCE_KM = { semimaraton: 21.0975, maraton: 42.195 } as const;

export interface PhaseHours {
  min: number;
  target: number;
  max: number;
}

/** Ore pe săptămână pe faze, pentru un finisher amator cu job (orientativ, din practica planurilor de amatori). */
export const PHASE_HOURS: Record<Goal, Record<Phase, PhaseHours>> = {
  '70.3': {
    evaluare: { min: 4, target: 6, max: 8 },
    baza1: { min: 6, target: 8.5, max: 11 },
    baza2: { min: 7, target: 9.5, max: 11 },
    build: { min: 8, target: 11, max: 14 },
    peak: { min: 8, target: 11, max: 14 },
    taper: { min: 4, target: 5.5, max: 7 },
  },
  olimpic: {
    evaluare: { min: 3, target: 5, max: 7 },
    baza1: { min: 5, target: 6.5, max: 9 },
    baza2: { min: 5, target: 7, max: 9 },
    build: { min: 6, target: 8, max: 10 },
    peak: { min: 6, target: 8, max: 10 },
    taper: { min: 3, target: 4, max: 6 },
  },
  sprint: {
    evaluare: { min: 3, target: 4, max: 6 },
    baza1: { min: 4, target: 5, max: 7 },
    baza2: { min: 4, target: 5.5, max: 7 },
    build: { min: 4, target: 6, max: 8 },
    peak: { min: 4, target: 6, max: 8 },
    taper: { min: 2, target: 3, max: 5 },
  },
  // Alergare + forță; orientativ pentru un amator care vrea să termine bine (aprox. 30–50 km/săpt. la semimaraton, 40–70 la maraton).
  semimaraton: {
    evaluare: { min: 2.5, target: 3.5, max: 5 },
    baza1: { min: 3, target: 4.5, max: 6 },
    baza2: { min: 3.5, target: 5, max: 6.5 },
    build: { min: 4, target: 5.5, max: 7 },
    peak: { min: 4, target: 5.5, max: 7 },
    taper: { min: 2, target: 3, max: 4 },
  },
  maraton: {
    evaluare: { min: 3, target: 4, max: 5.5 },
    baza1: { min: 3.5, target: 5, max: 7 },
    baza2: { min: 4, target: 6, max: 8 },
    build: { min: 4.5, target: 7, max: 9 },
    peak: { min: 4.5, target: 7, max: 9 },
    taper: { min: 2.5, target: 3.5, max: 5 },
  },
};

export interface PhaseWeek {
  /** Luni, YYYY-MM-DD */
  weekStart: string;
  index: number;
  phase: Phase;
  weekInPhase: number;
  /** Săptămână de descărcare (a 4-a din fiecare fază, în afara taper-ului). */
  recovery: boolean;
}

const ORDER: Phase[] = ['evaluare', 'baza1', 'baza2', 'build', 'peak', 'taper'];

/** Lungimi dorite când sunt destule săptămâni; baza1 ia restul. */
const DESIRED: Record<Exclude<Phase, 'baza1'>, number> = { evaluare: 3, baza2: 8, build: 12, peak: 4, taper: 2 };
const RATIO: Record<Phase, number> = { evaluare: 0.09, baza1: 0.25, baza2: 0.22, build: 0.3, peak: 0.09, taper: 0.05 };
const MIN_WEEKS: Record<Phase, number> = { evaluare: 0, baza1: 1, baza2: 1, build: 1, peak: 1, taper: 1 };

export function phaseLengths(totalWeeks: number): Record<Phase, number> {
  const fixed = DESIRED.evaluare + DESIRED.baza2 + DESIRED.build + DESIRED.peak + DESIRED.taper;
  if (totalWeeks >= fixed + 4) {
    return { ...DESIRED, baza1: totalWeeks - fixed };
  }
  // Orizont scurt: proporțional, cu minimum 1 săptămână pe fiecare fază în afara evaluării.
  const out = {} as Record<Phase, number>;
  let used = 0;
  for (const p of ORDER) {
    out[p] = Math.max(MIN_WEEKS[p], Math.floor(totalWeeks * RATIO[p]));
    used += out[p];
  }
  let rest = totalWeeks - used;
  const fill: Phase[] = ['build', 'baza2', 'baza1', 'peak'];
  let i = 0;
  while (rest > 0) {
    const p = fill[i % fill.length]!;
    out[p] += 1;
    rest -= 1;
    i += 1;
  }
  while (rest < 0) {
    const p = ['evaluare', 'baza1', 'baza2', 'build', 'peak'][(-rest - 1) % 5] as Phase;
    if (out[p] > MIN_WEEKS[p]) {
      out[p] -= 1;
      rest += 1;
    } else {
      break;
    }
  }
  return out;
}

export function phaseWeeks(startDate: string, raceDate: string): PhaseWeek[] {
  const first = weekStart(startDate);
  const raceWeek = weekStart(raceDate);
  const total = Math.floor(diffDays(first, raceWeek) / 7) + 1;
  if (total < 4) throw new Error(`Prea puține săptămâni până la cursă (${total}); planul are nevoie de minimum 4.`);
  const lengths = phaseLengths(total);
  const weeks: PhaseWeek[] = [];
  let index = 0;
  for (const phase of ORDER) {
    for (let w = 0; w < lengths[phase]; w++) {
      weeks.push({
        weekStart: addDays(first, index * 7),
        index,
        phase,
        weekInPhase: w,
        recovery: phase !== 'taper' && w % 4 === 3,
      });
      index += 1;
    }
  }
  return weeks;
}
