import { swimDeclared, sportReadiness } from '../../src/bar/sport-readiness.js';
import type { Goal } from '../../src/calendar/phases.js';
// /api/me: tot ce arată aplicația, într-un singur obiect, calculat pe server.
import { one, select, update } from './db.js';
import { ENV } from './env.js';
import { loadActivities, loadForms, loadPlan, loadTotals, loadUser, phaseAt, type UserRow } from './collect.js';
import { connectedProviders, providerConfigured, PROVIDERS, type Provider } from './tokens.js';
import type { LabsForm, Me, MeActivity, MeMessage, TestsForm } from '../../src/api-types.js';
import type { BarResult } from '../../src/bar/bar.js';
import { dedupeActivities, mergeWellness } from '../../src/collector/packet.js';
import { compareLabs } from '../../src/collector/labs-compare.js';
import { dayVerdict, hooperSum, objectiveReadiness } from '../../src/collector/readiness.js';
import { labSnapshot } from './collect.js';
import { matchActivities } from '../../src/scoring/match.js';
import type { Color } from '../../src/types.js';
import type { EveningForm, MorningForm, SourceDaily } from '../../src/collector/types.js';
import { addDays, labsExpired, localDayStartUtc, weekStart } from '../../src/util/dates.js';
import { activeRestriction, stricter, type Restriction } from '../../src/calendar/safety.js';
import { aerobicEfficiency } from '../../src/collector/efficiency.js';

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
    one<{ verdict: 'verde' | 'galben' | 'rosu' | 'stop'; reason: string | null; date: string; acwr: number | string | null; hooper_sum: number | null; sleep_min: number | null; hrv: number | string | null; hrv_baseline: number | string | null; tsb: number | string | null }>('readiness_daily', { user_id: `eq.${userId}`, date: `eq.${today}` }),
    select<{ id: string; kind: MeMessage['kind']; body: string; decision: MeMessage['decision']; created_at: string }>('messages', { user_id: `eq.${userId}` }, { order: 'created_at.desc', limit: 20 }),
    select<Record<string, unknown>>('wellness_daily', { user_id: `eq.${userId}`, date: `gte.${addDays(today, -61)}` }, { limit: 400 }),
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
    paceMinKm: a.avgPaceMinKm ?? null,
    cadence: a.avgCadence ?? null,
    watts: a.avgWatts ?? null,
    details: a.details ?? null,
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
          respiratoryRate: r.respiratory_rate,
        }) as SourceDaily,
    ),
  );
  const todayW = merged.find((m) => m.date === today) ?? null;
  // Starea de azi, live (la fiecare sincronizare): datele de sănătate față de media ta pe 60 de zile, apoi cum te simți.
  const prev = merged.filter((m) => m.date < today && m.date >= addDays(today, -60));
  const base = (k: 'hrv' | 'rhr' | 'respiratoryRate') => {
    const xs = prev.map((m) => m[k]).filter((x): x is number => x != null);
    return xs.length >= 14 ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
  };
  const objective = objectiveReadiness({ hrv: todayW?.hrv ?? null, hrvBaseline: base('hrv'), rhr: todayW?.rhr ?? null, rhrBaseline: base('rhr'), resp: todayW?.respiratoryRate ?? null, respBaseline: base('respiratoryRate'), recovery: todayW?.recoveryScore ?? null, sleepMin: todayW?.sleepMin ?? null });
  const mf = forms.morning as MorningForm | null;
  const hs = hooperSum(mf?.hooper).suma; // și din răspunsuri parțiale
  // Restricția activă (febră, simptom cardiac, boală, durere): o singură regulă; somnul bun nu o anulează.
  const restriction = activeRestriction({ today, morning: mf as never, evenings: forms.evenings, savedVerdict: readinessRow?.verdict ?? null, todayActivities: activities.filter((a) => a.date === today).map((a) => ({ sport: a.sport, minutes: a.minutes, rpe: (eveningByActivity[a.id] ?? eveningByActivity[a.externalId])?.rpe ?? null })) });
  const state0 = objective.scor == null && hs == null ? null : { ...dayVerdict(objective, hs), score: objective.scor, parts: { recuperare: objective.componente.recuperare.scor, somn: objective.componente.somn.scor, hrv: objective.componente.inima_hrv.scor, puls: objective.componente.inima_puls.scor, respiratie: objective.componente.respiratie.scor } };
  const state = !restriction
    ? state0
    : state0
      ? { ...state0, verdict: stricter(state0.verdict, restriction.verdict === 'stop' ? 'rosu' : restriction.verdict), motiv: restriction.reason }
      : { verdict: restriction.verdict === 'stop' ? ('rosu' as const) : restriction.verdict, motiv: restriction.reason, score: null, parts: { recuperare: null, somn: null, hrv: null, puls: null, respiratie: null } };

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
  const [totals, appleRow] = await Promise.all([
    planRow ? loadTotals(userId, planRow.start_date) : Promise.resolve(null),
    one<{ synced_at: string }>('wellness_daily', { user_id: `eq.${userId}`, source: 'eq.apple' }, { order: 'synced_at.desc' }).catch(() => null),
  ]);
  if (u2.apple_token) (appleRow ? have : missing).push('Apple Watch (Health Auto Export)');

  const dayStartMs = Date.parse(localDayStartUtc(today, (user as UserRow).tz || 'Europe/Bucharest'));
  const memento = messagesRows.find((m) => m.kind === 'memento' && Date.parse(m.created_at) >= dayStartMs)?.body ?? null;

  return {
    baseline,
    admin: (u2 as UserRow & { role?: string }).role === 'admin' ? { providers: { whoop: providerConfigured('whoop'), strava: providerConfigured('strava'), oura: providerConfigured('oura') }, appUrl: ENV.appUrl() } : null,
    profile: { sex: u2.sex ?? null, birthYear: u2.birth_year ?? null, heightCm: u2.height_cm ?? null, city: u2.city ?? null, appleConnected: !!u2.apple_token, appleLastSync: appleRow?.synced_at ?? null, appleLast: (() => { const l = lastSyncRows.find((r) => (r.provider as string) === 'apple'); return l ? { ok: l.ok, detail: l.detail, at: l.ran_at } : null; })() },
    totals,
    user: { id: user.id, email: user.email, name: user.name, goal: user.goal, raceName: user.race_name, raceDate: user.race_date, tz: user.tz },
    consent: !!consent?.health_data && !consent.withdrawn_at,
    intakeComplete: !!intake?.consimtamant,
    today,
    phase: planRow ? phaseAt(planRow.start_date, planRow.race_date, today) : null,
    budgetHours: planRow?.budget_hours ?? null,
    planStart: planRow?.start_date ?? null,
    plan: planned,
    scores: Object.fromEntries(scoresRows.map((s) => [s.workout_id, { color: s.color, reasons: s.reasons, final: s.is_final }])),
    activities: meActivities,
    state,
    wellnessToday: todayW ? { hrv: todayW.hrv, rhr: todayW.rhr, sleepMin: todayW.sleepMin, bedtime: todayW.bedtime, sleepScore: todayW.sleepScore, recoveryScore: todayW.recoveryScore, source: todayW.sources.hrv ?? todayW.sources.somn ?? null } : null,
    readiness: withRestriction(readinessRow ? { ...alignWithState(softenRed(readinessRow), state), acwr: num(readinessRow.acwr), hooperSum: readinessRow.hooper_sum } : null, restriction),
    efficiency: aerobicEfficiency(activities, today),
    sportReady: user.goal ? sportReadiness(user.goal as Goal, activities, today, { swimContinuousM: swimDeclared(forms.intake) }) : [],
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

/** Restricția activă e podeaua: decizia afișată nu poate fi mai permisivă decât ea. */
function withRestriction<T extends { verdict: 'verde' | 'galben' | 'rosu' | 'stop'; reason: string | null; acwr: number | null; hooperSum: number | null }>(r: T | null, restriction: Restriction): T | { verdict: 'galben' | 'rosu' | 'stop'; reason: string; acwr: null; hooperSum: null } | null {
  if (!restriction) return r;
  if (!r) return { verdict: restriction.verdict, reason: restriction.reason, acwr: null, hooperSum: null };
  const v = stricter(r.verdict, restriction.verdict);
  return v === r.verdict && r.verdict !== 'verde' ? r : { ...r, verdict: v, reason: restriction.reason };
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

/**
 * Roșu doar când e cu adevărat rău (aceeași regulă ca la rulare): o decizie salvată înainte de regulă, fără motiv grav,
 * se arată galben până la rularea următoare.
 */
function softenRed(r: { verdict: 'verde' | 'galben' | 'rosu' | 'stop'; reason: string | null; acwr: number | string | null; hooper_sum: number | null; sleep_min: number | null; hrv: number | string | null; hrv_baseline: number | string | null; tsb: number | string | null }): { verdict: 'verde' | 'galben' | 'rosu' | 'stop'; reason: string | null } {
  if (r.verdict !== 'rosu') return { verdict: r.verdict, reason: r.reason };
  const n = (v: unknown) => (v == null || v === '' ? null : Number(v));
  const acwr = n(r.acwr);
  const tsb = n(r.tsb);
  const hrv = n(r.hrv);
  const base = n(r.hrv_baseline);
  const really = (r.sleep_min != null && r.sleep_min < 270) || (acwr != null && acwr > 1.8) || (tsb != null && tsb < -40) || (r.hooper_sum ?? 0) >= 24 || (hrv != null && base != null && hrv < base * 0.8);
  return really ? { verdict: 'rosu', reason: r.reason } : { verdict: 'galben', reason: 'Galben: încărcare sau somn de urmărit, dar datele de sănătate sunt bune. Roșu rămâne doar pentru zilele cu adevărat rele.' };
}

/**
 * Culoarea zilei = starea din datele de sănătate. O decizie salvată mai devreme (sau după alte reguli) care nu se
 * potrivește cu starea de acum se aliniază la ea; stop rămâne stop.
 */
function alignWithState(d: { verdict: 'verde' | 'galben' | 'rosu' | 'stop'; reason: string | null }, state: { verdict: 'verde' | 'galben' | 'portocaliu' | 'rosu' } | null): { verdict: 'verde' | 'galben' | 'rosu' | 'stop'; reason: string | null } {
  if (!state || d.verdict === 'stop') return d;
  const v = state.verdict === 'portocaliu' ? 'galben' : state.verdict;
  if (v === d.verdict) return d;
  const why = { verde: 'Datele de sănătate sunt bune: faci antrenamentul din plan.', galben: 'Recuperarea nu e la maxim: ai o variantă mai ușoară ca sugestie; alegi tu.', rosu: 'Datele de sănătate arată o zi grea: azi pauză.' }[v];
  return { verdict: v, reason: why };
}

