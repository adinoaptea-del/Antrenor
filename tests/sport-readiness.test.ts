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

  it('alergare: 70% cea mai lungă (21,4 din 21,1), 30% după bicicletă (4 din 8 km)', () => {
    const run = r.find((x) => x.sport === 'alergare')!;
    assert.equal(run.parts[0]!.pct, 100);
    assert.equal(run.parts[1]!.pct, 50);
    assert.equal(run.value, 85);
  });

  it('bicicletă: tura de acum 2 luni nu contează; 45 din 90 km = 50%, frecvența nu dă puncte', () => {
    const bike = r.find((x) => x.sport === 'bicicleta')!;
    assert.equal(bike.value, 50);
  });

  it('înot fără ture măsurate: 0%, „nemăsurat” — totalul ședinței cu pauze NU contează', () => {
    const swim = r.find((x) => x.sport === 'inot')!;
    assert.equal(swim.value, 0);
    assert.equal(swim.parts[0]!.have, 'nemăsurat');
  });

  it('înot: doar porțiunea fără oprire (75 m din 650 m totali) → 4%', () => {
    const s = sportReadiness('70.3', [a({ id: 'sw', date: '2026-10-14', sport: 'inot', minutes: 30, distanceKm: 0.65, details: { continuousM: 75, continuousPace100mSec: 82 } })], today);
    assert.equal(s.find((x) => x.sport === 'inot')!.value, 4);
  });

  it('înot: distanța acoperită dar peste timpul-limită → cel mult 90%', () => {
    const s = sportReadiness('70.3', [a({ id: 'sw', date: '2026-10-14', sport: 'inot', minutes: 80, distanceKm: 2, details: { continuousM: 2000, continuousPace100mSec: 240 } })], today);
    assert.equal(s.find((x) => x.sport === 'inot')!.value, 90);
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
