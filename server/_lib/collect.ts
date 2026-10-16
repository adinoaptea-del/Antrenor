import { swimDeclared } from '../../src/bar/sport-readiness.js';
import type { Goal } from '../../src/calendar/phases.js';
// Din baza de date în CollectorInput: tot ce intră în pachet pentru un sportiv, la o dată.
import { select, one } from './db.js';
import type { CollectorInput, EveningForm, LabsInput, MorningForm, SourceActivity, SourceDaily, ZonesInput } from '../../src/collector/types.js';
import type { IntensityAllowed, Phase, PlannedWorkout, Sport, Zone } from '../../src/types.js';
import { addDays, labsExpired } from '../../src/util/dates.js';
import type { OtherActivity } from '../../src/collector/other.js';
import { isRunGoal, RUN_DISTANCE_KM } from '../../src/calendar/phases.js';
import { fmtDuration, fmtPaceSec, paceFromResult, type RunResult } from '../../src/util/run.js';
import { phaseWeeks } from '../../src/calendar/phases.js';
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
  goal: '70.3' | 'olimpic' | 'sprint' | 'semimaraton' | 'maraton' | 'full' | null;
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
    // Doar când există: tabelele vechi (fără coloană) nu primesc câmpul.
    ...(w.suggestion ? { suggestion: w.suggestion } : {}),
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
}

export function toSourceDaily(r: WellnessRow): SourceDaily {
  return { date: r.date, source: r.source, hrv: r.hrv, rhr: r.rhr, sleepMin: r.sleep_min, bedtime: r.bedtime, wakeTime: r.wake_time, sleepScore: r.sleep_score, recoveryScore: r.recovery_score, respiratoryRate: r.respiratory_rate, weightKg: r.weight_kg, bodyFatPct: r.body_fat_pct };
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

export async function loadActivities(userId: string, from: string): Promise<SourceActivity[]> {
  const rows = await select<ActivityRow>('activities', { user_id: `eq.${userId}`, date: `gte.${from}` }, { order: 'date.desc', limit: 500 });
  return rows.map(toSourceActivity);
}

export async function loadWellness(userId: string, from: string): Promise<SourceDaily[]> {
  const rows = await select<WellnessRow>('wellness_daily', { user_id: `eq.${userId}`, date: `gte.${from}` }, { order: 'date.desc', limit: 500 });
  return rows.map(toSourceDaily);
}

export async function loadForms(userId: string, today: string): Promise<{ morning: MorningForm | null; evenings: EveningForm[]; intake: Record<string, unknown> | null }> {
  const morningRow = await one<{ answers: MorningForm }>('questionnaires', { user_id: `eq.${userId}`, kind: 'eq.dimineata', for_date: `eq.${today}` }, { order: 'created_at.desc' });
  const eveningRows = await select<{ answers: EveningForm }>('questionnaires', { user_id: `eq.${userId}`, kind: 'eq.seara', for_date: `gte.${addDays(today, -14)}` }, { order: 'created_at.desc', limit: 50 });
  const intakeRow = await one<{ answers: Record<string, unknown> }>('questionnaires', { user_id: `eq.${userId}`, kind: 'eq.intrare' }, { order: 'created_at.desc' });
  return { morning: morningRow?.answers ?? null, evenings: eveningRows.map((r) => r.answers), intake: intakeRow?.answers ?? null };
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
  if (!c) return { cardiolog: 'nu', intensitate_permisa: 'Z2' };
  return { cardiolog: c.cardiology ? (c.cleared_at ?? 'da') : 'nu', intensitate_permisa: c.intensity_allowed };
}

export function phaseAt(startDate: string, raceDate: string, today: string): Phase | null {
  try {
    const weeks = phaseWeeks(startDate, raceDate);
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
  const phase = planRow ? (phaseAt(planRow.start_date, planRow.race_date, today) ?? 'evaluare') : 'evaluare';
  const [weather, history, totals] = await Promise.all([
    user.lat != null && user.lon != null && user.city ? forecast(user.city, user.lat, user.lon, user.tz) : Promise.resolve(null),
    loadHistory(userId, today),
    planRow ? loadTotals(userId, planRow.start_date) : Promise.resolve(null),
  ]);
  const others = await loadOthers(userId, addDays(today, -8));
  const input: CollectorInput = {
    others,
    today,
    event,
    nowLocal: new Intl.DateTimeFormat('en-GB', { timeZone: user.tz || 'Europe/Bucharest', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date()),
    athlete: { goal: (user.goal as Goal | null) ?? null, declaredSwimM: swimDeclared(forms.intake), obiectiv: `${user.race_name ?? 'cursă'}${user.race_date ? `, ${user.race_date}` : ''}${runGoalText(user.goal, forms.intake)}${declaredLevel(forms.intake)}`, raceDate: user.race_date ?? addDays(today, 365), phase, sex: user.sex ?? null, varsta: user.birth_year ? Number(today.slice(0, 4)) - user.birth_year : null, inaltimeCm: user.height_cm ?? null },
    wellness,
    activities,
    plan: planRes.workouts,
    zones,
    morning: forms.morning,
    evenings: forms.evenings,
    labs,
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
export async function loadTotals(userId: string, since: string): Promise<NonNullable<CollectorInput['totals']>> {
  // Pe ferestre de 30 de zile: Supabase întoarce maximum 1000 de rânduri pe cerere.
  const raw: SourceActivity[] = [];
  const today = new Date().toISOString().slice(0, 10);
  for (let from = since; from <= today; from = addDays(from, 30)) {
    const rows = await select<ActivityRow>('activities', { user_id: `eq.${userId}`, date: [`gte.${from}`, `lt.${addDays(from, 30)}`] }, { limit: 1000 });
    raw.push(...rows.map(toSourceActivity));
  }
  const acts = dedupeActivities(raw);
  const bySport = { inot: { km: 0, ore: 0, sedinte: 0 }, bicicleta: { km: 0, ore: 0, sedinte: 0 }, alergare: { km: 0, ore: 0, sedinte: 0 }, forta: { km: 0, ore: 0, sedinte: 0 } };
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
  return rows.map((r) => ({ id: r.id, source: r.source, externalId: r.external_id, date: r.date, startLocal: r.start_local, kind: r.kind, name: r.name, minutes: r.minutes, avgHr: r.avg_hr, maxHr: r.max_hr }));
}
