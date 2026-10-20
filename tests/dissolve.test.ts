// Dizolvarea spre Acasă (aceeași idee ca ieșirea din întâmpinare): ruperea din 4 zone, praful ajunge în bulă, rapid.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DISSOLVE, DISSOLVE_TOTAL_MS, dissolveZones, erosionAt, grainLook, makeDGrains, stepDGrains } from '../src/motion/dissolve.js';

test('ruperea pornește din 4 zone și se termină în fereastra de eroziune; totul sub 1,5 s', () => {
  const z = dissolveZones(7);
  assert.equal(z.length, 4);
  for (let i = 0; i < 400; i++) {
    const t = erosionAt(Math.random(), Math.random(), 0.46, z, 0);
    assert.ok(t >= 0 && t <= DISSOLVE.erode);
  }
  assert.ok(erosionAt(z[0]!.u, z[0]!.v, 0.46, z, 0) < 30, 'prima zonă se rupe imediat');
  assert.ok(DISSOLVE_TOTAL_MS <= 1500);
});

test('praful pleacă din ecran cu culoarea lui, ajunge în bulă și se stinge', () => {
  const cells = Array.from({ length: 2000 }, (_, i) => ({ x: (i * 37) % 390, y: (i * 53) % 844, r: 230, g: 235, b: 240, t: (i % 50) * 10 }));
  const target = { cx: 195, cy: 300, r: 90 };
  const G = makeDGrains(cells, target);
  let t = 0;
  let firstLook: { r: number } | null = null;
  while (t < DISSOLVE_TOTAL_MS) {
    t += 1000 / 60;
    stepDGrains(G, t);
    if (!firstLook && G.alive[0]) firstLook = grainLook(G, 0, t);
  }
  assert.ok(firstLook && firstLook.r > 200, 'la rupere are culoarea bucății de ecran');
  let near = 0;
  for (let i = 0; i < G.n; i++) if (Math.hypot(G.x[i]! - target.cx, G.y[i]! - target.cy) <= target.r * 1.3) near++;
  assert.ok(near / G.n > 0.9, `${near}/${G.n} în bulă`);
  for (let i = 0; i < G.n; i++) assert.equal(grainLook(G, i, t + 1), null, 'stins la final');
});
