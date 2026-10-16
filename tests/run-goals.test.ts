import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generatePlan } from '../src/calendar/generate.js';
import { paceFromResult, parseDuration } from '../src/util/run.js';
import { computeBar } from '../src/bar/bar.js';

const blocks = ([0, 1, 2, 3, 4, 5, 6] as const).map((day) => ({ day, startMin: 6 * 60, endMin: day >= 5 ? 10 * 60 : 8 * 60 }));

describe('obiective doar de alergare', () => {
  it('ritmul din timp final e calculat exact', () => {
    assert.equal(parseDuration('3:30:00'), 12600);
    assert.equal(Math.round(paceFromResult({ mod: 'timp', valoare: '3:30:00' }, 42.195)!), 299);
    assert.equal(paceFromResult({ mod: 'ritm', valoare: '5:30' }, 21.0975), 330);
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
    assert.ok(longest <= 180 && longest >= 150, `ieșirea lungă maximă ${longest}`);
  });

  it('bara la semimaraton are 3 componente (fără înot și bicicletă)', () => {
    const b = computeBar({ today: '2026-10-16', activities: [], plannedColorsLast4Weeks: [], cssSecPer100m: null, ctl: null, ctlTarget: null, openFlags: [], goal: 'semimaraton' });
    assert.deepEqual(b.components.map((c) => c.name), ['alergare', 'consistenta', 'forma']);
  });
});
