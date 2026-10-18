// Prescripția de forță pentru ședințele unui plan deja salvat. Planurile noi au în text ședința și blocul
// („Push A · Bază, săpt. 2/4 · …”); cele generate înainte de programul AIRON („Push 1 · …”) se recalculează aici,
// cu aceeași regulă ca generatorul, ca ecranul să arate programul nou fără să rescrie planul.

import { assignStrengthDays, type WeekPlan } from '../calendar/generate.js';
import { phaseWeeks } from '../calendar/phases.js';
import type { PlannedWorkout } from '../types.js';
import { parseStrength, type StrengthSpec } from './ppl.js';

export function strengthSpecFor(plan: PlannedWorkout[], w: PlannedWorkout, planStart: string | null, raceDate: string | null, recoveryEvery = 4, goal?: string | null): StrengthSpec | null {
  const own = parseStrength(w.structure);
  if (own) return own;
  if (!planStart || !raceDate) return null;
  let pws;
  try {
    pws = phaseWeeks(planStart, raceDate, recoveryEvery, goal);
  } catch {
    return null;
  }
  const active = plan.filter((x) => x.status === 'planificat' || x.status === 'mutat' || x.id === w.id);
  const weeks: WeekPlan[] = pws.map((pw) => ({
    weekStart: pw.weekStart,
    phase: pw.phase,
    recovery: pw.recovery,
    targetHours: 0,
    plannedHours: 0,
    notes: [],
    workouts: active.filter((x) => x.date >= pw.weekStart && x.date < addDaysIso(pw.weekStart, 7)).map((x) => ({ ...x })),
  }));
  assignStrengthDays(weeks, raceDate);
  const mine = weeks.flatMap((x) => x.workouts).find((x) => x.id === w.id);
  return mine ? parseStrength(mine.structure) : null;
}

function addDaysIso(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
