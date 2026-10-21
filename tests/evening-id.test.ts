// Răspunsul de seară aparține ședinței, nu unui id de înregistrare (corecția proprietarului, 21.10.2026).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activityIds, eveningForActivity, sameWindow } from '../src/collector/evening.js';
import type { EveningForm } from '../src/collector/types.js';

const ev = (activityId: string): EveningForm => ({ date: '2026-10-21', activityId, rpe: 6, fata_de_asteptari: 'la_fel', durere: { scor: 0, loc: null }, ce_a_incurcat: null, fueling_conform: null, comentariu: null } as unknown as EveningForm);

test('răspunsul dat sub id-ul vechi (WHOOP) rămâne al ședinței după ce înregistrarea Strava devine cea păstrată', () => {
  const byId = { 'whoop-o-1': ev('whoop-o-1') };
  const merged = { id: 'strava-o-9', externalId: '9', mergedIds: ['whoop-o-1', 'strava-o-9'] };
  assert.deepEqual(activityIds(merged), ['strava-o-9', '9', 'whoop-o-1']);
  assert.equal(eveningForActivity(merged, byId)?.activityId, 'whoop-o-1');
  assert.equal(eveningForActivity({ id: 'strava-o-9', externalId: '9' }, { '9': ev('9') })?.activityId, '9', 'și sub id-ul extern');
  assert.equal(eveningForActivity({ id: 'strava-o-9' }, byId), undefined);
});

test('a doua înregistrare a aceleiași ședințe (suprapusă în timp) nu mai cere alt răspuns; două ședințe reale la ore diferite da', () => {
  const ride = { id: 'a', date: '2026-10-21', sport: 'bicicleta', minutes: 110, startLocal: '08:00' };
  const whoopSame = { id: 'b', date: '2026-10-21', sport: 'bicicleta', minutes: 95, startLocal: '08:10' };
  const evening = { id: 'c', date: '2026-10-21', sport: 'bicicleta', minutes: 40, startLocal: '18:00' };
  assert.equal(sameWindow(ride, whoopSame), true);
  assert.equal(sameWindow(ride, evening), false);
  assert.equal(sameWindow(ride, { ...ride, id: 'd', sport: 'inot' }), false);
  assert.equal(sameWindow(ride, { ...ride, id: 'e', date: '2026-10-20' }), false);
  // Fără ore de start: aceeași durată (±10 min) = aceeași ședință.
  assert.equal(sameWindow({ id: 'x', date: '2026-10-21', sport: 'alergare', minutes: 50 }, { id: 'y', date: '2026-10-21', sport: 'alergare', minutes: 56 }), true);
  assert.equal(sameWindow({ id: 'x', date: '2026-10-21', sport: 'alergare', minutes: 50 }, { id: 'y', date: '2026-10-21', sport: 'alergare', minutes: 80 }), false);
});
