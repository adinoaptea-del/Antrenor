import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { RUN_MODULES, moduleMinutes } from '../src/calendar/run-modules.js';
import { detailSteps } from '../src/calendar/session-detail.js';
import type { PlannedWorkout } from '../src/types.js';

const mins = (t: string) => [...t.matchAll(/(\d+) min/g)].reduce((a, m) => a + Number(m[1]), 0);
describe('auditul v93 · pașii nu schimbă doza', () => {
  it('T19/A34: T1 și M — totalul = încălzire + repetări + pauze DOAR între ele + revenire', () => {
    const t1 = RUN_MODULES.T1;
    assert.equal(moduleMinutes(t1), t1.warm + t1.count * t1.work + (t1.count - 1) * t1.rest + t1.cool);
    assert.equal(moduleMinutes({ warm: 12, count: 3, work: 5, rest: 2, cool: 7 }), 38);
    assert.equal(moduleMinutes({ warm: 15, count: 3, work: 12, rest: 3, cool: 10 }), 67);
  });
  it('T20/A33: ieșirea lungă de 90 min cu ultimele 20 progresive nu e 90 min în Z3', () => {
    const w: PlannedWorkout = { id: 'l', date: '2026-11-01', sport: 'alergare', type: 'lung', plannedMinutes: 90, targetZones: [2, 3], key: true, status: 'planificat', structure: 'ușor, ultimele 20 min la efort de cursă' };
    const s = detailSteps(w, {});
    const main = s.find((x) => x.label === 'Principal')!.text;
    const fin = s.find((x) => x.label === 'Final')!.text;
    assert.match(main, /Z2|ușor|conversa/i);
    assert.doesNotMatch(main, /Z3/);
    assert.match(fin, /^20 min/);
  });
  it('T21/A37: bicicleta de taper „3 × 5 min” are exact trei blocuri de 5 min, nu 27 min continuu în Z4', () => {
    const w: PlannedWorkout = { id: 'b', date: '2027-09-20', sport: 'bicicleta', type: 'calitate', plannedMinutes: 40, targetZones: [3, 4], key: false, status: 'planificat', structure: '3 × 5 min la pace de cursă' };
    const main = detailSteps(w, {}).find((x) => x.label === 'Principal')!.text;
    assert.match(main, /^3 × 5 min/);
    assert.doesNotMatch(main, /^2\d min/);
  });
});
