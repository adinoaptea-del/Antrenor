import { activeRestriction, withIncidents } from '../../src/calendar/safety.js';
import { loadWalkRows, withWalks } from './walking.js';
import { isWalkName } from '../../src/walking/rows.js';
import { walkingView } from '../../src/walking/view.js';
import { swimDeclared } from '../../src/bar/sport-readiness.js';
import type { Goal } from '../../src/calendar/phases.js';
// Din baza de date în CollectorInput: tot ce intră în pachet pentru un sportiv, la o dată.
import { select, one } from './db.js';
import type { CollectorInput, EveningForm, LabsInput, MorningForm, SourceActivity, SourceDaily, ZonesInput } from '../../src/collector/types.js';
import type { IntensityAllowed, Phase, PlannedWorkout, Sport, Zone } from '../../src/types.js';
import { addDays, labsExpired, weekStart, weekday } from '../../src/util/dates.js';
import { loadPrefs } from './prefs.js';
import { DEFAULT_PREFS, nutritionDay } from '../../src/nutrition/engine.js';
import type { OtherActivity } from '../../src/collector/other.js';
import { targetSecFromIntake } from '../../src/goals/run-target.js';
import { isFitnessGoal, isRunGoal, isWalkGoal, RUN_DISTANCE_KM } from '../../src/calendar/phases.js';
import type { FitnessIntake } from '../../src/strength/fitness.js';
import { fmtDuration, fmtPaceSec, paceFromResult, type RunResult } from '../../src/util/run.js';
import { phaseWeeks } from '../../src/calendar/phases.js';
import { AI_BLOCKED_SOURCES, allowedForAI } from '../../src/collector/permissions.js';
import { recoverySummary } from '../../src/recovery/recovery.js';
import { historySummary, type HistorySummary } from '../../src/history/summary.js';
import { mergeWellness } from '../../src/collector/packet.js';
import { dedupeActivities } from '../../src/collector/packet.js';
import { forecast } from './weather.js';
import type { LabsForm } from '../../src/api-types.js';
type LabsFormOther = LabsForm['alte'];
import { compareLabs, type LabSnapshot } from '../../src/collector/labs-compare.js';

export interface UserRow {
  id: string;
  email: string;
  name: string;
  tz: string;
  goal: Goal | 'full' | null;
  race_name: string | null;
  race_date: string | null;
  city?: string | null;
  lat?: number | null;
  lon?: number | null;
  apple_token?: string | null;
  role?: string;
  sex?: 'm' | 'f' | null;
  birth_year?: number | null;
  height_cm?: number | null;
}

export interface WorkoutRow {
  id: string;
  plan_id: string;
  date: string;
  sport: Sport;
  type: PlannedWorkout['type'];
  planned_minutes: number;
  target_zones: number[];
  is_key: boolean;
  step: number | null;
  structure: string | null;
  intervals: PlannedWorkout['intervals'] | null;
  status: PlannedWorkout['status'];
  note: string | null;
  suggestion?: PlannedWorkout['suggestion'] | null;
  original?: PlannedWorkout['original'] | null;
  changed_at?: string | null;
}

export function toPlanned(r: WorkoutRow): PlannedWorkout {
  return {
    id: r.id,
    date: r.date,
    sport: r.sport,
    type: r.type,
    plannedMinutes: r.planned_minutes,
    targetZones: r.target_zones as Zone[],
    key: r.is_key,
    step: r.step ?? undefined,
    structure: r.structure ?? undefined,
    intervals: r.intervals ?? undefined,
    status: r.status,
    note: r.note ?? undefined,
    suggestion: r.suggestion ?? null,
    original: r.original ?? null,
    changedAt: r.changed_at ?? null,
  };
}

export function toWorkoutRow(w: PlannedWorkout, userId: string, planId: string): Record<string, unknown> {
  return {
    id: w.id,
    plan_id: planId,
    user_id: userId,
    date: w.date,
    sport: w.sport,
    type: w.type,
    planned_minutes: w.plannedMinutes,
    target_zones: w.targetZones,
    is_key: w.key,
    step: w.step ?? null,
    structure: w.structure ?? null,
    intervals: w.intervals ?? null,
    status: w.status,
    note: w.note ?? null,
    // Mereu scrisă (și null): o sugestie expirată se șterge explicit.
    suggestion: w.suggestion ?? null,
    // Forma din plan de dinainte de schimbări (eticheta „Actualizat”); null = ședința e cum a fost planificată.
    original: w.original ?? null,
    changed_at: w.changedAt ?? null,
  };
}

interface ActivityRow {
  id: string;
  source: SourceActivity['source'];
  external_id: string;
  date: string;
  start_local: string | null;
  sport: Sport;
  minutes: number;
  distance_km: number | null;
  avg_hr: number | null;
  max_hr: number | null;
  avg_pace_min_km: number | null;
  avg_cadence: number | null;
  avg_watts: number | null;
  time_in_zones_min: Record<string, number> | null;
  name: string | null;
  raw?: unknown;
}

export function toSourceActivity(r: ActivityRow): SourceActivity {
  return {
    id: r.id,
    externalId: r.external_id,
    source: r.source,
    date: r.date,
    startLocal: r.start_local,
    sport: r.sport,
    minutes: r.minutes,
    distanceKm: r.distance_km,
    avgHr: r.avg_hr,
    maxHr: r.max_hr,
    avgPaceMinKm: r.avg_pace_min_km,
    avgCadence: r.avg_cadence,
    avgWatts: r.avg_watts,
    timeInZonesMin: (r.time_in_zones_min as SourceActivity['timeInZonesMin']) ?? null,
    name: r.name,
    details: r.raw && typeof r.raw === 'object' ? (r.raw as SourceActivity['details']) : null,
  };
}

interface WellnessRow {
  date: string;
  source: SourceDaily['source'];
  hrv: number | null;
  rhr: number | null;
  sleep_min: number | null;
  bedtime: string | null;
  wake_time: string | null;
  sleep_score: number | null;
  recovery_score: number | null;
  respiratory_rate: number | null;
  weight_kg: number | null;
  body_fat_pct: number | null;
  temp_dev_c?: number | string | null;
}

export function toSourceDaily(r: WellnessRow): SourceDaily {
  return { date: r.date, source: r.source, hrv: r.hrv, rhr: r.rhr, sleepMin: r.sleep_min, bedtime: r.bedtime, wakeTime: r.wake_time, sleepScore: r.sleep_score, recoveryScore: r.recovery_score, respiratoryRate: r.respiratory_rate, weightKg: r.weight_kg, bodyFatPct: r.body_fat_pct, tempDevC: r.temp_dev_c == null ? null : Number(r.temp_dev_c) };
}

export async function loadUser(userId: string): Promise<UserRow> {
  const u = await one<UserRow>('users', { id: `eq.${userId}` });
  if (!u) throw new Error('utilizator inexistent');
  return u;
}

export async function loadPlan(userId: string, from: string, to: string): Promise<{ planId: string | null; workouts: PlannedWorkout[] }> {
  const plan = await one<{ id: string }>('plans', { user_id: `eq.${userId}`, active: 'eq.true' }, { order: 'version.desc' });
  if (!plan) return { planId: null, workouts: [] };
  const rows = await select<WorkoutRow>('workouts_planned', { plan_id: `eq.${plan.id}`, date: [`gte.${from}`, `lte.${to}`] }, { order: 'date.asc', limit: 1000 });
  const workouts = rows.map(toPlanned);
  return { planId: plan.id, workouts };
}

export async function loadActivities(userId: string, from: string, limit = 500): Promise<SourceActivity[]> {
  const [rows, ov, u] = await Promise.all([
    select<ActivityRow>('activities', { user_id: `eq.${userId}`, date: `gte.${from}` }, { order: 'date.desc', limit }),
    loadOverrides(userId),
    one<{ goal: string | null; tz: string | null }>('users', { id: `eq.${userId}` }, { select: 'goal,tz' }).catch(() => null),
  ]);
  // Obiectivul „mers”: plimbările (fără dubluri) intră ca activități de mers, peste tot (scor, agenți, pagină).
  return withWalks(userId, u?.goal ?? null, u?.tz ?? 'Europe/Bucharest', applyOverrides(rows.map(toSourceActivity), ov), from);
}

type Override = { activity_id: string; sport: SourceActivity['sport'] | null; ignored: boolean };

/** Corecturile sportivului (tabel lipsă = schemă veche: fără corecturi). */
export async function loadOverrides(userId: string): Promise<Override[]> {
  return select<Override>('activity_overrides', { user_id: `eq.${userId}` }, { limit: 1000 }).catch(() => []);
}

/** „Nu e antrenament” scoate ședința; „e de fapt X” îi schimbă sportul. Corectura bate brățara. */
export function applyOverrides(acts: SourceActivity[], ov: Override[]): SourceActivity[] {
  if (!ov.length) return acts;
  const by = new Map(ov.map((o) => [o.activity_id, o]));
  return acts.filter((a) => !by.get(a.id)?.ignored).map((a) => (by.get(a.id)?.sport ? { ...a, sport: by.get(a.id)!.sport! } : a));
}

export async function loadWellness(userId: string, from: string): Promise<SourceDaily[]> {
  const rows = await select<WellnessRow>('wellness_daily', { user_id: `eq.${userId}`, date: `gte.${from}` }, { order: 'date.desc', limit: 500 });
  return rows.map(toSourceDaily);
}

export async function loadForms(userId: string, today: string): Promise<{ morning: MorningForm | null; mornings: MorningForm[]; evenings: EveningForm[]; intake: Record<string, unknown> | null; incidents: { mornings: MorningForm[]; evenings: EveningForm[] } }> {
  const morningRow = await one<{ answers: MorningForm }>('questionnaires', { user_id: `eq.${userId}`, kind: 'eq.dimineata', for_date: `eq.${today}` }, { order: 'created_at.desc' });
  const eveningRows = await select<{ answers: EveningForm }>('questionnaires', { user_id: `eq.${userId}`, kind: 'eq.seara', for_date: `gte.${addDays(today, -14)}` }, { order: 'created_at.desc', limit: 50 });
  const intakeRow = await one<{ answers: Record<string, unknown> }>('questionnaires', { user_id: `eq.${userId}`, kind: 'eq.intrare' }, { order: 'created_at.desc' });
  const morningRows = await select<{ answers: MorningForm; for_date: string }>('questionnaires', { user_id: `eq.${userId}`, kind: 'eq.dimineata', for_date: `gte.${addDays(today, -14)}` }, { order: 'created_at.desc', limit: 60 }).catch(() => []);
  // Una pe zi (cea mai recentă), cu data zilei; și cele parțiale.
  const byDay = new Map<string, MorningForm>();
  for (const r of morningRows) if (!byDay.has(r.for_date)) byDay.set(r.for_date, { ...r.answers, date: r.for_date });
  // Incidentele (auditul v93, A02): durerea și simptomul cardiac nu expiră odată cu fereastra de citire. Se încarcă
  // raportările din ultimele 12 luni; se închid doar prin declarația sportivului („a trecut” / „evaluat medical”).
  const [painRows, cardiacRows] = await Promise.all([
    select<{ answers: EveningForm; for_date: string }>('questionnaires', { user_id: `eq.${userId}`, kind: 'eq.seara', for_date: `gte.${addDays(today, -365)}`, 'answers->durere->>scor': 'not.is.null' }, { order: 'for_date.asc', limit: 1000 }).catch(() => []),
    select<{ answers: MorningForm; for_date: string }>('questionnaires', { user_id: `eq.${userId}`, kind: 'eq.dimineata', for_date: `gte.${addDays(today, -365)}`, or: '(answers->semnale->>simptom_cardiac.eq.true,answers->semnale->>cardiac_evaluat.eq.true,answers->semnale->>febra.eq.true)' }, { order: 'for_date.asc', limit: 1000 }).catch(() => []),
  ]);
  const incidents = { evenings: painRows.map((r) => ({ ...r.answers, date: r.answers.date ?? r.for_date })), mornings: cardiacRows.map((r) => ({ ...r.answers, date: r.for_date })) };
  return { morning: morningRow?.answers ?? null, mornings: [...byDay.values()], evenings: eveningRows.map((r) => r.answers), intake: intakeRow?.answers ?? null, incidents };
}

export async function loadZones(userId: string): Promise<ZonesInput | null> {
  const z = await one<{ run_hr_zones: number[] | null; run_threshold_pace_sec_km: number | null; bike_ftp_w: number | null; bike_hr_zones: number[] | null; swim_css_sec_100m: number | null; hr_max_test: number | null; tested_at: string | null; source: string | null }>('zones', { user_id: `eq.${userId}` });
  if (!z || z.source === 'provizoriu') return null; // zonele provizorii nu intră în pachet: „estimările ceasului nu intră”
  const five = (a: number[] | null) => (a && a.length === 5 ? (a as [number, number, number, number, number]) : null);
  return {
    alergare: { fc_z1_z5: five(z.run_hr_zones), pace_prag: z.run_threshold_pace_sec_km ? `${Math.floor(z.run_threshold_pace_sec_km / 60)}:${String(z.run_threshold_pace_sec_km % 60).padStart(2, '0')}` : null },
    bicicleta: { ftp: z.bike_ftp_w, fc_z1_z5: five(z.bike_hr_zones) },
    inot: { css: z.swim_css_sec_100m },
    fcmax_test: z.hr_max_test,
    data_test: z.tested_at,
  };
}

type LabRow = { feritina: number | null; vitamina_d: number | null; hemoglobina: number | null; ck: number | null; crp: number | null; drawn_at: string; uploaded_at?: string | null; other: { valori?: NonNullable<LabsFormOther> } | null };

export function labSnapshot(l: LabRow): LabSnapshot {
  const n = (v: unknown) => (v == null || v === '' ? null : Number(v));
  return {
    data: l.drawn_at,
    feritina: n(l.feritina),
    vitamina_d: n(l.vitamina_d),
    hemoglobina: n(l.hemoglobina),
    ck: n(l.ck),
    crp: n(l.crp),
    alte: (l.other?.valori ?? []).map((v) => ({ nume: v.nume, valoare: v.valoare, unitate: v.unitate, ref_min: v.ref_min ?? null, ref_max: v.ref_max ?? null })),
  };
}

export async function loadLabs(userId: string): Promise<LabsInput | null> {
  const rows = await select<LabRow>('labs', { user_id: `eq.${userId}` }, { order: 'drawn_at.desc', limit: 2 });
  const l = rows[0];
  const today = new Date().toISOString().slice(0, 10);
  // Mai vechi de 12 luni: nu mai sunt valabile, agenții lucrează ca și cum n-ar exista.
  if (!l || labsExpired(l.drawn_at, today)) return null;
  const now = labSnapshot(l);
  const out = (l.other?.valori ?? []).filter((v) => v.in_afara).map((v) => ({ nume: v.nume, valoare: v.valoare, unitate: v.unitate, interval: v.ref_text, directie: v.in_afara! }));
  const uploaded = l.uploaded_at ? l.uploaded_at.slice(0, 10) : null;
  return {
    feritina: now.feritina,
    vitamina_d: now.vitamina_d,
    hemoglobina: now.hemoglobina,
    ck: now.ck,
    crp: now.crp,
    data_analize: l.drawn_at,
    in_afara_intervalului: out,
    noi: uploaded != null && uploaded >= addDays(today, -3),
    comparatie: compareLabs(now, rows[1] ? labSnapshot(rows[1]) : null),
  };
}

export async function loadClearance(userId: string): Promise<{ cardiolog: string; intensitate_permisa: IntensityAllowed }> {
  const c = await one<{ cardiology: boolean; cleared_at: string | null; intensity_allowed: IntensityAllowed }>('clearances', { user_id: `eq.${userId}` });
  // „declarat” = spus de sportiv (nu verificat clinic); „necunoscut” = nu e aviz și nici restricție.
  if (!c) return { cardiolog: 'necunoscut', intensitate_permisa: 'toate' };
  if (c.intensity_allowed === 'Z2') return { cardiolog: 'restrictie declarata', intensitate_permisa: 'Z2' };
  return { cardiolog: c.cardiology ? `declarat de sportiv${c.cleared_at ? ` (${c.cleared_at})` : ''}` : 'necunoscut', intensitate_permisa: c.intensity_allowed };
}

export function phaseAt(startDate: string, raceDate: string, today: string, goal?: string | null, recoveryEvery = 4): Phase | null {
  try {
    const weeks = phaseWeeks(startDate, raceDate, recoveryEvery, goal);
    const w = [...weeks].reverse().find((x) => x.weekStart <= today);
    return w?.phase ?? null;
  } catch {
    return null;
  }
}

/** Tot ce intră în pachet, pentru evenimentul dat. */
export async function collect(userId: string, today: string, event: CollectorInput['event']): Promise<{ input: CollectorInput; user: UserRow; planId: string | null }> {
  const user = await loadUser(userId);
  const [planRes, activities, wellness, forms, zones, labs, aviz] = await Promise.all([
    loadPlan(userId, addDays(today, -35), addDays(today, 14)),
    loadActivities(userId, addDays(today, -70)),
    loadWellness(userId, addDays(today, -70)),
    loadForms(userId, today),
    loadZones(userId),
    loadLabs(userId),
    loadClearance(userId),
  ]);
  const planRow = planRes.planId ? await one<{ start_date: string; race_date: string }>('plans', { id: `eq.${planRes.planId}` }) : null;
  const phase = planRow ? (phaseAt(planRow.start_date, planRow.race_date, today, user.goal) ?? 'evaluare') : 'evaluare';
  const [weather, history, totals] = await Promise.all([
    user.lat != null && user.lon != null && user.city ? forecast(user.city, user.lat, user.lon, user.tz) : Promise.resolve(null),
    loadHistory(userId, today),
    planRow ? loadTotals(userId, planRow.start_date, true) : Promise.resolve(null),
  ]);
  // Pachetul merge la AI: sursele din registrul de blocare (permissions.ts) nu intră deloc, nici prin derivate.
  // La obiectivul „mers”, plimbările sunt activitățile planului (nu „mișcare în plus”): nu se numără de două ori.
  const walkGoal = isWalkGoal(user.goal);
  const others = allowedForAI(await loadOthers(userId, addDays(today, -8))).filter((o) => !(walkGoal && isWalkName(o.name)));
  // Mesele de azi, din același motor ca ecranul „Mese recomandate” (aceleași intrări, aceeași zi a planului).
  const bodyRow = await one<{ date: string; weight_kg: number | null }>('wellness_daily', { user_id: `eq.${userId}`, source: 'eq.manual', weight_kg: 'not.is.null' }, { order: 'date.desc' }).catch(() => null);
  const prefs = await loadPrefs(userId).catch(() => null);
  const program = ((forms.intake?.program as { day: number; startMin: number }[] | undefined) ?? []).filter((x) => x.day === weekday(today)).map((x) => x.startMin).sort((a, b) => a - b);
  const age = user.birth_year ? Number(today.slice(0, 4)) - user.birth_year : null;
  const nutritionRestriction = activeRestriction({ today, morning: forms.morning as never, evenings: withIncidents(forms.evenings, forms.incidents.evenings), mornings: withIncidents(forms.mornings, forms.incidents.mornings) as never })?.verdict ?? null;
  const tiredRows = await select<{ workout_id: string }>('workout_outcomes', { user_id: `eq.${userId}`, motiv: 'eq.oboseala', reported_at: `gte.${addDays(today, -7)}` }, { select: 'workout_id', limit: 10 }).catch(() => []);
  const mealsToday = nutritionDay({
    date: today,
    athlete: { sex: user.sex ?? null, age, heightCm: user.height_cm ?? null, weightKg: bodyRow?.weight_kg != null ? Number(bodyRow.weight_kg) : null, weightDate: bodyRow?.date ?? null },
    goal: user.goal ?? null,
    athleteId: userId,
    sessions: planRes.workouts.filter((w) => w.date === today && (w.status === 'planificat' || w.status === 'mutat') && w.type !== 'odihna').map((w, i) => ({ sport: w.sport, type: w.type, minutes: w.plannedMinutes, key: w.key, startMin: program[i] ?? program[0] ?? null })),
    prefs: { ...DEFAULT_PREFS, ...(prefs?.nutritie ?? {}) },
    // Auditul v93, A79: aceleași blocaje ca ecranul (restricția activă, oboseala repetată, sarcina, minorul), ca AI-ul să
    // nu vadă deficit într-o zi roșie sau galbenă.
    blockers: { restriction: nutritionRestriction, fatigue: tiredRows.length >= 2, pregnancy: (forms.intake?.fitness as { sarcina?: string } | undefined)?.sarcina === 'da' || (forms.intake as { sarcina?: string } | null)?.sarcina === 'da', minor: age != null && age < 18 },
  });
  const walkLoad = walkGoal ? await loadWalkRows(userId, addDays(weekStart(today), -63)).catch(() => null) : null;
  const input: CollectorInput = {
    walking: walkLoad && prefs ? walkingView({ rows: walkLoad.rows, tz: user.tz || 'Europe/Bucharest', today, profile: prefs.mers!, plan: planRes.workouts.filter((w) => w.status !== 'sters'), schemaReady: walkLoad.schemaReady }) : null,
    mealsToday,
    others,
    today,
    event,
    nowLocal: new Intl.DateTimeFormat('en-GB', { timeZone: user.tz || 'Europe/Bucharest', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date()),
    athlete: {
      goal: (user.goal as Goal | null) ?? null,
      declaredSwimM: swimDeclared(forms.intake),
      obiectiv: `${user.race_name ?? 'cursă'}${user.race_date ? `, ${user.race_date}` : ''}${runGoalText(user.goal, forms.intake)}${declaredLevel(forms.intake)}`,
      targetSec: targetSecFromIntake(user.goal, (forms.intake?.alergare as { tinta?: RunResult | null } | undefined)?.tinta ?? null),
      fitness: isFitnessGoal(user.goal) ? ((forms.intake?.fitness as FitnessIntake | undefined) ?? {}) : null,
      ramura: isRunGoal(user.goal) ? ((forms.intake?.alergare as { ramura?: 'finalizare' | 'timp' | null; tinta?: unknown } | undefined)?.ramura ?? ((forms.intake?.alergare as { tinta?: unknown } | undefined)?.tinta ? 'timp' : 'finalizare')) : null,
      raceDate: user.race_date ?? addDays(today, 365),
      phase,
      sex: user.sex ?? null,
      varsta: user.birth_year ? Number(today.slice(0, 4)) - user.birth_year : null,
      inaltimeCm: user.height_cm ?? null,
    },
    wellness: allowedForAI(wellness),
    activities: allowedForAI(activities),
    trainingHistory: await loadHistorySummary(userId, today).catch(() => null),
    recoveryEffects: recoverySummary(today, allowedForAI(await loadOthers(userId, addDays(today, -92))), mergeWellness(allowedForAI(await loadWellness(userId, addDays(today, -92)))).map((m) => ({ date: m.date, hrv: m.hrv, rhr: m.rhr, sleepMin: m.sleepMin }))).effects,
    // Doar faptul că o sursă blocată e conectată (din tokenuri, nu din datele ei): AI-ul știe că nu vede tot.
    hiddenSources: AI_BLOCKED_SOURCES.size ? (await select<{ provider: string }>('oauth_tokens', { user_id: `eq.${userId}`, provider: `in.(${[...AI_BLOCKED_SOURCES].join(',')})` }, { select: 'provider', limit: 5 }).catch(() => [])).map((r) => r.provider) : [],
    plan: planRes.workouts,
    zones,
    morning: forms.morning,
    morningHistory: forms.mornings,
    evenings: forms.evenings,
    incidents: forms.incidents,
    labs,
    labsLimit: await import('./plan.js').then((m) => m.labsGate(userId)).then((g) => (g.limitIntensity ? g.why : null)).catch(() => null),
    load: null,
    aviz,
    weather,
    history,
    totals,
  };
  return { input, user, planId: planRes.planId };
}

/** Zile verzi la rând (până ieri inclusiv) și data ultimei creșteri aplicate de calendar. */
export async function loadHistory(userId: string, today: string): Promise<{ greenStreak: number; lastIncrease: string | null }> {
  const [rows, inc] = await Promise.all([
    select<{ date: string; verdict: string }>('readiness_daily', { user_id: `eq.${userId}`, date: [`gte.${addDays(today, -30)}`, `lt.${today}`] }, { order: 'date.desc', limit: 31 }),
    one<{ date: string }>('journal', { user_id: `eq.${userId}`, entry: 'like.calendar: progres:*' }, { order: 'date.desc' }),
  ]);
  let streak = 0;
  let expected = addDays(today, -1);
  for (const r of rows) {
    if (r.date !== expected || r.verdict !== 'verde') break;
    streak++;
    expected = addDays(expected, -1);
  }
  return { greenStreak: streak, lastIncrease: inc?.date ?? null };
}

/** Totaluri pe sport de la începutul pregătirii (data planului activ). Activități deduplicate pe sursă. */
export async function loadTotals(userId: string, since: string, forAI = false): Promise<NonNullable<CollectorInput['totals']>> {
  // Pe ferestre de 30 de zile: Supabase întoarce maximum 1000 de rânduri pe cerere.
  const raw: SourceActivity[] = [];
  const today = new Date().toISOString().slice(0, 10);
  for (let from = since; from <= today; from = addDays(from, 30)) {
    const rows = await select<ActivityRow>('activities', { user_id: `eq.${userId}`, date: [`gte.${from}`, `lt.${addDays(from, 30)}`] }, { limit: 1000 });
    raw.push(...rows.map(toSourceActivity));
  }
  const all = applyOverrides(raw, await loadOverrides(userId));
  const acts = dedupeActivities(forAI ? allowedForAI(all) : all);
  const bySport = { inot: { km: 0, ore: 0, sedinte: 0 }, bicicleta: { km: 0, ore: 0, sedinte: 0 }, alergare: { km: 0, ore: 0, sedinte: 0 }, forta: { km: 0, ore: 0, sedinte: 0 }, mers: { km: 0, ore: 0, sedinte: 0 } };
  for (const a of acts) {
    const t = bySport[a.sport];
    t.km += a.distanceKm ?? 0;
    t.ore += a.minutes / 60;
    t.sedinte += 1;
  }
  for (const t of Object.values(bySport)) {
    t.km = Math.round(t.km * 10) / 10;
    t.ore = Math.round(t.ore * 10) / 10;
  }
  return { since, bySport };
}

/** La semimaraton / maraton: ținta și nivelul de plecare, din chestionar (ritmurile calculate exact din timp și distanță). */
function runGoalText(goal: string | null, intake: Record<string, unknown> | null): string {
  if (!isRunGoal(goal) || !intake) return '';
  const a = (intake.alergare ?? {}) as { tinta?: RunResult | null; ritmActual?: string | null; poateDistanta?: boolean | null; rezultatActual?: RunResult | null };
  const d = RUN_DISTANCE_KM[goal];
  const t = paceFromResult(a.tinta, d);
  const now = paceFromResult(a.rezultatActual, d);
  const parts = [
    t ? `ținta ${fmtDuration(t * d)} (${fmtPaceSec(t)}/km)` : null,
    a.ritmActual ? `ritm ușor acum ${a.ritmActual}/km` : null,
    a.poateDistanta === true ? `poate distanța acum${now ? `: ${fmtDuration(now * d)} (${fmtPaceSec(now)}/km)` : ''}` : a.poateDistanta === false ? 'nu poate încă distanța' : null,
  ].filter(Boolean);
  return parts.length ? ` · doar alergare · ${parts.join(' · ')}` : ' · doar alergare';
}

/** Ce a declarat sportivul în chestionar despre nivelul de acum, pe sport (până la primul test). */
function declaredLevel(intake: Record<string, unknown> | null): string {
  const e = (intake?.evaluare ?? null) as { inot400?: string | null; bicicletaViteza?: number | null; ftp?: number | null; alergare5k?: string | null; alergare10k?: string | null; ritmUsor?: string | null; testEfort?: string | null } | null;
  if (!e) return '';
  const parts = [
    e.inot400 ? `400 m înot ${e.inot400}` : null,
    e.bicicletaViteza ? `bicicletă ${e.bicicletaViteza} km/h medie` : null,
    e.ftp ? `FTP declarat ${e.ftp} W` : null,
    e.ritmUsor ? `alergare ușoară ${e.ritmUsor}/km` : null,
    e.alergare5k ? `5 km în ${e.alergare5k}` : null,
    e.alergare10k ? `10 km în ${e.alergare10k}` : null,
    e.testEfort && e.testEfort !== 'nu' ? `test de efort: ${e.testEfort}` : null,
  ].filter(Boolean);
  return parts.length ? ` · nivel declarat: ${parts.join(', ')}` : '';
}

export async function loadOthers(userId: string, from: string): Promise<OtherActivity[]> {
  const rows = await select<{ id: string; source: string; external_id: string; date: string; start_local: string | null; kind: 'recuperare' | 'activ'; name: string; minutes: number; avg_hr: number | null; max_hr: number | null }>('other_activities', { user_id: `eq.${userId}`, date: `gte.${from}` }, { order: 'date.desc', limit: 200 }).catch(() => []);
  // Ce a șters sportivul (schema 9: excluded) nu se mai numără nicăieri.
  return rows.filter((r) => !(r as { excluded?: boolean | null }).excluded).map((r) => ({ id: r.id, source: r.source, externalId: r.external_id, date: r.date, startLocal: r.start_local, kind: r.kind, name: r.name, minutes: r.minutes, avgHr: r.avg_hr, maxHr: r.max_hr }));
}

/** Rezumatul istoricului (24 de luni), din coloanele ușoare ale activităților. */
export async function loadHistorySummary(userId: string, today: string): Promise<HistorySummary> {
  const rows = await select<{ id: string; source: string; external_id: string; date: string; sport: Sport; minutes: number; distance_km: number | string | null; name: string | null }>('activities', { user_id: `eq.${userId}`, date: `gte.${addDays(today, -730)}` }, { select: 'id,source,external_id,date,sport,minutes,distance_km,name', order: 'date.desc', limit: 4000 });
  const acts = dedupeActivities(
    allowedForAI(applyOverrides(rows.map((r) => ({ id: r.id, source: r.source as SourceActivity['source'], externalId: r.external_id, date: r.date, sport: r.sport, minutes: r.minutes, distanceKm: r.distance_km == null ? null : Number(r.distance_km), name: r.name })), await loadOverrides(userId))),
  );
  const ev = await select<{ activity_id: string | null; answers: { tip_neplanificat?: string | null } }>('questionnaires', { user_id: `eq.${userId}`, kind: 'eq.seara' }, { select: 'activity_id,answers', limit: 2000 }).catch(() => []);
  return historySummary(today, acts, ev.filter((e) => e.answers?.tip_neplanificat === 'cursa' && e.activity_id).map((e) => e.activity_id!));
}
