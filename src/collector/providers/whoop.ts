// WHOOP Developer API v2 (iulie 2025). OAuth 2.0; accesul „development” acoperă 10 membri fără aprobare.
import { classifyOther, type OtherActivity } from '../other.js';
// Documentație: https://developer.whoop.com/docs/developing/getting-started/ · https://developer.whoop.com/api/
// Verifică la implementare: numele exacte ale header-elor de semnătură pentru webhook și câmpurile v2.

import type { SourceActivity, SourceDaily } from '../types.js';
import type { Sport } from '../../types.js';
import { getJson, localDate, localHm, type OAuthConfig } from './oauth.js';

export const WHOOP_SCOPES = ['read:recovery', 'read:cycles', 'read:sleep', 'read:workout', 'read:body_measurement', 'read:profile', 'offline'];

export function whoopConfig(env: { WHOOP_CLIENT_ID: string; WHOOP_CLIENT_SECRET: string; WHOOP_REDIRECT_URI: string }): OAuthConfig {
  return {
    authorizeUrl: 'https://api.prod.whoop.com/oauth/oauth2/auth',
    tokenUrl: 'https://api.prod.whoop.com/oauth/oauth2/token',
    clientId: env.WHOOP_CLIENT_ID,
    clientSecret: env.WHOOP_CLIENT_SECRET,
    redirectUri: env.WHOOP_REDIRECT_URI,
    scopes: WHOOP_SCOPES,
    scopeSeparator: ' ',
  };
}

const BASE = 'https://api.prod.whoop.com/developer/v2';

// Formele v2, așa cum le trimite WHOOP (aceleași structuri au venit și prin AthleteData în 16 oct 2026).
export interface WhoopRecovery {
  cycle_id: number;
  sleep_id: string;
  user_id: number;
  created_at: string;
  updated_at: string;
  score_state: 'SCORED' | 'PENDING_SCORE' | 'UNSCORABLE';
  score?: { user_calibrating: boolean; recovery_score: number; resting_heart_rate: number; hrv_rmssd_milli: number; spo2_percentage?: number; skin_temp_celsius?: number };
}
export interface WhoopSleep {
  id: string;
  cycle_id?: number;
  user_id: number;
  start: string;
  end: string;
  timezone_offset: string;
  nap: boolean;
  score_state: 'SCORED' | 'PENDING_SCORE' | 'UNSCORABLE';
  score?: {
    stage_summary: { total_in_bed_time_milli: number; total_awake_time_milli: number; total_no_data_time_milli: number; total_light_sleep_time_milli: number; total_slow_wave_sleep_time_milli: number; total_rem_sleep_time_milli: number; sleep_cycle_count: number; disturbance_count: number };
    sleep_needed: { baseline_milli: number; need_from_sleep_debt_milli: number; need_from_recent_strain_milli: number; need_from_recent_nap_milli: number };
    respiratory_rate?: number;
    sleep_performance_percentage?: number;
    sleep_consistency_percentage?: number;
    sleep_efficiency_percentage?: number;
  };
}
export interface WhoopWorkout {
  id: string;
  user_id: number;
  start: string;
  end: string;
  timezone_offset: string;
  sport_name: string;
  score_state: 'SCORED' | 'PENDING_SCORE' | 'UNSCORABLE';
  score?: {
    strain: number;
    average_heart_rate: number;
    max_heart_rate: number;
    kilojoule: number;
    percent_recorded: number;
    distance_meter?: number | null;
    altitude_gain_meter?: number | null;
    zone_durations?: { zone_zero_milli: number; zone_one_milli: number; zone_two_milli: number; zone_three_milli: number; zone_four_milli: number; zone_five_milli: number };
  };
}
interface Page<T> {
  records: T[];
  next_token?: string | null;
}

async function pageAll<T>(path: string, token: string, start: string, end: string): Promise<T[]> {
  const out: T[] = [];
  let next: string | null | undefined;
  do {
    const u = new URL(`${BASE}${path}`);
    u.searchParams.set('start', `${start}T00:00:00.000Z`);
    u.searchParams.set('end', `${end}T23:59:59.999Z`);
    u.searchParams.set('limit', '25');
    if (next) u.searchParams.set('nextToken', next);
    const page = await getJson<Page<T>>(u.toString(), token);
    out.push(...page.records);
    next = page.next_token;
  } while (next);
  return out;
}

export const whoopApi = {
  recovery: (token: string, start: string, end: string) => pageAll<WhoopRecovery>('/recovery', token, start, end),
  sleep: (token: string, start: string, end: string) => pageAll<WhoopSleep>('/activity/sleep', token, start, end),
  workouts: (token: string, start: string, end: string) => pageAll<WhoopWorkout>('/activity/workout', token, start, end),
  body: (token: string) => getJson<{ height_meter: number; weight_kilogram: number; max_heart_rate: number }>(`${BASE}/user/measurement/body`, token),
  profile: (token: string) => getJson<{ user_id: number; email: string; first_name: string; last_name: string }>(`${BASE}/user/profile/basic`, token),
};

/** O noapte Whoop + recovery-ul ei → un rând normalizat. Ziua = ziua trezirii, în ora locală a sportivului. */
export function normalizeWhoopNight(sleep: WhoopSleep, recovery: WhoopRecovery | null): SourceDaily | null {
  if (sleep.nap || sleep.score_state !== 'SCORED' || !sleep.score) return null;
  const s = sleep.score.stage_summary;
  // Somnul = suma stadiilor (ușor + profund + REM). Timpul „fără date” al brățării nu e somn.
  const asleepMin = Math.round(((s.total_light_sleep_time_milli ?? 0) + (s.total_slow_wave_sleep_time_milli ?? 0) + (s.total_rem_sleep_time_milli ?? 0)) / 60_000);
  return {
    date: localDate(sleep.end, sleep.timezone_offset),
    source: 'whoop',
    sleepMin: asleepMin,
    bedtime: localHm(sleep.start, sleep.timezone_offset),
    wakeTime: localHm(sleep.end, sleep.timezone_offset),
    sleepScore: sleep.score.sleep_performance_percentage ?? null,
    respiratoryRate: sleep.score.respiratory_rate ?? null,
    hrv: recovery?.score ? Math.round(recovery.score.hrv_rmssd_milli * 10) / 10 : null,
    rhr: recovery?.score ? recovery.score.resting_heart_rate : null,
    recoveryScore: recovery?.score ? recovery.score.recovery_score : null,
  };
}

const WHOOP_SPORT: Record<string, Sport | null> = {
  running: 'alergare',
  cycling: 'bicicleta',
  swimming: 'inot',
  weightlifting: 'forta',
  functional_fitness: 'forta',
  'functional fitness': 'forta',
  activity: null,
  walking: null,
  hiking: null,
};

import { whoopDetails } from '../details.js';
export function normalizeWhoopWorkout(w: WhoopWorkout): SourceActivity | null {
  if (w.score_state !== 'SCORED' || !w.score) return null;
  const sport = WHOOP_SPORT[w.sport_name.toLowerCase()];
  if (!sport) return null; // plimbările și „activity” nu sunt antrenamente; intră doar în încărcarea agregatorului
  const minutes = Math.round((new Date(w.end).getTime() - new Date(w.start).getTime()) / 60_000);
  const z = w.score.zone_durations;
  return {
    id: `whoop-${w.id}`,
    externalId: w.id,
    source: 'whoop',
    date: localDate(w.start, w.timezone_offset),
    startLocal: localHm(w.start, w.timezone_offset),
    sport,
    minutes,
    // Precizie completă la stocare (25 m de înot nu devin 0 km); rotunjirea doar la afișare.
    distanceKm: w.score.distance_meter != null ? Math.round(w.score.distance_meter) / 1000 : null,
    avgHr: w.score.average_heart_rate,
    maxHr: w.score.max_heart_rate,
    // Zonele Whoop sunt ale Whoop (% din FCmax), nu ale sportivului: le păstrăm doar ca referință brută, nu ca timeInZonesMin.
    timeInZonesMin: null,
    name: z ? `whoop ${w.sport_name}; z1–z5 (min): ${[z.zone_one_milli, z.zone_two_milli, z.zone_three_milli, z.zone_four_milli, z.zone_five_milli].map((ms) => Math.round(ms / 60_000)).join('/')}` : `whoop ${w.sport_name}`,
    details: whoopDetails(w.score),
  };
}

/** Recuperarea și mișcarea în plus (saună, yoga, plimbări, alte sporturi) înregistrate în WHOOP. */
export function normalizeWhoopOther(w: WhoopWorkout): OtherActivity | null {
  if (WHOOP_SPORT[w.sport_name.toLowerCase()]) return null;
  const c = classifyOther(w.sport_name);
  if (!c) return null;
  const minutes = Math.round((new Date(w.end).getTime() - new Date(w.start).getTime()) / 60_000);
  if (minutes < 5) return null;
  return { id: `whoop-o-${w.id}`, source: 'whoop', externalId: w.id, date: localDate(w.start, w.timezone_offset), startLocal: localHm(w.start, w.timezone_offset), kind: c.kind, name: c.name, minutes, avgHr: w.score?.average_heart_rate ?? null, maxHr: w.score?.max_heart_rate ?? null, startUtc: new Date(w.start).toISOString(), elapsedSec: Math.round((new Date(w.end).getTime() - new Date(w.start).getTime()) / 1000), movingSec: null };
}

/** Webhook v2: WHOOP trimite doar evenimentul și id-ul; recordul se cere apoi prin API. */
export interface WhoopWebhookEvent {
  user_id: number;
  id: string | number;
  type: 'recovery.updated' | 'recovery.deleted' | 'sleep.updated' | 'sleep.deleted' | 'workout.updated' | 'workout.deleted';
  trace_id: string;
}
