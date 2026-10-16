import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { assignStrengthDays } from '../src/calendar/generate.js';
import { PPL, dayById, dosed, doseFor, rotation } from '../src/strength/ppl.js';
import type { PlannedWorkout } from '../src/types.js';

const w = (date: string, type: PlannedWorkout['type'], key = false): PlannedWorkout => ({ id: `${type}-${date}`, date, sport: type === 'forta' ? 'forta' : 'alergare', type, plannedMinutes: 50, targetZones: [], key, status: 'planificat' });

describe('forța: programul Push / Pull / Legs', () => {
  it('are cele 6 zile din program, cu exercițiile lor', () => {
    assert.deepEqual(PPL.map((d) => d.name), ['Push 1', 'Pull 1', 'Picioare', 'Push 2', 'Brațe', 'Pull 2']);
    assert.equal(dayById('push1')!.exercises[0]!.name, 'Împins din înclinat cu gantere');
    assert.equal(dayById('legs')!.exercises.length, 9);
  });
  it('rotația sare peste „Brațe” la sub 3 ședințe pe săptămână', () => {
    assert.ok(!rotation(2).includes('arms'));
    assert.ok(rotation(3).includes('arms'));
  });
  it('ședințele primesc zilele în ordine, pe tot planul', () => {
    const weeks = [
      { weekStart: '2026-11-02', phase: 'baza1' as const, recovery: false, targetHours: 6, plannedHours: 6, notes: [], workouts: [w('2026-11-03', 'forta'), w('2026-11-05', 'forta')] },
      { weekStart: '2026-11-09', phase: 'baza1' as const, recovery: false, targetHours: 6, plannedHours: 6, notes: [], workouts: [w('2026-11-10', 'forta'), w('2026-11-12', 'forta')] },
    ];
    assignStrengthDays(weeks);
    assert.deepEqual(weeks.flatMap((x) => x.workouts.map((y) => y.structure!.split(' · ')[0])), ['Push 1', 'Pull 1', 'Picioare', 'Push 2']);
  });
  it('picioarele nu cad în ziua dinaintea ieșirii lungi: trec la ședința următoare', () => {
    const weeks = [{ weekStart: '2026-11-02', phase: 'baza2' as const, recovery: false, targetHours: 6, plannedHours: 6, notes: [], workouts: [w('2026-11-02', 'forta'), w('2026-11-03', 'forta'), w('2026-11-06', 'forta'), w('2026-11-07', 'lung', true), w('2026-11-09', 'forta')] }];
    assignStrengthDays(weeks);
    const names = weeks[0]!.workouts.filter((x) => x.type === 'forta').map((x) => x.structure!.split(' · ')[0]);
    assert.deepEqual(names, ['Push 1', 'Pull 1', 'Push 2', 'Picioare']);
  });
  it('doza: învățare fără rest-pause; menținere doar setul greu; build fără rest-pause la picioare', () => {
    const legs = dayById('legs')!;
    assert.ok(dosed(legs, doseFor('evaluare')).exercises.every((e) => e.sets.every((s) => s.kind !== 'restpause')));
    assert.ok(dosed(dayById('push1')!, doseFor('peak')).exercises.every((e) => e.sets.every((s) => s.kind !== 'lowered' && s.kind !== 'restpause')));
    assert.ok(dosed(legs, doseFor('build')).exercises.every((e) => e.sets.every((s) => s.kind !== 'restpause')));
    assert.ok(dosed(dayById('push1')!, doseFor('build')).exercises.some((e) => e.sets.some((s) => s.kind === 'restpause')));
  });
});
