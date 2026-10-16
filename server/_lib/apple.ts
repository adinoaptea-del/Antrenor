import { classifyOther, type OtherActivity } from '../../src/collector/other.js';
// Apple Watch prin aplicația iPhone „Health Auto Export” (REST API automation, format JSON).
// Luăm somnul, HRV-ul, pulsul de repaus și antrenamentele (inclusiv cele de pe Garmin, trimise de Garmin Connect în Apple Health).
// Dublurile cu alte surse (Whoop, Strava) le scoate dedupeActivities.
// Atenție: Apple dă HRV ca SDNN, nu rMSSD — de aceea are prioritate mică la combinarea surselor.

export interface AppleDay {
  date: string;
  hrv: number | null;
  rhr: number | null;
  sleep_min: number | null;
  bedtime: string | null;
  wake_time: string | null;
}

interface Metric {
  name: string;
  units?: string;
  data: Record<string, unknown>[];
}

const day = (s: unknown) => (typeof s === 'string' ? s.slice(0, 10) : null);
const hm = (s: unknown) => (typeof s === 'string' && s.length >= 16 ? s.slice(11, 16) : null);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export function parseHealthExport(body: unknown): AppleDay[] {
  const metrics = ((body as { data?: { metrics?: Metric[] } })?.data?.metrics ?? []) as Metric[];
  const out = new Map<string, AppleDay>();
  const get = (d: string) => {
    let r = out.get(d);
    if (!r) out.set(d, (r = { date: d, hrv: null, rhr: null, sleep_min: null, bedtime: null, wake_time: null }));
    return r;
  };
  for (const m of metrics) {
    if (m.name === 'heart_rate_variability' || m.name === 'heart_rate_variability_sdnn') {
      // Mai multe măsurători pe zi: păstrăm media.
      const byDay = new Map<string, number[]>();
      for (const p of m.data) {
        const d = day(p.date);
        const q = num(p.qty);
        if (d && q != null) byDay.set(d, [...(byDay.get(d) ?? []), q]);
      }
      for (const [d, v] of byDay) get(d).hrv = Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10;
    } else if (m.name === 'resting_heart_rate') {
      for (const p of m.data) {
        const d = day(p.date);
        const q = num(p.qty);
        if (d && q != null) get(d).rhr = Math.round(q);
      }
    } else if (m.name === 'sleep_analysis') {
      for (const p of m.data) {
        // Ziua somnului = ziua trezirii.
        const d = day(p.sleepEnd ?? p.inBedEnd ?? p.date);
        const hours = num(p.totalSleep) ?? num(p.asleep);
        if (!d || hours == null) continue;
        const r = get(d);
        r.sleep_min = Math.round(hours * 60);
        r.bedtime = hm(p.sleepStart ?? p.inBedStart);
        r.wake_time = hm(p.sleepEnd ?? p.inBedEnd);
      }
    }
  }
  return [...out.values()];
}

export interface AppleWorkout {
  id: string;
  date: string;
  start_local: string | null;
  sport: 'inot' | 'bicicleta' | 'alergare' | 'forta';
  minutes: number;
  distance_km: number | null;
  avg_hr: number | null;
  max_hr: number | null;
  avg_pace_min_km: number | null;
  name: string;
}

function sportOf(name: string): AppleWorkout['sport'] | null {
  const n = name.toLowerCase();
  if (/swim|înot|inot/.test(n)) return 'inot';
  if (/cycl|bike|biking|ciclism|bicicl/.test(n)) return 'bicicleta';
  if (/run|alerg/.test(n)) return 'alergare';
  if (/strength|weight|forță|forta|functional|core|hiit|cross/.test(n)) return 'forta';
  return null;
}

const qty = (v: unknown): number | null => (v && typeof v === 'object' ? num((v as { qty?: unknown }).qty) : num(v));

function km(v: unknown): number | null {
  if (!v || typeof v !== 'object') return num(v);
  const q = num((v as { qty?: unknown }).qty);
  const u = String((v as { units?: unknown }).units ?? 'km').toLowerCase();
  if (q == null) return null;
  if (u === 'km') return q;
  if (u === 'mi') return q * 1.609344;
  if (u === 'm') return q / 1000;
  if (u === 'yd') return q * 0.0009144;
  return null;
}

/** Antrenamentele din exportul Health Auto Export (data.workouts), formatul v1 și v2. */
export function parseHealthWorkouts(body: unknown): AppleWorkout[] {
  const list = ((body as { data?: { workouts?: Record<string, unknown>[] } })?.data?.workouts ?? []) as Record<string, unknown>[];
  const out: AppleWorkout[] = [];
  for (const w of list) {
    const name = String(w.name ?? '');
    const sport = sportOf(name);
    const start = typeof w.start === 'string' ? w.start : null;
    if (!sport || !start) continue;
    let sec = num(w.duration);
    if (sec == null && typeof w.end === 'string') sec = (Date.parse(w.end.replace(' ', 'T').replace(' ', '')) - Date.parse(start.replace(' ', 'T').replace(' ', ''))) / 1000;
    if (sec == null || !Number.isFinite(sec) || sec < 60) continue;
    const minutes = Math.round(sec / 60);
    const dist = km(w.distance);
    const hr = (w.heartRate ?? {}) as { avg?: unknown; max?: unknown };
    const avg = qty(w.avgHeartRate) ?? qty(hr.avg);
    const max = qty(w.maxHeartRate) ?? qty(hr.max);
    const r1 = (x: number | null) => (x == null ? null : Math.round(x * 100) / 100);
    out.push({
      id: `apple-${typeof w.id === 'string' ? w.id : `${start}-${name}`.replace(/[^a-zA-Z0-9]/g, '')}`,
      date: start.slice(0, 10),
      start_local: hm(start),
      sport,
      minutes,
      distance_km: dist == null || dist <= 0 ? null : r1(dist),
      avg_hr: avg == null ? null : Math.round(avg),
      max_hr: max == null ? null : Math.round(max),
      avg_pace_min_km: sport === 'alergare' && dist && dist > 0.2 ? r1(sec / 60 / dist) : null,
      name,
    });
  }
  return out;
}

/** Recuperarea și mișcarea în plus din Apple Health (yoga, stretching, plimbări, alte sporturi). */
export function parseHealthOther(body: unknown): OtherActivity[] {
  const list = ((body as { data?: { workouts?: Record<string, unknown>[] } })?.data?.workouts ?? []) as Record<string, unknown>[];
  const out: OtherActivity[] = [];
  for (const w of list) {
    const name = String(w.name ?? '');
    const start = typeof w.start === 'string' ? w.start : null;
    if (!start || sportOf(name)) continue;
    const c = classifyOther(name);
    if (!c) continue;
    const sec = num(w.duration);
    if (sec == null || sec < 300) continue;
    const hr = (w.heartRate ?? {}) as { avg?: unknown; max?: unknown };
    const avg = qty(w.avgHeartRate) ?? qty(hr.avg);
    const max = qty(w.maxHeartRate) ?? qty(hr.max);
    const id = typeof w.id === 'string' ? w.id : `${start}-${name}`.replace(/[^a-zA-Z0-9]/g, '');
    out.push({ id: `apple-o-${id}`, source: 'apple', externalId: id, date: start.slice(0, 10), startLocal: hm(start), kind: c.kind, name: c.name, minutes: Math.round(sec / 60), avgHr: avg == null ? null : Math.round(avg), maxHr: max == null ? null : Math.round(max) });
  }
  return out;
}
