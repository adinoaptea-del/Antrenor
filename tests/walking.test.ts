// Mers pe jos / bula de 200 de minute: testele obligatorii din specificație (§7), pe codul real.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { changeTarget, dedupeWalks, shownMin, shownRemainingMin, splitByDay, targetForWeek, walkWeek, type WalkRecord } from '../src/walking/minutes.js';
import { planWalkWeek, walkPlanWorkouts, walkSpec, walkToday, restrictionOf, sessionCap, type WalkProfile } from '../src/walking/plan.js';
import { toWalkRecords, walkActivities, type WalkRow } from '../src/walking/rows.js';
import { walkingView } from '../src/walking/view.js';
import { generatePlan } from '../src/calendar/generate.js';
import { scoreWorkout } from '../src/scoring/score.js';
import { matchActivities } from '../src/scoring/match.js';
import { classifyOther } from '../src/collector/other.js';
import type { PlannedWorkout } from '../src/types.js';

const TZ = 'Europe/Bucharest';
// Săptămâna 12–18 oct 2026 (luni–duminică); 25 oct 2026 = trecerea la ora de iarnă în România.
const MON = '2026-10-12';
const row = (p: Partial<WalkRow> & { id: string; date: string; minutes: number }): WalkRow => ({ source: 'strava', start_local: null, name: 'plimbare', ...p });
const rec = (p: Partial<WalkRecord> & { id: string; date: string; elapsedSec: number }): WalkRecord => ({ source: 'strava', provenance: 'masurat', startUtc: null, movingSec: null, ...p });
const PROFILE: WalkProfile = { initial: 200, capacityMin: 30, brisk: 'da', changes: [] };

describe('mers: bula săptămânii (§1, §7.1)', () => {
  it('200 min țintă, 55 înregistrate → 145 rămase; la 225 → 0 rămase și 225 din 200', () => {
    const a = walkWeek([rec({ id: 'a', date: '2026-10-13', elapsedSec: 55 * 60 })], '2026-10-14', TZ, [], 200);
    assert.equal(a.targetMin, 200);
    assert.equal(shownMin(a.doneSec), 55);
    assert.equal(shownRemainingMin(a.remainingSec), 145);
    assert.equal(a.met, false);
    const b = walkWeek([rec({ id: 'a', date: '2026-10-13', elapsedSec: 100 * 60 }), rec({ id: 'b', date: '2026-10-15', elapsedSec: 125 * 60 })], '2026-10-16', TZ, [], 200);
    assert.equal(b.remainingSec, 0);
    assert.equal(shownMin(b.doneSec), 225);
    assert.equal(shownMin(b.overSec), 25);
    assert.equal(b.met, true);
  });

  it('secundele se păstrează intern: 3 plimbări de 20 min 20 s = 61 min, nu 60', () => {
    const w = walkWeek(['a', 'b', 'c'].map((id, i) => rec({ id, date: `2026-10-1${3 + i}`, elapsedSec: 20 * 60 + 20 })), '2026-10-16', TZ, [], 200);
    assert.equal(w.doneSec, 3 * 1220);
    assert.equal(shownMin(w.doneSec), 61);
    assert.equal(shownMin(w.doneSec) + shownRemainingMin(w.remainingSec), 200);
  });

  it('doar mersul consumă bula: alergarea, bicicleta, yoga nu (clasificarea de la import)', () => {
    assert.equal(classifyOther('Walk')?.name, 'plimbare');
    assert.equal(classifyOther('Hike')?.name, 'drumeție');
    assert.equal(classifyOther('Yoga')?.name, 'yoga');
    const recs = toWalkRecords([row({ id: 'w', date: '2026-10-13', minutes: 30 }), row({ id: 'y', date: '2026-10-13', minutes: 30, name: 'yoga' }), row({ id: 'p', date: '2026-10-13', minutes: 30, name: 'sport cu racheta' })], TZ);
    assert.deepEqual(recs.map((r) => r.id), ['w']);
  });
});

describe('mers: dubluri și reconciliere (§3, §7.2)', () => {
  it('același import repetat nu dublează progresul', () => {
    const r = row({ id: 'strava-o-1', date: '2026-10-13', minutes: 40, start_utc: '2026-10-13T06:00:00Z', elapsed_sec: 2400 });
    const v = walkWeek(toWalkRecords([r, { ...r }], TZ), '2026-10-14', TZ, [], 200);
    assert.equal(shownMin(v.doneSec), 40);
  });

  it('aceeași plimbare din două surse se numără o dată (cea cu timpul în mișcare)', () => {
    const rows = [
      row({ id: 'apple-o-x', source: 'apple', date: '2026-10-13', minutes: 42, start_utc: '2026-10-13T06:00:00Z', elapsed_sec: 2520 }),
      row({ id: 'strava-o-y', source: 'strava', date: '2026-10-13', minutes: 40, start_utc: '2026-10-13T06:01:00Z', elapsed_sec: 2460, moving_sec: 2280 }),
    ];
    const v = walkWeek(toWalkRecords(rows, TZ), '2026-10-14', TZ, [], 200);
    assert.equal(v.walks.length, 1);
    assert.equal(v.walks[0]!.id, 'strava-o-y');
    assert.equal(v.doneSec, 2280);
    assert.deepEqual(v.walks[0]!.mergedFrom, ['apple-o-x']);
  });

  it('două plimbări reale în aceeași zi rămân două', () => {
    const rows = [row({ id: 'a', date: '2026-10-13', minutes: 30, start_utc: '2026-10-13T05:00:00Z', elapsed_sec: 1800 }), row({ id: 'b', date: '2026-10-13', minutes: 30, start_utc: '2026-10-13T15:00:00Z', elapsed_sec: 1800 })];
    assert.equal(shownMin(walkWeek(toWalkRecords(rows, TZ), '2026-10-14', TZ, [], 200).doneSec), 60);
  });

  it('o plimbare manuală asociată ulterior cu importul e reconciliată (nu se adună de două ori)', () => {
    const manual = row({ id: 'manual-1', source: 'manual', date: '2026-10-13', minutes: 30 });
    const before = walkWeek(toWalkRecords([manual], TZ), '2026-10-14', TZ, [], 200);
    assert.equal(shownMin(before.declaredSec), 30);
    // Importul vine a doua zi (aceeași zi, durată apropiată): se păstrează importul măsurat.
    const imp = row({ id: 'strava-o-9', date: '2026-10-13', minutes: 32, start_utc: '2026-10-13T16:00:00Z', elapsed_sec: 1920 });
    const after = walkWeek(toWalkRecords([manual, imp], TZ), '2026-10-14', TZ, [], 200);
    assert.equal(shownMin(after.doneSec), 32);
    assert.equal(after.declaredSec, 0);
    // Legătura explicită (durate diferite, ore necunoscute): tot importul se numără.
    const manual2 = { ...manual, minutes: 50, reconciled_with: 'strava-o-9' };
    const linked = walkWeek(toWalkRecords([manual2, imp], TZ), '2026-10-14', TZ, [], 200);
    assert.equal(shownMin(linked.doneSec), 32);
  });
});

describe('mers: ștergere, corectare, persistență (§7.3)', () => {
  it('ștergerea și corectarea schimbă totalul; același rezultat după reîncărcare (calcul din rânduri, fără cache)', () => {
    const rows = [row({ id: 'm1', source: 'manual', date: '2026-10-13', minutes: 30 }), row({ id: 'i1', date: '2026-10-14', minutes: 40, start_utc: '2026-10-14T06:00:00Z', elapsed_sec: 2400 })];
    const v0 = walkingView({ rows, tz: TZ, today: '2026-10-15', profile: PROFILE, plan: [], schemaReady: true });
    assert.equal(shownMin(v0.week.doneSec), 70);
    const edited = rows.map((r) => (r.id === 'm1' ? { ...r, minutes: 20, elapsed_sec: 1200 } : r));
    assert.equal(shownMin(walkingView({ rows: edited, tz: TZ, today: '2026-10-15', profile: PROFILE, plan: [], schemaReady: true }).week.doneSec), 60);
    const excluded = edited.map((r) => (r.id === 'i1' ? { ...r, excluded: true } : r));
    const v2 = walkingView({ rows: excluded, tz: TZ, today: '2026-10-15', profile: PROFILE, plan: [], schemaReady: true });
    assert.equal(shownMin(v2.week.doneSec), 20);
    assert.equal(v2.items.find((i) => i.id === 'i1')!.excluded, true);
    // „Sesiune nouă”: rândurile citite din nou din bază (JSON) dau exact același rezultat.
    const reread = JSON.parse(JSON.stringify(excluded)) as WalkRow[];
    assert.deepEqual(walkingView({ rows: reread, tz: TZ, today: '2026-10-15', profile: PROFILE, plan: [], schemaReady: true }).week, v2.week);
  });
});

describe('mers: lipsa datelor, declarat vs măsurat, mers alert (§3, §7.4)', () => {
  it('fără date: 0 minute, 0 mers alert, nicio plimbare presupusă', () => {
    const v = walkWeek([], '2026-10-14', TZ, [], 200);
    assert.equal(v.doneSec, 0);
    assert.equal(v.briskSec, 0);
    assert.equal(shownRemainingMin(v.remainingSec), 200);
    assert.equal(v.walks.length, 0);
  });

  it('declaratul rămâne separat de măsurat; mersul alert doar confirmat, nu dedus', () => {
    const rows = [row({ id: 'm', source: 'manual', date: '2026-10-13', minutes: 30, brisk: true }), row({ id: 's', date: '2026-10-14', minutes: 45, start_utc: '2026-10-14T06:00:00Z', elapsed_sec: 2700, moving_sec: 2700 })];
    const v = walkWeek(toWalkRecords(rows, TZ), '2026-10-15', TZ, [], 200);
    assert.equal(shownMin(v.declaredSec), 30);
    assert.equal(shownMin(v.measuredSec), 45);
    // Plimbarea de 45 min nu e „alert” fără confirmare, oricât de repede ar fi fost.
    assert.equal(shownMin(v.briskSec), 30);
  });

  it('pauzele: scoase când sursa dă timpul în mișcare; altfel se spune că nu pot fi separate', () => {
    const withMoving = walkWeek(toWalkRecords([row({ id: 's', date: '2026-10-14', minutes: 50, start_utc: '2026-10-14T06:00:00Z', elapsed_sec: 3000, moving_sec: 2400 })], TZ), '2026-10-15', TZ, [], 200);
    assert.equal(shownMin(withMoving.doneSec), 40);
    assert.equal(withMoving.pausesUnknown, false);
    const total = walkWeek(toWalkRecords([row({ id: 'w', source: 'whoop', date: '2026-10-14', minutes: 50, start_utc: '2026-10-14T06:00:00Z', elapsed_sec: 3000 })], TZ), '2026-10-15', TZ, [], 200);
    assert.equal(shownMin(total.doneSec), 50);
    assert.equal(total.pausesUnknown, true);
  });
});

describe('mers: săptămâna, miezul nopții, ora de iarnă, importuri întârziate (§6, §7.5)', () => {
  it('duminică 23:40 → luni 00:20: 20 min în săptămâna veche, 20 în cea nouă', () => {
    // 18 oct 2026, 23:40 ora României (UTC+3) = 20:40 UTC.
    const w = rec({ id: 'x', date: '2026-10-18', startUtc: '2026-10-18T20:40:00Z', elapsedSec: 40 * 60 });
    assert.deepEqual(splitByDay(w, TZ).map((p) => [p.date, p.sec]), [['2026-10-18', 1200], ['2026-10-19', 1200]]);
    assert.equal(shownMin(walkWeek([w], '2026-10-18', TZ, [], 200).doneSec), 20);
    assert.equal(shownMin(walkWeek([w], '2026-10-19', TZ, [], 200).doneSec), 20);
  });

  it('noaptea schimbării orei (25 oct 2026): ziua are 25 de ore, plimbarea se împarte corect', () => {
    // Duminică 25 oct, 23:30 ora de iarnă (UTC+2) = 21:30 UTC; 60 min → 30 duminică, 30 luni.
    const w = rec({ id: 'dst', date: '2026-10-25', startUtc: '2026-10-25T21:30:00Z', elapsedSec: 3600 });
    assert.deepEqual(splitByDay(w, TZ).map((p) => [p.date, p.sec]), [['2026-10-25', 1800], ['2026-10-26', 1800]]);
    // O plimbare de 02:30–03:30 în noaptea schimbării rămâne în ziua ei (duminică).
    const night = rec({ id: 'n', date: '2026-10-25', startUtc: '2026-10-24T23:30:00Z', elapsedSec: 3600 });
    assert.deepEqual(splitByDay(night, TZ).map((p) => p.date), ['2026-10-25']);
    // Ora locală dintr-un rând vechi (fără start_utc), după schimbare: 10:00 = 08:00 UTC.
    assert.equal(toWalkRecords([row({ id: 'o', date: '2026-10-25', minutes: 30, start_local: '10:00' })], TZ)[0]!.startUtc, '2026-10-25T08:00:00.000Z');
  });

  it('importul întârziat intră în săptămâna în care s-a mers; istoricul și ținta de atunci rămân', () => {
    const changes = changeTarget([], { to: 150, reason: 'încep mai jos', today: '2026-10-07', at: '2026-10-07T10:00:00Z', initial: 200 });
    const rows0 = [row({ id: 'a', date: '2026-10-14', minutes: 30, start_utc: '2026-10-14T06:00:00Z', elapsed_sec: 1800 })];
    const v0 = walkingView({ rows: rows0, tz: TZ, today: '2026-10-20', profile: { ...PROFILE, changes }, plan: [], schemaReady: true });
    assert.equal(v0.week.doneSec, 0);
    assert.equal(v0.history[0]!.weekStart, MON);
    assert.equal(v0.history[0]!.targetMin, 150);
    // Joi 15 oct importat abia marți 20 oct: săptămâna 12–18 crește, săptămâna curentă nu.
    const late = [...rows0, row({ id: 'late', date: '2026-10-15', minutes: 45, start_utc: '2026-10-15T15:00:00Z', elapsed_sec: 2700, synced_at: '2026-10-20T09:00:00Z' })];
    const v1 = walkingView({ rows: late, tz: TZ, today: '2026-10-20', profile: { ...PROFILE, changes }, plan: [], schemaReady: true });
    assert.equal(v1.week.doneSec, 0);
    assert.equal(shownMin(v1.history[0]!.doneSec), 75);
  });
});

describe('mers: ținta și jurnalul ei, fără datorie (§6, §7.6)', () => {
  it('schimbarea țintei: implicit de lunea viitoare, cu valoarea veche, motivul și săptămâna; motivul e obligatoriu', () => {
    const c1 = changeTarget([], { to: 120, reason: 'genunchiul', today: '2026-10-14', at: '2026-10-14T10:00:00Z', initial: 200 });
    assert.deepEqual(c1[0], { at: '2026-10-14T10:00:00Z', from: 200, to: 120, reason: 'genunchiul', effectiveWeek: '2026-10-19' });
    assert.equal(targetForWeek(MON, c1, 200), 200);
    assert.equal(targetForWeek('2026-10-19', c1, 200), 120);
    const c2 = changeTarget(c1, { to: 150, reason: 'merge bine', today: '2026-10-21', at: '2026-10-21T10:00:00Z', now: true, initial: 200 });
    assert.equal(c2.length, 2);
    assert.equal(c2[1]!.from, 120);
    assert.equal(c2[1]!.effectiveWeek, '2026-10-19');
    assert.equal(targetForWeek('2026-10-19', c2, 200), 150);
    assert.throws(() => changeTarget(c2, { to: 100, reason: '  ', today: '2026-10-21', at: 'x', initial: 200 }), /motivul/);
    assert.throws(() => changeTarget(c2, { to: 10, reason: 'x', today: '2026-10-21', at: 'x', initial: 200 }), /între/);
  });

  it('duminică cu 120 de minute rămase: recomandarea rămâne ședința zilei, nu o ședință de 120', () => {
    const plan = walkPlanWorkouts({ startDate: MON, endDate: '2026-10-26', profile: { ...PROFILE, brisk: 'nu' }, freeBlocks: [] }).weeks[0]!.workouts;
    const sunday = '2026-10-18';
    const t = walkToday({ today: sunday, plan, restriction: 'none', remainingSec: 120 * 60 });
    assert.ok(t.spec, 'duminică e zi de mers în plan');
    assert.ok(t.spec!.totalMin <= 30, `azi ${t.spec!.totalMin} min (capacitatea e 30)`);
    assert.match(t.note ?? '', /nu se adaugă/);
  });

  it('săptămâna următoare pornește cu ținta ei, indiferent cât a rămas din cea trecută', () => {
    const a = planWalkWeek({ weekStart: '2026-10-19', targetMin: 200, capMin: 30, brisk: 'nu', days: [0, 1, 2, 3, 4, 5, 6] });
    assert.equal(a.plannedMin, 200);
    assert.ok(a.sessions.every((s) => s.totalMin <= 30));
  });
});

describe('mers: ședințele și mersul alert (§4)', () => {
  it('30 min mers alert = 5 ușor + 20 alert + 5 ușor, cu scop, pași și varianta scurtă', () => {
    const s = walkSpec(30, 'alert');
    assert.deepEqual([s.warmup.min, s.main.min, s.cooldown.min], [5, 20, 5]);
    assert.ok(s.purpose.length > 20);
    assert.ok(s.how.length >= 4);
    assert.equal(s.shorter?.totalMin, 20);
    assert.equal(s.shorter?.text, '20 min = 5 min ușor + 10 min alert + 5 min ușor');
    // Sub 20 de minute nu se prescrie mers alert.
    assert.equal(walkSpec(15, 'alert').kind, 'usor');
  });

  it('capacitatea limitează ședința; ținta care nu încape e spusă, nu umflată', () => {
    assert.equal(sessionCap(20, null), 20);
    assert.equal(sessionCap(20, 42), 40);
    assert.equal(sessionCap(90, null), 60);
    const p = planWalkWeek({ weekStart: '2026-10-19', targetMin: 200, capMin: 20, brisk: 'nu', days: [0, 2, 4] });
    assert.equal(p.plannedMin, 60);
    assert.match(p.short ?? '', /nu încape/);
  });

  it('mersul alert doar dacă e confirmat; „nu știu” = o probă; „nu” = doar ușor', () => {
    const da = planWalkWeek({ weekStart: '2026-10-19', targetMin: 200, capMin: 40, brisk: 'da', days: [0, 1, 2, 3, 4, 5, 6] });
    assert.ok(da.sessions.some((s) => s.kind === 'alert'));
    assert.ok(da.sessions.filter((s) => s.kind === 'alert').length <= 3);
    const ns = planWalkWeek({ weekStart: '2026-10-19', targetMin: 200, capMin: 40, brisk: 'nu_stiu', days: [0, 1, 2, 3, 4, 5, 6] });
    assert.equal(ns.sessions.filter((s) => s.kind === 'proba').length, 1);
    assert.equal(ns.sessions.filter((s) => s.kind === 'alert').length, 0);
    const nu = planWalkWeek({ weekStart: '2026-10-19', targetMin: 200, capMin: 40, brisk: 'nu', days: [0, 1, 2, 3, 4, 5, 6] });
    assert.ok(nu.sessions.every((s) => s.kind === 'usor'));
  });

  it('restricțiile: oprire = fără mers prescris; zi roșie = varianta scurtă ușoară; zi galbenă = fără alert', () => {
    const plan: PlannedWorkout[] = [{ id: 'm', date: '2026-10-14', sport: 'mers', type: 'calitate', plannedMinutes: 40, targetZones: [], key: false, status: 'planificat' }];
    assert.equal(walkToday({ today: '2026-10-14', plan, restriction: restrictionOf('stop'), remainingSec: 0 }).spec, null);
    const red = walkToday({ today: '2026-10-14', plan, restriction: restrictionOf('rosu'), remainingSec: 0 });
    assert.equal(red.spec?.kind, 'usor');
    assert.ok(red.spec!.totalMin < 40);
    const yellow = walkToday({ today: '2026-10-14', plan, restriction: restrictionOf('galben'), remainingSec: 0 });
    assert.equal(yellow.spec?.kind, 'usor');
    assert.equal(yellow.spec?.totalMin, 40);
  });

  it('generatorul de plan: obiectivul „mers” dă ședințe de mers care însumează ținta săptămânii', () => {
    const r = generatePlan({ goal: 'mers', startDate: '2026-10-19', raceDate: '2027-04-19', freeBlocks: [], walk: { profile: { initial: 150, capacityMin: 30, brisk: 'da', changes: [] }, demonstratedMin: null } } as unknown as Parameters<typeof generatePlan>[0]);
    assert.ok(r.ok);
    if (!r.ok) return;
    assert.equal(r.weeks.length, 26);
    const w1 = r.weeks[0]!.workouts;
    assert.ok(w1.every((w) => w.sport === 'mers'));
    assert.equal(w1.reduce((n, w) => n + w.plannedMinutes, 0), 150);
    assert.ok(w1.some((w) => w.type === 'calitate'));
    assert.match(w1[0]!.structure ?? '', /^Mers \d+ min: \d+ min ușor/);
  });

  it('ședința de mers din calendar se leagă de plimbarea făcută și iese verde', () => {
    const plan: PlannedWorkout[] = [{ id: 'm', date: '2026-10-14', sport: 'mers', type: 'z2', plannedMinutes: 30, targetZones: [], key: false, status: 'planificat' }];
    const acts = walkActivities(toWalkRecords([row({ id: 'w', date: '2026-10-14', minutes: 31, start_utc: '2026-10-14T06:00:00Z', elapsed_sec: 1860 })], TZ), TZ);
    const { matches } = matchActivities(plan, acts, '2026-10-15');
    assert.equal(matches[0]!.activity?.id, 'w');
    const s = scoreWorkout({ planned: plan[0]!, activity: matches[0]!.activity, today: '2026-10-16' });
    assert.equal(s.color, 'verde');
  });
});
