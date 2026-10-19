import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WORKOUT_LIBRARY } from '../src/knowledge/workouts.js';
import { CONTRACTS } from '../src/knowledge/contracts.js';

test('fiecare modul din bibliotecă are fișă: dovadă, populație, eligibilitate, alternativă, evaluare', () => {
  const missing = WORKOUT_LIBRARY.filter((w) => !CONTRACTS[w.id]).map((w) => w.id);
  assert.deepEqual(missing, []);
  for (const [id, k] of Object.entries(CONTRACTS)) {
    assert.ok(WORKOUT_LIBRARY.some((w) => w.id === id), `fișă fără modul: ${id}`);
    assert.ok(k.populatie && k.eligibil && k.alternativa && k.evaluare, id);
  }
});
