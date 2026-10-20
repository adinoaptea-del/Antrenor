// „Fire → Furtună → Home”: simularea e deterministă, firele lasă centrul liber, furtuna nu e un vârtej, resortul nu oscilează.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FIRE, FIRE_DT, buildOf, erosionTime, filamentPoint, fireShake, fireTextAlpha, fireContentAlpha, fireSceneOpacity, makeFilaments, makeGrains, makeZones, project, stepGrains, gatherWeight, warpAmp } from '../src/motion/fireStorm.js';

const R = 150;
const C = { x: 200, y: 360 };
const src = (fl: ReturnType<typeof makeFilaments>, g: ReturnType<typeof makeGrains>, t: number) => (i: number): [number, number, number, number] => {
  const f = fl[g.srcF[i]!]!;
  const s = g.srcS[i]!;
  const p = project(filamentPoint(f, s, t, R), C.x, C.y, R);
  const q = project(filamentPoint(f, s + 0.01, t, R), C.x, C.y, R);
  const l = Math.hypot(q.x - p.x, q.y - p.y) || 1;
  return [p.x, p.y, (q.x - p.x) / l, (q.y - p.y) / l];
};
function run(n: number, until: number, target: ((i: number) => [number, number] | null) | null = null) {
  const fl = makeFilaments(7);
  const zones = makeZones(11);
  const g = makeGrains(n, fl, zones, 23);
  for (let out = 0; out <= until; out += FIRE_DT * 1000) stepGrains(g, out, 30 + out / 1000, src(fl, g, 30 + out / 1000), target ?? (() => null));
  return { g, fl };
}

test('16–28 de fire, fiecare o curbă care lasă centrul liber pentru text (la orice moment)', () => {
  const fl = makeFilaments(7);
  assert.ok(fl.length >= 16 && fl.length <= 28);
  for (const t of [0, 3.7, 12, 40]) {
    for (const f of fl) {
      let min = Infinity;
      for (let k = 0; k < 128; k++) {
        const p = project(filamentPoint(f, (k / 128) * Math.PI * 2, t, R), C.x, C.y, R);
        min = Math.min(min, Math.hypot(p.x - C.x, p.y - C.y));
      }
      assert.ok(min >= 0.6 * R, `fir prea aproape de centru: ${(min / R).toFixed(2)}R`);
    }
  }
});

test('formarea: firele se desenează pe lungime, cu porniri decalate, în 1,2 s; textul intră în timpul formării (G03)', () => {
  const fl = makeFilaments(7);
  const starts = fl.map((f) => f.start).sort((a, b) => a - b);
  for (let i = 1; i < starts.length; i++) assert.ok(starts[i]! - starts[i - 1]! <= 110);
  assert.equal(buildOf(fl[0]!, fl[0]!.start).reveal, 0);
  assert.equal(buildOf(fl[0]!, FIRE.build[1]).reveal, 1);
  assert.ok(fl.some((f) => f.outside) && fl.some((f) => !f.outside));
  assert.ok(fl.every((f) => f.start + f.dur <= FIRE.build[1]), 'toate firele sunt formate până la sfârșitul formării');
  // Auditul grafic G03: mesajul începe înainte de finalul formării (~60% din ea) și e lizibil când forma e gata.
  const formed = Math.max(...fl.map((f) => f.start + f.dur));
  assert.ok(fireTextAlpha(FIRE.textIn[0] - 1, null) === 0 && FIRE.textIn[0] >= formed * 0.5 && FIRE.textIn[0] < formed, 'mesajul pornește în timpul formării');
  assert.ok(fireTextAlpha(FIRE.textIn[1], null) === 1 && FIRE.textIn[1] <= FIRE.build[1] && FIRE.ready === FIRE.textIn[1], 'lizibil și „Continuă” la sfârșitul formării');
});

test('ruperea începe din mai multe zone, decalat, și se termină în fereastra ei', () => {
  const zones = makeZones(11);
  assert.ok(zones.length >= 3);
  const times = zones.map((z) => erosionTime(z.c, zones));
  assert.ok(new Set(times.map((x) => Math.round(x / 50))).size >= 3, 'porniri decalate');
  const fl = makeFilaments(7);
  const g = makeGrains(3000, fl, zones);
  for (let i = 0; i < g.n; i++) assert.ok(g.emitAt[i]! >= FIRE.exit.erode[0] - 60 && g.emitAt[i]! <= FIRE.exit.erode[1] + 70);
});

test('determinist: același seed → exact aceleași poziții (fără Math.random pe cadru)', () => {
  const a = run(1500, 1500).g;
  const b = run(1500, 1500).g;
  assert.deepEqual(Array.from(a.x), Array.from(b.x));
  assert.deepEqual(Array.from(a.vy), Array.from(b.vy));
});

test('furtuna nu e un vârtej: fără circulație coerentă în jurul centrului, deplasare oblică dominantă', () => {
  const { g } = run(3000, FIRE.exit.gather[0]);
  let L = 0;
  let norm = 0;
  let mx = 0;
  let my = 0;
  let born = 0;
  for (let i = 0; i < g.n; i++) {
    if (!g.born[i]) continue;
    born++;
    const rx = g.x[i]! - C.x;
    const ry = g.y[i]! - C.y;
    L += rx * g.vy[i]! - ry * g.vx[i]!;
    norm += Math.hypot(rx, ry) * Math.hypot(g.vx[i]!, g.vy[i]!);
    mx += g.vx[i]!;
    my += g.vy[i]!;
  }
  assert.ok(born > 2900);
  assert.ok(Math.abs(L / norm) < 0.25, `circulație în jurul centrului: ${(L / norm).toFixed(2)}`);
  assert.ok(Math.abs(mx) > Math.abs(my) * 0.8, 'rafalele sunt predominant transversale (oblice)');
});

test('colectarea: resort critic amortizat — se apropie fără oscilații ample și se atașează până la predare', () => {
  // O singură granulă, fără vânt: pornește la 100 px de țintă.
  const fl = makeFilaments(7);
  const zones = makeZones(11);
  const g = makeGrains(1, fl, zones);
  g.born[0] = 1;
  g.x[0] = C.x + 100;
  g.y[0] = C.y;
  g.stagger[0] = 0;
  let minX = Infinity;
  for (let out = FIRE.exit.gather[0] + 1100; out < FIRE.exit.handoff; out += FIRE_DT * 1000) {
    // fără vânt: simulăm cu greutate completă (după rampa de captură)
    stepGrains(g, out, 0, () => [0, 0, 0, 0], () => [C.x, C.y]);
    minX = Math.min(minX, g.x[0]!);
  }
  assert.ok(minX > C.x - 5, `depășire ${(C.x - minX).toFixed(1)} px`);
  // Toată furtuna: aproape toate granulele se atașează la ținte până la predare.
  const { g: all } = run(2000, FIRE.exit.handoff, () => [C.x + 40, C.y - 20]);
  let att = 0;
  for (let i = 0; i < all.n; i++) att += all.attached[i]!;
  assert.ok(att / all.n > 0.9, `atașate ${((att / all.n) * 100).toFixed(0)}%`);
  assert.ok(gatherWeight(FIRE.exit.gather[0] - 1, 0) === 0 && gatherWeight(FIRE.exit.gather[0] + 1800, 1) === 1);
});

test('ritmul: shake scurt (1–3 px, 150–250 ms), compresie slabă (2–6 px), textul primul, interfața 0,5–0,8 s', () => {
  const sh = Array.from({ length: 1000 }, (_, i) => Math.hypot(...fireShake(i)));
  const on = sh.map((x, i) => [x, i] as const).filter(([x]) => x > 0.01);
  assert.ok(Math.max(...sh) <= 3 && Math.max(...sh) >= 1);
  assert.ok(on.at(-1)![1] - on[0]![1] <= 250);
  assert.ok(Math.max(...Array.from({ length: 800 }, (_, i) => warpAmp(i))) <= 6);
  assert.equal(fireTextAlpha(5000, FIRE.exit.textOut[1]), 0);
  assert.equal(fireContentAlpha(FIRE.exit.content[0]), 0);
  assert.equal(fireSceneOpacity(FIRE.exit.interface[0]), 1, 'Acasă ascuns până la dezvăluire');
  const ui = FIRE.exit.interface[1] - FIRE.exit.interface[0];
  assert.ok(ui >= 300 && ui <= 800);
  // Auditul grafic G02: fără pauză între text și rupere — ruperea începe cât textul încă se stinge.
  assert.ok(FIRE.exit.erode[0] < FIRE.exit.textOut[1]);
  assert.ok(FIRE.exit.interface[1] <= 2600, 'ieșirea întreagă sub ~2,5 s');
});
