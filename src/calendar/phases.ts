// Fazele planului, așezate înapoi de la data cursei. Săptămâna cursei e ultima săptămână de taper.

import type { Phase } from '../types.js';
import { addDays, diffDays, weekStart } from '../util/dates.js';

export type TriGoal = '70.3' | 'olimpic' | 'sprint';
/** Doar alergare: distanța pe care sportivul vrea să alerge (și, de obicei, un timp-țintă). */
export type RunGoal = '5k' | '10k' | 'semimaraton' | 'maraton';
/** Doar înot: distanța pe care vrea s-o înoate fără oprire (bazin sau ape libere). */
export type SwimGoal = 'inot-1500' | 'inot-1900' | 'inot-3800';
/** Doar bicicletă: distanța turei pe care vrea s-o termine. */
export type BikeGoal = 'bike-50' | 'bike-100' | 'bike-160';
/** Fitness (deocamdată doar pentru femei, programul AIRON de 26 de săptămâni): fără cursă, cu un obiectiv de corp. */
export type FitnessGoal = 'fit-slabire' | 'fit-tonifiere' | 'fit-intretinere' | 'fit-masa';
export type Goal = TriGoal | RunGoal | SwimGoal | BikeGoal | FitnessGoal;
export type GoalKind = 'tri' | 'run' | 'swim' | 'bike' | 'fitness';

export const TRI_GOALS: readonly TriGoal[] = ['70.3', 'olimpic', 'sprint'];
export const RUN_GOALS: readonly RunGoal[] = ['5k', '10k', 'semimaraton', 'maraton'];
export const SWIM_GOALS: readonly SwimGoal[] = ['inot-1500', 'inot-1900', 'inot-3800'];
export const BIKE_GOALS: readonly BikeGoal[] = ['bike-50', 'bike-100', 'bike-160'];
export const FITNESS_GOALS: readonly FitnessGoal[] = ['fit-slabire', 'fit-tonifiere', 'fit-intretinere', 'fit-masa'];
export const ALL_GOALS: readonly Goal[] = [...TRI_GOALS, ...RUN_GOALS, ...SWIM_GOALS, ...BIKE_GOALS, ...FITNESS_GOALS];
/** Programul de fitness are o lungime fixă de referință: 26 de săptămâni (aproximativ șase luni). */
export const FITNESS_WEEKS = 26;

export const isRunGoal = (g: string | null | undefined): g is RunGoal => (RUN_GOALS as readonly string[]).includes(g ?? '');
export const isSwimGoal = (g: string | null | undefined): g is SwimGoal => (SWIM_GOALS as readonly string[]).includes(g ?? '');
export const isBikeGoal = (g: string | null | undefined): g is BikeGoal => (BIKE_GOALS as readonly string[]).includes(g ?? '');
export const isFitnessGoal = (g: string | null | undefined): g is FitnessGoal => (FITNESS_GOALS as readonly string[]).includes(g ?? '');
export const isTriGoal = (g: string | null | undefined): g is TriGoal => (TRI_GOALS as readonly string[]).includes(g ?? '');
export const isGoal = (g: string | null | undefined): g is Goal => (ALL_GOALS as readonly string[]).includes(g ?? '');

/** Felul obiectivului: un singur sport (alergare / înot / bicicletă) sau triatlon. null pentru obiective necunoscute (ex. „full”). */
export function goalKind(g: string | null | undefined): GoalKind | null {
  return isRunGoal(g) ? 'run' : isSwimGoal(g) ? 'swim' : isBikeGoal(g) ? 'bike' : isTriGoal(g) ? 'tri' : isFitnessGoal(g) ? 'fitness' : null;
}

/** Sporturile din plan pentru un obiectiv: la un singur sport, doar sportul și forța; toate trei doar la triatlon. */
export function goalSports(g: string | null | undefined): ('inot' | 'bicicleta' | 'alergare' | 'forta')[] {
  switch (goalKind(g)) {
    case 'run':
      return ['alergare', 'forta'];
    case 'swim':
      return ['inot', 'forta'];
    case 'bike':
      return ['bicicleta', 'forta'];
    case 'fitness':
      return ['forta'];
    default:
      return ['inot', 'bicicleta', 'alergare', 'forta'];
  }
}

/** Distanța cursei de alergare, km. */
export const RUN_DISTANCE_KM: Record<RunGoal, number> = { '5k': 5, '10k': 10, semimaraton: 21.0975, maraton: 42.195 };
/** Distanța de înot a obiectivului, m. */
export const SWIM_DISTANCE_M: Record<SwimGoal, number> = { 'inot-1500': 1500, 'inot-1900': 1900, 'inot-3800': 3800 };
/** Distanța turei de bicicletă, km. */
export const BIKE_DISTANCE_KM: Record<BikeGoal, number> = { 'bike-50': 50, 'bike-100': 100, 'bike-160': 160 };

/** Numele obiectivului, pentru om. */
export const GOAL_LABEL: Record<Goal, string> = {
  '70.3': 'Ironman 70.3',
  olimpic: 'triatlon olimpic',
  sprint: 'triatlon sprint',
  '5k': '5 km',
  '10k': '10 km',
  semimaraton: 'semimaraton',
  maraton: 'maraton',
  'inot-1500': 'înot 1.500 m',
  'inot-1900': 'înot 1.900 m',
  'inot-3800': 'înot 3.800 m',
  'bike-50': 'tură de 50 km',
  'bike-100': 'tură de 100 km',
  'bike-160': 'tură de 160 km',
  'fit-slabire': 'scădere în greutate și tonifiere',
  'fit-tonifiere': 'tonifiere',
  'fit-intretinere': 'întreținere',
  'fit-masa': 'creștere musculară',
};

export interface PhaseHours {
  min: number;
  target: number;
  max: number;
}

const FIT_PH: PhaseHours = { min: 1, target: 2.5, max: 4.5 };
const FIT_HOURS: Record<Phase, PhaseHours> = { evaluare: FIT_PH, baza1: FIT_PH, baza2: FIT_PH, build: FIT_PH, peak: FIT_PH, taper: FIT_PH };

/** Etapele programului de fitness, așezate peste fazele planului (același tip de date, alt nume pentru om). */
export const FITNESS_PHASE_LABEL: Record<Phase, string> = { evaluare: 'Acomodare', baza1: 'Construire', baza2: 'Progres', build: 'Consolidare', peak: 'Tranziție', taper: 'Menținere' };

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
  // 5 și 10 km: mai puțin volum, mai multă calitate (orientativ 20–35 km/săpt. la 5 km, 25–45 la 10 km, cu forța inclusă).
  '5k': {
    evaluare: { min: 2, target: 3, max: 4 },
    baza1: { min: 2.5, target: 3.5, max: 5 },
    baza2: { min: 2.5, target: 4, max: 5.5 },
    build: { min: 3, target: 4.5, max: 6 },
    peak: { min: 3, target: 4.5, max: 6 },
    taper: { min: 1.5, target: 2.5, max: 3.5 },
  },
  '10k': {
    evaluare: { min: 2.5, target: 3.5, max: 4.5 },
    baza1: { min: 3, target: 4, max: 5.5 },
    baza2: { min: 3, target: 4.5, max: 6 },
    build: { min: 3.5, target: 5, max: 6.5 },
    peak: { min: 3.5, target: 5, max: 6.5 },
    taper: { min: 2, target: 2.5, max: 4 },
  },
  // Doar înot: 3–4 ședințe + forță; distanța lungă crește treptat (bazinul nu cere ore multe, cere constanță).
  'inot-1500': {
    evaluare: { min: 2, target: 3, max: 4 },
    baza1: { min: 2.5, target: 3.5, max: 4.5 },
    baza2: { min: 2.5, target: 3.5, max: 5 },
    build: { min: 3, target: 4, max: 5 },
    peak: { min: 3, target: 4, max: 5 },
    taper: { min: 1.5, target: 2.5, max: 3.5 },
  },
  'inot-1900': {
    evaluare: { min: 2, target: 3, max: 4 },
    baza1: { min: 2.5, target: 3.5, max: 5 },
    baza2: { min: 3, target: 4, max: 5.5 },
    build: { min: 3, target: 4.5, max: 5.5 },
    peak: { min: 3, target: 4.5, max: 5.5 },
    taper: { min: 1.5, target: 2.5, max: 3.5 },
  },
  'inot-3800': {
    evaluare: { min: 2.5, target: 3.5, max: 4.5 },
    baza1: { min: 3, target: 4, max: 5.5 },
    baza2: { min: 3.5, target: 4.5, max: 6 },
    build: { min: 4, target: 5, max: 6.5 },
    peak: { min: 4, target: 5, max: 6.5 },
    taper: { min: 2, target: 3, max: 4 },
  },
  // Doar bicicletă: 3 ture + forță; tura lungă crește spre distanța-țintă.
  'bike-50': {
    evaluare: { min: 2.5, target: 3.5, max: 5 },
    baza1: { min: 3, target: 4, max: 6 },
    baza2: { min: 3.5, target: 4.5, max: 6.5 },
    build: { min: 3.5, target: 5, max: 7 },
    peak: { min: 3.5, target: 5, max: 7 },
    taper: { min: 2, target: 3, max: 4 },
  },
  'bike-100': {
    evaluare: { min: 3, target: 4, max: 6 },
    baza1: { min: 4, target: 5.5, max: 7.5 },
    baza2: { min: 4.5, target: 6, max: 8 },
    build: { min: 5, target: 7, max: 9 },
    peak: { min: 5, target: 7, max: 9 },
    taper: { min: 2.5, target: 3.5, max: 5 },
  },
  'bike-160': {
    evaluare: { min: 3.5, target: 5, max: 7 },
    baza1: { min: 4.5, target: 6.5, max: 8.5 },
    baza2: { min: 5.5, target: 7.5, max: 10 },
    build: { min: 6, target: 8.5, max: 11 },
    peak: { min: 6, target: 8.5, max: 11 },
    taper: { min: 3, target: 4, max: 6 },
  },
  // Fitness: orele vin din zilele și minutele alese (2–4 ședințe × 35–65 min); valorile sunt doar orientative.
  'fit-slabire': FIT_HOURS,
  'fit-tonifiere': FIT_HOURS,
  'fit-intretinere': FIT_HOURS,
  'fit-masa': FIT_HOURS,
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

/**
 * Reducerea dinaintea cursei, în săptămâni (săptămâna cursei inclusă), după distanță: 5–10 km ~5–10 zile, semimaraton
 * ~10–14 zile, maraton ~14–21 zile (documentul antrenorului de alergare); triatlonul păstrează 2.
 */
export function taperWeeksFor(goal: string | null | undefined): number {
  return goal === '5k' || goal === '10k' ? 1 : goal === 'maraton' ? 3 : 2;
}

export function phaseLengths(totalWeeks: number, taperWeeks?: number): Record<Phase, number> {
  const desired = { ...DESIRED, taper: taperWeeks ?? DESIRED.taper };
  const fixed = desired.evaluare + desired.baza2 + desired.build + desired.peak + desired.taper;
  if (totalWeeks >= fixed + 4) {
    return { ...desired, baza1: totalWeeks - fixed };
  }
  // Orizont scurt: proporțional, cu minimum 1 săptămână pe fiecare fază în afara evaluării.
  const out = {} as Record<Phase, number>;
  let used = 0;
  for (const p of ORDER) {
    out[p] = Math.max(MIN_WEEKS[p], Math.floor(totalWeeks * RATIO[p]));
    used += out[p];
  }
  // Pe orizont scurt, taper-ul distanței dacă încape (cel mult ~12% din plan), altfel o săptămână.
  if (taperWeeks != null) {
    const shortTaper = Math.max(1, Math.min(taperWeeks, Math.floor(totalWeeks * 0.12)));
    used += shortTaper - out.taper;
    out.taper = shortTaper;
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
  // Prea puține săptămâni pentru minimele fazelor: se scoate din faza cea mai lungă (taper rămâne o săptămână, cea a
  // cursei), până când totalul e exact orizontul. Fazele pot lipsi; planul nu trece niciodată de cursă.
  while (rest < 0) {
    const p = (['evaluare', 'baza1', 'baza2', 'build', 'peak'] as Phase[]).filter((q) => out[q] > 0).sort((a, b) => out[b] - out[a])[0];
    if (!p) break;
    out[p] -= 1;
    rest += 1;
  }
  return out;
}

/** recoveryEvery: a câta săptămână din fază e descărcare (4 implicit; 3 de la 40 de ani, recuperarea e mai lentă). */
export function phaseWeeks(startDate: string, raceDate: string, recoveryEvery = 4, goal?: string | null): PhaseWeek[] {
  const first = weekStart(startDate);
  const raceWeek = weekStart(raceDate);
  const total = Math.floor(diffDays(first, raceWeek) / 7) + 1;
  if (total < 4) throw new Error(`Prea puține săptămâni până la cursă (${total}); planul are nevoie de minimum 4.`);
  if (isFitnessGoal(goal)) return fitnessPhaseWeeks(first, total, goal);
  const lengths = phaseLengths(total, goal ? taperWeeksFor(goal) : undefined);
  const weeks: PhaseWeek[] = [];
  let index = 0;
  for (const phase of ORDER) {
    for (let w = 0; w < lengths[phase]; w++) {
      weeks.push({
        weekStart: addDays(first, index * 7),
        index,
        phase,
        weekInPhase: w,
        recovery: phase !== 'taper' && w % recoveryEvery === recoveryEvery - 1,
      });
      index += 1;
    }
  }
  return weeks;
}

/**
 * Fitness: etapele programului de 26 de săptămâni, așezate peste fazele planului (acomodare = evaluare, construire =
 * baza1, progres = baza2, consolidare = build, tranziție = peak, menținere = taper). La întreținere: acomodare, apoi
 * menținere. Revizuirea din S12 e singura săptămână „de descărcare”. (Varianta exactă, cu nivelul sportivei, e în
 * src/strength/fitness.ts; aici e doar faza zilei, pentru pachet și ecrane.)
 */
function fitnessPhaseWeeks(first: string, total: number, goal: FitnessGoal): PhaseWeek[] {
  const seq: [Phase, number][] = goal === 'fit-intretinere' ? [['evaluare', 4], ['taper', 22]] : [['evaluare', 4], ['baza1', 4], ['baza2', 4], ['build', 4], ['peak', 4], ['taper', 6]];
  const out: PhaseWeek[] = [];
  for (const [phase, len] of seq) {
    for (let w = 0; w < len && out.length < total; w++) {
      out.push({ weekStart: addDays(first, out.length * 7), index: out.length, phase, weekInPhase: w, recovery: phase === 'baza2' && w === len - 1 });
    }
  }
  while (out.length < total) out.push({ weekStart: addDays(first, out.length * 7), index: out.length, phase: 'taper', weekInPhase: out.length, recovery: false });
  return out;
}
