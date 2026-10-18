// Planul: din chestionarul de intrare (program, nivel, aviz) și istoricul de activități → generatePlan → workouts_planned.
import { applyAway } from '../../src/calendar/actions.js';
import { currentAway, loadPrefs } from './prefs.js';
import { insert, one, remove, rpc, select, update, upsert } from './db.js';
import { loadActivities, loadZones, toWorkoutRow } from './collect.js';
import { dedupeActivities } from '../../src/collector/packet.js';
import { labsExpired } from '../../src/util/dates.js';
import { generatePlan, type GenerateResult } from '../../src/calendar/generate.js';
import type { FreeBlock, IntensityAllowed } from '../../src/types.js';
import { addDays, diffDays, weekStart } from '../../src/util/dates.js';
import { GOAL_LABEL, isRunGoal, type Goal } from '../../src/calendar/phases.js';
import { currentFromIntake, isBeginnerRunner, planTarget, type RunIntakeLike } from '../../src/goals/run-target.js';

/** Ramura de alergare: aleasă în chestionar; la cele vechi, „timp” dacă există o țintă. */
const runBranch = (intake: { alergare?: { ramura?: 'finalizare' | 'timp' | null; tinta?: unknown } }): 'finalizare' | 'timp' => intake.alergare?.ramura ?? (intake.alergare?.tinta ? 'timp' : 'finalizare');
import { swimDeclared } from '../../src/bar/sport-readiness.js';
import { parsePace, type RunResult } from '../../src/util/run.js';

export interface IntakeLike {
  nume?: string;
  sex?: 'm' | 'f' | null;
  anNastere?: number | null;
  inaltime?: number | null;
  obiectiv: Goal | 'full';
  dataCursa: string;
  inot?: { nivel: string | null };
  bicicleta?: { ceaMaiLungaOre?: number | null };
  alergare?: { ceaMaiLungaKm?: number | null; ramura?: 'finalizare' | 'timp' | null; tinta?: RunResult | null; ritmActual?: string | null; poateDistanta?: boolean | null; rezultatActual?: RunResult | null };
  program: FreeBlock[];
  /** Ore pe săptămână pentru sport, declarate. */
  oreSport?: number | null;
  sanatate: { avizCardiolog: 'da' | 'nu' | 'programat' | null };
  echipament?: { ceas?: string | null; whoop?: boolean; oura?: boolean };
  evaluare?: { inot400?: string | null; ritmUsor?: string | null; ftp?: number | null; alergare5k?: string | null; alergare10k?: string | null; testEfort?: string | null };
}

/** Orele pe săptămână din ultimele până la 8 săptămâni, din activitățile deja sincronizate (gol = fără istoric). */
/**
 * Orele pe săptămână din ultimele 8 săptămâni, din activitățile canonice (corecturile sportivului aplicate, dublurile
 * dintre brățări unite). O săptămână fără nimic între prima și ultima săptămână cu date contează 0 (pauză reală);
 * înainte de prima săptămână cu date nu se știe nimic, deci nu intră.
 */
export async function historyHours(userId: string, today: string): Promise<number[]> {
  const from = addDays(weekStart(today), -56);
  const to = weekStart(today);
  const acts = dedupeActivities((await loadActivities(userId, from)).filter((a) => a.date < to));
  const weeks = new Map<string, number>();
  for (const a of acts) weeks.set(weekStart(a.date), (weeks.get(weekStart(a.date)) ?? 0) + a.minutes);
  if (!weeks.size) return [];
  const first = [...weeks.keys()].sort()[0]!;
  const out: number[] = [];
  for (let w = first; w < to; w = addDays(w, 7)) out.push(Math.round(((weeks.get(w) ?? 0) / 60) * 10) / 10);
  return out.reverse();
}

export async function saveIntake(userId: string, today: string, intake: IntakeLike & { consimtamant?: boolean }): Promise<void> {
  await upsert('questionnaires', { user_id: userId, kind: 'intrare', for_date: today, activity_id: null, answers: intake }, 'user_id,kind,for_date,activity_id');
  await update('users', { id: `eq.${userId}` }, { ...(intake.nume ? { name: intake.nume } : {}), goal: intake.obiectiv, race_date: intake.dataCursa, race_name: raceName(intake.obiectiv), ...(intake.sex ? { sex: intake.sex } : {}), ...(intake.anNastere ? { birth_year: intake.anNastere } : {}), ...(intake.inaltime && intake.inaltime >= 120 && intake.inaltime <= 230 ? { height_cm: Math.round(intake.inaltime) } : {}) });
  await remove('schedules', { user_id: `eq.${userId}` });
  if (intake.program.length) await insert('schedules', intake.program.map((b) => ({ user_id: userId, day: b.day, start_min: b.startMin, end_min: b.endMin, valid_from: today })));
  const intensity: IntensityAllowed = intake.sanatate.avizCardiolog === 'da' ? 'toate' : 'Z2';
  await upsert('clearances', { user_id: userId, cardiology: intake.sanatate.avizCardiolog === 'da', cleared_at: intake.sanatate.avizCardiolog === 'da' ? today : null, intensity_allowed: intensity }, 'user_id');
  if (intake.consimtamant) {
    await upsert('consents', { user_id: userId, health_data: true, adult: true, not_medical_ack: true, accepted_at: new Date().toISOString(), withdrawn_at: null }, 'user_id');
  }
}

function raceName(goal: IntakeLike['obiectiv']): string {
  if (goal === 'full') return 'Ironman';
  const l = GOAL_LABEL[goal];
  return l.charAt(0).toUpperCase() + l.slice(1);
}

export interface PlanOutcome {
  ok: boolean;
  reason?: string;
  budgetHours: number;
  weeks?: number;
  workouts?: number;
  options?: string[];
  preview?: boolean;
  currentBudgetHours?: number | null;
  from?: string;
  firstWeekHours?: number;
  firstWeekSessions?: number;
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
  const rows = await select<{ drawn_at: string; feritina: number | string | null; hemoglobina: number | string | null; other: { valori?: { nume: string; in_afara?: 'sub' | 'peste' | null }[] } | null }>('labs', { user_id: `eq.${userId}` }, { order: 'drawn_at.desc', limit: 20 });
  return labsGateFrom(rows, new Date().toISOString().slice(0, 10));
}

/**
 * Pe fiecare analit, ultima valoare cunoscută (nu doar ultimul buletin): un buletin nou fără feritină nu ascunde o
 * feritină mică de dinainte, iar un buletin expirat (peste 12 luni) nu „vindecă” limita: ea rămâne până la o valoare nouă.
 */
export function labsGateFrom(rows: { drawn_at: string; feritina: number | string | null; hemoglobina?: number | string | null; other: { valori?: { nume: string; in_afara?: 'sub' | 'peste' | null }[] } | null }[], today: string): { valid: boolean; limitIntensity: boolean; why: string | null } {
  if (!rows.length) return { valid: false, limitIntensity: false, why: null };
  const sorted = [...rows].sort((a, b) => (a.drawn_at < b.drawn_at ? 1 : -1));
  const valid = !labsExpired(sorted[0]!.drawn_at, today);
  const fer = sorted.find((r) => r.feritina != null && r.feritina !== '');
  const ferVal = fer ? Number(fer.feritina) : null;
  const hb = sorted.find((r) => (r.other?.valori ?? []).some((v) => /hemoglobin/i.test(v.nume)));
  const lowHb = !!hb && (hb.other?.valori ?? []).some((v) => /hemoglobin/i.test(v.nume) && v.in_afara === 'sub');
  const old = (d: string) => (labsExpired(d, today) ? `, din ${d}; limita rămâne până la o analiză nouă` : '');
  const why = ferVal != null && ferVal < 30 ? `feritina ${ferVal} µg/L (sub 30${old(fer!.drawn_at)})` : lowHb ? `hemoglobina sub intervalul laboratorului${old(hb!.drawn_at)}` : null;
  return { valid, limitIntensity: !!why, why };
}

/** Generează (sau regenerează) planul activ de la lunea următoare. Planul vechi rămâne în istoric, inactiv. */
export async function generateAndStore(userId: string, today: string, intake: IntakeLike, opts: { preview?: boolean } = {}): Promise<PlanOutcome> {
  if (intake.obiectiv === 'full') {
    return { ok: false, reason: 'Ironman complet nu e în versiunea asta a planului; alege 70.3 pentru acum.', budgetHours: 0 };
  }
  const nextMonday = addDays(weekStart(today), 7);
  // Același obiectiv și aceeași cursă: planul continuă din fazele lui (nu revine la evaluare); trecutul și săptămâna
  // curentă rămân cum sunt, se refac doar săptămânile de la lunea viitoare.
  const current = await one<{ id: string; start_date: string; race_date: string; goal: string }>('plans', { user_id: `eq.${userId}`, active: 'eq.true' }, { order: 'created_at.desc' });
  const continuing = !!current && current.goal === intake.obiectiv && current.race_date === intake.dataCursa && current.start_date < nextMonday;
  const startDate = continuing ? current!.start_date : nextMonday;
  const history = await historyHours(userId, today);
  const labs = await labsGate(userId);
  const prefs = await loadPrefs(userId);
  const result: GenerateResult = generatePlan({
    fixed: prefs.fixe,
    startDate,
    raceDate: intake.dataCursa,
    goal: intake.obiectiv,
    freeBlocks: intake.program,
    sportHours: intake.oreSport ?? null,
    historyHoursPerWeek: history,
    intensityAllowed: intake.sanatate.avizCardiolog === 'da' && !labs.limitIntensity ? 'toate' : 'Z2',
    swimContinuous400: intake.inot?.nivel === 'continuu_400' || intake.inot?.nivel === 'peste_1500',
    athlete: await athleteInfo(userId, today),
    tests: await testsAvailable(userId, intake),
    level: { longestRideH: intake.bicicleta?.ceaMaiLungaOre ?? null, longestRunKm: intake.alergare?.ceaMaiLungaKm ?? null, easyPaceSecKm: parsePace(intake.evaluare?.ritmUsor ?? intake.alergare?.ritmActual ?? null) },
    swim: { continuousM: swimDeclared(intake as unknown as Record<string, unknown>) },
    run: isRunGoal(intake.obiectiv)
      ? {
          // Ritmul de cursă din plan: ținta, sau timpul realist de acum când ținta e nerealistă (promisiunea din chestionar).
          goalPaceSecKm: runBranch(intake) === 'finalizare' ? null : planTarget(intake.obiectiv, intake.alergare?.tinta ?? null, currentFromIntake(intake as RunIntakeLike), diffDays(startDate, intake.dataCursa) / 7).paceSecKm,
          canDoDistance: intake.alergare?.poateDistanta ?? null,
          longestRunKm: intake.alergare?.ceaMaiLungaKm ?? null,
          branch: runBranch(intake),
          beginner: isBeginnerRunner(intake.alergare?.ceaMaiLungaKm),
        }
      : undefined,
  });
  if (!result.ok) return { ok: false, reason: result.reason, budgetHours: result.budgetHours, options: result.options };
  if (opts.preview) {
    // Previzualizare: ce s-ar schimba, fără să atingă planul activ.
    const fut = result.weeks.flatMap((w) => w.workouts).filter((x) => x.date >= nextMonday);
    const firstWeek = fut.filter((x) => x.date < addDays(nextMonday, 7));
    return {
      ok: true,
      preview: true,
      budgetHours: result.budgetHours,
      currentBudgetHours: (await one<{ budget_hours: number }>('plans', { user_id: `eq.${userId}`, active: 'eq.true' }, { order: 'created_at.desc' }))?.budget_hours ?? null,
      weeks: result.weeks.length,
      workouts: fut.length,
      from: nextMonday,
      firstWeekHours: Math.round((firstWeek.reduce((n, x) => n + x.plannedMinutes, 0) / 60) * 10) / 10,
      firstWeekSessions: firstWeek.length,
    };
  }

  // Planul nou se construiește întreg (inactiv), apoi se activează într-o singură tranzacție; un eșec la mijloc lasă
  // planul vechi activ, nu un plan gol sau pe jumătate.
  const prev = await select<{ version: number }>('plans', { user_id: `eq.${userId}` }, { order: 'version.desc', limit: 1 });
  const [plan] = await insert<{ id: string }>('plans', {
    user_id: userId,
    goal: intake.obiectiv,
    race_date: intake.dataCursa,
    start_date: startDate,
    budget_hours: result.budgetHours,
    version: (prev[0]?.version ?? 0) + 1,
    active: false,
  });
  let future = result.weeks.flatMap((w) => w.workouts).filter((x) => x.date >= nextMonday);
  // Plecările deja anunțate se aplică și pe planul nou (altfel „Refă planul” le-ar șterge).
  const at = new Date().toISOString();
  for (const away of currentAway(prefs, today)) {
    const changed = new Map(applyAway(future, away, today, at).map((w) => [w.id, w]));
    future = future.map((w) => changed.get(w.id) ?? w);
  }
  const rows = future.map((x) => toWorkoutRow({ ...x, id: `${plan!.id}-${x.id}` }, userId, plan!.id));
  try {
    for (let i = 0; i < rows.length; i += 200) await insert('workouts_planned', rows.slice(i, i + 200));
    await rpc('activate_plan', { p_user: userId, p_plan: plan!.id, p_keep_before: nextMonday });
  } catch (e) {
    await remove('plans', { id: `eq.${plan!.id}`, active: 'eq.false' }).catch(() => undefined);
    throw e;
  }
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
