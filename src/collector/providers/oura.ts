// Oura API v2. OAuth 2.0; scope-uri: daily, heartrate, workout, personal. Documentație: https://cloud.ouraring.com/v2/docs

import type { SourceDaily } from '../types.js';
import { getJson, type OAuthConfig } from './oauth.js';

export function ouraConfig(env: { OURA_CLIENT_ID: string; OURA_CLIENT_SECRET: string; OURA_REDIRECT_URI: string }): OAuthConfig {
  return {
    authorizeUrl: 'https://cloud.ouraring.com/oauth/authorize',
    tokenUrl: 'https://api.ouraring.com/oauth/token',
    clientId: env.OURA_CLIENT_ID,
    clientSecret: env.OURA_CLIENT_SECRET,
    redirectUri: env.OURA_REDIRECT_URI,
    scopes: ['daily', 'heartrate', 'workout', 'personal'],
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
}
export interface OuraDailySleep {
  day: string;
  score?: number | null;
}

const BASE = 'https://api.ouraring.com/v2/usercollection';
export const ouraApi = {
  sleep: (token: string, start: string, end: string) => getJson<{ data: OuraSleep[] }>(`${BASE}/sleep?start_date=${start}&end_date=${end}`, token),
  dailySleep: (token: string, start: string, end: string) => getJson<{ data: OuraDailySleep[] }>(`${BASE}/daily_sleep?start_date=${start}&end_date=${end}`, token),
  dailyReadiness: (token: string, start: string, end: string) => getJson<{ data: OuraDailyReadiness[] }>(`${BASE}/daily_readiness?start_date=${start}&end_date=${end}`, token),
};

export function normalizeOuraNight(sleep: OuraSleep, dailySleep: OuraDailySleep | null, readiness: OuraDailyReadiness | null): SourceDaily | null {
  if (sleep.type !== 'long_sleep') return null;
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
  };
}
