// Wordmark-ul AIRON și intro-ul „wordmark → fire → bulă” (ghidul vizual-tehnic, 21.10.2026): litere vector geometrice,
// fiecare fir al sferei e o bucată de literă, toate ajung pe sferă la 3.300 ms, mesajul apare abia după aceea.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FIRE, makeFilaments } from '../src/motion/fireStorm.js';
import {
  WM,
  WORDMARK_W,
  introAmbient,
  introArc,
  introBlend,
  introDelay,
  introPhase,
  introTextAlpha,
  introWobble,
  polylineAt,
  wordmarkAlpha,
  wordmarkBoxes,
  wordmarkChunkLengths,
  wordmarkChunks,
  wordmarkFit,
  wordmarkPaths,
  wordmarkPolylines,
  wordmarkSamples,
  wordmarkStrokes,
} from '../src/motion/wordmark.js';

const h = WM.stroke / 2;
const EPS = 1e-6;

test('literele A I R O N, în ordine, cu spații egale; tușele stau în cutia literei (marginea exterioară atinge cutia)', () => {
  const boxes = wordmarkBoxes();
  assert.deepEqual(
    boxes.map((b) => b.letter),
    ['A', 'I', 'R', 'O', 'N'],
  );
  for (let i = 1; i < boxes.length; i++) assert.ok(Math.abs(boxes[i]!.x - (boxes[i - 1]!.x + boxes[i - 1]!.w) - WM.gap) < EPS, 'spațiu egal între litere');
  assert.ok(Math.abs(WORDMARK_W - (boxes[4]!.x + boxes[4]!.w)) < EPS);
  assert.ok(WORDMARK_W > 4.3 && WORDMARK_W < 4.8, `lățimea ${WORDMARK_W.toFixed(2)} H`);
  for (const p of wordmarkPolylines()) {
    const b = boxes.find((x) => x.letter === p.letter)!;
    for (const [x, y] of p.pts) {
      assert.ok(x >= b.x + h - EPS && x <= b.x + b.w - h + EPS, `${p.letter}: x=${x.toFixed(3)} iese din cutie`);
      assert.ok(y >= h - EPS && y <= 1 - h + EPS, `${p.letter}: y=${y.toFixed(3)} iese din cutie`);
    }
  }
  // O e cerc adevărat (nu zero, nu elipsă îngustă), închis; I e un singur trunchi vertical.
  const o = wordmarkPolylines().find((p) => p.letter === 'O')!;
  const ob = boxes.find((b) => b.letter === 'O')!;
  const [cxO, cyO] = [ob.x + ob.w / 2, 0.5];
  const r = Math.hypot(o.pts[0]![0] - cxO, o.pts[0]![1] - cyO);
  for (const [x, y] of o.pts) assert.ok(Math.abs(Math.hypot(x - cxO, y - cyO) - r) < 1e-6, 'O nu e cerc');
  assert.ok(Math.abs(o.pts[0]![0] - o.pts[o.pts.length - 1]![0]) < EPS && Math.abs(o.pts[0]![1] - o.pts[o.pts.length - 1]![1]) < EPS, 'O e închis');
  assert.ok(Math.abs(2 * r - (1 - 2 * h)) < EPS, 'O are înălțimea majusculei');
  const iStrokes = wordmarkStrokes().filter((s) => s.letter === 'I');
  assert.equal(iStrokes.length, 1);
  assert.equal(iStrokes[0]!.segs.length, 1);
  assert.ok(iStrokes[0]!.segs[0]!.kind === 'L' && Math.abs(iStrokes[0]!.segs[0]!.to[0] - iStrokes[0]!.from[0]) < EPS, 'I e vertical');
});

test('căile SVG: o cale pe literă, doar M/L/A, O din două arce; aceeași geometrie ca poliliniile', () => {
  const paths = wordmarkPaths();
  assert.deepEqual(
    paths.map((p) => p.letter),
    ['A', 'I', 'R', 'O', 'N'],
  );
  for (const p of paths) {
    assert.ok(p.d.startsWith('M'));
    assert.ok(!/[^MLA0-9 .\-]/.test(p.d), `comenzi neașteptate în ${p.letter}: ${p.d}`);
  }
  assert.equal((paths.find((p) => p.letter === 'O')!.d.match(/A/g) ?? []).length, 2);
  // Capetele segmentelor drepte din SVG coincid cu punctele poliliniei (scara 100).
  const n = wordmarkPolylines().find((p) => p.letter === 'N')!;
  const d = paths.find((p) => p.letter === 'N')!.d;
  for (const [x, y] of n.pts) assert.ok(d.includes(`${Math.round(x * 100 * 1000) / 1000} ${Math.round(y * 100 * 1000) / 1000}`), `punctul N (${x},${y}) lipsește din cale`);
});

test('așezarea: ~64% din lățime (60–68%, la 390 px ≈ 234–265 px), centrat pe centrul sferei; pe ecrane late nu iese din sferă', () => {
  const f = wordmarkFit(390, 195, 380, 152);
  assert.ok(f.W >= 234 && f.W <= 265, `lățimea ${f.W.toFixed(0)} px`);
  assert.ok(Math.abs(f.x0 + f.W / 2 - 195) < EPS && Math.abs(f.y0 + f.H / 2 - 380) < EPS, 'centrul optic = centrul sferei');
  assert.ok(f.H >= 40 && f.H * WM.stroke >= 6, `litere de ${f.H.toFixed(0)} px, tușă ${(f.H * WM.stroke).toFixed(1)} px`);
  const wide = wordmarkFit(1280, 640, 400, 186);
  assert.ok(wide.W <= 2 * 186 * 0.86 + EPS, 'pe ecran lat cuvântul rămâne în centrul liber al sferei');
  const small = wordmarkFit(320, 160, 320, 125);
  assert.ok(small.W >= 320 * 0.6 - EPS && small.W <= 320 * 0.68 + EPS);
});

test('fiecare din cele 22 de fire e o bucată de literă: nicio bucată nu sare de la o tușă la alta, toate tușele sunt acoperite complet, determinist', () => {
  const n = makeFilaments().length;
  const polys = wordmarkPolylines();
  const chunks = wordmarkChunks(n, polys);
  assert.equal(chunks.length, n);
  assert.deepEqual(chunks, wordmarkChunks(n, wordmarkPolylines()));
  for (let i = 0; i < polys.length; i++) {
    const mine = chunks.filter((c) => c.stroke === i).sort((a, b) => a.from - b.from);
    assert.ok(mine.length >= 1, `tușa ${i} (${polys[i]!.letter}) fără fir`);
    assert.ok(Math.abs(mine[0]!.from) < EPS && Math.abs(mine[mine.length - 1]!.to - polys[i]!.length) < EPS, 'tușa e acoperită cap-coadă');
    for (let k = 1; k < mine.length; k++) assert.ok(Math.abs(mine[k]!.from - mine[k - 1]!.to) < EPS, 'bucăți lipite, fără goluri');
    for (const c of mine) assert.ok(c.to > c.from && c.letter === polys[i]!.letter);
  }
  // Eșantioanele: uniforme pe lungime, fără salturi (un salt ar desena o linie străină peste cuvânt).
  const S = wordmarkSamples(n, 96);
  const len = wordmarkChunkLengths(n);
  assert.equal(S.length, n);
  for (let k = 0; k < n; k++) {
    const s = S[k]!;
    const step = len[k]! / 96;
    for (let j = 1; j <= 96; j++) {
      const d = Math.hypot(s[2 * j]! - s[2 * j - 2]!, s[2 * j + 1]! - s[2 * j - 1]!);
      assert.ok(d <= step * 1.001 + EPS, `fir ${k}, eșantion ${j}: pas ${d.toFixed(4)} > ${step.toFixed(4)}`);
    }
  }
  // polylineAt: capetele și mijlocul.
  const p = polys[2]!; // I
  assert.deepEqual(polylineAt(p, 0), p.pts[0]);
  const end = polylineAt(p, p.length);
  assert.ok(Math.abs(end[0] - p.pts[p.pts.length - 1]![0]) < EPS && Math.abs(end[1] - p.pts[p.pts.length - 1]![1]) < EPS);
});

test('cronologia: AIRON apare 0–0,3 s și stă până la 1,5 s; toate firele ajung pe sferă la 3,3 s oricare ar fi întârzierea; stilul o ia înaintea poziției', () => {
  assert.equal(wordmarkAlpha(0), 0);
  assert.equal(wordmarkAlpha(WM.in[1]), 1);
  assert.equal(wordmarkAlpha(1400), 1);
  const n = 22;
  for (let k = 0; k < n; k++) {
    const d = introDelay(k, n);
    assert.ok(d >= 0 && d < 1000, `întârzierea ${d}`);
    assert.equal(introDelay(k, n), d, 'determinist');
    const at0 = introBlend(WM.morph[0] + d, d);
    assert.equal(at0.s, 0);
    assert.equal(at0.a, 0);
    assert.equal(at0.style, 0);
    assert.equal(introBlend(WM.morph[0] + d - 1, d).s, 0, 'înainte de întârziere stă pe literă');
    const end = introBlend(WM.morph[1], d);
    assert.equal(end.s, 1);
    assert.equal(end.a, 0);
    assert.equal(end.style, 1);
    let prev = 0;
    for (let T = WM.morph[0] + d; T <= WM.morph[1]; T += 10) {
      const b = introBlend(T, d);
      assert.ok(b.s >= prev - EPS && b.s >= 0 && b.s <= 1, 'poziția avansează monoton');
      assert.ok(b.a >= 0 && b.a <= 1 && b.style >= b.s - EPS, 'stilul e mereu cel puțin cât poziția');
      prev = b.s;
    }
  }
  // Întârzierile cresc, în mare, de la stânga la dreapta (A pleacă înaintea lui N).
  const ds = Array.from({ length: n }, (_, k) => introDelay(k, n));
  const first = ds.slice(0, 5).reduce((a, b) => a + b, 0) / 5;
  const last = ds.slice(-5).reduce((a, b) => a + b, 0) / 5;
  assert.ok(last > first + 200, 'firele din dreapta pleacă mai târziu');
  // Anvelopa abaterii: maximă la jumătatea drumului, zero la capete; abaterea nu depinde de centru (fără câmp comun).
  const mid = introBlend(WM.morph[0] + (WM.morph[1] - WM.morph[0]) / 2, 0);
  assert.ok(mid.a > 0.99 && mid.s > 0.49 && mid.s < 0.51);
  const w1 = introWobble(2000, 3, 0.2);
  const w2 = introWobble(2000, 9, 0.2);
  assert.ok(Math.abs(w1[0]) <= 1 && Math.abs(w1[1]) <= 1 && (w1[0] !== w2[0] || w1[1] !== w2[1]), 'unduire proprie fiecărui fir');
  // Arcul desfășurat: la început doar bucata de literă, la final tot cercul.
  assert.ok(Math.abs(introArc(0, 30, 900) - 30 / 900) < EPS && introArc(1, 30, 900) === 1 && introArc(0.5, 30, 900) > 0.5);
});

test('predarea fără cadru gol: la 3.300 ms ceasul intern e exact sfârșitul formării; mesajul și „Continuă” vin după (3,3–3,7 s), nu peste litere', () => {
  assert.equal(WM.morph[1] - WM.offset, FIRE.build[1]);
  const formed = Math.max(...makeFilaments().map((f) => f.start + f.dur));
  assert.ok(formed <= FIRE.build[1], 'toate firele sunt formate când se predă');
  assert.ok(WM.ready - WM.offset >= FIRE.ready, '„Continuă” nu înainte de lizibilitatea mesajului');
  assert.equal(introTextAlpha(WM.morph[1]), 0);
  assert.equal(introTextAlpha(WM.reveal[1]), 1);
  for (let T = 0; T <= WM.morph[1]; T += 50) assert.equal(introTextAlpha(T), 0, 'mesajul nu se suprapune cu literele');
  assert.equal(introAmbient(WM.morph[0]), 0);
  assert.equal(introAmbient(WM.morph[1]), 1);
  assert.equal(WM.reveal[0], WM.morph[1]);
  assert.equal(WM.hold[1], WM.morph[0]);
  assert.equal(WM.in[1], WM.hold[0]);
});

test('fazele intro-ului, în ordine, și ieșirea existentă după „Continuă”', () => {
  assert.equal(introPhase(0, null), 'wordmark_in');
  assert.equal(introPhase(299, null), 'wordmark_in');
  assert.equal(introPhase(300, null), 'wordmark_hold');
  assert.equal(introPhase(1499, null), 'wordmark_hold');
  assert.equal(introPhase(1500, null), 'wordmark_to_orb');
  assert.equal(introPhase(3299, null), 'wordmark_to_orb');
  assert.equal(introPhase(3300, null), 'welcome_reveal');
  assert.equal(introPhase(3699, null), 'welcome_reveal');
  assert.equal(introPhase(3700, null), 'welcome_idle');
  assert.equal(introPhase(9000, null), 'welcome_idle');
  assert.equal(introPhase(9000, 0), 'existing_exit');
  assert.equal(WM.bg, '#061010');
  assert.equal(WM.ink, '#EAF2E7');
});
