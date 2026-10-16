// Sincronizarea: trage ultimele zile de la fiecare brățară conectată, normalizează, scrie în wellness_daily și activities.
import { insert, select, upsert } from './db.js';
import { DETAILS_V, mergeDetails, stravaDetails, type ActivityDetails } from '../../src/collector/details.js';
import { accessToken, connectedProviders, type Provider } from './tokens.js';
import type { SourceActivity, SourceDaily } from '../../src/collector/types.js';
import { normalizeWhoopNight, normalizeWhoopOther, normalizeWhoopWorkout, whoopApi } from '../../src/collector/providers/whoop.js';
import { getActivity, listActivities, normalizeStravaActivity, normalizeStravaOther } from '../../src/collector/providers/strava.js';
import type { OtherActivity } from '../../src/collector/other.js';
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

async function pullWhoop(userId: string, token: string, days: number): Promise<{ wellness: SourceDaily[]; activities: SourceActivity[]; others: OtherActivity[] }> {
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
  const others = workouts.map(normalizeWhoopOther).filter((a): a is OtherActivity => a != null);
  void userId;
  return { wellness, activities, others };
}

async function pullStrava(token: string, days: number): Promise<{ activities: SourceActivity[]; others: OtherActivity[] }> {
  const now = Math.floor(Date.now() / 1000);
  const rows = await listActivities(token, now - Math.max(days, 42) * 86_400, now + 3600);
  return { activities: rows.map(normalizeStravaActivity).filter((a): a is SourceActivity => a != null), others: rows.map(normalizeStravaOther).filter((a): a is OtherActivity => a != null) };
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
    ...(a.details ? { raw: a.details } : {}),
    synced_at: new Date().toISOString(),
  };
}

/**
 * Strava: lista dă rezumatul; splits pe km, best efforts și turele vin doar din activitatea detaliată.
 * Păstrăm detaliile deja citite și cerem cel mult 15 activități noi pe sincronizare (limita Strava: 100 de cereri / 15 min).
 */
async function enrichStrava(userId: string, token: string, acts: SourceActivity[]): Promise<void> {
  if (!acts.length) return;
  const existing = await select<{ id: string; raw: ActivityDetails | null }>('activities', { user_id: `eq.${userId}`, id: `in.(${acts.map((a) => `"${a.id}"`).join(',')})` }, { select: 'id,raw' }).catch(() => []);
  const prev = new Map(existing.map((r) => [r.id, r.raw]));
  let budget = 15;
  for (const a of acts) {
    const old = prev.get(a.id);
    if (old) a.details = mergeDetails(a.details, old); // nu pierdem ce s-a citit deja
    if (old?.detailed && (old.v ?? 1) >= DETAILS_V) continue;
    if (budget <= 0 || (a.sport !== 'alergare' && a.sport !== 'inot')) continue;
    budget--;
    try {
      const det = await getActivity(token, a.externalId);
      a.details = mergeDetails(stravaDetails(det, a.sport), a.details);
    } catch {
      budget = 0; // limită sau eroare: încercăm la sincronizarea următoare
    }
  }
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
        const { wellness, activities, others } = await pullWhoop(userId, token, days);
        await saveOthers(userId, others);
        if (wellness.length) await upsert('wellness_daily', wellness.map((w) => wellnessRow(userId, w)), 'user_id,date,source');
        if (activities.length) await upsert('activities', activities.map((a) => activityRow(userId, a)), 'id');
        rows = wellness.length + activities.length;
      } else if (provider === 'strava') {
        const { activities, others } = await pullStrava(token, days);
        await saveOthers(userId, others);
        await enrichStrava(userId, token, activities);
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

/** Recuperarea și mișcarea în plus; dacă tabelul nu există încă (schemă veche), nu oprește sincronizarea. */
export async function saveOthers(userId: string, others: OtherActivity[]): Promise<void> {
  if (!others.length) return;
  await upsert(
    'other_activities',
    others.map((o) => ({ id: o.id, user_id: userId, source: o.source, external_id: o.externalId, date: o.date, start_local: o.startLocal, kind: o.kind, name: o.name, minutes: o.minutes, avg_hr: o.avgHr, max_hr: o.maxHr, synced_at: new Date().toISOString() })),
    'id',
  ).catch(() => undefined);
}
