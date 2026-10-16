import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { declaredSwimM, isBrickRun, overallReady, sportReadiness } from '../src/bar/sport-readiness.js';
import type { SourceActivity } from '../src/collector/types.js';

const a = (o: Partial<SourceActivity> & Pick<SourceActivity, 'id' | 'date' | 'sport' | 'minutes'>): SourceActivity => ({ source: 'strava', externalId: o.id, ...o });
const today = '2026-10-16';
const part = (r: ReturnType<typeof sportReadiness>[number], label: RegExp) => r.parts.find((p) => label.test(p.label))!;

// Cazul real (Cuza, 6 săpt.): înot cu pauze, 75 m maxim fără oprire; 21,4 km alergare; fără bicicletă.
const cuza = [
  a({ id: 's1', date: '2026-10-14', sport: 'inot', minutes: 30, distanceKm: 0.65, details: { continuousM: 75, continuousPace100mSec: 82 } }),
  a({ id: 's2', date: '2026-10-13', sport: 'inot', minutes: 54, distanceKm: 0.45, details: { continuousM: 50 } }),
  a({ id: 's3', date: '2026-10-12', sport: 'inot', minutes: 50, distanceKm: 0.45, details: { continuousM: 50 } }),
  a({ id: 's4', date: '2026-10-09', sport: 'inot', minutes: 36, distanceKm: 0.425, details: { continuousM: 50 } }),
  a({ id: 'r1', date: '2026-10-11', sport: 'alergare', minutes: 127, distanceKm: 21.4 }),
  a({ id: 'r2', date: '2026-10-14', sport: 'alergare', minutes: 46, distanceKm: 6 }),
  a({ id: 'r3', date: '2026-10-08', sport: 'alergare', minutes: 42, distanceKm: 6 }),
  a({ id: 'r4', date: '2026-10-01', sport: 'alergare', minutes: 49, distanceKm: 6.1 }),
  a({ id: 'r5', date: '2026-09-23', sport: 'alergare', minutes: 61, distanceKm: 10 }),
];

describe('pregătirea pe probă — algoritmul', () => {
  const r = sportReadiness('70.3', cuza, today, { swimContinuousM: 50 });
  it('înot: 75 m fără oprire măsurat bate declarația; rezultat mic, cum e realitatea', () => {
    const s = r.find((x) => x.sport === 'inot')!;
    assert.equal(part(s, /fără oprire/).source, 'masurat');
    assert.equal(part(s, /fără oprire/).pct, 4);
    assert.ok(s.value! <= 8, `înot ${s.value}`);
  });
  it('alergare: distanța acoperită, volum 49,5/4 km pe săpt. față de 31,7, fără brick', () => {
    const run = r.find((x) => x.sport === 'alergare')!;
    assert.equal(part(run, /lungă/).pct, 100);
    assert.equal(part(run, /Volum/).pct, Math.round((49.5 / 4 / 31.65) * 100));
    assert.equal(part(run, /după bicicletă/).pct, 0);
  });
  it('bicicletă fără nicio tură: null (nedemonstrat), iar media cursei o numără 0', () => {
    assert.equal(r.find((x) => x.sport === 'bicicleta')!.value, null);
    assert.ok(overallReady(r)! < 35);
  });
  it('fără ture de la ceas (Apple Health): se folosește ce a declarat, marcat „declarat”, nu 0', () => {
    const marius = sportReadiness('70.3', [a({ id: 'm', source: 'apple', date: '2026-10-10', sport: 'inot', minutes: 45, distanceKm: 1.6 })], today, { swimContinuousM: 400 });
    const s = marius.find((x) => x.sport === 'inot')!;
    assert.equal(part(s, /fără oprire/).source, 'declarat');
    assert.equal(part(s, /fără oprire/).pct, 21);
    assert.ok(s.value! > 0);
  });
  it('ritmul la înot nu dă puncte peste distanța pe care o poți acoperi', () => {
    const s = r.find((x) => x.sport === 'inot')!;
    assert.ok(part(s, /Ritm/).pct <= 5);
  });
  it('declarația din chestionar → metri', () => {
    assert.equal(declaredSwimM('bazin_scurt'), 50);
    assert.equal(declaredSwimM('nu_stiu'), 0);
    assert.equal(declaredSwimM(null, true), 400);
  });
  it('semimaraton: doar alergarea; specificul trece în rezistență', () => {
    const s = sportReadiness('semimaraton', cuza, today);
    assert.deepEqual(s.map((x) => x.sport), ['alergare']);
    assert.equal(part(s[0]!, /lungă/).weight, 0.75);
  });
  it('brick: alergare pornită la ≤ 30 min după bicicletă', () => {
    const b = a({ id: 'b', date: '2026-10-04', sport: 'bicicleta', minutes: 90, distanceKm: 45, startLocal: '08:00' });
    const br = a({ id: 'br', date: '2026-10-04', sport: 'alergare', minutes: 25, distanceKm: 4, startLocal: '09:40' });
    assert.equal(isBrickRun(br, [b, br]), true);
  });
});
