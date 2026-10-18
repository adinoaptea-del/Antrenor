import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { historySummary } from '../src/history/summary.js';

describe('istoricul pentru antrenor', () => {
  it('lunile, cele mai lungi, ritmurile, cursele, pauzele', () => {
    const acts = [
      { id: 'a', date: '2026-03-15', sport: 'alergare' as const, minutes: 120, distanceKm: 21.1, name: 'Semimaratonul București' },
      { id: 'b', date: '2026-03-20', sport: 'alergare' as const, minutes: 55, distanceKm: 10 },
      { id: 'c', date: '2026-05-01', sport: 'bicicleta' as const, minutes: 180, distanceKm: 75 },
      { id: 'd', date: '2026-10-11', sport: 'alergare' as const, minutes: 127, distanceKm: 21.4 },
    ];
    const h = historySummary('2026-10-18', acts);
    assert.equal(h.de_la, '2026-03-15');
    assert.equal(h.curse.length, 1);
    assert.equal(h.cele_mai_lungi.find((x) => x.sport === 'bicicleta')!.km, 75);
    assert.equal(h.cele_mai_bune_ritmuri.find((x) => x.distanta_min_km === 10)!.ritm_min_km, 5.5);
    assert.ok(h.pauze.some((p) => p.de_la === '2026-05-01' && p.zile === 163));
  });
});
