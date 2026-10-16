// Sincronizarea: trage ultimele zile de la fiecare brățară conectată, normalizează, scrie în wellness_daily și activities.
import { insert, upsert } from './db.js';
import { accessToken, connectedProviders, type Provider } from './tokens.js';
import type { SourceActivity, SourceDaily } from '../../src/collector/types.js';
import { normalizeWhoopNight, normalizeWhoopWorkout, whoopApi } from '../../src/collector/providers/whoop.js';
import { listActivities, normalizeStravaActivity } from '../../src/collector/providers/strava.js';
import { normalizeOuraNight, ouraApi } from '../../src/collector/providers/oura.js';

export interface SyncReport {
  provider: Provider;
  ok: boolean;
  rows: number;
  detail: string | null;
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function pullWhoop(userId: string, token: string, days: number): Promise<{ wellness: SourceDaily[]; activities: SourceActivity[] }> {
  const end = new Date();
  const start = new Date(end.getTime() - days * 86_400_000);
  const [recoveries, sleeps, workouts] = await Promise.all([whoopApi.recovery(token, isoDay(start), isoDay(end)), whoopApi.sleep(token, isoDay(start), isoDay(end)), whoopApi.workouts(token, isoDay(start), isoDay(end))]);
  const wellness: SourceDaily[] = [];
  for (const s of sleeps) {
    const rec = recoveries.find((r) => r.sleep_id === s.id) ?? null;
    const n = normalizeWhoopNight(s, rec);
    if (n) wellness.push(n);
  }
  const activities = workouts.map(normalizeWhoopWorkout).filter((a): a is SourceActivity => a != null);
  void userId;
  return { wellness, activities };
}

async function pullStrava(token: string, days: number): Promise<SourceActivity[]> {
  const now = Math.floor(Date.now() / 1000);
  const rows = await listActivities(token, now - days * 86_400, now + 3600);
  return rows.map(normalizeStravaActivity).filter((a): a is SourceActivity => a != null);
}

async function pullOura(token: string, days: number): Promise<SourceDaily[]> {
  const end = new Date();
  const start = new Date(end.getTime() - days * 86_400_000);
  const [sleep, daily, readiness] = await Promise.all([ouraApi.sleep(token, isoDay(start), isoDay(end)), ouraApi.dailySleep(token, isoDay(start), isoDay(end)), ouraApi.dailyReadiness(token, isoDay(start), isoDay(end))]);
  const out: SourceDaily[] = [];
  for (const s of sleep.data) {
    const n = normalizeOuraNight(s, daily.data.find((d) => d.day === s.day) ?? null, readiness.data.find((r) => r.day === s.day) ?? null);
    if (n) out.push(n);
  }
  return out;
}

function wellnessRow(userId: string, w: SourceDaily) {
  return {
    user_id: userId,
    date: w.date,
    source: w.source,
    hrv: w.hrv ?? null,
    rhr: w.rhr ?? null,
    sleep_min: w.sleepMin ?? null,
    bedtime: w.bedtime ?? null,
    wake_time: w.wakeTime ?? null,
    sleep_score: w.sleepScore ?? null,
    recovery_score: w.recoveryScore ?? null,
    respiratory_rate: w.respiratoryRate ?? null,
    weight_kg: w.weightKg ?? null,
    body_fat_pct: w.bodyFatPct ?? null,
    synced_at: new Date().toISOString(),
  };
}

function activityRow(userId: string, a: SourceActivity) {
  return {
    id: a.id,
    user_id: userId,
    source: a.source,
    external_id: a.externalId,
    date: a.date,
    start_local: a.startLocal ?? null,
    sport: a.sport,
    minutes: a.minutes,
    distance_km: a.distanceKm ?? null,
    avg_hr: a.avgHr ?? null,
    max_hr: a.maxHr ?? null,
    avg_pace_min_km: a.avgPaceMinKm ?? null,
    avg_cadence: a.avgCadence ?? null,
    avg_watts: a.avgWatts ?? null,
    time_in_zones_min: a.timeInZonesMin ?? null,
    name: a.name ?? null,
    synced_at: new Date().toISOString(),
  };
}

/** Sincronizează toate brățările conectate ale unui sportiv. days = câte zile înapoi (3 la apăsare, 35 la conectare). */
export async function syncUser(userId: string, days = 3): Promise<SyncReport[]> {
  const connected = await connectedProviders(userId);
  const reports: SyncReport[] = [];
  for (const row of connected) {
    const provider = row.provider;
    try {
      const token = await accessToken(userId, provider);
      if (!token) throw new Error('fără token');
      let rows = 0;
      if (provider === 'whoop') {
        const { wellness, activities } = await pullWhoop(userId, token, days);
        if (wellness.length) await upsert('wellness_daily', wellness.map((w) => wellnessRow(userId, w)), 'user_id,date,source');
        if (activities.length) await upsert('activities', activities.map((a) => activityRow(userId, a)), 'id');
        rows = wellness.length + activities.length;
      } else if (provider === 'strava') {
        const activities = await pullStrava(token, days);
        if (activities.length) await upsert('activities', activities.map((a) => activityRow(userId, a)), 'id');
        rows = activities.length;
      } else if (provider === 'oura') {
        const wellness = await pullOura(token, days);
        if (wellness.length) await upsert('wellness_daily', wellness.map((w) => wellnessRow(userId, w)), 'user_id,date,source');
        rows = wellness.length;
      }
      reports.push({ provider, ok: true, rows, detail: null });
      await insert('sync_log', { user_id: userId, provider, ok: true, rows, detail: null });
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      reports.push({ provider, ok: false, rows: 0, detail });
      await insert('sync_log', { user_id: userId, provider, ok: false, rows: 0, detail: detail.slice(0, 500) }).catch(() => undefined);
    }
  }
  return reports;
}
