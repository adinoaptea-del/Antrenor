import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isBrickRun, sportReadiness } from '../src/bar/sport-readiness.js';
import type { SourceActivity } from '../src/collector/types.js';

const a = (o: Partial<SourceActivity> & Pick<SourceActivity, 'id' | 'date' | 'sport' | 'minutes'>): SourceActivity => ({ source: 'strava', externalId: o.id, ...o });

describe('pregătit pentru proba de cursă', () => {
  const today = '2026-10-16';
  const acts = [
    a({ id: 'r1', date: '2026-10-11', sport: 'alergare', minutes: 127, distanceKm: 21.4 }),
    a({ id: 'r2', date: '2026-10-14', sport: 'alergare', minutes: 46, distanceKm: 6 }),
    a({ id: 's1', date: '2026-10-12', sport: 'inot', minutes: 30, distanceKm: 0.95 }),
    a({ id: 'b1', date: '2026-10-04', sport: 'bicicleta', minutes: 90, distanceKm: 45, startLocal: '08:00' }),
    a({ id: 'br', date: '2026-10-04', sport: 'alergare', minutes: 25, distanceKm: 4, startLocal: '09:40' }),
    a({ id: 'old', date: '2026-08-01', sport: 'bicicleta', minutes: 300, distanceKm: 120 }),
  ];
  const r = sportReadiness('70.3', acts, today);

  it('alergare: distanța probei acoperită, constanță 3 din 8, brick 4 din 5 km', () => {
    const run = r.find((x) => x.sport === 'alergare')!;
    assert.equal(run.parts[0]!.pct, 100);
    assert.equal(run.parts[1]!.pct, 38);
    assert.equal(run.parts[2]!.pct, 80);
    assert.equal(run.value, Math.round(100 * 0.6 + 38 * 0.2 + 80 * 0.2));
  });

  it('bicicletă: tura de acum 2 luni nu contează; 45 din 90 km', () => {
    const bike = r.find((x) => x.sport === 'bicicleta')!;
    assert.equal(bike.parts[0]!.pct, 50);
    assert.equal(bike.value, Math.round(50 * 0.6 + 13 * 0.4));
  });

  it('înot: distanță și ritm față de timpul-limită de 70 min', () => {
    const swim = r.find((x) => x.sport === 'inot')!;
    assert.equal(swim.parts[0]!.pct, 50);
    assert.equal(swim.parts[2]!.label, 'Ritm față de timpul-limită');
    assert.equal(swim.parts[2]!.pct, 100); // 3:09/100 m e sub 3:41/100 m
  });

  it('fără ședințe cu distanță: null, nu 0', () => {
    const empty = sportReadiness('70.3', [], today);
    assert.ok(empty.every((x) => x.value === null));
  });

  it('semimaraton: doar alergarea', () => {
    assert.deepEqual(sportReadiness('semimaraton', acts, today).map((x) => x.sport), ['alergare']);
  });

  it('brick: alergare pornită la ≤ 30 min după bicicletă', () => {
    assert.equal(isBrickRun(acts[4]!, acts), true);
    assert.equal(isBrickRun(acts[1]!, acts), false);
  });
});

import { overallReady } from '../src/bar/sport-readiness.js';
describe('bara de pe Acasă', () => {
  it('media probelor; o probă fără ședințe trage în jos cu 0', () => {
    assert.equal(overallReady([{ sport: 'inot', leg: '', value: null, parts: [] }, { sport: 'bicicleta', leg: '', value: 40, parts: [] }, { sport: 'alergare', leg: '', value: 80, parts: [] }]), 40);
  });
  it('nicio ședință: 0%, nu „fără date”', () => {
    assert.equal(overallReady([{ sport: 'alergare', leg: '', value: null, parts: [] }]), 0);
  });
});
