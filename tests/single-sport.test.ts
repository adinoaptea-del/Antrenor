import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generatePlan } from '../src/calendar/generate.js';
import { goalKind, goalSports, isGoal } from '../src/calendar/phases.js';
import { runTarget, riegel } from '../src/goals/run-target.js';
import { raceReady } from '../src/bar/race-ready.js';
import { sportReadiness } from '../src/bar/sport-readiness.js';

const blocks = ([0, 1, 2, 3, 4, 5, 6] as const).map((day) => ({ day, startMin: 6 * 60, endMin: day >= 5 ? 10 * 60 : 8 * 60 }));

describe('un singur sport: alergare 5 / 10 km', () => {
  it('felul obiectivului și sporturile din plan', () => {
    assert.equal(goalKind('5k'), 'run');
    assert.equal(goalKind('inot-1900'), 'swim');
    assert.equal(goalKind('bike-100'), 'bike');
    assert.equal(goalKind('70.3'), 'tri');
    assert.equal(goalKind('full'), null);
    assert.deepEqual(goalSports('10k'), ['alergare', 'forta']);
    assert.deepEqual(goalSports('inot-1500'), ['inot', 'forta']);
    assert.deepEqual(goalSports('sprint'), ['inot', 'bicicleta', 'alergare', 'forta']);
    assert.ok(isGoal('5k') && !isGoal('full'));
  });

  it('5 km cu ritm-țintă: doar alergare și forță, repetări la ritmul de 5 km în build, ieșirea lungă nu trece de 75 min', () => {
    const r = generatePlan({ startDate: '2026-10-19', raceDate: '2027-03-14', goal: '5k', freeBlocks: blocks, historyHoursPerWeek: [3, 3, 3], intensityAllowed: 'toate', swimContinuous400: false, run: { goalPaceSecKm: 300, canDoDistance: true, longestRunKm: 8 } });
    assert.ok(r.ok);
    if (!r.ok) return;
    const all = r.weeks.flatMap((w) => w.workouts);
    assert.ok(all.every((w) => w.sport === 'alergare' || w.sport === 'forta'));
    assert.ok(all.some((w) => /ritm de 5 km \(5:00\/km\)/.test(w.structure ?? '')), 'repetări la ritmul de 5 km');
    assert.ok(all.filter((w) => w.type === 'lung').every((w) => w.plannedMinutes <= 75));
    assert.ok(all.filter((w) => w.type === 'lung').every((w) => !/ritm de cursă/.test(w.structure ?? '')), 'la 5 km ieșirea lungă rămâne ușoară');
  });

  it('10 km: bucăți de 6–8 min la ritmul de 10 km', () => {
    const r = generatePlan({ startDate: '2026-10-19', raceDate: '2027-04-18', goal: '10k', freeBlocks: blocks, historyHoursPerWeek: [3, 3, 3], intensityAllowed: 'toate', swimContinuous400: false, run: { goalPaceSecKm: 330, canDoDistance: true, longestRunKm: 10 } });
    assert.ok(r.ok);
    if (!r.ok) return;
    const all = r.weeks.flatMap((w) => w.workouts);
    assert.ok(all.some((w) => /la ritm de 10 km \(5:30\/km\)/.test(w.structure ?? '')));
  });
});

describe('ținta la alergare: realistă, ambițioasă sau nerealistă', () => {
  it('Riegel: 25:00 pe 5 km ≈ 52:07 pe 10 km', () => {
    assert.equal(Math.round(riegel(1500, 5, 10)), 3127);
  });
  it('10 km în 13:20 (1:20/km) e nerealist, oricare ar fi nivelul', () => {
    const v = runTarget({ goal: '10k', targetSec: 800, current: { km: 10, sec: 50 * 60 }, weeks: 30 });
    assert.equal(v.verdict, 'nerealist');
    assert.ok(/elită/.test(v.reasons[0]!));
  });
  it('de la 55:00 la 52:00 pe 10 km în 20 de săptămâni: realist (5,5% cu ~7% posibil)', () => {
    const v = runTarget({ goal: '10k', targetSec: 52 * 60, current: { km: 10, sec: 55 * 60 }, weeks: 20 });
    assert.equal(v.verdict, 'realist');
    assert.equal(v.improvementPct, 5.5);
  });
  it('de la 55:00 la 45:00 pe 10 km în 12 săptămâni: nerealist (18% în ~3 luni)', () => {
    const v = runTarget({ goal: '10k', targetSec: 45 * 60, current: { km: 10, sec: 55 * 60 }, weeks: 12 });
    assert.equal(v.verdict, 'nerealist');
  });
  it('de la 27:00 pe 5 km la 52:00 pe 10 km în 16 săptămâni: ambițios (echivalentul de acum ≈ 56:17)', () => {
    const v = runTarget({ goal: '10k', targetSec: 52 * 60, current: { km: 5, sec: 27 * 60 }, weeks: 16 });
    assert.ok(v.equivalentNowSec! > 3360 && v.equivalentNowSec! < 3400);
    assert.equal(v.verdict, 'ambitios');
  });
  it('fără niciun rezultat: necunoscut, nu ghicim', () => {
    assert.equal(runTarget({ goal: '5k', targetSec: 25 * 60, current: null, weeks: 20 }).verdict, 'necunoscut');
  });
});

describe('un singur sport: înot și bicicletă', () => {
  it('înot 1.900 m fără 400 m continuu: doar înot și forță, totul tehnică + bucăți legate, nimic „continuu” sau CSS', () => {
    const r = generatePlan({ startDate: '2026-10-19', raceDate: '2027-06-13', goal: 'inot-1900', freeBlocks: blocks, historyHoursPerWeek: [], intensityAllowed: 'toate', swimContinuous400: false, swim: { continuousM: 50 } });
    assert.ok(r.ok, r.ok ? '' : r.reason);
    if (!r.ok) return;
    const all = r.weeks.flatMap((w) => w.workouts);
    assert.ok(all.every((w) => w.sport === 'inot' || w.sport === 'forta'));
    assert.ok(all.filter((w) => w.sport === 'inot').every((w) => w.type === 'tehnica'));
    assert.ok(all.some((w) => /bucăți legate/.test(w.structure ?? '')));
  });
  it('înot 1.500 m cu 400 m continuu: ședința lungă crește spre 40 min și apare setul CSS din baza2', () => {
    const r = generatePlan({ startDate: '2026-10-19', raceDate: '2027-06-13', goal: 'inot-1500', freeBlocks: blocks, historyHoursPerWeek: [2, 2, 2], intensityAllowed: 'toate', swimContinuous400: true, swim: { continuousM: 600 } });
    assert.ok(r.ok);
    if (!r.ok) return;
    const all = r.weeks.flatMap((w) => w.workouts);
    const longs = all.filter((w) => w.sport === 'inot' && w.type === 'lung');
    assert.ok(longs.length > 0 && Math.max(...longs.map((w) => w.plannedMinutes)) <= 40);
    assert.ok(all.some((w) => /set CSS/.test(w.structure ?? '')));
  });
  it('bicicletă 100 km: doar bicicletă și forță, tura lungă crește și nu trece de 4 h', () => {
    const r = generatePlan({ startDate: '2026-10-19', raceDate: '2027-06-13', goal: 'bike-100', freeBlocks: [...blocks, { day: 6, startMin: 10 * 60, endMin: 14 * 60 }], historyHoursPerWeek: [4, 4, 5], intensityAllowed: 'toate', swimContinuous400: false, level: { longestRideH: 1.5 } });
    assert.ok(r.ok, r.ok ? '' : r.reason);
    if (!r.ok) return;
    const all = r.weeks.flatMap((w) => w.workouts);
    assert.ok(all.every((w) => w.sport === 'bicicleta' || w.sport === 'forta'));
    const longs = all.filter((w) => w.type === 'lung').map((w) => w.plannedMinutes);
    assert.ok(Math.max(...longs) <= 240 && Math.max(...longs) > Math.min(...longs));
  });
  it('reperele: la înot doar veriga de înot; la bicicletă doar bicicleta; fără „Cumul”', () => {
    const acts = [{ id: 's', source: 'strava', externalId: 's', date: '2026-10-10', sport: 'inot', minutes: 40, distanceKm: 1.2, details: { continuousM: 800 } }] as never[];
    const r = raceReady({ goal: 'inot-1900', today: '2026-10-18', acts, plan: [], fueledDates: [] });
    assert.deepEqual(r.links.map((l) => l.name), ['Înot']);
    assert.equal(r.links[0]!.pct, 42);
    assert.equal(sportReadiness('bike-100', [], '2026-10-18').map((x) => x.sport).join(), 'bicicleta');
  });
  it('alergare cu țintă: timpul estimat și verdictul din cel mai bun efort de pe ceas', () => {
    const acts = [{ id: 'r', source: 'strava', externalId: 'r', date: '2026-10-10', sport: 'alergare', minutes: 36, distanceKm: 6, details: { bestEfforts: { '5 km': 1620 }, fastestKmSec: 300 } }] as never[];
    const r = raceReady({ goal: '10k', today: '2026-10-18', acts, plan: [{ id: 'x', date: '2027-02-21', sport: 'alergare', type: 'z2', plannedMinutes: 30, targetZones: [2], key: false, status: 'planificat' }], fueledDates: [], targetSec: 55 * 60 });
    assert.ok(r.target);
    assert.equal(r.target!.best!.km, 5);
    assert.ok(r.target!.predictedSec! > 3300 && r.target!.predictedSec! < 3500);
    assert.equal(r.target!.verdict.verdict, 'realist');
    assert.ok(r.benchmarks.some((b) => b.id === 'ritm-cursa' && b.done));
  });
});
