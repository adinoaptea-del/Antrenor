// Planul: din chestionarul de intrare (program, nivel, aviz) și istoricul de activități → generatePlan → workouts_planned.
import { applyAway } from '../../src/calendar/actions.js';
import { currentAway, loadPrefs } from './prefs.js';
import { insert, one, remove, rpc, select, update, upsert } from './db.js';
import { loadActivities, loadForms, loadPlan, loadZones, toWorkoutRow } from './collect.js';
import { carryAdjustments, planSignature, weekTotals } from '../../src/calendar/regen-carry.js';
import { loadSchedules } from './agents.js';
import { dedupeActivities } from '../../src/collector/packet.js';
import { labsExpired } from '../../src/util/dates.js';
import { generatePlan, type GenerateResult } from '../../src/calendar/generate.js';
import type { FreeBlock, IntensityAllowed, PlannedWorkout } from '../../src/types.js';
import { addDays, diffDays, weekStart, weekday } from '../../src/util/dates.js';
import { FITNESS_WEEKS, GOAL_LABEL, WALK_WEEKS, isFitnessGoal, isRunGoal, isWalkGoal, type Goal } from '../../src/calendar/phases.js';
import { loadWalkRows } from './walking.js';
import { demonstratedMin, toWalkRecords } from '../../src/walking/rows.js';
import { fitnessProfile, unlockDecision, type FitnessIntake, type FitnessProfile } from '../../src/strength/fitness.js';
import { activeRestriction } from '../../src/calendar/safety.js';
import { currentFromIntake, isBeginnerRunner, planTarget, type RunIntakeLike } from '../../src/goals/run-target.js';

/** Ramura de alergare: aleasă în chestionar; la cele vechi, „timp” dacă există o țintă. */
const runBranch = (intake: { alergare?: { ramura?: 'finalizare' | 'timp' | null; tinta?: unknown } }): 'finalizare' | 'timp' => intake.alergare?.ramura ?? (intake.alergare?.tinta ? 'timp' : 'finalizare');
import { swimDeclared } from '../../src/bar/sport-readiness.js';
import { swimCapacity } from '../../src/calendar/swim-capacity.js';
import { parsePace, type RunResult } from '../../src/util/run.js';
import { decideReplan } from '../../src/calendar/reevaluate.js';

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
  oreRecente?: number | null;
  /**
   * Avizul cardiologic: întrebarea nu se mai pune la intrare (oamenii o ignorau). Lipsa răspunsului rămâne „necunoscut”,
   * nu devine aviz; necunoscutul nu blochează antrenamentul obișnuit. Intensitatea se limitează doar la o restricție
   * declarată (medicul a limitat efortul).
   */
  sanatate: { avizCardiolog?: 'da' | 'nu' | 'programat' | null; limitareMedic?: boolean | null };
  echipament?: { ceas?: string | null; whoop?: boolean; oura?: boolean };
  evaluare?: { inot400?: string | null; ritmUsor?: string | null; ftp?: number | null; alergare5k?: string | null; alergare10k?: string | null; testEfort?: string | null };
  /** Doar la fitness (femei): nivelul, zilele, minutele, accesul, mișcarea de acum și contextul opțional. */
  fitness?: FitnessIntake;
  /** Doar la mers: ținta de la început, cât merge acum fără oprire, mersul alert. */
  mers?: { tinta?: number | null; capacitate?: number | null; alert?: 'da' | 'nu' | 'nu_stiu' | null };
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
  await upsert('clearances', clearanceRow(userId, today, intake), 'user_id');
  if (intake.consimtamant) {
    await upsert('consents', { user_id: userId, health_data: true, adult: true, not_medical_ack: true, accepted_at: new Date().toISOString(), withdrawn_at: null }, 'user_id');
  }
}

/**
 * Rândul de aviz din răspunsuri: „declarat” doar când sportivul a spus că are aviz; restricția doar când a declarat-o.
 * Altfel necunoscut (cardiology = false, fără dată), cu intensitatea permisă: lipsa documentului nu e restricție.
 */
export function clearanceRow(userId: string, today: string, intake: Pick<IntakeLike, 'sanatate'>) {
  const limited = medicalLimit(intake);
  const declared = !limited && intake.sanatate?.avizCardiolog === 'da';
  return { user_id: userId, cardiology: declared, cleared_at: declared ? today : null, intensity_allowed: limited ? 'Z2' : 'toate' };
}

/** Limitare de efort doar când e declarată explicit (Profil → Date de sănătate). */
export function medicalLimit(intake: Pick<IntakeLike, 'sanatate'>): boolean {
  return intake.sanatate?.limitareMedic === true;
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
  /** Amprenta candidatului previzualizat: confirmarea activează exact acest plan (altfel cere o nouă privire). */
  signature?: string;
  /** Ajustările tale păstrate și cele care nu se mai aplică (cu motiv), plecările aplicate. */
  kept?: string[];
  dropped?: string[];
  awayApplied?: number;
  /** Între previzualizare și confirmare s-a schimbat ceva: nimic activat, uite varianta nouă. */
  stale?: boolean;
  /** Planul activ e deja exact acesta: nimic de schimbat (ex. a doua apăsare). */
  unchanged?: boolean;
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
/**
 * După un import de istoric: recalculează doza de start din istoricul nou și reface planul de la lunea viitoare doar
 * dacă diferența contează (src/calendar/reevaluate.ts). Sportivul nu mai trebuie să știe de „Refă planul”.
 */
export async function reevaluateAfterImport(userId: string, today: string): Promise<{ changed: boolean; message: string }> {
  const intake = await one<{ answers: IntakeLike }>('questionnaires', { user_id: `eq.${userId}`, kind: 'eq.intrare' }, { order: 'created_at.desc' });
  if (!intake) return { changed: false, message: 'Istoricul e salvat; planul se face după chestionarul de intrare.' };
  const preview = await generateAndStore(userId, today, intake.answers, { preview: true });
  if (!preview.ok || !preview.preview) return { changed: false, message: `Istoricul e salvat. Planul rămâne: ${preview.ok ? 'nu s-a putut calcula o variantă nouă' : preview.reason}` };
  const from = preview.from!;
  const plan = await one<{ id: string }>('plans', { user_id: `eq.${userId}`, active: 'eq.true' }, { order: 'created_at.desc' });
  const cur = plan ? await select<{ planned_minutes: number }>('workouts_planned', { plan_id: `eq.${plan.id}`, date: [`gte.${from}`, `lt.${addDays(from, 7)}`] }, { select: 'planned_minutes', limit: 50 }) : [];
  const d = decideReplan({ currentWeekH: plan && cur.length ? cur.reduce((n, w) => n + w.planned_minutes, 0) / 60 : null, proposedWeekH: preview.firstWeekHours ?? 0, historyH: await historyHours(userId, today), from: `luni, ${Number(from.slice(8, 10))}.${from.slice(5, 7)}` });
  if (!d.apply) return { changed: false, message: d.message };
  const r = await generateAndStore(userId, today, intake.answers);
  return r.ok ? { changed: true, message: d.message } : { changed: false, message: `Istoricul e salvat, dar planul nu s-a putut reface: ${r.reason}` };
}

export async function generateAndStore(userId: string, today: string, intake: IntakeLike, opts: { preview?: boolean; expect?: string } = {}): Promise<PlanOutcome> {
  if (intake.obiectiv === 'full') {
    return { ok: false, reason: 'Ironman complet nu e în versiunea asta a planului; alege 70.3 pentru acum.', budgetHours: 0 };
  }
  const nextMonday0 = addDays(weekStart(today), 7);
  // Același obiectiv și aceeași cursă: planul continuă din fazele lui (nu revine la evaluare); trecutul și săptămâna
  // curentă rămân cum sunt, se refac doar săptămânile de la lunea viitoare.
  const current = await one<{ id: string; start_date: string; race_date: string; goal: string }>('plans', { user_id: `eq.${userId}`, active: 'eq.true' }, { order: 'created_at.desc' });
  // Fitness: fără cursă; programul are 26 de săptămâni de la început. Același obiectiv = același program, continuat.
  // Primul plan (L-SIM-11): dacă azi e luni–joi, începe săptămâna asta, din zilele rămase; altfel de luni.
  const startThisWeek = !current && weekday(today) <= 3;
  const firstDay = startThisWeek ? today : nextMonday0;
  const nextMonday = firstDay;
  const fitness = isFitnessGoal(intake.obiectiv);
  // Mersul pe jos: tot un program de 26 de săptămâni, fără cursă.
  const walk = isWalkGoal(intake.obiectiv);
  if (fitness || walk) {
    const same = !!current && current.goal === intake.obiectiv && current.start_date < nextMonday0;
    intake = { ...intake, dataCursa: same ? current!.race_date : addDays(startThisWeek ? weekStart(today) : nextMonday0, (walk ? WALK_WEEKS : FITNESS_WEEKS) * 7) };
  }
  const continuing = !!current && current.goal === intake.obiectiv && current.race_date === intake.dataCursa && current.start_date < nextMonday0;
  const startDate = continuing ? current!.start_date : startThisWeek ? weekStart(today) : nextMonday0;
  const history = await historyHours(userId, today);
  const labs = await labsGate(userId);
  const prefs = await loadPrefs(userId);
  // Capacitatea la înot cu proveniență: măsurată (ceas) sau declarată; necunoscut rămâne null (V2-04).
  const swimCap = swimCapacity({ declaredM: swimDeclared(intake as unknown as Record<string, unknown>), activities: await loadActivities(userId, addDays(today, -56)).catch(() => []), today });
  const result: GenerateResult = generatePlan({
    walk: walk ? { profile: prefs.mers!, demonstratedMin: await walkDemonstrated(userId, today) } : undefined,
    fixed: prefs.fixe,
    fitness: fitness ? await fitnessWithAttendance(userId, today, fitnessProfile(intake.obiectiv as Goal, intake.fitness), continuing ? current!.id : null) : undefined,
    startDate,
    raceDate: intake.dataCursa,
    goal: intake.obiectiv as Goal,
    freeBlocks: intake.program,
    sportHours: intake.oreSport ?? null,
    historyHoursPerWeek: history,
    declaredRecentHours: intake.oreRecente ?? null,
    intensityAllowed: !medicalLimit(intake) && !labs.limitIntensity ? 'toate' : 'Z2',
    swimContinuous400: (swimCap.meters ?? 0) >= 400,
    athlete: await athleteInfo(userId, today).then((a) => ({ ...a, sex: a.sex ?? intake.sex ?? null })),
    tests: await testsAvailable(userId, intake),
    level: { longestRideH: intake.bicicleta?.ceaMaiLungaOre ?? null, longestRunKm: intake.alergare?.ceaMaiLungaKm ?? null, easyPaceSecKm: parsePace(intake.evaluare?.ritmUsor ?? intake.alergare?.ritmActual ?? null) },
    swim: { continuousM: swimCap.meters },
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
  // Candidatul complet (L-SIM-02): planul generat + plecările anunțate + ajustările tale de pe planul vechi. Același
  // candidat se previzualizează și se activează.
  const at = new Date().toISOString();
  let future = result.weeks.flatMap((w) => w.workouts).filter((x) => x.date >= nextMonday);
  let awayApplied = 0;
  for (const away of currentAway(prefs, today)) {
    const changed = new Map(applyAway(future, away, today, at).map((w) => [w.id, w]));
    awayApplied += changed.size;
    future = future.map((w) => changed.get(w.id) ?? w);
  }
  const old = current ? (await loadPlan(userId, nextMonday, addDays(intake.dataCursa, 1)).catch(() => ({ workouts: [] as PlannedWorkout[] }))).workouts.filter((w) => w.date >= nextMonday) : [];
  const carried = carryAdjustments(future, old, nextMonday, today, at);
  future = carried.workouts;
  const signature = planSignature(future);
  const first = weekTotals(future, nextMonday, addDays(weekStart(nextMonday), 7));
  const summary = {
    budgetHours: result.budgetHours,
    currentBudgetHours: current ? (await one<{ budget_hours: number }>('plans', { user_id: `eq.${userId}`, active: 'eq.true' }, { order: 'created_at.desc' }))?.budget_hours ?? null : null,
    weeks: result.weeks.length,
    workouts: future.filter((x) => x.status === 'planificat' || x.status === 'mutat').length,
    from: nextMonday,
    firstWeekHours: first.hours,
    firstWeekSessions: first.sessions,
    signature,
    kept: carried.kept,
    dropped: carried.dropped,
    awayApplied,
  };
  if (opts.preview) return { ok: true, preview: true, ...summary };
  // Confirmarea activează exact ce s-a văzut; dacă între timp s-au schimbat datele, nimic nu se activează în tăcere.
  if (opts.expect && opts.expect !== signature) return { ok: false, stale: true, reason: 'Între timp s-au schimbat datele planului. Uite din nou ce se schimbă, apoi confirmi.', preview: true, ...summary };
  // A doua apăsare (sau aceleași intrări): planul activ e deja exact candidatul — nicio versiune nouă, nimic dublat.
  if (old.length && planSignature(old) === signature) return { ok: true, unchanged: true, ...summary };

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
  const rows = future.map((x) => toWorkoutRow({ ...x, id: `${plan!.id}-${x.id}` }, userId, plan!.id));
  try {
    for (let i = 0; i < rows.length; i += 200) await insert('workouts_planned', rows.slice(i, i + 200));
    await rpc('activate_plan', { p_user: userId, p_plan: plan!.id, p_keep_before: nextMonday });
  } catch (e) {
    await remove('plans', { id: `eq.${plan!.id}`, active: 'eq.false' }).catch(() => undefined);
    throw e;
  }
  // Avizul se consideră dat: și planurile refăcute (ex. din Admin) aduc intensitatea permisă în pachetul agenților.
  await upsert('clearances', clearanceRow(userId, today, intake), 'user_id').catch(() => undefined);
  // Fitness: data de final e a programului (26 de săptămâni de la început), nu cea trimisă din chestionar.
  if (fitness || walk) await update('users', { id: `eq.${userId}` }, { race_date: intake.dataCursa }).catch(() => undefined);
  return {
    ok: true,
    budgetHours: result.budgetHours,
    weeks: result.weeks.length,
    workouts: rows.length,
    withoutLabs: !labs.valid,
    note: [labs.limitIntensity ? `Intensitatea rămâne la Z1–Z2: ${labs.why}. De discutat cu medicul; planul se reface când urci analize noi.` : null, startThisWeek ? 'Planul începe săptămâna asta, din zilele rămase.' : null].filter(Boolean).join(' ') || undefined,
    kept: carried.kept,
    dropped: carried.dropped,
    awayApplied,
    signature,
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

/**
 * Fitness: zilele de sală cresc doar după prezență reală. Din planul activ, ultimele 6 săptămâni încheiate: câte ședințe
 * de forță erau planificate și câte au o activitate de forță înregistrată (ceas sau marcată), pe săptămână.
 */
export async function fitnessWithAttendance(userId: string, today: string, p: FitnessProfile, planId: string | null): Promise<FitnessProfile> {
  if (!planId) return p;
  const thisMonday = weekStart(today);
  const from = addDays(thisMonday, -42);
  const planned = await select<{ date: string; status: string }>('workouts_planned', { plan_id: `eq.${planId}`, sport: 'eq.forta', date: [`gte.${from}`, `lt.${thisMonday}`] }, { select: 'date,status', limit: 200 });
  const acts = await select<{ date: string }>('activities', { user_id: `eq.${userId}`, sport: 'eq.forta', date: [`gte.${from}`, `lt.${thisMonday}`] }, { select: 'date', limit: 200 });
  // Feedback = jurnal de forță sau formular de seară în ziua ședinței; durerea ≥ 3 blochează creșterea (V2-07).
  const logs = await select<{ date: string }>('strength_log', { user_id: `eq.${userId}`, date: [`gte.${from}`, `lt.${thisMonday}`] }, { select: 'date', limit: 400 }).catch(() => []);
  const evenings = await select<{ for_date: string; answers: { durere?: { scor?: number | null } | null } }>('questionnaires', { user_id: `eq.${userId}`, kind: 'eq.seara', for_date: [`gte.${from}`, `lt.${thisMonday}`] }, { select: 'for_date,answers', limit: 200 }).catch(() => []);
  const weeks = Array.from({ length: 6 }, (_, i) => addDays(from, i * 7)).map((ws) => {
    const end = addDays(ws, 7);
    const inW = (d: string) => d >= ws && d < end;
    const pl = planned.filter((w) => inW(w.date) && w.status !== 'sters' && w.status !== 'anulat_sistem').length;
    const doneDays = new Set([...acts.filter((a) => inW(a.date)).map((a) => a.date), ...logs.filter((l) => inW(l.date)).map((l) => l.date)]);
    const fb = new Set([...logs.filter((l) => inW(l.date)).map((l) => l.date), ...evenings.filter((e) => inW(e.for_date)).map((e) => e.for_date)]).size;
    const pain = evenings.some((e) => inW(e.for_date) && (e.answers?.durere?.scor ?? 0) >= 3);
    return { planned: pl, done: Math.min(pl, doneDays.size), feedback: fb, pain };
  });
  const freeDays = new Set((await loadSchedules(userId).catch(() => [])).map((b) => b.day)).size;
  const forms = await loadForms(userId, today).catch(() => null);
  const restricted = forms ? activeRestriction({ today, morning: forms.morning as never, evenings: forms.evenings }) != null : false;
  const d = unlockDecision(p, weeks, { freeDays, restricted });
  return { ...p, unlocked: d.days, unlockWhy: d.why };
}

/**
 * Reevaluarea de duminică la fitness: dacă prezența reală a deblocat o zi în plus (sau planul are mai multe zile decât
 * s-au demonstrat), se reface planul de la lunea viitoare. Altfel nu se schimbă nimic.
 */
export async function reevaluateFitnessDays(userId: string, today: string): Promise<{ changed: boolean; days: number | null }> {
  const intake = await one<{ answers: IntakeLike }>('questionnaires', { user_id: `eq.${userId}`, kind: 'eq.intrare' }, { order: 'created_at.desc' });
  if (!intake || !isFitnessGoal(intake.answers.obiectiv)) return { changed: false, days: null };
  const plan = await one<{ id: string }>('plans', { user_id: `eq.${userId}`, active: 'eq.true' }, { order: 'created_at.desc' });
  if (!plan) return { changed: false, days: null };
  const p = await fitnessWithAttendance(userId, today, fitnessProfile(intake.answers.obiectiv as Goal, intake.answers.fitness), plan.id);
  const next = addDays(weekStart(today), 7);
  const nextWeek = await select<{ id: string }>('workouts_planned', { plan_id: `eq.${plan.id}`, sport: 'eq.forta', date: [`gte.${next}`, `lt.${addDays(next, 7)}`] }, { select: 'id', limit: 10 });
  const want = Math.min(p.days, p.unlocked ?? p.days);
  if (nextWeek.length === 0 || nextWeek.length === want) return { changed: false, days: nextWeek.length || null };
  const r = await generateAndStore(userId, today, intake.answers);
  return { changed: r.ok, days: want };
}

/** Cea mai lungă plimbare din ultimele 14 zile (minute): capacitatea demonstrată pentru planul de mers. */
async function walkDemonstrated(userId: string, today: string): Promise<number | null> {
  const u = await one<{ tz: string | null }>('users', { id: `eq.${userId}` }, { select: 'tz' }).catch(() => null);
  const { rows } = await loadWalkRows(userId, addDays(today, -15)).catch(() => ({ rows: [] }));
  return demonstratedMin(toWalkRecords(rows, u?.tz || 'Europe/Bucharest'), today);
}
