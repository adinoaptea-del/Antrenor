// Auditul grafic (G05–G07): felicitările strânse într-un singur mesaj, tubul ajunge la valoare în ~350 ms.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FILL_MS, fillTween } from '../src/motion/meniscus.js';

test('G07: tubul ajunge exact la țintă în 250–400 ms, monoton, fără depășire', () => {
  assert.ok(FILL_MS >= 250 && FILL_MS <= 400);
  assert.equal(fillTween(0, 1, FILL_MS), 1);
  assert.equal(fillTween(0.2, 0.6, 0), 0.2);
  let prev = 0;
  for (let ms = 0; ms <= FILL_MS; ms += 10) {
    const v = fillTween(0, 1, ms);
    assert.ok(v >= prev && v <= 1);
    prev = v;
  }
  // La jumătatea timpului e deja peste 80%: eticheta și lichidul nu se contrazic vizibil.
  assert.ok(fillTween(0, 1, FILL_MS / 2) > 0.8);
  // 0% rămâne 0 (fără lichid).
  assert.equal(fillTween(0, 0, 100), 0);
});

test('G06: mai multe felicitări = un singur mesaj, textul celei mai recente, toate marcate', async () => {
  const { aggregateCheers, cheerKicker } = await import('../src/cheers.js');
  assert.equal(aggregateCheers([]), null);
  const a = aggregateCheers([
    { w: { id: 'azi' }, c: { text: 'Bravo azi' } },
    { w: { id: 'ieri' }, c: { text: 'Bravo ieri' } },
  ]);
  assert.deepEqual(a, { ids: ['azi', 'ieri'], text: 'Bravo azi', n: 2 });
  assert.equal(cheerKicker(1), 'Antrenament finalizat');
  assert.equal(cheerKicker(2), '2 antrenamente finalizate');
});
