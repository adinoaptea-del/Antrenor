// Strava API v3: calea pentru activitățile de pe Garmin cât timp programul de developeri Garmin e suspendat
import { classifyOther, type OtherActivity } from '../other.js';
// (Garmin → Strava → aplicație). Scope: activity:read_all. Aplicațiile noi pot conecta un singur sportiv
// (dezvoltatorul) până la o cerere de mărire a limitei. Rate limit: 200 cereri / 15 min, 2 000 / zi.
// Documentație: https://developers.strava.com/docs/reference/

import type { SourceActivity } from '../types.js';
import { stravaDetails, type StravaDetailed } from '../details.js';
import type { Sport } from '../../types.js';
import { getJson, type OAuthConfig } from './oauth.js';

export function stravaConfig(env: { STRAVA_CLIENT_ID: string; STRAVA_CLIENT_SECRET: string; STRAVA_REDIRECT_URI: string }): OAuthConfig {
  return {
    authorizeUrl: 'https://www.strava.com/oauth/authorize',
    tokenUrl: 'https://www.strava.com/oauth/token',
    clientId: env.STRAVA_CLIENT_ID,
    clientSecret: env.STRAVA_CLIENT_SECRET,
    redirectUri: env.STRAVA_REDIRECT_URI,
    scopes: ['read', 'activity:read_all'],
    scopeSeparator: ',',
    extraAuthorizeParams: { approval_prompt: 'auto' },
  };
}

export interface StravaActivity {
  id: number;
  name: string;
  sport_type: string; // Run, TrailRun, Ride, VirtualRide, Swim, WeightTraining, Walk, Hike…
  start_date_local: string; // „2026-10-11T08:19:17Z” — ora locală scrisă cu Z
  elapsed_time: number; // s
  moving_time: number; // s
  distance: number; // m
  average_heartrate?: number;
  max_heartrate?: number;
  average_cadence?: number; // la alergare: pași/min pe un picior (×2 = cadența obișnuită)
  average_watts?: number;
  device_name?: string;
  external_id?: string;
  total_elevation_gain?: number;
  average_speed?: number;
  max_speed?: number;
  weighted_average_watts?: number;
  max_watts?: number;
  kilojoules?: number;
  calories?: number;
  map?: { summary_polyline?: string | null } | null;
}

const STRAVA_SPORT: Record<string, Sport | null> = {
  Run: 'alergare',
  TrailRun: 'alergare',
  VirtualRun: 'alergare',
  Ride: 'bicicleta',
  VirtualRide: 'bicicleta',
  GravelRide: 'bicicleta',
  MountainBikeRide: 'bicicleta',
  Swim: 'inot',
  WeightTraining: 'forta',
  Workout: 'forta',
  Crossfit: 'forta',
  Walk: null,
  Hike: null,
};

export async function listActivities(token: string, afterEpochSec: number, beforeEpochSec: number): Promise<StravaActivity[]> {
  const out: StravaActivity[] = [];
  for (let page = 1; page <= 10; page++) {
    const u = new URL('https://www.strava.com/api/v3/athlete/activities');
    u.searchParams.set('after', String(afterEpochSec));
    u.searchParams.set('before', String(beforeEpochSec));
    u.searchParams.set('per_page', '100');
    u.searchParams.set('page', String(page));
    const rows = await getJson<StravaActivity[]>(u.toString(), token);
    out.push(...rows);
    if (rows.length < 100) break;
  }
  return out;
}

/** Activitatea detaliată (splits pe km, best efforts, ture): o cerere pe activitate. */
export async function getActivity(token: string, id: string): Promise<StravaDetailed> {
  return getJson<StravaDetailed>(`https://www.strava.com/api/v3/activities/${id}?include_all_efforts=false`, token);
}

export function normalizeStravaOther(a: StravaActivity): OtherActivity | null {
  if (STRAVA_SPORT[a.sport_type]) return null;
  const c = classifyOther(a.sport_type);
  if (!c) return null;
  const minutes = Math.round((a.elapsed_time ?? a.moving_time) / 60);
  if (minutes < 5) return null;
  return { id: `strava-o-${a.id}`, source: 'strava', externalId: String(a.id), date: a.start_date_local.slice(0, 10), startLocal: a.start_date_local.slice(11, 16), kind: c.kind, name: c.name, minutes, avgHr: a.average_heartrate != null ? Math.round(a.average_heartrate) : null, maxHr: a.max_heartrate != null ? Math.round(a.max_heartrate) : null };
}

export function normalizeStravaActivity(a: StravaActivity): SourceActivity | null {
  const sport = STRAVA_SPORT[a.sport_type];
  if (!sport) return null;
  // Durata ședinței. La alergare și bicicletă, timpul în mișcare (fără opririle la semafor). La înot în bazin, Strava pune
  // în moving_time doar lungimile înotate (450 m = „5 minute”), iar pauzele de la perete, care sunt parte din ședință,
  // dispar: acolo ședința e timpul de la start la stop. Timpul în mișcare rămâne în detalii (ritmul se calculează pe el).
  const minutes = Math.round((sport === 'inot' ? (a.elapsed_time ?? a.moving_time) : a.moving_time) / 60);
  const km = a.distance > 0 ? Math.round((a.distance / 1000) * 10) / 10 : null;
  return {
    id: `strava-${a.id}`,
    externalId: String(a.id),
    source: 'strava',
    date: a.start_date_local.slice(0, 10),
    startLocal: a.start_date_local.slice(11, 16),
    sport,
    minutes,
    distanceKm: km,
    avgHr: a.average_heartrate != null ? Math.round(a.average_heartrate) : null,
    maxHr: a.max_heartrate != null ? Math.round(a.max_heartrate) : null,
    avgPaceMinKm: km && sport === 'alergare' ? Math.round((minutes / km) * 100) / 100 : null,
    avgCadence: a.average_cadence != null ? Math.round(sport === 'alergare' ? a.average_cadence * 2 : a.average_cadence) : null,
    avgWatts: a.average_watts != null ? Math.round(a.average_watts) : null,
    timeInZonesMin: null, // se calculează din stream-ul de FC cu zonele sportivului, nu din Strava
    name: `${a.name}${a.device_name ? ` · ${a.device_name}` : ''}`,
    details: stravaDetails(a, sport),
  };
}

/** Webhook Strava: un abonament pe aplicație; evenimentul aduce object_id și aspect_type, recordul se cere apoi. */
export interface StravaWebhookEvent {
  object_type: 'activity' | 'athlete';
  object_id: number;
  aspect_type: 'create' | 'update' | 'delete';
  owner_id: number;
  subscription_id: number;
  event_time: number;
  updates?: Record<string, string>;
}
