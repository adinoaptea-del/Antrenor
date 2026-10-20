// Auditul v93 — personalizarea planului (A25, A28, A97, A98).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generatePlan } from '../src/calendar/generate.js';
import type { FreeBlock } from '../src/types.js';

const blocks: FreeBlock[] = [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day: day as FreeBlock['day'], startMin: 360, endMin: day >= 5 ? 720 : 540 }));

test('T70 / A98: 46 de ani, 400 m continuu, fără CSS → testul CSS apare în plan (nu cade în descărcare, nu e înmuiat)', () => {
  for (const goal of ['70.3', 'olimpic'] as const) {
    const r = generatePlan({ startDate: '2026-10-26', raceDate: '2027-09-26', goal, freeBlocks: blocks, historyHoursPerWeek: [7, 7, 7, 7], intensityAllowed: 'toate', swimContinuous400: true, tests: { alergare: false, bicicleta: false, inot: false }, athlete: { age: 46 } as never });
    assert.ok(r.ok);
    if (!r.ok) return;
    const css = r.weeks.flatMap((w) => w.workouts).filter((w) => w.sport === 'inot' && /TEST CSS/.test(w.structure ?? ''));
    assert.ok(css.length >= 1, `${goal}: niciun test CSS`);
    for (const w of r.weeks) assert.ok(w.workouts.filter((x) => x.type === 'calitate' || x.type === 'brick').length <= 3, w.weekStart);
  }
});

test('A98: testul de evaluare (CSS lipsă) căzut în descărcare apare în săptămâna următoare', () => {
  const r = generatePlan({ startDate: '2026-10-26', raceDate: '2027-09-26', goal: '70.3', freeBlocks: blocks, historyHoursPerWeek: [7, 7, 7, 7], intensityAllowed: 'toate', swimContinuous400: true, athlete: { age: 46, sex: 'm' } });
  assert.ok(r.ok);
  if (!r.ok) return;
  const i = r.weeks.findIndex((w) => w.phase === 'evaluare' && w.recovery);
  assert.ok(i >= 0, 'la 46 de ani evaluarea are o descărcare (cazul din audit)');
  assert.ok(r.weeks[i + 1]!.workouts.some((x) => /TEST CSS/.test(x.structure ?? '')), 'CSS mutat în săptămâna următoare');
});

test('A25: săptămânile fără antrenament intră în media de start; saltul peste medie e spus', () => {
  const steady = generatePlan({ startDate: '2026-10-26', raceDate: '2027-09-26', goal: '70.3', freeBlocks: blocks, historyHoursPerWeek: [6, 6, 6, 6], intensityAllowed: 'toate', swimContinuous400: true });
  const gaps = generatePlan({ startDate: '2026-10-26', raceDate: '2027-09-26', goal: '70.3', freeBlocks: blocks, historyHoursPerWeek: [6, 0, 0, 6], intensityAllowed: 'toate', swimContinuous400: true });
  assert.ok(steady.ok && gaps.ok);
  if (!steady.ok || !gaps.ok) return;
  assert.ok(gaps.weeks[0]!.plannedHours <= steady.weeks[0]!.plannedHours, `${gaps.weeks[0]!.plannedHours} vs ${steady.weeks[0]!.plannedHours}`);
  if (gaps.weeks[0]!.plannedHours > 3 * 1.3) assert.ok(gaps.weeks[0]!.notes.some((n) => /peste media ta/.test(n)), gaps.weeks[0]!.notes.join(' | '));
});

test('A26: alergarea necunoscută pornește prudent; ce s-a măsurat decide', async () => {
  const { isBeginnerRunner } = await import('../src/goals/run-target.js');
  assert.equal(isBeginnerRunner(null), true, 'necunoscut = prudent');
  assert.equal(isBeginnerRunner(null, 45), false, '45 min măsurate');
  assert.equal(isBeginnerRunner(null, 12), true);
  assert.equal(isBeginnerRunner(10), false);
  assert.equal(isBeginnerRunner(2), true);
});

test('A26 / T25: orele din alt sport nu deblochează 30/15 la bicicletă', () => {
  const base = { startDate: '2026-10-26', raceDate: '2027-07-26', goal: 'bike-100' as never, freeBlocks: blocks, historyHoursPerWeek: [7, 7, 7, 7], intensityAllowed: 'toate' as const, swimContinuous400: false };
  const noBike = generatePlan({ ...base, demonstrated: { easy: { alergare: 50 }, longest: { alergare: 90 }, n: { alergare: 12, bicicleta: 0 } } });
  assert.ok(noBike.ok);
  if (!noBike.ok) return;
  const has3015 = (r: ReturnType<typeof generatePlan>) => r.ok && r.weeks.flatMap((w) => w.workouts).some((w) => /30 s tare/.test(w.structure ?? ''));
  assert.ok(!has3015(noBike), '30/15 fără bicicletă');
  const withBike = generatePlan({ ...base, demonstrated: { easy: { bicicleta: 60 }, longest: { bicicleta: 150 }, n: { bicicleta: 12 } } });
  assert.ok(has3015(withBike), 'cu istoric de bicicletă, 30/15 rămâne opțiune');
});

test('A102: CSS din test → capacitate ≥ 400 m, aceeași funcție pe server și în aplicație', async () => {
  const { swimCapacity } = await import('../src/calendar/swim-capacity.js');
  const acts = [{ date: '2026-10-10', sport: 'inot', details: { continuousM: 75 } }];
  assert.equal(swimCapacity({ declaredM: null, css: 110, activities: acts, today: '2026-10-20' }).meters, 400);
  assert.equal(swimCapacity({ declaredM: null, css: null, activities: acts, today: '2026-10-20' }).meters, 75);
});

test('T69 / A97: descărcarea pe contor global — niciodată mai mult de N−1 săptămâni încărcate la rând (în afară de peak/taper)', async () => {
  const { phaseWeeks } = await import('../src/calendar/phases.js');
  for (const n of [3, 4]) {
    const ws = phaseWeeks('2026-10-26', '2027-09-26', n, '70.3');
    let run = 0;
    for (const w of ws) {
      if (w.phase === 'peak' || w.phase === 'taper') break;
      run = w.recovery ? 0 : run + 1;
      assert.ok(run <= n - 1, `N=${n}: ${w.weekStart} are ${run} săptămâni încărcate la rând`);
    }
  }
});

test('T13 / A28: la 55 de ani calitatea de alergare plafonată la Z4 nu are doză mai mare decât la 54', () => {
  const q = (age: number) => {
    const r = generatePlan({ startDate: '2026-10-26', raceDate: '2027-09-26', goal: '70.3', freeBlocks: blocks, historyHoursPerWeek: [8, 8, 8, 8], intensityAllowed: 'toate', swimContinuous400: true, athlete: { age, sex: 'm' } });
    assert.ok(r.ok);
    if (!r.ok) return 0;
    // Doza pe ședință (minute de lucru); săptămâna cu test de teren (sub 55 de ani) nu are intervale și nu intră.
    const xs = r.weeks.filter((w) => w.phase === 'build').flatMap((w) => w.workouts).filter((w) => w.sport === 'alergare' && w.type === 'calitate' && w.intervals);
    return xs.reduce((n, w) => n + w.intervals!.count * w.intervals!.minutes, 0) / xs.length;
  };
  const a54 = q(54), a55 = q(55);
  assert.ok(a55 <= a54 * 1.1, `54: ${a54} min de lucru pe ședință, 55: ${a55}`);
});

test('A29: doza din prima săptămână nu crește când orizontul e mai scurt', () => {
  const first = (race: string) => {
    const r = generatePlan({ startDate: '2026-10-26', raceDate: race, goal: 'olimpic', freeBlocks: blocks, historyHoursPerWeek: [3, 3, 3, 3], intensityAllowed: 'toate', swimContinuous400: true });
    assert.ok(r.ok, r.ok ? '' : r.reason);
    return r.ok ? r.weeks[0]!.targetHours : 0;
  };
  const short = first('2026-12-20'), long = first('2027-05-23');
  assert.ok(short <= long + 0.05, `8 săpt.: ${short} h, 30 săpt.: ${long} h`);
});
