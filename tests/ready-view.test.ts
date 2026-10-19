import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readyView } from '../src/bar/ready-view.js';

const base = { onTrack: null, benchmarks: [], estimate: null, target: null, weakest: null };
test('complet: indicele întreg', () => {
  const v = readyView({ ...base, ready: 40, coverage: { withData: 3, total: 3, missing: [] }, links: [] } as never);
  assert.deepEqual([v.pct, v.partial], [40, false]);
});
test('o probă fără date: parțial pe probele măsurate, cu proba lipsă numită', () => {
  const v = readyView({ ...base, ready: null, coverage: { withData: 2, total: 3, missing: ['Înot'] }, links: [{ name: 'Înot', pct: null }, { name: 'Bicicletă', pct: 61 }, { name: 'Alergare', pct: 74 }, { name: 'Cumul', pct: 50 }] } as never);
  assert.deepEqual([v.pct, v.partial, v.missing], [50, true, ['Înot']]);
});
test('nicio probă cu date: fără cifră', () => {
  assert.equal(readyView({ ...base, ready: null, coverage: { withData: 0, total: 3, missing: ['Înot', 'Bicicletă', 'Alergare'] }, links: [{ name: 'Înot', pct: null }] } as never).pct, null);
});
