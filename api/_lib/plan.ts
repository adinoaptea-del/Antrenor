// Planul: din chestionarul de intrare (program, nivel, aviz) și istoricul de activități → generatePlan → workouts_planned.
import { insert, remove, select, update, upsert } from './db.js';
import { toWorkoutRow } from './collect.js';
import { generatePlan, type GenerateResult } from '../../src/calendar/generate.js';
import type { FreeBlock, IntensityAllowed } from '../../src/types.js';
import { addDays, diffDays, weekStart } from '../../src/util/dates.js';

export interface IntakeLike {
  obiectiv: '70.3' | 'olimpic' | 'sprint' | 'full';
  dataCursa: string;
  inot: { nivel: string | null };
  program: FreeBlock[];
  sanatate: { avizCardiolog: 'da' | 'nu' | 'programat' | null };
  echipament?: { ceas?: string | null; whoop?: boolean; oura?: boolean };
}

/** Orele pe săptămână din ultimele până la 8 săptămâni, din activitățile deja sincronizate (gol = fără istoric). */
export async function historyHours(userId: string, today: string): Promise<number[]> {
  const from = addDays(weekStart(today), -56);
  const rows = await select<{ date: string; minutes: number }>('activities', { user_id: `eq.${userId}`, date: [`gte.${from}`, `lt.${weekStart(today)}`] }, { limit: 500 });
  const weeks = new Map<string, number>();
  for (const r of rows) weeks.set(weekStart(r.date), (weeks.get(weekStart(r.date)) ?? 0) + r.minutes);
  return [...weeks.entries()]
    .sort((a, b) => diffDays(b[0], a[0]))
    .map(([, m]) => Math.round((m / 60) * 10) / 10);
}

export async function saveIntake(userId: string, today: string, intake: IntakeLike & { consimtamant?: boolean }): Promise<void> {
  await upsert('questionnaires', { user_id: userId, kind: 'intrare', for_date: today, activity_id: null, answers: intake }, 'user_id,kind,for_date,activity_id');
  await update('users', { id: `eq.${userId}` }, { goal: intake.obiectiv, race_date: intake.dataCursa, race_name: raceName(intake.obiectiv) });
  await remove('schedules', { user_id: `eq.${userId}` });
  if (intake.program.length) await insert('schedules', intake.program.map((b) => ({ user_id: userId, day: b.day, start_min: b.startMin, end_min: b.endMin, valid_from: today })));
  const intensity: IntensityAllowed = intake.sanatate.avizCardiolog === 'da' ? 'toate' : 'Z2';
  await upsert('clearances', { user_id: userId, cardiology: intake.sanatate.avizCardiolog === 'da', cleared_at: intake.sanatate.avizCardiolog === 'da' ? today : null, intensity_allowed: intensity }, 'user_id');
  if (intake.consimtamant) {
    await upsert('consents', { user_id: userId, health_data: true, adult: true, not_medical_ack: true, accepted_at: new Date().toISOString(), withdrawn_at: null }, 'user_id');
  }
}

function raceName(goal: IntakeLike['obiectiv']): string {
  return { '70.3': 'Ironman 70.3', olimpic: 'Triatlon olimpic', sprint: 'Triatlon sprint', full: 'Ironman' }[goal];
}

export interface PlanOutcome {
  ok: boolean;
  reason?: string;
  budgetHours: number;
  weeks?: number;
  workouts?: number;
  options?: string[];
}

/** Generează (sau regenerează) planul activ de la lunea următoare. Planul vechi rămâne în istoric, inactiv. */
export async function generateAndStore(userId: string, today: string, intake: IntakeLike): Promise<PlanOutcome> {
  if (intake.obiectiv === 'full') {
    return { ok: false, reason: 'Ironman complet nu e în versiunea asta a planului; alege 70.3 pentru acum.', budgetHours: 0 };
  }
  const startDate = addDays(weekStart(today), 7);
  const history = await historyHours(userId, today);
  const result: GenerateResult = generatePlan({
    startDate,
    raceDate: intake.dataCursa,
    goal: intake.obiectiv,
    freeBlocks: intake.program,
    historyHoursPerWeek: history,
    intensityAllowed: intake.sanatate.avizCardiolog === 'da' ? 'toate' : 'Z2',
    swimContinuous400: intake.inot.nivel === 'continuu_400' || intake.inot.nivel === 'peste_1500',
  });
  if (!result.ok) return { ok: false, reason: result.reason, budgetHours: result.budgetHours, options: result.options };

  await update('plans', { user_id: `eq.${userId}`, active: 'eq.true' }, { active: false });
  const prev = await select<{ version: number }>('plans', { user_id: `eq.${userId}` }, { order: 'version.desc', limit: 1 });
  const [plan] = await insert<{ id: string }>('plans', {
    user_id: userId,
    goal: intake.obiectiv,
    race_date: intake.dataCursa,
    start_date: startDate,
    budget_hours: result.budgetHours,
    version: (prev[0]?.version ?? 0) + 1,
    active: true,
  });
  const rows = result.weeks.flatMap((w) => w.workouts.map((x) => toWorkoutRow({ ...x, id: `${plan!.id.slice(0, 8)}-${x.id}` }, userId, plan!.id)));
  for (let i = 0; i < rows.length; i += 200) await insert('workouts_planned', rows.slice(i, i + 200));
  return { ok: true, budgetHours: result.budgetHours, weeks: result.weeks.length, workouts: rows.length };
}
