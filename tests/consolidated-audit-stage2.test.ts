// Auditul consolidat (22.10.2026), etapa 2: datele și persistarea. Fiecare test reproduce constatarea (comportamentul
// vechi, unde se poate arăta) și verifică remedierea. Ce cere o bază de date reală e în scripts/db-probe (PostgreSQL
// local, date sintetice); ce cere Strava/Vercel reale nu e verificabil aici (vezi raportul, „limite”).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

process.env.OAUTH_STATE_SECRET ??= 'secret-de-test-doar-pentru-probe-0123456789';
process.env.SUPABASE_URL ??= 'http://supabase.invalid';
process.env.SUPABASE_SECRET_KEY ??= 'cheie-de-test';

const { parseStravaEvent, subscriptionMatches, classifyDeleteCheck, deauthConfirmed, isDeauthorization } = await import('../src/collector/providers/strava-webhook.js');
const { processDelete, processDeauth } = await import('../server/_lib/strava-inbox.js');
const { signState, verifyState, newOAuthNonce } = await import('../server/_lib/tokens.js');
const { oauthCookie, readCookie } = await import('../server/_lib/http.js');
const { sameSession, dedupeActivities } = await import('../src/collector/packet.js');
const { approvedCount } = await import('../server/account/signup.js');
const { recentJournal } = await import('../server/_lib/agents.js');
const { contextHash, manualDecision, stableStringify } = await import('../server/_lib/ai-budget.js');
const { fanOut, backoffMs, jobDue, stalestFirst } = await import('../src/util/fanout.js');
const { missingOptionalColumn, stripColumn } = await import('../server/_lib/db.js');
const { moveWorkout, applyAway, restoreAway } = await import('../src/calendar/actions.js');
const { adapt } = await import('../src/calendar/adapt.js');
const { weatherSwap, undoWeatherSwap } = await import('../src/calendar/weather-swap.js');
const { stateOf, isMovedByAthlete, legacyFlags, lockedForAutomation } = await import('../src/calendar/flags.js');
const { userAdjustment } = await import('../src/calendar/regen-carry.js');
import type { PlannedWorkout } from '../src/types.js';
import type { SourceActivity } from '../src/collector/types.js';

// ---------------- C1: webhook Strava ----------------

const goodEvent = { object_type: 'activity', object_id: 9001, aspect_type: 'delete', owner_id: 555, subscription_id: 77, event_time: 1_761_000_000 };

test('C1: forma evenimentului se validează; gunoiul e respins', () => {
  assert.equal(parseStravaEvent(goodEvent).ok, true);
  for (const bad of [null, [], 'x', { ...goodEvent, object_type: 'club' }, { ...goodEvent, aspect_type: 'erase' }, { ...goodEvent, object_id: -1 }, { ...goodEvent, owner_id: 'abc' }, { ...goodEvent, event_time: 'azi' }, { ...goodEvent, subscription_id: undefined }, { ...goodEvent, updates: [1] }])
    assert.equal(parseStravaEvent(bad).ok, false, JSON.stringify(bad));
  const p = parseStravaEvent(goodEvent);
  assert.ok(p.ok && p.ev.object_id === '9001' && p.ev.owner_id === '555');
});

test('C1: abonamentul se verifică dacă STRAVA_SUBSCRIPTION_ID e setat', () => {
  const p = parseStravaEvent(goodEvent);
  assert.ok(p.ok);
  assert.equal(subscriptionMatches(p.ev, undefined), true);
  assert.equal(subscriptionMatches(p.ev, '77'), true);
  assert.equal(subscriptionMatches(p.ev, '78'), false);
});

test('C1: 401, 403, 429, 5xx și rețeaua NU înseamnă „ștearsă”; doar 404', () => {
  assert.equal(classifyDeleteCheck(404), 'stearsa');
  assert.equal(classifyDeleteCheck(200), 'exista');
  assert.equal(classifyDeleteCheck(401), 'acces_refuzat');
  assert.equal(classifyDeleteCheck(403), 'acces_refuzat');
  for (const s of [429, 500, 502, 503, null]) assert.equal(classifyDeleteCheck(s), 'reincearca', String(s));
  assert.equal(deauthConfirmed(401), true);
  assert.equal(deauthConfirmed(200), false);
  assert.equal(deauthConfirmed(503), null);
  const de = parseStravaEvent({ ...goodEvent, object_type: 'athlete', aspect_type: 'update', updates: { authorized: 'false' } });
  assert.ok(de.ok && isDeauthorization(de.ev));
});

/** Strava falsificat: răspunde cu `status` la GET /activities/:id și /athlete. */
async function withStrava<T>(status: number | 'retea', fn: () => Promise<T>): Promise<{ out: T; urls: string[] }> {
  const prev = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = (async (u: string | URL) => {
    urls.push(String(u));
    if (status === 'retea') throw new Error('ECONNRESET');
    return new Response('{}', { status });
  }) as typeof fetch;
  try {
    return { out: await fn(), urls };
  } finally {
    globalThis.fetch = prev;
  }
}

test('C1: un „delete” se aplică doar după ce API-ul Strava confirmă 404; altfel datele rămân', async () => {
  for (const [status, deleted, done] of [
    [404, true, true],
    [200, false, true],
    [401, false, true],
    [403, false, true],
    [429, false, false],
    [500, false, false],
    ['retea', false, false],
  ] as const) {
    const calls: string[][] = [];
    const deps = { tokenOf: async () => 'tok', deleter: async (_u: string, ids: string[]) => (calls.push(ids), { removed: ids.length }), forgetStrava: async () => undefined };
    const { out, urls } = await withStrava(status, () => processDelete('u1', '9001', '2026-10-22', deps));
    assert.equal(calls.length > 0, deleted, `status ${status}`);
    assert.equal(out.done, done, `status ${status}`);
    assert.ok(urls[0]!.endsWith('/api/v3/activities/9001'));
    if (deleted) assert.deepEqual(calls[0], ['strava-9001', 'strava-o-9001']);
  }
});

test('C1: retragerea accesului închide conexiunea doar dacă tokenul e refuzat (401)', async () => {
  for (const [status, forgotten] of [
    [401, true],
    [200, false],
    [503, false],
  ] as const) {
    let gone = false;
    const deps = { tokenOf: async () => 'tok', deleter: async () => ({ removed: 0 }), forgetStrava: async () => void (gone = true) };
    await withStrava(status, () => processDeauth('u1', deps));
    assert.equal(gone, forgotten, `status ${status}`);
  }
});

test('C1: webhook-ul răspunde 400 la evenimente invalide și 403 la alt abonament, fără să atingă baza', async () => {
  const { default: handler } = await import('../server/webhooks/strava.js');
  const prevFetch = globalThis.fetch;
  let dbCalls = 0;
  globalThis.fetch = (async () => {
    dbCalls++;
    return new Response('[]', { status: 200 });
  }) as typeof fetch;
  const call = async (body: unknown) => {
    const res = { statusCode: 0, headers: {} as Record<string, string>, body: '', setHeader(k: string, v: string) { this.headers[k] = v; }, end(b: string) { this.body = b; } };
    await handler({ method: 'POST', body, query: {}, headers: {} } as never, res as never);
    return res;
  };
  try {
    assert.equal((await call({ hello: 'world' })).statusCode, 400);
    process.env.STRAVA_SUBSCRIPTION_ID = '78';
    assert.equal((await call(goodEvent)).statusCode, 403);
    assert.equal(dbCalls, 0);
  } finally {
    delete process.env.STRAVA_SUBSCRIPTION_ID;
    globalThis.fetch = prevFetch;
  }
  // Codul vechi ștergea direct și înghițea eroarea: nu mai există așa ceva în webhook.
  const src = readFileSync('server/webhooks/strava.ts', 'utf8');
  assert.ok(!/remove\('activities'/.test(src));
});

// ---------------- C2: ștergere și scoruri ----------------

test('C2: migrarea 0005 pune „on delete set null” pe ambele legături din scor; ștergerea nu mai înghite erorile', () => {
  const sql = readFileSync('supabase/migrations/0005_audit_consolidat.sql', 'utf8');
  assert.match(sql, /scores_activity_id_fkey foreign key \(activity_id\) references public\.activities\(id\) on update cascade on delete set null/);
  assert.match(sql, /scores_extra_activity_id_fkey foreign key \(extra_activity_id\) references public\.activities\(id\) on update cascade on delete set null/);
  const del = readFileSync('server/_lib/activity-delete.ts', 'utf8');
  assert.ok(/await rescore\(/.test(del) && !/\.catch\(\(\) => undefined\)/.test(del), 'ștergerea recalculează scorul și nu înghite erori');
  // Proba pe PostgreSQL real (schema 12 → FK violation; schema 13 → ștergere, scor cu legătura NULL):
  // scripts/db-probe/c2-probe.sh; rezultatul e în raport.
});

// ---------------- C3: dubluri din aceeași sursă ----------------

const act = (o: Partial<SourceActivity>): SourceActivity => ({ id: 'x', externalId: 'x', source: 'apple', date: '2026-10-20', sport: 'alergare', minutes: 50, distanceKm: 9.1, startLocal: '07:30', ...o }) as SourceActivity;

test('C3: aceeași alergare venită de două ori prin Apple Health (ceas + Strava) = o activitate', () => {
  // Proba auditului: 07:30 și 07:31, 50 și 49 min, 9,1 și 9,05 km → înainte 2 activități.
  const a = act({ id: 'apple-1', externalId: 'A1' });
  const b = act({ id: 'apple-2', externalId: 'A2', startLocal: '07:31', minutes: 49, distanceKm: 9.05 });
  assert.equal(sameSession(a, b), true);
  const kept = dedupeActivities([a, b]);
  assert.equal(kept.length, 1);
  assert.deepEqual([...(kept[0]!.mergedIds ?? [])].sort(), ['apple-1', 'apple-2'], 'proveniența rămâne');
  // Cu Strava adăugat: tot una (înainte: 2).
  const s = act({ id: 'strava-1', externalId: '1', source: 'strava', startLocal: '07:30', minutes: 50, distanceKm: 9.08 });
  assert.equal(dedupeActivities([a, b, s]).length, 1);
  // Import repetat (același id extern): una.
  assert.equal(dedupeActivities([a, act({ id: 'apple-1b', externalId: 'A1' })]).length, 1);
});

test('C3: două ședințe distincte din aceeași sursă nu se contopesc; cazurile ambigue rămân două', () => {
  const am = act({ id: 'a1', externalId: 'A1', startLocal: '07:00', minutes: 40, distanceKm: 7 });
  assert.equal(sameSession(am, act({ id: 'a2', externalId: 'A2', startLocal: '19:00', minutes: 40, distanceKm: 7 })), false, 'dimineața și seara');
  assert.equal(sameSession(am, act({ id: 'a2', externalId: 'A2', startLocal: '07:05', minutes: 40, distanceKm: 7 })), false, 'start la 5 minute');
  assert.equal(sameSession(am, act({ id: 'a2', externalId: 'A2', startLocal: '07:00', minutes: 30, distanceKm: 5.2 })), false, 'durate diferite');
  assert.equal(sameSession(am, act({ id: 'a2', externalId: 'A2', startLocal: '07:00', minutes: 40, distanceKm: 8 })), false, 'distanțe diferite');
  assert.equal(sameSession(act({ id: 'a1', externalId: 'A1', startLocal: null }), act({ id: 'a2', externalId: 'A2', startLocal: null })), false, 'fără ore de start');
});

// ---------------- C4: OAuth state legat de browser ----------------

test('C4: state-ul cere nonce-ul din cookie, același producător, în 15 minute; replay și link trimis altcuiva sunt respinse', () => {
  const user = '11111111-2222-3333-4444-555555555555';
  const n = newOAuthNonce();
  const st = signState(user, 'strava', n);
  assert.equal(verifyState(st, 'strava', n), user);
  // Linkul generat de A, deschis de B: B nu are cookie-ul lui A (sau are altul, de la propria conectare).
  assert.throws(() => verifyState(st, 'strava', null), /n-a pornit din AIRON/);
  assert.throws(() => verifyState(st, 'strava', newOAuthNonce()), /n-a pornit din AIRON/);
  // Alt producător, modificat, expirat, formatul vechi (fără nonce).
  assert.throws(() => verifyState(st, 'whoop', n), /alt producător/);
  assert.throws(() => verifyState(st.replace(/.$/, (c) => (c === 'A' ? 'B' : 'A')), 'strava', n), /nu se potrivește/);
  assert.throws(() => verifyState(signState(user, 'strava', n, Date.now() - 16 * 60_000), 'strava', n), /15 minute/);
  assert.throws(() => verifyState(`${user.replace(/-/g, '')}.${Date.now().toString(36)}.abc`, 'strava', n), /modificat sau vechi/);
});

test('C4: cookie-ul e HttpOnly, Secure, SameSite=Lax, doar pe /api/oauth; callback-ul îl șterge oricum se termină', () => {
  const c = oauthCookie('airon_oauth', 'abc', 900);
  for (const part of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/api/oauth', 'Max-Age=900']) assert.ok(c.includes(part), part);
  assert.equal(readCookie({ headers: { cookie: 'x=1; airon_oauth=abc; y=2' } } as never, 'airon_oauth'), 'abc');
  assert.equal(readCookie({ headers: {} } as never, 'airon_oauth'), null);
  const cb = readFileSync('server/oauth/[provider]/callback.ts', 'utf8');
  assert.ok(cb.indexOf("oauthCookie(OAUTH_COOKIE, '', 0)") < cb.indexOf('verifyState('), 'cookie-ul se șterge înainte de orice verificare');
});

// ---------------- C5: tokenuri Apple / Android separate ----------------

test('C5: Android caută după android_token; deconectarea Apple nu-l atinge; Profilul cere adresa Android separat', () => {
  const android = readFileSync('server/webhooks/android.ts', 'utf8');
  assert.match(android, /android_token: `eq\.\$\{token\}`/);
  const forms = readFileSync('server/forms/[kind].ts', 'utf8');
  assert.match(forms, /if \(p === 'apple'\) await update\('users', \{ id: `eq\.\$\{u\.id\}` \}, \{ apple_token: null \}\);/);
  assert.match(forms, /else if \(p === 'android'\) await update\('users', \{ id: `eq\.\$\{u\.id\}` \}, \{ android_token: null \}\);/);
  const profile = readFileSync('apps/web/src/ui/Profile.tsx', 'utf8');
  assert.ok(!profile.includes("replace('/api/webhooks/apple?', '/api/webhooks/android?')"), 'adresa Android nu mai e adresa Apple rescrisă');
  // Migrarea păstrează adresele Android deja folosite (copiază tokenul doar celor care au trimis date Android).
  assert.match(readFileSync('supabase/migrations/0005_audit_consolidat.sql', 'utf8'), /set android_token = u\.apple_token[\s\S]*provider = 'android'/);
});

// ---------------- C6: locuri ----------------

test('C6: doar conturile aprobate ocupă locuri', () => {
  const rows = [{ approved: true }, { approved: false }, { approved: null }, { approved: true }];
  assert.equal(approvedCount(rows), 2);
  assert.equal(approvedCount(Array.from({ length: 30 }, () => ({ approved: false }))), 0, '30 de conturi neaprobate nu umplu cele 10 locuri');
});

// ---------------- A2: starea ședinței în câmpuri tipizate ----------------

const pw = (id: string, date: string, sport: PlannedWorkout['sport'], type: PlannedWorkout['type'], min: number, zones: number[] = [2]): PlannedWorkout => ({ id, date, sport, type, plannedMinutes: min, targetZones: zones as PlannedWorkout['targetZones'], key: false, status: 'planificat' });

test('A2: progresia rescrie nota, dar ședința rămâne „mutată de tine” (Pune înapoi, regenerarea, vremea o respectă)', () => {
  const plan = [pw('r1', '2026-10-20', 'alergare', 'z2', 65), pw('b0', '2026-10-22', 'bicicleta', 'z2', 65), pw('b1', '2026-10-27', 'bicicleta', 'z2', 70), pw('r2', '2026-10-28', 'alergare', 'z2', 60)];
  const moved = moveWorkout(plan, 'b1', '2026-10-29', '2026-10-22', '2026-10-22T08:00:00Z');
  assert.equal(stateOf(moved)?.origin, 'mutare');
  assert.equal(stateOf(moved)?.original_slot, '2026-10-27');
  const withMove = plan.map((w) => (w.id === 'b1' ? moved : w));
  const r = adapt(withMove, { kind: 'progres', date: '2026-10-22' }, { today: '2026-10-22', freeBlocks: [], recentKeyScores: [] });
  const after = r.plan.find((w) => w.id === 'b1')!;
  assert.match(after.note ?? '', /creștere controlată/, 'progresia a rescris nota (reproducerea auditului)');
  // ÎNAINTE (starea din notă): ședința „uita” că a fost mutată de sportiv.
  assert.equal(legacyFlags(after), null);
  // ACUM: starea tipizată rămâne.
  assert.equal(isMovedByAthlete(after), true);
  assert.equal(lockedForAutomation(after), true);
  assert.equal(userAdjustment(after), 'muta');
});

test('A2: vremea nu atinge o ședință mutată de sportiv nici după ce nota a fost rescrisă', () => {
  const plan = [pw('swim', '2026-10-21', 'inot', 'tehnica', 45, [1, 2]), pw('bike', '2026-10-22', 'bicicleta', 'z2', 60)];
  const SUN = { tmax: 20, tmin: 10, ploaie_mm: 0, prob_ploaie: 5, vant_kmh: 10, cod: 0 } as never;
  const RAIN = { tmax: 12, tmin: 8, ploaie_mm: 12, prob_ploaie: 90, vant_kmh: 20, cod: 63 } as never;
  const movedNoteRewritten = plan.map((x) => (x.id === 'bike' ? { ...x, note: '+5 min: creștere controlată (7 zile verzi)', original: { ...x, date: '2026-10-20' } as never, flags: { origin: 'mutare' as const, manual_override: true, weather_swap: null, original_slot: '2026-10-20', change_reason: 'mutată de tine' } } : x));
  assert.equal(weatherSwap(movedNoteRewritten, { date: '2026-10-21', w: SUN }, { date: '2026-10-22', w: RAIN }, '2026-10-20', '2026-10-20T18:00:00Z'), null);
  // ÎNAINTE (starea doar în notă): aceeași ședință, cu nota rescrisă, era inversată de vreme.
  const legacy = movedNoteRewritten.map((x) => ({ ...x, flags: undefined }));
  assert.notEqual(weatherSwap(legacy, { date: '2026-10-21', w: SUN }, { date: '2026-10-22', w: RAIN }, '2026-10-20', '2026-10-20T18:00:00Z'), null);
});

test('A2: inversarea după vreme și „Lasă-le cum erau” folosesc starea tipizată; plecarea se anulează după stare', () => {
  const plan = [pw('swim', '2026-10-21', 'inot', 'tehnica', 45, [1, 2]), pw('bike', '2026-10-22', 'bicicleta', 'z2', 60)];
  const SUN = { tmax: 20, tmin: 10, ploaie_mm: 0, prob_ploaie: 5, vant_kmh: 10, cod: 0 } as never;
  const RAIN = { tmax: 12, tmin: 8, ploaie_mm: 12, prob_ploaie: 90, vant_kmh: 20, cod: 63 } as never;
  const sw = weatherSwap(plan, { date: '2026-10-21', w: SUN }, { date: '2026-10-22', w: RAIN }, '2026-10-20', '2026-10-20T18:00:00Z');
  assert.ok(sw, 'inversare făcută');
  for (const w of sw!.changed) assert.equal(stateOf(w)?.origin, 'vreme');
  // O notă rescrisă după inversare nu mai strică „Lasă-le cum erau”.
  const live = plan.map((x) => sw!.changed.find((c) => c.id === x.id) ?? x).map((x) => ({ ...x, note: 'altceva' }));
  const back = undoWeatherSwap(live, 'bike', '2026-10-20', '2026-10-20T19:00:00Z');
  assert.equal(back.length, 2);
  assert.ok(back.every((w) => stateOf(w)?.origin === 'pus_inapoi' || stateOf(w) === null));
  // Plecarea: schimbată cu stare, nota rescrisă, anularea plecării tot o pune la loc.
  const away = { dela: '2026-10-21', panala: '2026-10-22', ce: 'nimic' as const };
  const changed = applyAway(plan, away, '2026-10-20', '2026-10-20T18:00:00Z');
  const rewritten = changed.map((w) => ({ ...w, note: 'notă rescrisă' }));
  assert.equal(restoreAway(rewritten, away, '2026-10-20', '2026-10-20T19:00:00Z').length, changed.length);
});

test('A2: scrierea pe o schemă fără coloana flags se repetă fără ea (planul nu cade înainte de actualizarea bazei)', () => {
  assert.equal(missingOptionalColumn('workouts_planned', `{"code":"PGRST204","message":"Could not find the 'flags' column of 'workouts_planned' in the schema cache"}`), 'flags');
  assert.equal(missingOptionalColumn('workouts_planned', 'column "flags" of relation "workouts_planned" does not exist'), 'flags');
  assert.equal(missingOptionalColumn('workouts_planned', 'column "note" does not exist'), null, 'doar coloanele declarate opționale');
  assert.equal(missingOptionalColumn('users', "Could not find the 'flags' column"), null);
  assert.deepEqual(stripColumn([{ id: 1, flags: null }, { id: 2 }], 'flags'), [{ id: 1 }, { id: 2 }]);
});

// ---------------- B3: cost: versiunea contextului și plafonul ----------------

test('B3: amprenta contextului ignoră ora exactă, nu și conținutul; același context nu cheamă modelul', () => {
  const p1 = { meta: { ora_locala: '08:01', moment_zi: 'dimineata' }, hrv: { azi: 60 } };
  const p2 = { hrv: { azi: 60 }, meta: { moment_zi: 'dimineata', ora_locala: '08:14' } };
  const base = { journal: ['2026-10-22: calendar: x'], event: 'dimineata', models: { head: 'claude-opus-5-5' } };
  assert.equal(contextHash({ ...base, packet: p1 }), contextHash({ ...base, packet: p2 }), 'aceeași situație, altă oră și altă ordine a cheilor');
  assert.notEqual(contextHash({ ...base, packet: p1 }), contextHash({ ...base, packet: { ...p1, hrv: { azi: 48 } } }), 'date noi = context nou');
  assert.notEqual(contextHash({ ...base, packet: p1 }), contextHash({ ...base, journal: [...base.journal, '2026-10-22: declarat de sportiv: durere'], packet: p1 }), 'o declarație nouă = context nou');
  assert.equal(stableStringify({ b: 1, a: [2, { d: 1, c: undefined }] }), '{"a":[2,{"d":1}],"b":1}');
});

test('B3: plafonul pe server oprește cererile repetate; reutilizarea nu consumă din plafon', () => {
  assert.deepEqual(manualDecision({ used: 0, cap: 6, sameContextAsLastMessage: false }), { run: true });
  const same = manualDecision({ used: 6, cap: 6, sameContextAsLastMessage: true });
  assert.ok(!same.run && same.reason === 'acelasi_context');
  const cap = manualDecision({ used: 6, cap: 6, sameContextAsLastMessage: false });
  assert.ok(!cap.run && cap.reason === 'plafon' && /limita zilei e 6/.test(cap.message));
  // Ruta manuală trece prin plafon (cronurile nu).
  assert.match(readFileSync('server/agents/run.ts', 'utf8'), /\{ manual: true \}/);
  assert.match(readFileSync('.env.example', 'utf8'), /^MODEL_HEAD=claude-opus-5-5/m);
});

// ---------------- B4: jurnalul recent ----------------

test('B4: la model ajung cele mai noi intrări, în ordine cronologică (nu cele mai vechi 200)', () => {
  // 250 de intrări, cea mai nouă prima (cum vin acum din interogare): azi e declarația sportivului.
  const newestFirst = [{ date: '2026-10-22', entry: 'declarat de sportiv: durere genunchi 4/10' }, ...Array.from({ length: 249 }, (_, i) => ({ date: `2026-10-${String(21 - Math.floor(i / 20)).padStart(2, '0')}`, entry: `calendar: schimbare ${i}` }))];
  const out = recentJournal(newestFirst, 200);
  assert.equal(out.length, 200);
  assert.equal(out[out.length - 1], '2026-10-22: declarat de sportiv: durere genunchi 4/10', 'declarația de azi e ultima, deci prezentă');
  // Ce nu e permis (text AI, respinse) nu intră, indiferent de vârstă.
  assert.deepEqual(recentJournal([{ date: '2026-10-22', entry: 'ai: amintire fără dovadă' }, { date: '2026-10-22', entry: 'respins: x' }], 200), []);
  // Comportamentul vechi (cele mai vechi 200, filtrate după limită) ar fi pierdut-o:
  const oldWay = [...newestFirst].reverse().slice(0, 200);
  assert.ok(!oldWay.some((r) => r.entry.startsWith('declarat de sportiv')));
});

// ---------------- E1: cron: concurență limitată, buget, stare pe sportiv ----------------

test('E1: cel mult `limit` sportivi deodată; o eroare nu oprește restul; bugetul lasă restul pentru rularea următoare', async () => {
  let active = 0;
  let peak = 0;
  const seen: number[] = [];
  const r = await fanOut(Array.from({ length: 10 }, (_, i) => i), { limit: 3, budgetMs: 60_000 }, async (i) => {
    active++;
    peak = Math.max(peak, active);
    await new Promise((res) => setTimeout(res, 5));
    active--;
    seen.push(i);
    if (i === 2) throw new Error('sportiv cu eroare');
  });
  assert.equal(peak, 3);
  assert.equal(r.done.length, 10);
  assert.equal(r.notStarted.length, 0);
  // Timp simulat: fiecare sportiv „durează” 100 s; bugetul de 150 s pornește doar primii (3 paraleli + nimic după).
  let t = 0;
  const slow = await fanOut(Array.from({ length: 10 }, (_, i) => i), { limit: 3, budgetMs: 150_000, now: () => t }, async () => {
    await Promise.resolve();
    t += 100_000;
  });
  assert.ok(slow.notStarted.length > 0 && slow.done.length + slow.notStarted.length === 10, 'neprocesații sunt raportați, nu pierduți');
});

test('E1: reîncercare cu așteptare crescătoare și ordinea „cel mai vechi întâi”', () => {
  assert.deepEqual([0, 1, 2, 3, 10].map(backoffMs), [0, 15 * 60_000, 30 * 60_000, 60 * 60_000, 6 * 3_600_000]);
  const now = Date.parse('2026-10-22T10:00:00Z');
  assert.equal(jobDue({ next_try_at: '2026-10-22T10:30:00Z' }, now), false);
  assert.equal(jobDue({ next_try_at: '2026-10-22T09:30:00Z' }, now), true);
  assert.equal(jobDue(null, now), true);
  const st: Record<string, { last_ok_at: string | null }> = { a: { last_ok_at: '2026-10-22T09:45:00Z' }, b: { last_ok_at: null }, c: { last_ok_at: '2026-10-22T08:00:00Z' } };
  assert.deepEqual(stalestFirst(['a', 'b', 'c'], (k) => st[k]), ['b', 'c', 'a']);
});
