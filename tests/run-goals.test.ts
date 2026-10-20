import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generatePlan } from '../src/calendar/generate.js';
import { fmtDuration, paceFromResult, parseDuration } from '../src/util/run.js';
import { computeBar } from '../src/bar/bar.js';

const blocks = ([0, 1, 2, 3, 4, 5, 6] as const).map((day) => ({ day, startMin: 6 * 60, endMin: day >= 5 ? 10 * 60 : 8 * 60 }));

describe('obiective doar de alergare', () => {
  it('ritmul din timp final e calculat exact', () => {
    assert.equal(parseDuration('3:30:00'), 12600);
    assert.equal(Math.round(paceFromResult({ mod: 'timp', valoare: '3:30:00' }, 42.195)!), 299);
    assert.equal(paceFromResult({ mod: 'ritm', valoare: '5:30' }, 21.0975), 330);
  });

  it('timpul cu două părți se citește după distanță: 57:00 pe 10 km sunt minute, 1:45 pe semimaraton sunt ore', () => {
    assert.equal(parseDuration('57:00', 10), 57 * 60);
    assert.equal(parseDuration('27:30', 5), 27 * 60 + 30);
    assert.equal(parseDuration('1:45', 21.0975), 105 * 60);
    assert.equal(parseDuration('3:30', 42.195), 210 * 60);
    assert.equal(parseDuration('1:45'), 105 * 60); // fără distanță: ore:minute, ca înainte
    assert.equal(Math.round(paceFromResult({ mod: 'timp', valoare: '57:00' }, 10)!), 342);
    assert.equal(fmtDuration(57 * 60), '57:00');
    assert.equal(fmtDuration(13 * 60 + 20), '13:20');
    assert.equal(fmtDuration(105 * 60), '1:45:00');
  });

  it('maraton: doar alergare și forță, ritmul-țintă apare în ședințele specifice, ieșirea lungă crește până la 3 h', () => {
    const r = generatePlan({
      startDate: '2026-10-19',
      raceDate: '2027-04-11',
      goal: 'maraton',
      freeBlocks: blocks,
      historyHoursPerWeek: [4, 4.5, 5],
      intensityAllowed: 'toate',
      swimContinuous400: false,
      run: { goalPaceSecKm: 299, canDoDistance: false, longestRunKm: 15 },
    });
    assert.ok(r.ok);
    if (!r.ok) return;
    const all = r.weeks.flatMap((w) => w.workouts);
    assert.ok(all.every((w) => w.sport === 'alergare' || w.sport === 'forta'));
    assert.ok(all.some((w) => (w.structure ?? '').includes('4:59/km')));
    const longest = Math.max(...all.filter((w) => w.type === 'lung').map((w) => w.plannedMinutes));
    // Auditul v93, A97: descărcarea se numără pe tot planul (3 + 1), deci într-un plan de 25 de săptămâni sunt mai multe
    // săptămâni de descărcare decât cu numărătoarea pe faze; ieșirea lungă ajunge ceva mai jos, fără să treacă de 3 h.
    assert.ok(longest <= 180 && longest >= 140, `ieșirea lungă maximă ${longest}`);
  });

  it('de la 40 de ani descărcarea vine la a treia săptămână din fază', () => {
    const base = { startDate: '2026-10-19', raceDate: '2027-04-11', goal: 'semimaraton' as const, freeBlocks: blocks, historyHoursPerWeek: [], intensityAllowed: 'toate' as const, swimContinuous400: false };
    const young = generatePlan({ ...base, athlete: { age: 30, sex: 'm' } });
    const older = generatePlan({ ...base, athlete: { age: 45, sex: 'f' } });
    assert.ok(young.ok && older.ok);
    if (!young.ok || !older.ok) return;
    assert.ok(older.weeks.filter((w) => w.recovery).length > young.weeks.filter((w) => w.recovery).length);
  });

  it('bara la semimaraton are 3 componente (fără înot și bicicletă)', () => {
    const b = computeBar({ today: '2026-10-16', activities: [], plannedColorsLast4Weeks: [], cssSecPer100m: null, ctl: null, ctlTarget: null, openFlags: [], goal: 'semimaraton' });
    assert.deepEqual(b.components.map((c) => c.name), ['alergare', 'consistenta', 'forma']);
  });
});

describe('planul de triatlon până la cursă', () => {
  const tri = generatePlan({
    startDate: '2026-10-19',
    raceDate: '2027-09-26',
    goal: '70.3',
    freeBlocks: blocks,
    historyHoursPerWeek: [6, 7, 7],
    intensityAllowed: 'toate',
    swimContinuous400: true,
    tests: { alergare: false, bicicleta: false, inot: false },
  });

  it('acoperă toate săptămânile până la cursă, cu toate cele trei sporturi', () => {
    assert.ok(tri.ok);
    if (!tri.ok) return;
    assert.equal(tri.weeks.at(-1)!.weekStart, '2027-09-20');
    const sports = new Set(tri.weeks.flatMap((w) => w.workouts.map((x) => x.sport)));
    for (const s of ['inot', 'bicicleta', 'alergare', 'forta']) assert.ok(sports.has(s as never), s);
  });

  it('o singură ședință intensă pe zi, în afară de peak (cel mult 2 zile duble pe săptămână)', () => {
    if (!tri.ok) return;
    for (const w of tri.weeks) {
      const byDay = new Map<string, number>();
      for (const x of w.workouts) if (x.type === 'calitate') byDay.set(x.date, (byDay.get(x.date) ?? 0) + 1);
      const doubles = [...byDay.values()].filter((n) => n >= 2).length;
      if (w.phase === 'peak') assert.ok(doubles <= 2);
      else assert.equal(doubles, 0, `${w.weekStart} ${w.phase}`);
    }
  });

  it('intensitatea crește în trepte: fără calitate în evaluare (doar teste), Z5 din build doar ca 4×4, în peak', () => {
    if (!tri.ok) return;
    const maxZone = (phase: string) => Math.max(0, ...tri.weeks.filter((w) => w.phase === phase).flatMap((w) => w.workouts.filter((x) => x.type === 'calitate' && !(x.structure ?? '').startsWith('TEST')).flatMap((x) => x.targetZones)));
    assert.equal(maxZone('evaluare'), 0);
    assert.ok(maxZone('baza1') <= 3);
    // În build, Z5 apare doar ca 4×4 norvegian (o săptămână din două), nu ca alte intervale.
    const buildZ5 = tri.weeks.filter((w) => w.phase === 'build').flatMap((w) => w.workouts).filter((x) => x.targetZones.includes(5) && !(x.structure ?? '').startsWith('TEST'));
    assert.ok(buildZ5.every((x) => /4×4/.test(x.structure ?? '')));
    assert.equal(maxZone('peak'), 5);
    const tests = tri.weeks.filter((w) => w.phase === 'evaluare').flatMap((w) => w.workouts).filter((x) => (x.structure ?? '').startsWith('TEST'));
    assert.ok(tests.length >= 2);
  });
});

describe('toate sporturile din prima săptămână', () => {
  it('fără istoric și cu ore puține: cel puțin 2 înot, 2 bicicletă, 2 alergare și 1 forță în fiecare săptămână', () => {
    const tight = ([0, 1, 2, 3, 4, 5, 6] as const).map((day) => ({ day, startMin: 360, endMin: day >= 5 ? 540 : 450 }));
    const r = generatePlan({ startDate: '2026-10-19', raceDate: '2027-09-26', goal: '70.3', freeBlocks: tight, historyHoursPerWeek: [], intensityAllowed: 'Z2', swimContinuous400: false, level: { longestRideH: 1, longestRunKm: 8 } });
    assert.ok(r.ok);
    if (!r.ok) return;
    for (const w of r.weeks.slice(0, 12)) {
      const n = (s: string) => w.workouts.filter((x) => x.sport === s).length;
      assert.ok(n('inot') >= 2 && n('bicicleta') >= 2 && n('alergare') >= 2 && n('forta') >= 1, `${w.weekStart}: ${n('inot')}/${n('bicicleta')}/${n('alergare')}/${n('forta')}`);
    }
  });
});
