import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decideReplan } from '../src/calendar/reevaluate.js';

test('import care schimbă doza: planul se reface de la luni, cu cifrele în mesaj', () => {
  const d = decideReplan({ currentWeekH: 2.5, proposedWeekH: 4, historyH: [4.5, 4, 3.8], from: 'luni, 26.10' });
  assert.equal(d.apply, true);
  assert.match(d.message, /4 h în loc de 2,5 h/);
  assert.match(d.message, /Săptămâna asta rămâne/);
});

test('diferență mică: planul rămâne, cu motivul', () => {
  const d = decideReplan({ currentWeekH: 4, proposedWeekH: 4.3, historyH: [4], from: 'luni, 26.10' });
  assert.equal(d.apply, false);
  assert.match(d.message, /Planul rămâne/);
});

test('fără plan activ: se face', () => {
  assert.equal(decideReplan({ currentWeekH: null, proposedWeekH: 3, historyH: [], from: 'luni, 26.10' }).apply, true);
});
