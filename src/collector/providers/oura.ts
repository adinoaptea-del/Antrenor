// Oura API v2. OAuth 2.0; scope-uri: daily, heartrate, workout, session, personal. Documentație: https://cloud.ouraring.com/v2/docs; aplicațiile noi se fac pe https://developer.ouraring.com/
//
// Ce aducem (optimizarea din 19.10.2026):
//  - noaptea principală (long_sleep; dacă lipsește, cel mai lung somn de peste 3 ore din zi), cu HRV, puls minim,
//    respirație, scorul de somn, readiness și abaterea temperaturii pielii față de media ta (Oura o calculează);
//  - antrenamentele (alergare, bicicletă, înot, forță → activități; plimbări, drumeții, restul → mișcare în plus);
//  - sesiunile din aplicația Oura (meditație, respirație, relaxare) → recuperare;
//  - toate paginile (next_token) și ziua de azi (end_date e exclusiv la Oura: cerem până mâine).

import type { Sport } from '../../types.js';
import type { SourceActivity, SourceDaily } from '../types.js';
import { classifyOther, type OtherActivity } from '../other.js';
import { getJson, type OAuthConfig } from './oauth.js';

export function ouraConfig(env: { OURA_CLIENT_ID: string; OURA_CLIENT_SECRET: string; OURA_REDIRECT_URI: string }): OAuthConfig {
  return {
    // Portalul nou (developer.ouraring.com) dă exact acest URL ca „Example Authorization URL” pentru aplicațiile lui;
    // cloud.ouraring.com a fost retras.
    authorizeUrl: 'https://developer.ouraring.com/authorize',
    // Aplicațiile din portalul nou (developer.ouraring.com) primesc codurile de la serverul de autorizare
    // moi.ouraring.com: schimbul codului și reîmprospătarea merg acolo (endpointul vechi le respinge cu invalid_request).
    // Codul se schimbă o singură dată, deci nu încercăm întâi endpointul vechi; doar reîmprospătarea are rezervă.
    tokenUrl: 'https://moi.ouraring.com/oauth/v2/ext/oauth-token',
    refreshFallbackUrl: 'https://api.ouraring.com/oauth/token',
    clientId: env.OURA_CLIENT_ID,
    clientSecret: env.OURA_CLIENT_SECRET,
    redirectUri: env.OURA_REDIRECT_URI,
    scopes: ['daily', 'heartrate', 'workout', 'session', 'personal'],
    scopeSeparator: ' ',
  };
}

export interface OuraSleep {
  id: string;
  day: string; // ziua trezirii
  type: 'long_sleep' | 'sleep' | 'late_nap' | 'rest';
  bedtime_start: string; // ISO cu offset local
  bedtime_end: string;
  total_sleep_duration: number; // s
  average_hrv?: number | null;
  lowest_heart_rate?: number | null;
  efficiency?: number | null;
  average_breath?: number | null;
}
export interface OuraDailyReadiness {
  day: string;
  score?: number | null;
  /** Abaterea temperaturii pielii față de media ta (°C), calculată de Oura. */
  temperature_deviation?: number | null;
}
export interface OuraWorkout {
  id: string;
  activity: string; // running, cycling, swimming, strength_training, walking, hiking, …
  day: string;
  start_datetime: string; // ISO cu offset local
  end_datetime: string;
  intensity?: 'easy' | 'moderate' | 'hard' | null;
  calories?: number | null;
  distance?: number | null; // m
  label?: string | null;
  source?: 'manual' | 'autodetected' | 'confirmed' | 'workout_heart_rate' | null;
}
export interface OuraSession {
  id: string;
  day: string;
  start_datetime: string;
  end_datetime: string;
  type: 'breathing' | 'meditation' | 'nap' | 'relaxation' | 'rest' | 'body_status' | string;
}
export interface OuraDailySleep {
  day: string;
  score?: number | null;
}

const BASE = 'https://api.ouraring.com/v2/usercollection';

/** Toate paginile unei colecții (Oura întoarce next_token până la capăt). */
async function all<T>(path: string, token: string, start: string, end: string): Promise<T[]> {
  const out: T[] = [];
  let next: string | null = null;
  for (let page = 0; page < 50; page++) {
    const u = `${BASE}/${path}?start_date=${start}&end_date=${end}${next ? `&next_token=${encodeURIComponent(next)}` : ''}`;
    const r: { data: T[]; next_token?: string | null } = await getJson(u, token);
    out.push(...(r.data ?? []));
    next = r.next_token ?? null;
    if (!next) break;
  }
  return out;
}

export const ouraApi = {
  sleep: (token: string, start: string, end: string) => all<OuraSleep>('sleep', token, start, end),
  dailySleep: (token: string, start: string, end: string) => all<OuraDailySleep>('daily_sleep', token, start, end),
  dailyReadiness: (token: string, start: string, end: string) => all<OuraDailyReadiness>('daily_readiness', token, start, end),
  workouts: (token: string, start: string, end: string) => all<OuraWorkout>('workout', token, start, end),
  sessions: (token: string, start: string, end: string) => all<OuraSession>('session', token, start, end),
};

/**
 * Noaptea principală a fiecărei zile: somnul lung (long_sleep); dacă Oura nu l-a marcat așa (noapte scurtă, inel pus
 * târziu), cel mai lung somn de cel puțin 3 ore din ziua respectivă. Siestele nu devin noapte.
 */
export function mainNights(sleeps: OuraSleep[]): OuraSleep[] {
  const byDay = new Map<string, OuraSleep[]>();
  for (const s of sleeps) byDay.set(s.day, [...(byDay.get(s.day) ?? []), s]);
  const out: OuraSleep[] = [];
  for (const list of byDay.values()) {
    const longest = (xs: OuraSleep[]) => [...xs].sort((a, b) => b.total_sleep_duration - a.total_sleep_duration)[0];
    const long = list.filter((s) => s.type === 'long_sleep');
    const pick = long.length ? longest(long) : longest(list.filter((s) => s.type === 'sleep' && s.total_sleep_duration >= 3 * 3600));
    if (pick) out.push(pick);
  }
  return out;
}

export function normalizeOuraNight(sleep: OuraSleep, dailySleep: OuraDailySleep | null, readiness: OuraDailyReadiness | null): SourceDaily | null {
  if (sleep.type !== 'long_sleep' && !(sleep.type === 'sleep' && sleep.total_sleep_duration >= 3 * 3600)) return null;
  return {
    date: sleep.day,
    source: 'oura',
    sleepMin: Math.round(sleep.total_sleep_duration / 60),
    bedtime: sleep.bedtime_start.slice(11, 16),
    wakeTime: sleep.bedtime_end.slice(11, 16),
    hrv: sleep.average_hrv ?? null,
    rhr: sleep.lowest_heart_rate ?? null,
    sleepScore: dailySleep?.score ?? null,
    recoveryScore: readiness?.score ?? null,
    respiratoryRate: sleep.average_breath ?? null,
    tempDevC: readiness?.temperature_deviation ?? null,
  };
}

const OURA_SPORT: Record<string, Sport> = {
  running: 'alergare',
  trail_running: 'alergare',
  treadmill_running: 'alergare',
  cycling: 'bicicleta',
  indoor_cycling: 'bicicleta',
  mountain_biking: 'bicicleta',
  swimming: 'inot',
  strength_training: 'forta',
  weight_training: 'forta',
  functional_training: 'forta',
};

const hm = (iso: string) => iso.slice(11, 16);
const durSec = (w: { start_datetime: string; end_datetime: string }) => Math.round((Date.parse(w.end_datetime) - Date.parse(w.start_datetime)) / 1000);

/** Antrenamentele Oura în cele patru sporturi; ziua și ora sunt cele locale din înregistrare. */
export function normalizeOuraWorkout(w: OuraWorkout): SourceActivity | null {
  // Ce a „ghicit” inelul din mișcare (autodetected) nu e antrenament: Oura confundă des (ex. „bicicletă” la o zi activă).
  // Intră doar ce a pornit sau a confirmat sportivul; restul rămâne mișcare în plus, etichetată.
  if (w.source === 'autodetected') return null;
  const sport = OURA_SPORT[w.activity];
  const sec = durSec(w);
  if (!sport || !Number.isFinite(sec) || sec < 60) return null;
  const km = w.distance != null && w.distance > 0 ? Math.round(w.distance / 100) / 10 : null;
  return {
    id: `oura-${w.id}`,
    externalId: w.id,
    source: 'oura',
    date: w.start_datetime.slice(0, 10),
    startLocal: hm(w.start_datetime),
    sport,
    minutes: Math.round(sec / 60),
    distanceKm: km,
    avgHr: null,
    maxHr: null,
    timeInZonesMin: null,
    name: `oura ${w.label || w.activity}${w.intensity ? ` (${w.intensity === 'easy' ? 'ușor' : w.intensity === 'moderate' ? 'moderat' : 'greu'})` : ''}`,
  };
}

/** Restul antrenamentelor (plimbare, drumeție, alte sporturi) → mișcare în plus; plimbările intră și în bula de mers. */
export function normalizeOuraOther(w: OuraWorkout): OtherActivity | null {
  const auto = w.source === 'autodetected';
  if (OURA_SPORT[w.activity] && !auto) return null;
  // Un sport detectat automat rămâne vizibil ca mișcare în plus, cu eticheta lui, fără să conteze la pregătire.
  const c = OURA_SPORT[w.activity] ? { kind: 'activ' as const, name: `${w.activity.replace(/_/g, ' ')} (detectat automat de Oura, neconfirmat)` } : classifyOther(w.activity);
  const sec = durSec(w);
  if (!c || !Number.isFinite(sec) || sec < 300) return null;
  return { id: `oura-o-${w.id}`, source: 'oura', externalId: w.id, date: w.start_datetime.slice(0, 10), startLocal: hm(w.start_datetime), kind: c.kind, name: c.name, minutes: Math.round(sec / 60), avgHr: null, maxHr: null, startUtc: new Date(w.start_datetime).toISOString(), elapsedSec: sec, movingSec: null };
}

const SESSION_NAME: Record<string, string> = { breathing: 'respirație', meditation: 'meditație', relaxation: 'meditație', rest: 'recuperare' };

/** Sesiunile din aplicația Oura (respirație, meditație, relaxare, odihnă) → recuperare; siestele și „body status” nu. */
export function normalizeOuraSession(s: OuraSession): OtherActivity | null {
  const name = SESSION_NAME[s.type];
  const sec = durSec(s);
  if (!name || !Number.isFinite(sec) || sec < 120) return null;
  return { id: `oura-s-${s.id}`, source: 'oura', externalId: s.id, date: s.start_datetime.slice(0, 10), startLocal: hm(s.start_datetime), kind: 'recuperare', name, minutes: Math.round(sec / 60), avgHr: null, maxHr: null, startUtc: new Date(s.start_datetime).toISOString(), elapsedSec: sec, movingSec: null };
}
