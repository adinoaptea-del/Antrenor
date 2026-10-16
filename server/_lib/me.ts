// /api/me: tot ce arată aplicația, într-un singur obiect, calculat pe server.
import { one, select, update } from './db.js';
import { ENV } from './env.js';
import { loadActivities, loadForms, loadPlan, loadTotals, loadUser, phaseAt, type UserRow } from './collect.js';
import { connectedProviders, providerConfigured, PROVIDERS, type Provider } from './tokens.js';
import type { LabsForm, Me, MeActivity, MeMessage, TestsForm } from '../../src/api-types.js';
import type { BarResult } from '../../src/bar/bar.js';
import { dedupeActivities, mergeWellness } from '../../src/collector/packet.js';
import { compareLabs } from '../../src/collector/labs-compare.js';
import { labSnapshot } from './collect.js';
import { matchActivities } from '../../src/scoring/match.js';
import type { Color } from '../../src/types.js';
import type { EveningForm, MorningForm, SourceDaily } from '../../src/collector/types.js';
import { addDays, labsExpired, weekStart } from '../../src/util/dates.js';

export async function buildMe(userId: string, today: string): Promise<Me> {
  const user = await loadUser(userId);
  const from = addDays(today, -42);
  const [{ workouts }, acts, forms, consent, tokens, scoresRows, barRow, readinessRow, messagesRows, wellnessRows, zonesRow, labsRows, lastSyncRows, planRow] = await Promise.all([
    loadPlan(userId, addDays(today, -28), user.race_date ?? addDays(today, 400)),
    loadActivities(userId, from),
    loadForms(userId, today),
    one<{ health_data: boolean; withdrawn_at: string | null }>('consents', { user_id: `eq.${userId}` }),
    connectedProviders(userId),
    select<{ workout_id: string; color: Color; reasons: string[]; is_final: boolean }>('scores', { user_id: `eq.${userId}` }, { limit: 400 }),
    one<BarResult & { date: string }>('bar_daily', { user_id: `eq.${userId}` }, { order: 'date.desc' }),
    one<{ verdict: 'verde' | 'galben' | 'rosu' | 'stop'; reason: string | null; date: string; acwr: number | string | null; hooper_sum: number | null }>('readiness_daily', { user_id: `eq.${userId}`, date: `eq.${today}` }),
    select<{ id: string; kind: MeMessage['kind']; body: string; decision: MeMessage['decision']; created_at: string }>('messages', { user_id: `eq.${userId}` }, { order: 'created_at.desc', limit: 20 }),
    select<Record<string, unknown>>('wellness_daily', { user_id: `eq.${userId}`, date: `gte.${addDays(today, -2)}` }, { limit: 20 }),
    one<{ run_hr_zones: number[] | null; bike_ftp_w: number | null; bike_hr_zones: number[] | null; swim_css_sec_100m: number | null; source: string | null }>('zones', { user_id: `eq.${userId}` }),
    select<{ drawn_at: string; feritina: number | null; vitamina_d: number | null; hemoglobina: number | null; ck: number | null; crp: number | null; other: { laborator?: string | null; valori?: LabsForm['alte'] } | null }>('labs', { user_id: `eq.${userId}` }, { order: 'drawn_at.desc', limit: 2 }),
    select<{ provider: Provider; ok: boolean; detail: string | null; ran_at: string }>('sync_log', { user_id: `eq.${userId}` }, { order: 'ran_at.desc', limit: 30 }),
    one<{ start_date: string; race_date: string; budget_hours: number }>('plans', { user_id: `eq.${userId}`, active: 'eq.true' }),
  ]);

  const activities = dedupeActivities(acts);
  const planned = workouts.filter((w) => w.status !== 'sters');
  const { unplanned } = matchActivities(planned.filter((w) => w.date <= today), activities, today);
  const unplannedIds = new Set(unplanned.map((a) => a.id));
  const eveningByActivity: Record<string, EveningForm> = {};
  for (const e of forms.evenings) if (e.activityId) eveningByActivity[e.activityId] = e;

  const meActivities: MeActivity[] = activities.map((a) => ({
    id: a.id,
    source: a.source,
    date: a.date,
    sport: a.sport,
    minutes: a.minutes,
    distanceKm: a.distanceKm ?? null,
    avgHr: a.avgHr ?? null,
    maxHr: a.maxHr ?? null,
    name: a.name ?? null,
    unplanned: unplannedIds.has(a.id),
    tipNeplanificat: eveningByActivity[a.id]?.tip_neplanificat ?? eveningByActivity[a.externalId]?.tip_neplanificat ?? null,
  }));

  const merged = mergeWellness(
    wellnessRows.map(
      (r) =>
        ({
          date: r.date,
          source: r.source,
          hrv: r.hrv,
          rhr: r.rhr,
          sleepMin: r.sleep_min,
          bedtime: r.bedtime,
          wakeTime: r.wake_time,
          sleepScore: r.sleep_score,
          recoveryScore: r.recovery_score,
        }) as SourceDaily,
    ),
  );
  const todayW = merged.find((m) => m.date === today) ?? null;

  const devices = tokens.map((t) => {
    const last = lastSyncRows.find((s) => s.provider === t.provider);
    return { provider: t.provider, connectedAt: t.connected_at, lastSync: last?.ran_at ?? null, lastOk: last ? last.ok : null, detail: last?.detail ?? null };
  });
  const lastSync = lastSyncRows.find((s) => s.ok)?.ran_at ?? null;

  const intake = forms.intake as (Record<string, unknown> & { consimtamant?: boolean }) | null;
  const have: string[] = [];
  const missing: string[] = [];
  (intake ? have : missing).push('chestionar de intrare');
  (planRow ? have : missing).push('program săptămânal');
  for (const p of PROVIDERS) if (providerConfigured(p)) (tokens.some((t) => t.provider === p) ? have : missing).push({ whoop: 'Whoop', strava: 'Garmin / ceas (prin Strava)', oura: 'Oura' }[p]);
  (zonesRow && zonesRow.source !== 'provizoriu' ? have : missing).push('zone testate (CPET / test de teren)');
  const labsRow = labsRows[0] ?? null;
  const labsOld = !!labsRow && labsExpired(labsRow.drawn_at, today);
  (labsRow && !labsOld ? have : missing).push(labsOld ? 'analize de sânge (mai vechi de 12 luni)' : 'analize de sânge');
  const clearance = await one<{ cardiology: boolean }>('clearances', { user_id: `eq.${userId}` });
  (clearance?.cardiology ? have : missing).push('aviz cardiologic');
  (activities.length ? have : missing).push('istoric de activități');

  const warnings: Me['warnings'] = [];
  const weekAgo = addDays(today, -14);
  const plannedSwim = planned.filter((w) => w.sport === 'inot' && w.date >= weekAgo && w.date < today).reduce((n, w) => n + w.plannedMinutes, 0);
  const doneSwim = activities.filter((a) => a.sport === 'inot' && a.date >= weekAgo && a.date < today).reduce((n, a) => n + a.minutes, 0);
  if (plannedSwim >= 90 && doneSwim / plannedSwim < 0.6) {
    warnings.push({ title: 'Înot sub plan', text: `Ai înotat ${Math.round((doneSwim / plannedSwim) * 100)}% din minutele planificate în ultimele două săptămâni.`, fix: 'Săptămâna viitoare ședințele de înot se plasează primele.' });
  }

  const testRow = await one<{ results: TestsForm }>('tests', { user_id: `eq.${userId}` }, { order: 'tested_at.desc' });
  const bodyRow = await one<{ date: string; weight_kg: number | null; body_fat_pct: number | null }>('wellness_daily', { user_id: `eq.${userId}`, source: 'eq.manual', weight_kg: 'not.is.null' }, { order: 'date.desc' });
  const aviz = (intake as { sanatate?: { avizCardiolog?: 'da' | 'nu' | 'programat' } } | null)?.sanatate?.avizCardiolog ?? null;
  const baseline: Me['baseline'] = {
    labs: labsRow ? { data: labsRow.drawn_at, feritina: num(labsRow.feritina), vitamina_d: num(labsRow.vitamina_d), hemoglobina: num(labsRow.hemoglobina), ck: num(labsRow.ck), crp: num(labsRow.crp), alte: labsRow.other?.valori ?? undefined, laborator: labsRow.other?.laborator ?? null, expirat: labsExpired(labsRow.drawn_at, today) } : null,
    labsCompare: labsRow ? compareLabs(labSnapshot(labsRow), labsRows[1] ? labSnapshot(labsRows[1]) : null) : null,
    tests: testRow?.results ?? null,
    body: bodyRow ? { data: bodyRow.date, greutate: num(bodyRow.weight_kg), grasime_pct: num(bodyRow.body_fat_pct) } : null,
    cardiolog: clearance?.cardiology ? 'da' : aviz === 'da' ? 'da' : aviz ? 'nu' : null,
  };

  const u2 = user as UserRow;
  // Reparație: dacă nimeni nu e admin (setarea n-a prins la creare), primul cont creat devine admin.
  if (u2.role !== 'admin') {
    const admins = await select<{ id: string }>('users', { role: 'eq.admin' }, { select: 'id', limit: 1 });
    if (!admins.length) {
      const first = await select<{ id: string }>('users', {}, { select: 'id', order: 'created_at.asc', limit: 1 });
      if (first[0]?.id === userId) {
        await update('users', { id: `eq.${userId}` }, { role: 'admin' });
        u2.role = 'admin';
      }
    }
  }
  const [totals, appleRow] = await Promise.all([
    planRow ? loadTotals(userId, planRow.start_date) : Promise.resolve(null),
    one<{ synced_at: string }>('wellness_daily', { user_id: `eq.${userId}`, source: 'eq.apple' }, { order: 'synced_at.desc' }).catch(() => null),
  ]);
  if (u2.apple_token) (appleRow ? have : missing).push('Apple Watch (Health Auto Export)');

  const memento = messagesRows.find((m) => m.kind === 'memento' && m.created_at >= `${today}T00:00:00`)?.body ?? null;

  return {
    baseline,
    admin: (u2 as UserRow & { role?: string }).role === 'admin' ? { providers: { whoop: providerConfigured('whoop'), strava: providerConfigured('strava'), oura: providerConfigured('oura') }, appUrl: ENV.appUrl() } : null,
    profile: { city: u2.city ?? null, appleConnected: !!u2.apple_token, appleLastSync: appleRow?.synced_at ?? null },
    totals,
    user: { id: user.id, email: user.email, name: user.name, goal: user.goal, raceName: user.race_name, raceDate: user.race_date, tz: user.tz },
    consent: !!consent?.health_data && !consent.withdrawn_at,
    intakeComplete: !!intake?.consimtamant,
    today,
    phase: planRow ? phaseAt(planRow.start_date, planRow.race_date, today) : null,
    budgetHours: planRow?.budget_hours ?? null,
    plan: planned,
    scores: Object.fromEntries(scoresRows.map((s) => [s.workout_id, { color: s.color, reasons: s.reasons, final: s.is_final }])),
    activities: meActivities,
    wellnessToday: todayW ? { hrv: todayW.hrv, rhr: todayW.rhr, sleepMin: todayW.sleepMin, bedtime: todayW.bedtime, sleepScore: todayW.sleepScore, recoveryScore: todayW.recoveryScore, source: todayW.sources.hrv ?? todayW.sources.somn ?? null } : null,
    readiness: readinessRow ? { verdict: readinessRow.verdict, reason: readinessRow.reason, acwr: num(readinessRow.acwr), hooperSum: readinessRow.hooper_sum } : null,
    bar: barRow ? { blocked: barRow.blocked, total: barRow.total, basis: barRow.basis, components: barRow.components } : null,
    messages: messagesRows.filter((m) => m.kind !== 'memento').map((m) => ({ id: m.id, kind: m.kind, body: m.body, decision: m.decision, createdAt: m.created_at })),
    memento,
    forms: { intake, morning: (forms.morning as MorningForm | null) ?? null, evening: eveningByActivity, weeklyDone: await weeklyDone(userId, today) },
    devices,
    lastSync,
    zones: zonesRow
      ? {
          run: zonesRow.run_hr_zones ? `Z2 ${zonesRow.run_hr_zones[0]}–${zonesRow.run_hr_zones[1]} bpm` : null,
          bike: zonesRow.bike_ftp_w ? `FTP ${zonesRow.bike_ftp_w} W` : zonesRow.bike_hr_zones ? `Z2 ${zonesRow.bike_hr_zones[0]}–${zonesRow.bike_hr_zones[1]} bpm` : null,
          swim: zonesRow.swim_css_sec_100m ? `CSS ${zonesRow.swim_css_sec_100m} s/100 m` : null,
          source: zonesRow.source,
        }
      : null,
    dataAvailability: { have, missing },
    warnings,
  };
}

async function weeklyDone(userId: string, today: string): Promise<boolean> {
  const row = await one('questionnaires', { user_id: `eq.${userId}`, kind: 'eq.saptamanal', for_date: `gte.${weekStart(today)}` });
  return !!row;
}

/** PostgREST întoarce `numeric` ca string; îl citim ca număr, fără să inventăm nimic. */
function num(v: number | string | null | undefined): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
