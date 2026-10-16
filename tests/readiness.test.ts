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

  it('respirația crescută și pulsul mare trag media în jos', () => {
    const o = objectiveReadiness({ ...good, resp: 16.5, rhr: 58, hrv: 48, recovery: 35 });
    assert.equal(o.verdict, 'rosu');
  });

  it('Hooper doar coboară: date verzi + Hooper 22 = galben; date roșii + Hooper bun rămân roșii', () => {
    assert.equal(dayVerdict(objectiveReadiness(good), 22).verdict, 'galben');
    const bad = objectiveReadiness({ ...good, hrv: 40, rhr: 60, recovery: 20 });
    assert.equal(dayVerdict(bad, 8).verdict, 'rosu');
  });

  it('fără date de la brățări: cel mult galben', () => {
    const none = objectiveReadiness({ hrv: null, hrvBaseline: null, rhr: null, rhrBaseline: null, resp: null, respBaseline: null, recovery: null, sleepMin: null });
    assert.equal(dayVerdict(none, 8).verdict, 'galben');
  });
});
