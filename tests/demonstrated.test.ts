import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { demonstrated, raiseToDemonstrated } from '../src/calendar/demonstrated.js';
import { generatePlan } from '../src/calendar/generate.js';
import type { FreeBlock, PlannedWorkout, Sport } from '../src/types.js';

// Alergările reale ale proprietarului (Garmin, 8.09–17.10.2026), minute.
const runs: [string, number][] = [['2026-09-08', 27], ['2026-09-11', 30], ['2026-09-14', 125], ['2026-09-21', 38], ['2026-09-23', 61], ['2026-09-25', 55], ['2026-09-27', 75], ['2026-10-01', 49], ['2026-10-06', 22], ['2026-10-08', 42], ['2026-10-11', 127], ['2026-10-14', 46], ['2026-10-17', 229]];
const acts = runs.map(([date, minutes], i) => ({ id: `r${i}`, date, sport: 'alergare' as Sport, minutes }));
const today = '2026-10-20';

describe('ce a demonstrat sportivul (corecția „30 min Z2 e doză de sedentar”, 20.10.2026)', () => {
  it('alergarea obișnuită ~45 min, cea mai lungă 229 min', () => {
    const d = demonstrated(acts, today);
    assert.equal(d.easy.alergare, 45);
    assert.equal(d.longest.alergare, 229);
  });
  it('fără istoric (sub 3 ședințe) nu inventează nimic', () => {
    assert.equal(demonstrated(acts.slice(0, 2), today).easy.alergare, undefined);
  });
  it('planul de 70.3 nu mai pune alergare ușoară sub 45 min (în afară de descărcare/taper), iar lunga pornește de la ~100 min', () => {
    const blocks: FreeBlock[] = [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day: day as FreeBlock['day'], startMin: 360, endMin: day >= 5 ? 720 : 480 }));
    const r = generatePlan({ startDate: '2026-10-26', raceDate: '2027-09-26', goal: '70.3', freeBlocks: blocks, historyHoursPerWeek: [7, 8, 6, 9, 8, 7], intensityAllowed: 'toate', swimContinuous400: false, demonstrated: demonstrated(acts, today) });
    assert.equal(r.ok, true);
    if (!r.ok) return;
    for (const w of r.weeks) {
      if (w.recovery || w.phase === 'taper') continue;
      for (const x of w.workouts.filter((y) => y.sport === 'alergare' && y.type === 'z2' && !y.key)) assert.ok(x.plannedMinutes >= 45, `${x.date}: ${x.plannedMinutes} min`);
    }
    const firstLong = r.weeks.flatMap((w) => w.workouts).find((x) => x.sport === 'alergare' && x.type === 'lung');
    assert.ok(firstLong && firstLong.plannedMinutes >= 90, `lunga pornește de la ${firstLong?.plannedMinutes}`);
  });
  it('planul activ: z2 de 30 min urcă la 45; cele schimbate de reguli sau alese de sportiv rămân', () => {
    const base: PlannedWorkout = { id: 'a', date: '2026-10-22', sport: 'alergare', type: 'z2', plannedMinutes: 30, targetZones: [2], key: false, status: 'planificat' };
    const plan: PlannedWorkout[] = [base, { ...base, id: 'b', note: 'febră: odihnă' }, { ...base, id: 'c', date: '2026-10-19' }, { ...base, id: 'd', key: true }];
    const up = raiseToDemonstrated(plan, today, demonstrated(acts, today));
    assert.deepEqual(up.map((w) => [w.id, w.plannedMinutes]), [['a', 45]]);
  });
  it('T17/A63: după 3 săptămâni fără alergare (dar cu înot), podeaua de alergare nu se mai aplică', () => {
    const old = acts.filter((a) => a.date <= '2026-09-28');
    assert.equal(demonstrated(old, today).easy.alergare, undefined);
  });
});
