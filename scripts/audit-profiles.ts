// Profilurile sintetice ale simulării de audit, comune cu testele de coerență (tests/coherence.test.ts).
import type { GenerateInput } from '../src/calendar/generate.js';
import { isFitnessGoal, isRunGoal, type Goal } from '../src/calendar/phases.js';
import { fitnessProfile } from '../src/strength/fitness.js';
import { addDays } from '../src/util/dates.js';

export const START = '2026-10-26';
export const RACE: Record<string, string> = { '70.3': '2027-09-12', olimpic: '2027-06-13', sprint: '2027-06-13', '5k': '2027-03-28', '10k': '2027-04-18', semimaraton: '2027-05-09', maraton: '2027-10-10', 'inot-1500': '2027-06-27', 'inot-1900': '2027-06-27', 'inot-3800': '2027-08-29', 'bike-50': '2027-05-30', 'bike-100': '2027-06-20', 'bike-160': '2027-08-22' };
export const PACE: Record<string, [number, number]> = { '5k': [330, 285], '10k': [345, 300], semimaraton: [360, 315], maraton: [380, 335] };
export type Level = 'debutant' | 'intermediar' | 'avansat';
export const LEVELS: Level[] = ['debutant', 'intermediar', 'avansat'];
export const AGES = [25, 35, 45, 55, 65];
export const SEXES: ('m' | 'f')[] = ['m', 'f'];
export const INTENS: ('toate' | 'Z2')[] = ['toate', 'Z2'];
// Program liber: luni–vineri 18:00–19:30, sâmbătă 08:00–12:00, duminică 08:00–11:00 (14,5 h libere).
export const FREE = [0, 1, 2, 3, 4].map((d) => ({ day: d as 0, startMin: 18 * 60, endMin: 19 * 60 + 30 })).concat([{ day: 5 as 0, startMin: 8 * 60, endMin: 12 * 60 }, { day: 6 as 0, startMin: 8 * 60, endMin: 11 * 60 }]);

export interface Profile { goal: Goal; sex: 'm' | 'f'; age: number; level: Level; intens: 'toate' | 'Z2'; hours?: number }
export function input(p: Profile): GenerateInput {
  const L = p.level;
  const hist = L === 'debutant' ? [] : L === 'intermediar' ? [5, 5.5, 4.5, 6, 5, 5, 5.5, 6] : [9, 9.5, 8, 10, 9, 9.5, 10, 9];
  const hours = p.hours ?? (L === 'debutant' ? 5 : L === 'intermediar' ? 8 : 12);
  const fit = isFitnessGoal(p.goal);
  return {
    startDate: START,
    raceDate: fit ? addDays(START, 26 * 7) : RACE[p.goal]!,
    goal: p.goal,
    freeBlocks: FREE,
    sportHours: hours,
    historyHoursPerWeek: hist,
    intensityAllowed: p.intens,
    swimContinuous400: L !== 'debutant',
    level: { longestRideH: L === 'debutant' ? 1 : L === 'intermediar' ? 2.5 : 4, longestRunKm: L === 'debutant' ? 3 : L === 'intermediar' ? 12 : 21, easyPaceSecKm: L === 'debutant' ? null : L === 'intermediar' ? 375 : 320 },
    tests: L === 'avansat' ? { alergare: true, bicicleta: true, inot: true } : { alergare: false, bicicleta: false, inot: false },
    athlete: { age: p.age, sex: p.sex },
    swim: { continuousM: L === 'debutant' ? 50 : L === 'intermediar' ? 600 : 1500 },
    run: isRunGoal(p.goal) ? { goalPaceSecKm: L === 'debutant' ? null : PACE[p.goal]![L === 'intermediar' ? 0 : 1], canDoDistance: L !== 'debutant' && (p.goal === '5k' || p.goal === '10k' || L === 'avansat'), longestRunKm: L === 'debutant' ? 3 : L === 'intermediar' ? 12 : 21, branch: L === 'debutant' ? 'finalizare' : 'timp', beginner: L === 'debutant' } : undefined,
    fitness: fit ? fitnessProfile(p.goal, { experienta: L === 'debutant' ? 'incepatoare' : 'stabila', zile: L === 'debutant' ? 2 : L === 'intermediar' ? 3 : 4, minute: L === 'debutant' ? 45 : 60, acces: 'sala', miscare: L === 'debutant' ? 'sedentara' : L === 'intermediar' ? 'plimbari' : 'activa' }) : undefined,
  };
}

