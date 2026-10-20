// Dizolvarea spre Acasă: rapidă, completă, praful ajunge în bulă.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DISSOLVE, DISSOLVE_TOTAL_MS, grainAt, makeGrains, threshold } from '../src/motion/dissolve.js';

test('dizolvarea e rapidă (sub 1,1 s) și fiecare punct se desprinde în fereastra de eroziune', () => {
  assert.ok(DISSOLVE_TOTAL_MS <= 1100);
  for (let i = 0; i < 500; i++) {
    const t = threshold(Math.random(), Math.random(), i);
    assert.ok(t >= 0 && t <= 1);
  }
});

test('granulele pleacă din ecran, ajung la bulă și se sting; nicio granulă nu rămâne după final', () => {
  const W = 400, H = 850;
  const target = { cx: 200, cy: 340, r: 120 };
  const g = makeGrains(3000, W, H, target);
  let near = 0;
  for (let i = 0; i < g.n; i++) {
    assert.equal(grainAt(g, i, g.born[i]! - 1), null, 'înainte de desprindere stă pe ecran');
    assert.equal(grainAt(g, i, DISSOLVE_TOTAL_MS + 1), null, 'după final nu mai există');
    const p = grainAt(g, i, g.born[i]! + g.life[i]! * 0.97);
    if (p && Math.hypot(p.x - target.cx, p.y - target.cy) <= target.r * 1.25) near++;
  }
  assert.ok(near / g.n > 0.9, `${near}/${g.n} la bulă`);
  assert.ok(Math.max(...g.born) <= DISSOLVE.erode);
});
