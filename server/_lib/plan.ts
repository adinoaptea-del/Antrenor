// Planul: din chestionarul de intrare (program, nivel, aviz) și istoricul de activități → generatePlan → workouts_planned.
import { insert, remove, select, update, upsert } from './db.js';
import { loadLabs, loadZones, toWorkoutRow } from './collect.js';
import { generatePlan, type GenerateResult } from '../../src/calendar/generate.js';
import type { FreeBlock, IntensityAllowed } from '../../src/types.js';
import { addDays, diffDays, weekStart } from '../../src/util/dates.js';
import { isRunGoal, RUN_DISTANCE_KM } from '../../src/calendar/phases.js';
import { paceFromResult, parsePace, type RunResult } from '../../src/util/run.js';

export interface IntakeLike {
  nume?: string;
  sex?: 'm' | 'f' | null;
  anNastere?: number | null;
  obiectiv: '70.3' | 'olimpic' | 'sprint' | 'semimaraton' | 'maraton' | 'full';
  dataCursa: string;
  inot?: { nivel: string | null };
  bicicleta?: { ceaMaiLungaOre?: number | null };
  alergare?: { ceaMaiLungaKm?: number | null; tinta?: RunResult | null; ritmActual?: string | null; poateDistanta?: boolean | null; rezultatActual?: RunResult | null };
  program: FreeBlock[];
  sanatate: { avizCardiolog: 'da' | 'nu' | 'programat' | null };
  echipament?: { ceas?: string | null; whoop?: boolean; oura?: boolean };
  evaluare?: { inot400?: string | null; ritmUsor?: string | null; ftp?: number | null; alergare5k?: string | null; alergare10k?: string | null; testEfort?: string | null };
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
  await update('users', { id: `eq.${userId}` }, { ...(intake.nume ? { name: intake.nume } : {}), goal: intake.obiectiv, race_date: intake.dataCursa, race_name: raceName(intake.obiectiv), ...(intake.sex ? { sex: intake.sex } : {}), ...(intake.anNastere ? { birth_year: intake.anNastere } : {}) });
  await remove('schedules', { user_id: `eq.${userId}` });
  if (intake.program.length) await insert('schedules', intake.program.map((b) => ({ user_id: userId, day: b.day, start_min: b.startMin, end_min: b.endMin, valid_from: today })));
  const intensity: IntensityAllowed = intake.sanatate.avizCardiolog === 'da' ? 'toate' : 'Z2';
  await upsert('clearances', { user_id: userId, cardiology: intake.sanatate.avizCardiolog === 'da', cleared_at: intake.sanatate.avizCardiolog === 'da' ? today : null, intensity_allowed: intensity }, 'user_id');
  if (intake.consimtamant) {
    await upsert('consents', { user_id: userId, health_data: true, adult: true, not_medical_ack: true, accepted_at: new Date().toISOString(), withdrawn_at: null }, 'user_id');
  }
}

function raceName(goal: IntakeLike['obiectiv']): string {
  return { '70.3': 'Ironman 70.3', olimpic: 'Triatlon olimpic', sprint: 'Triatlon sprint', semimaraton: 'Semimaraton', maraton: 'Maraton', full: 'Ironman' }[goal];
}

export interface PlanOutcome {
  ok: boolean;
  reason?: string;
  budgetHours: number;
  weeks?: number;
  workouts?: number;
  options?: string[];
  /** De ce e planul altfel decât s-ar aștepta sportivul (ex. intensitate limitată din analize). */
  note?: string;
  /** Planul e făcut fără analize valabile (mai noi de 12 luni). */
  withoutLabs?: boolean;
}

/**
 * Analizele schimbă planul doar într-un singur fel, prudent: feritina sub 30 µg/L sau hemoglobina sub intervalul
 * laboratorului țin intensitatea la Z1–Z2 până la analize noi (după discuția cu medicul). Nimic altceva.
 */
export async function labsGate(userId: string): Promise<{ valid: boolean; limitIntensity: boolean; why: string | null }> {
  const l = await loadLabs(userId);
  if (!l) return { valid: false, limitIntensity: false, why: null };
  const lowFerritin = l.feritina != null && l.feritina < 30;
  const lowHb = (l.in_afara_intervalului ?? []).some((v) => v.directie === 'sub' && /hemoglobin/i.test(v.nume));
  const why = lowFerritin ? `feritina ${l.feritina} µg/L (sub 30)` : lowHb ? 'hemoglobina sub intervalul laboratorului' : null;
  return { valid: true, limitIntensity: !!why, why };
}

/** Generează (sau regenerează) planul activ de la lunea următoare. Planul vechi rămâne în istoric, inactiv. */
export async function generateAndStore(userId: string, today: string, intake: IntakeLike): Promise<PlanOutcome> {
  if (intake.obiectiv === 'full') {
    return { ok: false, reason: 'Ironman complet nu e în versiunea asta a planului; alege 70.3 pentru acum.', budgetHours: 0 };
  }
  const startDate = addDays(weekStart(today), 7);
  const history = await historyHours(userId, today);
  const labs = await labsGate(userId);
  const result: GenerateResult = generatePlan({
    startDate,
    raceDate: intake.dataCursa,
    goal: intake.obiectiv,
    freeBlocks: intake.program,
    historyHoursPerWeek: history,
    intensityAllowed: intake.sanatate.avizCardiolog === 'da' && !labs.limitIntensity ? 'toate' : 'Z2',
    swimContinuous400: intake.inot?.nivel === 'continuu_400' || intake.inot?.nivel === 'peste_1500',
    athlete: await athleteInfo(userId, today),
    tests: await testsAvailable(userId, intake),
    level: { longestRideH: intake.bicicleta?.ceaMaiLungaOre ?? null, longestRunKm: intake.alergare?.ceaMaiLungaKm ?? null, easyPaceSecKm: parsePace(intake.evaluare?.ritmUsor ?? intake.alergare?.ritmActual ?? null) },
    run: isRunGoal(intake.obiectiv)
      ? {
          goalPaceSecKm: paceFromResult(intake.alergare?.tinta, RUN_DISTANCE_KM[intake.obiectiv]),
          canDoDistance: intake.alergare?.poateDistanta ?? null,
          longestRunKm: intake.alergare?.ceaMaiLungaKm ?? null,
        }
      : undefined,
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
  return {
    ok: true,
    budgetHours: result.budgetHours,
    weeks: result.weeks.length,
    workouts: rows.length,
    withoutLabs: !labs.valid,
    note: labs.limitIntensity ? `Intensitatea rămâne la Z1–Z2: ${labs.why}. De discutat cu medicul; planul se reface când urci analize noi.` : undefined,
  };
}

async function athleteInfo(userId: string, today: string): Promise<{ age: number | null; sex: 'm' | 'f' | null }> {
  const u = await select<{ sex: 'm' | 'f' | null; birth_year: number | null }>('users', { id: `eq.${userId}` }, { select: 'sex,birth_year', limit: 1 }).catch(() => []);
  const r = u[0];
  return { age: r?.birth_year ? Number(today.slice(0, 4)) - r.birth_year : null, sex: r?.sex ?? null };
}

/** Unde există deja date de test (zone din test, FTP, CSS) planul nu mai pune test în evaluare. */
async function testsAvailable(userId: string, intake: IntakeLike): Promise<{ alergare: boolean; bicicleta: boolean; inot: boolean }> {
  const z = await loadZones(userId).catch(() => null);
  return {
    alergare: !!(z?.alergare.fc_z1_z5 || z?.alergare.pace_prag),
    bicicleta: !!(z?.bicicleta.ftp || z?.bicicleta.fc_z1_z5 || intake.evaluare?.ftp),
    inot: !!z?.inot.css,
  };
}
