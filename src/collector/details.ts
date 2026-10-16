// Detaliile unei ședințe, așa cum le dau brățările: doar valori măsurate sau calculate direct din ele (fără estimări).
// Se salvează în activities.raw și se arată sportivului pe ecranul fiecărui sport.

export interface ActivityDetails {
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
  /** WHOOP: efortul zilei pentru ședință (0–21). */
  strain?: number | null;
  /** Minute în zonele de FC ale brățării (1–5), nu ale sportivului. */
  deviceZonesMin?: number[] | null;
  /** Traseul GPS (polyline codat Google, de la Strava). */
  polyline?: string | null;
  /** Strava: s-au citit și splits/best efforts (ca să nu cerem detaliile de două ori). */
  detailed?: boolean;
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
    d.pace100mSec = a.distance >= 50 && ok(a.moving_time) ? Math.round(a.moving_time / (a.distance / 100)) : null;
  }
  const det = a as StravaDetailed;
  if (det.splits_metric || det.best_efforts || det.laps) {
    d.detailed = true;
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
      const laps = (det.laps ?? []).filter((l) => l.distance >= 50 && ok(l.moving_time));
      d.laps = det.laps?.length ?? null;
      d.fastestLap100mSec = laps.length ? Math.min(...laps.map((l) => Math.round(l.moving_time / (l.distance / 100)))) : null;
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
