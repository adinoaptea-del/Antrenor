import { todayIn } from './auth.js';
import { prepStartOf } from '../../src/calendar/prep-day.js';
import { GOAL_NAME, swimDeclared, sportReadiness } from '../../src/bar/sport-readiness.js';
import { balanceCheck } from '../../src/calendar/balance.js';
import { perDayMinutes, weeklyBudget } from '../../src/calendar/budget.js';
import { raceReady } from '../../src/bar/race-ready.js';
import { targetSecFromIntake } from '../../src/goals/run-target.js';
import type { RunResult } from '../../src/util/run.js';
import type { Goal } from '../../src/calendar/phases.js';
// /api/me: tot ce arată aplicația, într-un singur obiect, calculat pe server.
import { one, select, update, upsert } from './db.js';
import { ensureSplit } from './split.js';
import { MIGRATIONS, runOnce } from './migrations.js';
import { restoreExtraCuts } from '../../src/calendar/adapt.js';
import { demonstrated, raiseToDemonstrated } from '../../src/calendar/demonstrated.js';
import { fitStructure } from '../../src/calendar/validate.js';
import { normalizeWorkout } from '../../src/calendar/coherence.js';
import { fitnessWithAttendance } from './plan.js';
import { fitnessProfile, type FitnessIntake } from '../../src/strength/fitness.js';
import { isFitnessGoal, isWalkGoal } from '../../src/calendar/phases.js';
import { loadWalkRows } from './walking.js';
import { walkingView } from '../../src/walking/view.js';
import { loadPrefs } from './prefs.js';
import { recoverySummary } from '../../src/recovery/recovery.js';
import { loadBadges } from './badges.js';
import { decideDay, messageMatches } from '../../src/calendar/day.js';
import { overYesterday } from '../../src/calendar/load.js';
import { ENV } from './env.js';
import { latestCssTest, loadActivities, loadForms, loadOthers, loadPlan, loadTotals, loadUser, phaseAt, toWorkoutRow, type UserRow } from './collect.js';
import { connectedProviders, providerConfigured, PROVIDERS, type Provider } from './tokens.js';
import type { LabsForm, Me, MeActivity, MeMessage, TestsForm } from '../../src/api-types.js';
import type { BarResult } from '../../src/bar/bar.js';
import { dedupeActivities, mergeWellness } from '../../src/collector/packet.js';
import { compareLabs } from '../../src/collector/labs-compare.js';
import { dayVerdict, hooperSum, objectiveReadiness } from '../../src/collector/readiness.js';
import { labSnapshot } from './collect.js';
import { matchActivities } from '../../src/scoring/match.js';
import type { Color, FreeBlock } from '../../src/types.js';
import type { EveningForm, MorningForm, SourceDaily } from '../../src/collector/types.js';
import { addDays, labsExpired, localDayStartUtc, weekStart } from '../../src/util/dates.js';
import { activeRestriction, pendingCardiac, stricter, withIncidents, type Restriction } from '../../src/calendar/safety.js';
import { aerobicEfficiency } from '../../src/collector/efficiency.js';
import type { StrengthLogEntry } from '../../src/strength/log.js';

export async function buildMe(userId: string, today: string): Promise<Me> {
  const user = await loadUser(userId);
  const from = addDays(today, -42);
  const [planLoad, acts0, forms, consent, tokens, scoresRows, barRow, readinessRow, messagesRows, wellnessRows, zonesRow, labsRows, lastSyncRows, planRow] = await Promise.all([
    loadPlan(userId, addDays(today, -28), user.race_date ?? addDays(today, 400)),
    loadActivities(userId, from),
    loadForms(userId, today),
    one<{ health_data: boolean; withdrawn_at: string | null }>('consents', { user_id: `eq.${userId}` }),
    connectedProviders(userId),
    select<{ workout_id: string; color: Color; reasons: string[]; is_final: boolean; metrics: { durationPct?: number | null; pain?: number | null; evaluare?: import('../../src/scoring/score.js').Evaluation | null } | null }>('scores', { user_id: `eq.${userId}` }, { limit: 400 }),
    one<BarResult & { date: string }>('bar_daily', { user_id: `eq.${userId}` }, { order: 'date.desc' }),
    one<{ verdict: 'verde' | 'galben' | 'rosu' | 'stop'; reason: string | null; date: string; acwr: number | string | null; hooper_sum: number | null; sleep_min: number | null; hrv: number | string | null; hrv_baseline: number | string | null; tsb: number | string | null }>('readiness_daily', { user_id: `eq.${userId}`, date: `eq.${today}` }),
    select<{ id: string; kind: MeMessage['kind']; body: string; decision: MeMessage['decision']; created_at: string }>('messages', { user_id: `eq.${userId}` }, { order: 'created_at.desc', limit: 20 }),
    select<Record<string, unknown>>('wellness_daily', { user_id: `eq.${userId}`, date: `gte.${addDays(today, -92)}` }, { limit: 600 }),
    one<{ run_hr_zones: number[] | null; bike_ftp_w: number | null; bike_hr_zones: number[] | null; swim_css_sec_100m: number | null; source: string | null }>('zones', { user_id: `eq.${userId}` }),
    select<{ drawn_at: string; feritina: number | null; vitamina_d: number | null; hemoglobina: number | null; ck: number | null; crp: number | null; other: { laborator?: string | null; valori?: LabsForm['alte'] } | null }>('labs', { user_id: `eq.${userId}` }, { order: 'drawn_at.desc', limit: 2 }),
    select<{ provider: Provider; ok: boolean; detail: string | null; ran_at: string }>('sync_log', { user_id: `eq.${userId}` }, { order: 'ran_at.desc', limit: 30 }),
    one<{ start_date: string; race_date: string; budget_hours: number }>('plans', { user_id: `eq.${userId}`, active: 'eq.true' }),
  ]);
  // Mersul pe jos (obiectivul „mers”): plimbările devin activități de mers, legate de ședințele de mers din plan.
  const tz = (user as UserRow).tz || 'Europe/Bucharest';
  const walkGoal = isWalkGoal(user.goal);
  const walkLoad = walkGoal ? await loadWalkRows(userId, addDays(weekStart(today), -63)) : null;
  const acts = acts0;
  // Jurnalul de forță (schema 7); pe o schemă veche lipsește tabela: lista rămâne goală, nu cade pagina.
  const outcomeRows = await select<{ workout_id: string; status: 'ratat' | 'partial'; motiv: 'timp' | 'oboseala' | 'durere' | 'boala' | 'altul'; minutes: number | null; reported_at: string }>('workout_outcomes', { user_id: `eq.${userId}`, date: `gte.${addDays(today, -42)}` }, { limit: 200 }).catch(() => []);
  const strengthRows = await select<StrengthLogEntry>('strength_log', { user_id: `eq.${userId}`, date: `gte.${addDays(today, -120)}` }, { select: 'date,exercise,sets,rir,source', order: 'date.asc', limit: 500 }).catch(() => [] as StrengthLogEntry[]);

  const activities = dedupeActivities(acts);
  // Auditul v93, A23 (decizia proprietarului 20.10.2026): regulile noi se aplică planului activ O SINGURĂ DATĂ, ca
  // migrări versionate și jurnalizate (server/_lib/migrations.ts); refresh-ul și login-ul nu mai rescriu ședințe.
  const pid = planLoad.planId;
  const sexOf = user.sex ?? ((forms.intake as { sex?: string } | null)?.sex ?? null);
  let workouts = planLoad.workouts;
  workouts = await runOnce(userId, pid, today, MIGRATIONS.strengthSplit, workouts, async (plan) => {
    const after = await ensureSplit(userId, today, { planId: pid, workouts: plan }, sexOf, (user.goal as string | null) ?? null);
    return after.filter((w, i) => w !== plan[i]);
  }).catch(() => workouts);
  workouts = await runOnce(userId, pid, today, MIGRATIONS.restoreExtraCuts, workouts, (plan) => restoreExtraCuts(plan, today)).catch(() => workouts);
  workouts = await runOnce(userId, pid, today, MIGRATIONS.raiseDemonstrated, workouts, (plan) => raiseToDemonstrated(plan, today, demonstrated(activities, today)).map((w) => normalizeWorkout(fitStructure(w)))).catch(() => workouts);
  const planned = workouts.filter((w) => w.status !== 'sters');
  const { unplanned, matches } = matchActivities(planned.filter((w) => w.date <= today), activities, today);
  const doneToday = matches.filter((m) => m.activity && m.planned.date === today).map((m) => m.planned.id);
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
    startLocal: a.startLocal ?? null,
    sources: a.mergedSources ?? [a.source],
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
          tempDevC: r.temp_dev_c == null ? null : Number(r.temp_dev_c),
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
  const restriction = activeRestriction({ today, morning: mf as never, evenings: withIncidents(forms.evenings, forms.incidents.evenings), mornings: withIncidents(forms.mornings, forms.incidents.mornings) as never, savedVerdict: readinessRow?.verdict ?? null, todayActivities: activities.filter((a) => a.date === today).map((a) => ({ sport: a.sport, minutes: a.minutes, rpe: (eveningByActivity[a.id] ?? eveningByActivity[a.externalId])?.rpe ?? null })) });
  // Ieri a fost efort peste plan? Atunci azi contează și durerile musculare (brățara nu vede oboseala musculară).
  const withRpe = activities.map((a) => ({ ...a, rpe: (eveningByActivity[a.id] ?? eveningByActivity[a.externalId])?.rpe ?? null }));
  const ieri = overYesterday(today, planned, withRpe);
  const verdict0 = dayVerdict(objective, hs, { apt: mf?.apt ?? null, efortIeri: ieri.over, dureri: mf?.hooper.dureri ?? null });
  // Fără date de la brățări și fără răspuns: nu ghicim o culoare, îl întrebăm pe sportiv.
  const ask = !!verdict0.intrebare;
  const state0 = ask || (objective.scor == null && hs == null && !mf?.apt) ? null : { ...verdict0, score: objective.scor, parts: { recuperare: objective.componente.recuperare.scor, somn: objective.componente.somn.scor, hrv: objective.componente.inima_hrv.scor, puls: objective.componente.inima_puls.scor, respiratie: objective.componente.respiratie.scor } };
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
  const lastDataOf = (src: string) => {
    const a = acts.filter((x) => x.source === src).map((x) => x.date);
    const w = wellnessRows.filter((x) => x.source === src).map((x) => String(x.date));
    const all = [...a, ...w].sort();
    return all.length ? all[all.length - 1]! : null;
  };
  const SOURCE_NAME = { whoop: 'WHOOP', strava: 'Strava', oura: 'Oura', apple: 'Apple Health', android: 'Samsung Health' } as const;
  const androidLast = lastSyncRows.find((r) => (r.provider as string) === 'android') ?? null;

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
  const clearance = await one<{ cardiology: boolean; intensity_allowed: string }>('clearances', { user_id: `eq.${userId}` });
  // Avizul apare doar când sportivul l-a declarat; necunoscutul nu e listat ca lipsă (întrebarea nu se mai pune).
  const avizState: 'da' | 'nu' | null = clearance?.intensity_allowed === 'Z2' ? 'nu' : clearance?.cardiology ? 'da' : null;
  if (avizState === 'da') have.push('aviz cardiologic (declarat)');
  (activities.length ? have : missing).push('istoric de activități');

  const warnings: Me['warnings'] = [];
  // Oura conectat înainte de 19.10.2026: fără permisiunea pentru sesiuni (meditație, respirație). Somnul, readiness-ul și
  // antrenamentele vin oricum; sesiunile doar după reconectare.
  const ouraTok = tokens.find((t) => t.provider === 'oura') as { scope?: string | null } | undefined;
  if (ouraTok?.scope && !/\bsession\b/.test(ouraTok.scope)) warnings.push({ title: 'Oura: reconectează o dată', text: 'Somnul, readiness-ul, temperatura și antrenamentele vin deja. Sesiunile de respirație și meditație din aplicația Oura cer o permisiune nouă.', fix: 'Profil → Brățări → Oura → Deconectează, apoi Conectează.' });
  const weekAgo = addDays(today, -14);
  const plannedSwim = planned.filter((w) => w.sport === 'inot' && w.date >= weekAgo && w.date < today).reduce((n, w) => n + w.plannedMinutes, 0);
  const doneSwim = activities.filter((a) => a.sport === 'inot' && a.date >= weekAgo && a.date < today).reduce((n, a) => n + a.minutes, 0);
  void plannedSwim;
  void doneSwim;
  // Echilibrul pe 3 săptămâni (sporturi rămase în urmă, intensitate sărită): un singur loc, aceleași texte ca la agenți.
  const balance = balanceCheck(today, planned, activities, user.goal && user.goal in GOAL_NAME ? GOAL_NAME[user.goal as Goal] : (user.goal ?? 'cursă'));
  for (const a of balance.avertismente) warnings.push({ title: a.titlu, text: a.text, fix: a.ce_faci });

  const [testRow, cssTest] = await Promise.all([one<{ results: TestsForm }>('tests', { user_id: `eq.${userId}` }, { order: 'tested_at.desc' }), latestCssTest(userId)]);
  const bodyRow = await one<{ date: string; weight_kg: number | null; body_fat_pct: number | null }>('wellness_daily', { user_id: `eq.${userId}`, source: 'eq.manual', weight_kg: 'not.is.null' }, { order: 'date.desc' });
  const baseline: Me['baseline'] = {
    labs: labsRow ? { data: labsRow.drawn_at, feritina: num(labsRow.feritina), vitamina_d: num(labsRow.vitamina_d), hemoglobina: num(labsRow.hemoglobina), ck: num(labsRow.ck), crp: num(labsRow.crp), alte: labsRow.other?.valori ?? undefined, laborator: labsRow.other?.laborator ?? null, expirat: labsExpired(labsRow.drawn_at, today) } : null,
    labsCompare: labsRow ? compareLabs(labSnapshot(labsRow), labsRows[1] ? labSnapshot(labsRows[1]) : null) : null,
    tests: testRow?.results ?? null,
    cssTest,
    body: bodyRow ? { data: bodyRow.date, greutate: num(bodyRow.weight_kg), grasime_pct: num(bodyRow.body_fat_pct) } : null,
    cardiolog: avizState,
  };

  const u2 = user as UserRow;
  const [totals, appleRow] = await Promise.all([
    planRow ? loadTotals(userId, planRow.start_date) : Promise.resolve(null),
    one<{ synced_at: string }>('wellness_daily', { user_id: `eq.${userId}`, source: 'eq.apple' }, { order: 'synced_at.desc' }).catch(() => null),
  ]);
  if (u2.apple_token) (appleRow ? have : missing).push('Apple Watch (Health Auto Export)');

  const dayStartMs = Date.parse(localDayStartUtc(today, (user as UserRow).tz || 'Europe/Bucharest'));
  const readinessOut = withRestriction(readinessRow ? { ...alignWithState(softenRed(readinessRow), state), acwr: num(readinessRow.acwr), hooperSum: readinessRow.hooper_sum } : null, restriction);
  // Decizia zilei: una singură, pentru toate ecranele.
  const day = decideDay({ state, readiness: ask ? null : readinessOut, restriction, todayPlan: planned.filter((w) => w.date === today), doneIds: doneToday, ask });
  // Mementoul de azi se arată doar dacă mesajul de dimineață cu care a venit spune același lucru ca decizia de acum.
  const todayMsgs = messagesRows.filter((m) => Date.parse(m.created_at) >= dayStartMs);
  const lastDecided = todayMsgs.find((m) => m.kind !== 'memento' && m.decision);
  const memento = lastDecided && !messageMatches(lastDecided.decision, day) ? null : (todayMsgs.find((m) => m.kind === 'memento')?.body ?? null);

  const prefs = await loadPrefs(userId);
  // Ziua pregătirii („Ziua X din Y” la deschidere): din prima zi în care ai avut plan pentru obiectivul de acum, nu din
  // începutul planului activ (refacerea planului îl mută pe lunea viitoare, iar calendarul încarcă doar 4 săptămâni).
  const firstPlan = await one<{ created_at: string; start_date: string }>('plans', { user_id: `eq.${userId}`, goal: `eq.${user.goal ?? ''}` }, { select: 'created_at,start_date', order: 'created_at.asc' }).catch(() => null);
  const prepStart = prepStartOf([firstPlan ? todayIn(tz, new Date(firstPlan.created_at)) : null, firstPlan?.start_date ?? null, planRow?.start_date ?? null], today);
  return {
    prepStart,
    baseline,
    admin: (u2 as UserRow & { role?: string }).role === 'admin' ? { providers: { whoop: providerConfigured('whoop'), strava: providerConfigured('strava'), oura: providerConfigured('oura') }, appUrl: ENV.appUrl() } : null,
    profile: { sex: u2.sex ?? null, birthYear: u2.birth_year ?? null, heightCm: u2.height_cm ?? null, city: u2.city ?? null, appleConnected: !!u2.apple_token, appleLastSync: appleRow?.synced_at ?? null, appleLast: (() => { const l = lastSyncRows.find((r) => (r.provider as string) === 'apple'); return l ? { ok: l.ok, detail: l.detail, at: l.ran_at } : null; })(), androidLastSync: lastSyncRows.find((r) => (r.provider as string) === 'android' && r.ok && !String(r.detail ?? '').startsWith('test'))?.ran_at ?? null, androidLast: androidLast ? { ok: androidLast.ok, detail: androidLast.detail, at: androidLast.ran_at } : null },
    totals: totals
      ? {
          ...totals,
          // Istoricul dinaintea planului (ultimele 6 săptămâni încărcate aici), separat de execuția planului.
          before: (() => {
            const out = { inot: { km: 0, ore: 0, sedinte: 0 }, bicicleta: { km: 0, ore: 0, sedinte: 0 }, alergare: { km: 0, ore: 0, sedinte: 0 }, forta: { km: 0, ore: 0, sedinte: 0 }, mers: { km: 0, ore: 0, sedinte: 0 } };
            for (const a of activities.filter((x) => x.date < totals.since)) {
              out[a.sport].km = Math.round((out[a.sport].km + (a.distanceKm ?? 0)) * 10) / 10;
              out[a.sport].ore = Math.round((out[a.sport].ore + a.minutes / 60) * 10) / 10;
              out[a.sport].sedinte += 1;
            }
            return out;
          })(),
          beforeFrom: from,
        }
      : null,
    user: { id: user.id, email: user.email, name: user.name, goal: user.goal, raceName: user.race_name, raceDate: user.race_date, tz: user.tz },
    consent: !!consent?.health_data && !consent.withdrawn_at,
    intakeComplete: !!intake?.consimtamant,
    today,
    phase: planRow ? phaseAt(planRow.start_date, planRow.race_date, today, user.goal, 4, intake) : null,
    budgetHours: planRow?.budget_hours ?? null,
    availability: (() => {
      const prog = (intake?.program as FreeBlock[] | undefined) ?? [];
      if (!prog.length) return null;
      const b = weeklyBudget(prog, undefined, (intake?.oreSport as number | null | undefined) ?? null);
      return { freeHours: b.freeHours, declaredHours: b.declaredHours, sportHours: b.hours, valid: b.valid, perDay: perDayMinutes(prog), planHours: planRow?.budget_hours ?? null };
    })(),
    planStart: planRow?.start_date ?? null,
    plan: planned,
    scores: Object.fromEntries(scoresRows.map((s) => [s.workout_id, { color: s.color, reasons: s.reasons, final: s.is_final, durationPct: s.metrics?.durationPct ?? null, pain: s.metrics?.pain ?? null, evaluare: s.metrics?.evaluare ?? null }])),
    activities: meActivities,
    state,
    wellnessToday: todayW ? { hrv: todayW.hrv, rhr: todayW.rhr, sleepMin: todayW.sleepMin, bedtime: todayW.bedtime, sleepScore: todayW.sleepScore, recoveryScore: todayW.recoveryScore, tempDevC: todayW.tempDevC, source: todayW.sources.hrv ?? todayW.sources.somn ?? null } : null,
    readiness: readinessOut,
    day,
    cardiacPending: pendingCardiac(withIncidents(forms.mornings, forms.incidents.mornings) as never, today),
    // Frecvența de fitness: câte zile vrea, câte are acum și de ce (auditul F55, F06).
    fitnessFreq: isFitnessGoal(user.goal) && planLoad.planId
      ? await (async () => {
          const f = ((forms.intake as { fitness?: FitnessIntake } | null)?.fitness ?? {}) as FitnessIntake;
          const p = await fitnessWithAttendance(userId, today, fitnessProfile(user.goal as Goal, f), planLoad.planId).catch(() => null);
          return p ? { wanted: p.days, now: Math.min(p.days, p.unlocked ?? p.days), why: p.unlockWhy ?? null } : null;
        })()
      : null,
    outcomes: Object.fromEntries(outcomeRows.map((o) => [o.workout_id, { status: o.status, motiv: o.motiv, minutes: o.minutes, reportedAt: o.reported_at }])),
    efficiency: aerobicEfficiency(activities, today),
    strengthLog: strengthRows,
    raceReady: user.goal && user.goal in GOAL_NAME
      ? raceReady({
          goal: user.goal as Goal,
          today,
          acts: activities,
          plan: planned,
          targetSec: targetSecFromIntake(user.goal, (forms.intake?.alergare as { tinta?: RunResult | null } | undefined)?.tinta ?? null),
          raceDate: user.race_date ?? null,
          fueledDates: forms.evenings.filter((e) => e.fueling_conform === 'da').map((e) => activities.find((a) => (a.id === e.activityId || a.externalId === e.activityId) && a.minutes >= 120)?.date).filter((x): x is string => !!x),
        })
      : null,
    sportReady: user.goal ? sportReadiness(user.goal as Goal, activities, today, { swimContinuousM: swimDeclared(forms.intake) }) : [],
    bar: barRow ? { blocked: barRow.blocked, total: barRow.total, basis: barRow.basis, components: barRow.components } : null,
    messages: messagesRows.filter((m) => m.kind !== 'memento').map((m) => ({ id: m.id, kind: m.kind, body: m.body, decision: m.decision, createdAt: m.created_at })),
    memento,
    forms: { intake, morning: (forms.morning as MorningForm | null) ?? null, evening: eveningByActivity, weeklyDone: await weeklyDone(userId, today), weekly: await weeklySaved(userId, today) },
    devices,
    lastSync,
    sources: [
      ...tokens.map((t) => {
        const ok = lastSyncRows.find((r) => r.provider === t.provider && r.ok);
        const last = lastSyncRows.find((r) => r.provider === t.provider);
        const todayRow = wellnessRows.find((r) => r.source === t.provider && String(r.date) === today);
        const missingToday = t.provider === 'strava' ? [] : [['sleep_min', 'somn'], ['recovery_score', 'recuperare'], ['rhr', 'puls de repaus'], ['hrv', 'HRV']].filter(([k]) => todayRow?.[k!] == null).map(([, n]) => n!);
        return { id: t.provider, name: SOURCE_NAME[t.provider], lastSync: ok?.ran_at ?? null, error: last && !last.ok ? last.detail ?? 'eroare la citire' : null, lastData: lastDataOf(t.provider), noRecoveryToday: t.provider !== 'strava' && !todayRow, connectedAt: t.connected_at ?? null, lastAttempt: last?.ran_at ?? null, missingToday };
      }),
      ...(u2.apple_token ? [{ id: 'apple' as const, name: SOURCE_NAME.apple, lastSync: appleRow?.synced_at ?? null, error: null, lastData: lastDataOf('apple'), noRecoveryToday: !wellnessRows.some((r) => r.source === 'apple' && String(r.date) === today) }] : []),
      // Samsung Health apare ca sursă doar după ce a trimis ceva (același token ca Apple Health).
      ...(androidLast
        ? [{ id: 'android' as const, name: SOURCE_NAME.android, lastSync: androidLast.ok ? androidLast.ran_at : (lastSyncRows.find((r) => (r.provider as string) === 'android' && r.ok && !String(r.detail ?? '').startsWith('test'))?.ran_at ?? null), lastAttempt: androidLast.ran_at, error: androidLast.ok ? null : androidLast.detail, lastData: lastDataOf('android'), noRecoveryToday: !wellnessRows.some((r) => r.source === 'android' && String(r.date) === today) }]
        : []),
    ],
    prefs,
    walking: walkLoad ? walkingView({ rows: walkLoad.rows, tz, today, profile: prefs.mers!, plan: planned, dayLevel: day?.level ?? null, dayWhy: day?.reason ?? day?.title ?? null, schemaReady: walkLoad.schemaReady }) : null,
    recovery: {
      ...recoverySummary(today, await loadOthers(userId, addDays(today, -92)), merged.map((m) => ({ date: m.date, hrv: m.hrv, rhr: m.rhr, sleepMin: m.sleepMin }))),
      sleep: merged.filter((m) => m.date > addDays(today, -7)).sort((a, b) => (a.date < b.date ? 1 : -1)).map((m) => ({ date: m.date, minutes: m.sleepMin, score: m.sleepScore })),
    },
    badges: await loadBadges(userId, today, {
      goal: user.goal ?? null,
      planStart: planRow?.start_date ?? null,
      raceDate: user.race_date ?? null,
      age: u2.birth_year ? Number(today.slice(0, 4)) - u2.birth_year : null,
      zonesTested: !!zonesRow && zonesRow.source !== 'provizoriu',
      efficiencyPct: aerobicEfficiency(activities, today).map((e) => e.schimbare_pct),
    }).catch((e) => {
      console.error('insigne', e instanceof Error ? e.message : e);
      return null;
    }),
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

/** Răspunsul săptămânal salvat (ultimele 7 zile), cu decizia: formularul se redeschide completat. */
async function weeklySaved(userId: string, today: string): Promise<Record<string, unknown> | null> {
  const row = await one<{ answers: Record<string, unknown>; for_date: string }>('questionnaires', { user_id: `eq.${userId}`, kind: 'eq.saptamanal', for_date: `gte.${addDays(today, -7)}` }, { order: 'for_date.desc' }).catch(() => null);
  return row ? { ...row.answers, weekStart: row.for_date } : null;
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
  return really ? { verdict: 'rosu', reason: r.reason } : { verdict: 'galben', reason: 'Încărcarea sau somnul sunt de urmărit, dar datele de sănătate sunt bune.' };
}

/**
 * Culoarea zilei = starea din datele de sănătate. O decizie salvată mai devreme (sau după alte reguli) care nu se
 * potrivește cu starea de acum se aliniază la ea; stop rămâne stop.
 */
function alignWithState(d: { verdict: 'verde' | 'galben' | 'rosu' | 'stop'; reason: string | null }, state: { verdict: 'verde' | 'galben' | 'portocaliu' | 'rosu' } | null): { verdict: 'verde' | 'galben' | 'rosu' | 'stop'; reason: string | null } {
  if (!state || d.verdict === 'stop') return d;
  const v = state.verdict === 'portocaliu' ? 'galben' : state.verdict;
  if (v === d.verdict) return d;
  const why = { verde: 'Datele de sănătate sunt bune.', galben: 'Recuperarea nu e la maxim.', rosu: 'Datele de sănătate arată o zi grea.' }[v];
  return { verdict: v, reason: why };
}

