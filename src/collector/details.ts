// Detaliile unei ședințe, așa cum le dau brățările: doar valori măsurate sau calculate direct din ele (fără estimări).
// Se salvează în activities.raw și se arată sportivului pe ecranul fiecărui sport.

export interface ActivityDetails {
  /** Auditul v93, A19: HIIT / CrossFit / core / antrenament generic — „forță” ca sport, dar nu ședința de sală prescrisă. */
  genericStrength?: boolean | null;
  movingMin?: number | null;
  elapsedMin?: number | null;
  kcal?: number | null;
  kj?: number | null;
  elevGainM?: number | null;
  avgSpeedKmh?: number | null;
  maxSpeedKmh?: number | null;
  /** Alergare: pași/min (ambele picioare); bicicletă: rpm; înot: brațe/min. */
  cadence?: number | null;
  stepsPerKm?: number | null;
  strideM?: number | null;
  /** Alergare: cel mai rapid km, în secunde. */
  fastestKmSec?: number | null;
  /** Alergare: timpul fiecărui km întreg, în secunde. */
  splitsSecPerKm?: number[] | null;
  /** Alergare: cele mai bune timpi din ședință pe distanțe standard („1 km”, „5 km”…), în secunde. */
  bestEfforts?: Record<string, number> | null;
  avgWatts?: number | null;
  /** Puterea normalizată (Strava: weighted average watts). */
  npWatts?: number | null;
  maxWatts?: number | null;
  /** Înot: ritmul mediu pe 100 m, în secunde. */
  pace100mSec?: number | null;
  /** Înot: cea mai rapidă tură (≥ 50 m), pe 100 m. */
  fastestLap100mSec?: number | null;
  laps?: number | null;
  /** Înot: cea mai lungă porțiune fără oprire (ture consecutive fără pauză), în metri. Măsura reală a capacității pe proba de înot. */
  continuousM?: number | null;
  /** Ritmul pe 100 m în porțiunea aceea continuă. */
  continuousPace100mSec?: number | null;
  /** WHOOP: efortul zilei pentru ședință (0–21). */
  strain?: number | null;
  /** Minute în zonele de FC ale brățării (1–5), nu ale sportivului. */
  deviceZonesMin?: number[] | null;
  /** Traseul GPS (polyline codat Google, de la Strava). */
  polyline?: string | null;
  /** Strava: s-au citit și splits/best efforts (ca să nu cerem detaliile de două ori). */
  detailed?: boolean;
  /** Versiunea calculului din activitatea detaliată; la o versiune nouă, detaliile se recitesc. */
  v?: number;
}

export const DETAILS_V = 2;

/**
 * Ritm de înot plauzibil pentru un amator, pe 100 m: sub 60 s e detectare greșită a ceasului (atingere de perete, GPS
 * în ape libere, distanță în unități greșite); peste 6 min nu mai e înot continuu. În afara intervalului: fără ritm.
 */
export const MIN_SWIM_SEC_100 = 60;
export const MAX_SWIM_SEC_100 = 360;
/** Sub atâția metri un segment nu dă ritm (o lungime de bazin nu spune nimic despre 1.900 m). */
export const MIN_SWIM_PACE_M = 100;

/** Ritmul pe 100 m din secunde și metri; null dacă segmentul e prea scurt sau ritmul e imposibil. */
export function swimPace100(sec: number | null | undefined, meters: number | null | undefined): number | null {
  if (!sec || !meters || !Number.isFinite(sec) || !Number.isFinite(meters) || sec <= 0 || meters < MIN_SWIM_PACE_M) return null;
  const p = sec / (meters / 100);
  return p >= MIN_SWIM_SEC_100 && p <= MAX_SWIM_SEC_100 ? Math.round(p) : null;
}

/** Un ritm deja calculat (s/100 m) e plauzibil? */
export function swimPaceOk(p: number | null | undefined): p is number {
  return p != null && Number.isFinite(p) && p >= MIN_SWIM_SEC_100 && p <= MAX_SWIM_SEC_100;
}

/**
 * Cea mai lungă porțiune înotată fără oprire: ture consecutive cu distanță; o tură de pauză (fără distanță)
 * sau o tură imposibil de rapidă (detectare greșită) întrerupe șirul.
 */
export function longestContinuousSwim(laps: { distance: number; moving_time: number; elapsed_time: number }[]): { m: number; pace100: number | null } | null {
  if (!laps.length) return null;
  let best = { m: 0, sec: 0 };
  let cur = { m: 0, sec: 0 };
  for (const l of laps) {
    const t = l.elapsed_time || l.moving_time;
    const valid = l.distance > 0 && t > 0 && t / (l.distance / 100) >= MIN_SWIM_SEC_100;
    if (!valid) {
      cur = { m: 0, sec: 0 };
      continue;
    }
    // O tură cu pauză în interior (timp scurs cu peste 10 s peste timpul în mișcare): nu știm cât din ea a fost fără
    // oprire, deci nu contează ca înot continuu și rupe legătura cu vecinele.
    // Auditul v93, A41: toleranța e 3 s pe tură (o întoarcere), nu 10 s: 20 × 50 m cu 8 s de stat nu sunt 1.000 m continuu.
    if (l.elapsed_time - l.moving_time > 3) {
      cur = { m: 0, sec: 0 };
      continue;
    }
    cur = { m: cur.m + l.distance, sec: cur.sec + t };
    if (cur.m > best.m) best = { ...cur };
  }
  // O singură tură pentru toată activitatea (sumar fără ture reale): nu dovedește înot fără oprire → necunoscut.
  if (laps.length === 1) return null;
  return { m: Math.round(best.m), pace100: swimPace100(best.sec, best.m) };
}

const r1 = (x: number) => Math.round(x * 10) / 10;
const ok = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x) && x > 0;

/** Pașii pe km și lungimea pasului, din cadență (pași/min) și ritm (min/km). */
export function stepsFromCadence(spm: number | null | undefined, minPerKm: number | null | undefined): { stepsPerKm: number | null; strideM: number | null } {
  if (!ok(spm) || !ok(minPerKm)) return { stepsPerKm: null, strideM: null };
  const s = Math.round(spm * minPerKm);
  return { stepsPerKm: s, strideM: Math.round((1000 / s) * 100) / 100 };
}

// ---------- Strava ----------

export interface StravaSummaryExtra {
  sport_type: string;
  distance: number;
  moving_time: number;
  elapsed_time: number;
  total_elevation_gain?: number;
  average_speed?: number; // m/s
  max_speed?: number;
  average_cadence?: number;
  average_watts?: number;
  weighted_average_watts?: number;
  max_watts?: number;
  kilojoules?: number;
  calories?: number;
  map?: { summary_polyline?: string | null; polyline?: string | null } | null;
}

export interface StravaDetailed extends StravaSummaryExtra {
  splits_metric?: { distance: number; moving_time: number; elapsed_time: number }[];
  best_efforts?: { name: string; moving_time: number; elapsed_time: number }[];
  laps?: { distance: number; moving_time: number; elapsed_time: number }[];
}

const EFFORT_NAMES: Record<string, string> = { '400m': '400 m', '1k': '1 km', '1 mile': '1 milă', '5k': '5 km', '10k': '10 km', 'Half-Marathon': '21,1 km', Marathon: '42,2 km' };

export function stravaDetails(a: StravaSummaryExtra | StravaDetailed, sport: string): ActivityDetails {
  const d: ActivityDetails = {
    movingMin: ok(a.moving_time) ? Math.round(a.moving_time / 60) : null,
    elapsedMin: ok(a.elapsed_time) ? Math.round(a.elapsed_time / 60) : null,
    elevGainM: ok(a.total_elevation_gain) ? Math.round(a.total_elevation_gain) : null,
    avgSpeedKmh: ok(a.average_speed) ? r1(a.average_speed * 3.6) : null,
    maxSpeedKmh: ok(a.max_speed) ? r1(a.max_speed * 3.6) : null,
    kj: ok(a.kilojoules) ? Math.round(a.kilojoules) : null,
    kcal: ok(a.calories) ? Math.round(a.calories) : null,
    avgWatts: ok(a.average_watts) ? Math.round(a.average_watts) : null,
    npWatts: ok(a.weighted_average_watts) ? Math.round(a.weighted_average_watts) : null,
    maxWatts: ok(a.max_watts) ? Math.round(a.max_watts) : null,
    polyline: a.map?.summary_polyline || null,
  };
  if (sport === 'alergare') {
    d.cadence = ok(a.average_cadence) ? Math.round(a.average_cadence * 2) : null;
    const km = a.distance / 1000;
    const minPerKm = km > 0.2 && ok(a.moving_time) ? a.moving_time / 60 / km : null;
    Object.assign(d, stepsFromCadence(d.cadence, minPerKm));
  } else if (sport === 'bicicleta') {
    d.cadence = ok(a.average_cadence) ? Math.round(a.average_cadence) : null;
  } else if (sport === 'inot') {
    d.cadence = ok(a.average_cadence) ? Math.round(a.average_cadence) : null;
    d.pace100mSec = swimPace100(a.moving_time, a.distance);
  }
  const det = a as StravaDetailed;
  if (det.splits_metric || det.best_efforts || det.laps) {
    d.detailed = true;
    d.v = DETAILS_V;
    if (sport === 'alergare') {
      const splits = (det.splits_metric ?? []).filter((s) => s.distance >= 950 && ok(s.moving_time)).map((s) => Math.round(s.moving_time / (s.distance / 1000)));
      d.splitsSecPerKm = splits.length ? splits : null;
      const efforts: Record<string, number> = {};
      for (const e of det.best_efforts ?? []) {
        const n = EFFORT_NAMES[e.name];
        if (n && ok(e.moving_time)) efforts[n] = e.moving_time;
      }
      d.bestEfforts = Object.keys(efforts).length ? efforts : null;
      d.fastestKmSec = efforts['1 km'] ?? (splits.length ? Math.min(...splits) : null);
    }
    if (sport === 'inot') {
      const lapPaces = (det.laps ?? []).map((l) => swimPace100(l.moving_time, l.distance)).filter(swimPaceOk);
      d.laps = det.laps?.length ?? null;
      const c = longestContinuousSwim(det.laps ?? []);
      d.continuousM = c ? c.m : null;
      d.continuousPace100mSec = c?.pace100 ?? null;
      d.fastestLap100mSec = lapPaces.length ? Math.min(...lapPaces) : null;
    }
  }
  return d;
}

// ---------- WHOOP ----------

export function whoopDetails(score: { strain?: number; kilojoule?: number; altitude_gain_meter?: number | null; zone_durations?: { zone_one_milli: number; zone_two_milli: number; zone_three_milli: number; zone_four_milli: number; zone_five_milli: number } }): ActivityDetails {
  const z = score.zone_durations;
  return {
    strain: ok(score.strain) ? r1(score.strain) : null,
    kj: ok(score.kilojoule) ? Math.round(score.kilojoule) : null,
    kcal: ok(score.kilojoule) ? Math.round(score.kilojoule / 4.184) : null,
    elevGainM: ok(score.altitude_gain_meter) ? Math.round(score.altitude_gain_meter) : null,
    deviceZonesMin: z ? [z.zone_one_milli, z.zone_two_milli, z.zone_three_milli, z.zone_four_milli, z.zone_five_milli].map((ms) => Math.round(ms / 60_000)) : null,
  };
}

/** Aceeași ședință venită din mai multe brățări: completează câmpurile lipsă, fără să suprascrie ce există. */
export function mergeDetails(a: ActivityDetails | null | undefined, b: ActivityDetails | null | undefined): ActivityDetails | null {
  if (!a) return b ?? null;
  if (!b) return a;
  const out: ActivityDetails = { ...b };
  for (const [k, v] of Object.entries(a)) if (v != null) (out as Record<string, unknown>)[k] = v;
  return out;
}

/**
 * Auditul v93, A17: din a doua înregistrare a aceleiași ședințe (alt ceas) se completează doar câmpurile care nu depind
 * de fereastra înregistrării (cadența, lungimea pasului, puterea, vârfurile). Ture, kilometri, zone, minute, calorii și
 * traseul rămân ale înregistrării alese: altfel s-ar amesteca ferestre diferite.
 */
const WINDOW_FREE: (keyof ActivityDetails)[] = ['cadence', 'stepsPerKm', 'strideM', 'avgWatts', 'npWatts', 'maxWatts', 'maxSpeedKmh', 'genericStrength'];
export function mergeIndependent(chosen: ActivityDetails | null | undefined, other: ActivityDetails | null | undefined): ActivityDetails | null {
  if (!other) return chosen ?? null;
  const out: ActivityDetails = { ...(chosen ?? {}) };
  for (const k of WINDOW_FREE) if (out[k] == null && other[k] != null) (out as Record<string, unknown>)[k] = other[k];
  return Object.keys(out).length ? out : null;
}

/**
 * Căderea pe final la o ieșire lungă: ritmul mediu din a doua jumătate față de prima (pe kilometri întregi).
 * Pozitiv = mai lent în a doua parte (cădere); negativ = final mai rapid. null = prea puțini kilometri (sub 6).
 * Pe teren cu urcări mari rezultatul nu e comparabil; apelantul decide dacă îl folosește.
 */
export function fadePct(splits: number[] | null | undefined): number | null {
  const xs = (splits ?? []).filter((x) => Number.isFinite(x) && x > 0);
  if (xs.length < 6) return null;
  const half = Math.floor(xs.length / 2);
  const avg = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;
  const first = avg(xs.slice(0, half));
  const second = avg(xs.slice(xs.length - half));
  return Math.round(((second / first) - 1) * 1000) / 10;
}

/** A19: denumiri de activitate care NU sunt sală cu greutăți (HIIT, CrossFit, core, funcțional, bootcamp). */
export const GENERIC_STRENGTH_RE = /hiit|cross|core|functional|funcțional|bootcamp|interval|circuit/i;
