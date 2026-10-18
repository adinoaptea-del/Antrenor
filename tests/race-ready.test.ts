import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { raceReady } from '../src/bar/race-ready.js';
import type { SourceActivity } from '../src/collector/types.js';

const A = (o: Partial<SourceActivity> & { id: string; date: string; sport: SourceActivity['sport']; minutes: number }): SourceActivity => ({ source: 'strava', externalId: o.id, ...o }) as SourceActivity;

describe('gata de cursă: cea mai slabă verigă', () => {
  // Ca la Cuza în octombrie: alergare multă, înot scurt cu pauze, fără bicicletă.
  const acts = [
    A({ id: 'r1', date: '2026-10-11', sport: 'alergare', minutes: 127, distanceKm: 21.4 }),
    A({ id: 'r2', date: '2026-10-17', sport: 'alergare', minutes: 229, distanceKm: 21.3 }),
    A({ id: 's1', date: '2026-10-14', sport: 'inot', minutes: 30, distanceKm: 0.65 }),
    A({ id: 's2', date: '2026-10-13', sport: 'inot', minutes: 54, distanceKm: 0.45 }),
  ];
  const r = raceReady({ goal: '70.3', today: '2026-10-18', acts, plan: [], fueledDates: [] });
  it('alergarea nu ascunde bicicleta lipsă: veriga slabă decide', () => {
    assert.equal(r.links.find((l) => l.name === 'Alergare')!.pct, 100);
    assert.equal(r.weakest, 'Bicicletă');
    assert.equal(r.ready, 0);
  });
  it('ședințe-reper: alergarea lungă trecută, restul nu', () => {
    assert.equal(r.benchmarks.find((b) => b.id === 'alergare-lunga')!.done, true);
    assert.equal(r.benchmarks.find((b) => b.id === 'tura-lunga')!.done, false);
    assert.equal(r.benchmarks.find((b) => b.id === 'inot-continuu')!.done, false);
  });
  it('fără bicicletă nu se estimează timpul total (nu ghicim)', () => {
    assert.equal(r.estimate?.total, null);
  });
  it('cu toate ritmurile: estimare cu marjă și ipoteze scrise', () => {
    const more = [...acts, A({ id: 'b1', date: '2026-10-05', sport: 'bicicleta', minutes: 180, distanceKm: 75 }), A({ id: 's3', date: '2026-10-06', sport: 'inot', minutes: 50, distanceKm: 2, details: { continuousM: 2000, continuousPace100mSec: 140 } as never })];
    const e = raceReady({ goal: '70.3', today: '2026-10-18', acts: more, plan: [], fueledDates: [] }).estimate!;
    assert.ok(e.total && e.low! < e.total && e.high! > e.total);
    assert.ok(e.assumptions.some((x) => /\+10%/.test(x)));
  });
});
