// Apple Watch prin aplicația iPhone „Health Auto Export” (REST API automation, format JSON).
// Luăm doar somnul, HRV-ul și pulsul de repaus; antrenamentele vin prin Strava (altfel s-ar dubla).
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
