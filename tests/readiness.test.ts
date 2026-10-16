import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { dayVerdict, objectiveReadiness } from '../src/collector/readiness.js';

describe('starea zilei: întâi datele obiective, apoi cum s-a simțit', () => {
  const good = { hrv: 62, hrvBaseline: 60, rhr: 50, rhrBaseline: 51, resp: 14.2, respBaseline: 14, recovery: 78, sleepMin: 460 };

  it('date bune = verde; Hooper bun nu schimbă', () => {
    const o = objectiveReadiness(good);
    assert.equal(o.verdict, 'verde');
    assert.equal(dayVerdict(o, 12).verdict, 'verde');
  });

  it('respirația crescută și pulsul mare trag media în jos: 30–50 = portocaliu, sub 30 = roșu', () => {
    const o = objectiveReadiness({ ...good, resp: 16.5, rhr: 58, hrv: 48, recovery: 35 });
    assert.equal(o.verdict, 'portocaliu');
    const r = objectiveReadiness({ ...good, resp: 16.5, rhr: 60, hrv: 40, recovery: 20, sleepMin: 300 });
    assert.equal(r.verdict, 'rosu');
  });

  it('Hooper doar coboară: date verzi + Hooper 21 = galben; date roșii + Hooper bun rămân roșii', () => {
    assert.equal(dayVerdict(objectiveReadiness(good), 21).verdict, 'galben');
    const bad = objectiveReadiness({ ...good, resp: 16.5, hrv: 40, rhr: 60, recovery: 20, sleepMin: 300 });
    assert.equal(dayVerdict(bad, 8).verdict, 'rosu');
  });

  it('fără date de la brățări: cel mult galben', () => {
    const none = objectiveReadiness({ hrv: null, hrvBaseline: null, rhr: null, rhrBaseline: null, resp: null, respBaseline: null, recovery: null, sleepMin: null });
    assert.equal(dayVerdict(none, 8).verdict, 'galben');
  });
});

import { hooperSum } from '../src/collector/readiness.js';
describe('chestionarul de dimineață parțial', () => {
  it('contează și cu răspunsuri lipsă: media × 4', () => {
    assert.deepEqual(hooperSum({ somn: 6, oboseala: 6, stres: null, dureri: null }), { suma: 24, raspunse: 2 });
    assert.deepEqual(hooperSum({ somn: null, oboseala: null, stres: null, dureri: null }), { suma: null, raspunse: 0 });
    assert.deepEqual(hooperSum({ somn: 2, oboseala: 3, stres: 2, dureri: 1 }), { suma: 8, raspunse: 4 });
  });
});
