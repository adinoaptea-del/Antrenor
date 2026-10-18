// Samsung Health (și orice altă aplicație Android care scrie în Health Connect), prin aplicația „Health Connect Webhook”
// (open source, Play Store: com.hcwebhook.app) sau orice exportator care trimite înregistrările Health Connect ca JSON
// la adresa personală a sportivului (același token ca la Apple Health).
//
// Formatul exact al exportatorului nu e standardizat, așa că parserul e tolerant: caută înregistrări Health Connect după
// tipul lor (SleepSessionRecord, HeartRateVariabilityRmssdRecord, RestingHeartRateRecord, ExerciseSessionRecord,
// WeightRecord), fie într-o listă `records` cu câmpul `type`/`recordType`, fie grupate pe chei cu numele tipului.
// Ce nu recunoaște nu inventează: tipurile necunoscute se întorc la vedere (sync_log), ca să le adăugăm după primul
// telefon Samsung conectat.
//
// Codurile ExerciseSessionRecord.exerciseType (Health Connect): 8 BIKING, 9 BIKING_STATIONARY, 25 ELLIPTICAL, 36 HIIT,
// 37 HIKING, 53 ROWING, 54 ROWING_MACHINE, 56 RUNNING, 57 RUNNING_TREADMILL, 70 STRENGTH_TRAINING, 73 SWIMMING_OPEN_WATER,
// 74 SWIMMING_POOL, 79 WALKING, 81 WEIGHTLIFTING, 83 YOGA. Stadiile de somn: 1 AWAKE, 3 OUT_OF_BED, 7 AWAKE_IN_BED.

import { swimPace100, type ActivityDetails } from '../../src/collector/details.js';
import { classifyOther, type OtherActivity } from '../../src/collector/other.js';
import type { AppleDay, AppleWorkout } from './apple.js';

type Rec = Record<string, unknown>;

const EXERCISE_CODE: Record<number, string> = { 8: 'biking', 9: 'biking', 25: 'elliptical', 36: 'hiit', 37: 'hiking', 53: 'rowing', 54: 'rowing', 56: 'running', 57: 'running', 70: 'strength', 73: 'swimming', 74: 'swimming', 79: 'walking', 81: 'weightlifting', 83: 'yoga' };

const normType = (t: string) => t.toLowerCase().replace(/record$/, '').replace(/[^a-z]/g, '');
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null);
const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

/** Prima valoare numerică găsită pe oricare din chei (și în obiecte ca { inMeters: 1200 } / { value: 52 }). */
function pick(r: Rec, keys: string[], inner: string[] = ['value', 'inMeters', 'inKilograms', 'inMilliseconds', 'beatsPerMinute']): number | null {
  for (const k of keys) {
    const v = r[k];
    const n = num(v);
    if (n != null) return n;
    if (v && typeof v === 'object') {
      for (const ik of inner) {
        const n2 = num((v as Rec)[ik]);
        if (n2 != null) return n2;
      }
    }
  }
  return null;
}

/** Momentul ca milisecunde: ISO (cu sau fără offset), epoch ms sau epoch s. */
function whenMs(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v > 1e11 ? v : v * 1000;
  if (typeof v === 'string') {
    const t = Date.parse(v);
    return Number.isNaN(t) ? null : t;
  }
  if (v && typeof v === 'object') {
    const o = v as Rec;
    return whenMs(o.epochSecond ?? o.epochMillis ?? o.time ?? o.value);
  }
  return null;
}

/** Data și ora locală ale unui moment, în fusul sportivului. */
function local(ms: number, tz: string): { date: string; hm: string; minutes: number } {
  const f = new Intl.DateTimeFormat('en-GB', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
  const parts = Object.fromEntries(f.formatToParts(new Date(ms)).map((p) => [p.type, p.value]));
  const hour = parts.hour === '24' ? '00' : parts.hour!;
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hm: `${hour}:${parts.minute}`, minutes: Number(hour) * 60 + Number(parts.minute) };
}

/** Toate înregistrările din pachet, cu tipul normalizat. */
export function collectRecords(body: unknown): { type: string; rec: Rec }[] {
  const out: { type: string; rec: Rec }[] = [];
  const GENERIC = /^(records?|data|items|results?|entries|list|payload|body)$/i;
  // Tipul înregistrării: întâi câmpul ei (type / recordType / dataType), apoi numele cheii sub care a venit lista
  // (ex. „SleepSessionRecord”: [...]); o cheie generică („records”) nu spune tipul.
  const push = (keyHint: string | null, rec: Rec) => {
    const t = str(rec.type) ?? str(rec.recordType) ?? str(rec.dataType) ?? str(rec.kind) ?? (keyHint && !GENERIC.test(keyHint) ? keyHint : null);
    if (t) out.push({ type: normType(t), rec });
  };
  const walk = (node: unknown, keyHint: string | null, depth: number) => {
    if (depth > 4 || !node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const x of node) if (x && typeof x === 'object' && !Array.isArray(x)) push(keyHint, x as Rec);
      return;
    }
    const o = node as Rec;
    if (str(o.type) || str(o.recordType) || str(o.dataType)) {
      // Un obiect-înregistrare singur (ex. body = o înregistrare).
      if (depth === 0 || keyHint == null) push(null, o);
    }
    for (const [k, v] of Object.entries(o)) {
      if (Array.isArray(v)) walk(v, k, depth + 1);
      else if (v && typeof v === 'object' && ['data', 'payload', 'records', 'result', 'body', 'healthConnect', 'health_connect'].includes(k)) walk(v, k, depth + 1);
    }
  };
  walk(body, null, 0);
  return out;
}

function sportOfExercise(rec: Rec): string | null {
  const code = num(rec.exerciseType ?? rec.exercise_type ?? rec.activityType);
  if (code != null) return EXERCISE_CODE[code] ?? `exercise_${code}`;
  const name = str(rec.exerciseType ?? rec.exerciseTypeName ?? rec.activityType ?? rec.title ?? rec.name);
  return name ? name.toLowerCase() : null;
}

function sportOf(name: string): AppleWorkout['sport'] | null {
  if (/swim|înot|inot/.test(name)) return 'inot';
  if (/bik|cycl|ciclism|bicicl/.test(name)) return 'bicicleta';
  if (/run|alerg/.test(name)) return 'alergare';
  if (/strength|weight|forță|forta|functional|hiit|cross/.test(name)) return 'forta';
  return null;
}

export interface HealthConnectParse {
  days: AppleDay[];
  workouts: AppleWorkout[];
  others: OtherActivity[];
  /** Tipuri de înregistrări pe care nu le folosim (la vedere, ca să le adăugăm). */
  unknownTypes: string[];
  recognized: number;
}

/**
 * Formatul aplicației „Health Connect Webhook” (mcnaveen/health-connect-webhook, docs/webhook.md): obiectul rădăcină are
 * `timestamp`, `app_version`, `timezone` și câte o listă pe tip, cu chei snake_case (`sleep`, `heart_rate_variability`,
 * `resting_heart_rate`, `exercise`, `weight` …). Somnul are doar `session_end_time` + `duration_seconds`; exercițiul are
 * `type` = codul numeric Health Connect ca text („56” = alergare) și nu are puls: îl calculăm din `heart_rate`, dacă vine.
 */
const HCW_UNUSED = new Set(['steps', 'heart_rate', 'distance', 'active_calories', 'total_calories', 'oxygen_saturation', 'respiratory_rate', 'skin_temperature', 'body_temperature', 'hydration', 'nutrition', 'height', 'blood_pressure', 'blood_glucose', 'basal_metabolic_rate', 'body_fat', 'lean_body_mass', 'bone_mass', 'vo2_max', 'menstruation_flow', 'menstruation_period', 'intermenstrual_bleeding', 'ovulation_test', 'cervical_mucus', 'sexual_activity', 'basal_body_temperature', 'floors_climbed', 'elevation_gained', 'speed', 'power', 'cycling_pedaling_cadence', 'steps_cadence', 'wheelchair_pushes', 'deleted', 'mindfulness', 'planned_exercise']);

export function isHcWebhook(body: unknown): body is Rec {
  return !!body && typeof body === 'object' && !Array.isArray(body) && typeof (body as Rec).app_version === 'string' && typeof (body as Rec).timezone === 'string';
}

function hcWebhookRecords(body: Rec): { recs: { type: string; rec: Rec }[]; unknown: string[] } {
  const recs: { type: string; rec: Rec }[] = [];
  const unknown: string[] = [];
  const arr = (k: string) => (Array.isArray(body[k]) ? (body[k] as Rec[]) : []);
  // Pulsul (eșantioane sau medii pe minut), ca să dăm puls mediu / maxim antrenamentelor.
  const hr = arr('heart_rate')
    .map((h) => ({ t: whenMs(h.time), avg: num(h.avg ?? h.bpm), max: num(h.max ?? h.bpm) }))
    .filter((h): h is { t: number; avg: number; max: number } => h.t != null && h.avg != null && h.max != null);
  for (const s of arr('sleep')) {
    const end = whenMs(s.session_end_time ?? s.end_time);
    const dur = num(s.duration_seconds);
    const start = whenMs(s.start_time) ?? (end != null && dur != null ? end - dur * 1000 : null);
    if (start == null || end == null) continue;
    recs.push({ type: 'sleepsession', rec: { startTime: start, endTime: end, stages: (Array.isArray(s.stages) ? (s.stages as Rec[]) : []).map((st) => ({ stage: st.stage, startTime: st.start_time, endTime: st.end_time })) } });
  }
  for (const h of arr('heart_rate_variability')) recs.push({ type: 'hrv', rec: { time: h.time, value: h.avg ?? h.rmssd_millis } });
  for (const r of arr('resting_heart_rate')) recs.push({ type: 'restingheartrate', rec: { time: r.time, value: r.bpm } });
  for (const w of arr('weight')) recs.push({ type: 'weight', rec: { time: w.time, value: w.kilograms } });
  for (const e of arr('exercise')) {
    const s0 = whenMs(e.start_time);
    const s1 = whenMs(e.end_time);
    const inside = s0 != null && s1 != null ? hr.filter((h) => h.t >= s0 && h.t <= s1) : [];
    recs.push({
      type: 'exercisesession',
      rec: {
        startTime: e.start_time,
        endTime: e.end_time,
        exerciseType: e.type,
        title: e.title,
        distanceMeters: e.distance_meters,
        // Timpul activ, fără pauze, când sursa îl dă (exportul Samsung Health; HC Webhook poate trimite active_seconds).
        activeSeconds: num(e.active_seconds ?? e.active_duration_seconds),
        // Pulsul din eșantioane; altfel cel din înregistrarea antrenamentului (exportul Samsung Health îl are).
        averageHeartRate: inside.length ? inside.reduce((a, h) => a + h.avg, 0) / inside.length : num(e.avg_heart_rate),
        maxHeartRate: inside.length ? Math.max(...inside.map((h) => h.max)) : num(e.max_heart_rate),
        id: (e.metadata as Rec | undefined)?.id ?? null,
      },
    });
  }
  const KNOWN = new Set(['timestamp', 'app_version', 'timezone', 'sleep', 'heart_rate_variability', 'resting_heart_rate', 'weight', 'exercise']);
  for (const k of Object.keys(body)) if (!KNOWN.has(k) && !HCW_UNUSED.has(k)) unknown.push(k);
  return { recs, unknown };
}

export function parseHealthConnect(body: unknown, tz: string): HealthConnectParse {
  const hcw = isHcWebhook(body) ? hcWebhookRecords(body) : null;
  const recs = hcw ? hcw.recs : collectRecords(body);
  const days = new Map<string, AppleDay>();
  const get = (d: string) => {
    let r = days.get(d);
    if (!r) days.set(d, (r = { date: d, hrv: null, rhr: null, sleep_min: null, bedtime: null, wake_time: null }));
    return r;
  };
  const hrvByDay = new Map<string, number[]>();
  const rhrByDay = new Map<string, number[]>();
  const workouts: AppleWorkout[] = [];
  const others: OtherActivity[] = [];
  const unknown = new Set<string>(hcw?.unknown ?? []);
  let recognized = hcw ? Object.keys(body as Rec).filter((k) => HCW_UNUSED.has(k)).length : 0;

  for (const { type, rec } of recs) {
    const start = whenMs(rec.startTime ?? rec.start_time ?? rec.start ?? rec.startTimeMillis);
    const end = whenMs(rec.endTime ?? rec.end_time ?? rec.end ?? rec.endTimeMillis);
    const at = whenMs(rec.time ?? rec.timestamp ?? rec.instant) ?? start;

    if (type === 'sleepsession') {
      if (start == null || end == null || end <= start) continue;
      recognized++;
      let awakeMs = 0;
      const stages = Array.isArray(rec.stages) ? (rec.stages as Rec[]) : [];
      for (const st of stages) {
        const code = num(st.stage ?? st.type);
        const nm = str(st.stage ?? st.type)?.toLowerCase() ?? '';
        const s0 = whenMs(st.startTime ?? st.start);
        const s1 = whenMs(st.endTime ?? st.end);
        if (s0 == null || s1 == null) continue;
        if (code === 1 || code === 3 || code === 7 || /awake|out_of_bed|outofbed/.test(nm)) awakeMs += Math.max(0, s1 - s0);
      }
      const wake = local(end, tz);
      const bed = local(start, tz);
      const d = get(wake.date);
      const min = Math.round((end - start - awakeMs) / 60_000);
      // Două sesiuni în aceeași noapte (somn + un pui de somn): se adună.
      d.sleep_min = (d.sleep_min ?? 0) + min;
      d.bedtime = d.bedtime ?? bed.hm;
      d.wake_time = wake.hm;
    } else if (type === 'heartratevariabilityrmssd' || type === 'hrv' || type === 'heartratevariability') {
      const v = pick(rec, ['heartRateVariabilityMillis', 'rmssd', 'hrv', 'value', 'millis']);
      if (v == null || at == null) continue;
      recognized++;
      const l = local(at, tz);
      // Măsurătorile din noapte și dimineață (până la 11:00) sunt cele comparabile cu WHOOP/Oura; dacă nu există, toate.
      const key = l.minutes <= 11 * 60 ? `${l.date}:n` : `${l.date}:d`;
      hrvByDay.set(key, [...(hrvByDay.get(key) ?? []), v]);
    } else if (type === 'restingheartrate') {
      const v = pick(rec, ['beatsPerMinute', 'bpm', 'value', 'restingHeartRate']);
      if (v == null || at == null) continue;
      recognized++;
      const l = local(at, tz);
      rhrByDay.set(l.date, [...(rhrByDay.get(l.date) ?? []), v]);
    } else if (type === 'weight') {
      const kg = pick(rec, ['weight', 'weightKg', 'value'], ['inKilograms', 'value']);
      if (kg == null || at == null) continue;
      recognized++;
      get(local(at, tz).date).weight_kg = Math.round(kg * 10) / 10;
    } else if (type === 'exercisesession') {
      if (start == null || end == null || end <= start) continue;
      recognized++;
      const kind = sportOfExercise(rec) ?? '';
      const sport = sportOf(kind);
      const title = str(rec.title) ?? str(rec.name) ?? kind;
      const elapsedSec = (end - start) / 1000;
      // Timpul activ (fără pauze) dacă îl avem și are sens; altfel start→stop. Durata și ritmul se calculează pe el,
      // ca o alergare cu opriri să nu pară lentă; durata totală rămâne în detalii (elapsedMin).
      const activeSec = pick(rec, ['activeSeconds', 'activeDurationSeconds', 'active_seconds'], ['value']);
      const sec = activeSec != null && activeSec >= 60 && activeSec <= elapsedSec + 30 ? Math.min(activeSec, elapsedSec) : elapsedSec;
      const l = local(start, tz);
      const distM = pick(rec, ['distance', 'distanceMeters', 'totalDistance', 'distance_m'], ['inMeters', 'value']);
      const distKm = distM != null && distM > 0 ? Math.round(distM / 10) / 100 : null; // metri → km cu 2 zecimale
      const avg = pick(rec, ['averageHeartRate', 'avgHeartRate', 'avgHr', 'heartRateAvg'], ['value', 'beatsPerMinute']);
      const max = pick(rec, ['maxHeartRate', 'maxHr', 'heartRateMax'], ['value', 'beatsPerMinute']);
      const id = (str(rec.id) ?? str((rec.metadata as Rec | undefined)?.id) ?? `${start}-${kind}`).replace(/[^a-zA-Z0-9-]/g, '');
      if (sport) {
        if (sec < 60) continue;
        const details: ActivityDetails = { movingMin: Math.round(sec / 60), elapsedMin: Math.round(elapsedSec / 60), avgSpeedKmh: distKm && distKm > 0.2 ? Math.round((distKm / (sec / 3600)) * 10) / 10 : null };
        if (sport === 'inot' && distKm) details.pace100mSec = swimPace100(sec, distKm * 1000);
        workouts.push({ id: `android-${id}`, date: l.date, start_local: l.hm, sport, minutes: Math.round(sec / 60), distance_km: distKm, avg_hr: avg == null ? null : Math.round(avg), max_hr: max == null ? null : Math.round(max), avg_pace_min_km: sport === 'alergare' && distKm && distKm > 0.2 ? Math.round((sec / 60 / distKm) * 100) / 100 : null, name: `${title} · Samsung Health`, details });
      } else {
        const c = classifyOther(kind || title);
        if (!c || sec < 300) {
          if (!c) unknown.add(`exercise:${kind || title}`);
          continue;
        }
        others.push({ id: `android-o-${id}`, source: 'android', externalId: id, date: l.date, startLocal: l.hm, kind: c.kind, name: c.name, minutes: Math.round(sec / 60), avgHr: avg == null ? null : Math.round(avg), maxHr: max == null ? null : Math.round(max) });
      }
    } else if (type === 'steps' || type === 'heartrate' || type === 'distance' || type === 'totalcaloriesburned' || type === 'activecaloriesburned' || type === 'oxygensaturation' || type === 'respiratoryrate' || type === 'hydration' || type === 'nutrition') {
      // Le primim, nu le folosim (încă); nu sunt necunoscute.
      recognized++;
    } else {
      unknown.add(type);
    }
  }

  const mean = (xs: number[]) => Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10;
  const hrvDates = new Set([...hrvByDay.keys()].map((k) => k.split(':')[0]!));
  for (const d of hrvDates) {
    const night = hrvByDay.get(`${d}:n`);
    const dayv = hrvByDay.get(`${d}:d`);
    const xs = night?.length ? night : dayv ?? [];
    if (xs.length) get(d).hrv = mean(xs);
  }
  for (const [d, xs] of rhrByDay) get(d).rhr = Math.round(mean(xs));

  return { days: [...days.values()], workouts, others, unknownTypes: [...unknown], recognized };
}
