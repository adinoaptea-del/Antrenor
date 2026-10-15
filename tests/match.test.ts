import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { matchActivities } from '../src/scoring/match.js';
import type { Activity, PlannedWorkout } from '../src/types.js';

const pw = (over: Partial<PlannedWorkout>): PlannedWorkout => ({
  id: 'p',
  date: '2026-11-07',
  sport: 'alergare',
  type: 'z2',
  plannedMinutes: 50,
  targetZones: [2],
  key: false,
  status: 'planificat',
  ...over,
});

const act = (over: Partial<Activity>): Activity => ({ id: 'a', date: '2026-11-07', sport: 'alergare', minutes: 50, ...over });

describe('matchActivities', () => {
  it('leagă activitatea de același sport din aceeași zi sau din ziua următoare, cea mai apropiată ca durată', () => {
    const planned = [pw({ id: 'p1', plannedMinutes: 50 }), pw({ id: 'p2', date: '2026-11-08', plannedMinutes: 90, type: 'lung', key: true })];
    const acts = [act({ id: 'a1', minutes: 48 }), act({ id: 'a2', date: '2026-11-08', minutes: 85 })];
    const r = matchActivities(planned, acts, '2026-11-09');
    assert.equal(r.matches.find((m) => m.planned.id === 'p1')?.activity?.id, 'a1');
    assert.equal(r.matches.find((m) => m.planned.id === 'p2')?.activity?.id, 'a2');
    assert.equal(r.unplanned.length, 0);
  });

  it('o activitate fără antrenament propus rămâne neplanificată (albastru)', () => {
    const r = matchActivities([pw({ id: 'p1' })], [act({ id: 'a1' }), act({ id: 'a2', sport: 'bicicleta', minutes: 60 })], '2026-11-08');
    assert.deepEqual(
      r.unplanned.map((a) => a.id),
      ['a2'],
    );
  });

  it('brick: bicicletă + alergare la ≤ 30 min după', () => {
    const planned = [pw({ id: 'b1', sport: 'bicicleta', type: 'brick', plannedMinutes: 150, key: true })];
    const acts = [act({ id: 'r1', minutes: 25, afterBikeMinutes: 10 }), act({ id: 'k1', sport: 'bicicleta', minutes: 120 })];
    const r = matchActivities(planned, acts, '2026-11-07');
    const m = r.matches[0]!;
    assert.equal(m.activity?.id, 'k1');
    assert.equal(m.extraActivity?.id, 'r1');
    assert.equal(r.unplanned.length, 0);
  });

  it('nu folosește activități din viitor și nu leagă aceeași activitate de două antrenamente', () => {
    const planned = [pw({ id: 'p1' }), pw({ id: 'p2', date: '2026-11-08' })];
    const r = matchActivities(planned, [act({ id: 'a1', date: '2026-11-08' })], '2026-11-08');
    assert.equal(r.matches.filter((m) => m.activity).length, 1);
  });
});
