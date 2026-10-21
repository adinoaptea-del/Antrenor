// Wordmark-ul AIRON și intro-ul „wordmark → fire → bulă” (ghidul vizual-tehnic, 21.10.2026): litere vector geometrice,
// fiecare fir al sferei e o bucată de literă, toate ajung pe sferă la 3.300 ms, mesajul apare abia după aceea.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FIRE, makeFilaments } from '../src/motion/fireStorm.js';
import {
  CHUNK_OVERLAP,
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

const EPS = 1e-6;

test('literele A I R O N după imaginea din ghid: pozițiile și lățimile măsurate, tușe de 0,149–0,17 H, capete drepte decupate în cutia literei', () => {
  const boxes = wordmarkBoxes();
  assert.deepEqual(
    boxes.map((b) => b.letter),
    ['A', 'I', 'R', 'O', 'N'],
  );
  // Măsurat în imaginea de referință (H = 52 px): A 88–140, I 168–177, R 209–249, O 273–327, N 355–396 (de la x = 88).
  const near = (a: number, b: number, tol = 0.02) => assert.ok(Math.abs(a - b) <= tol, `${a.toFixed(3)} ≠ ${b.toFixed(3)}`);
  near(boxes[0]!.x, 0);
  near(boxes[0]!.w, 1.0);
  near(boxes[1]!.x, (172.5 - 88) / 52 - 0.085);
  near(boxes[1]!.w, 0.17);
  near(boxes[2]!.x, (209 - 88) / 52);
  near(boxes[2]!.w, 41 / 52, 0.03);
  near(boxes[3]!.x + boxes[3]!.w / 2, (300 - 88) / 52);
  near(boxes[3]!.w, 54 / 52, 0.03);
  near(boxes[4]!.x, (355 - 88) / 52);
  near(boxes[4]!.w, 41 / 52, 0.03);
  near(WORDMARK_W, 309 / 52, 0.05);
  const strokes = wordmarkStrokes();
  assert.equal(strokes.length, 11, 'A 3 tușe, I 1, R 3, O 1, N 3');
  for (const s of strokes) {
    assert.ok(s.w >= 0.149 && s.w <= 0.17, `tușa ${s.letter} ${s.w}`);
    assert.ok(s.clip.length >= 1 && s.clip[0]!.length >= 4, 'fiecare tușă e decupată');
  }
  // A: picioare simetrice față de x = 0,5 care se întâlnesc la linia majusculei (vârf retezat), bară scurtă pe piciorul
  // stâng cu capăt liber la 0,567 și tăietura orizontală sub ea (doar în piciorul stâng).
  const [aL, aR, aBar] = strokes.filter((s) => s.letter === 'A');
  const endL = (aL!.segs[0] as { to: [number, number] }).to;
  const endR = (aR!.segs[0] as { to: [number, number] }).to;
  near(endL[0] + endR[0], 1.0);
  near(aL!.from[0] + aR!.from[0], 1.0);
  near(aBar!.from[1], 0.654);
  near((aBar!.segs[0] as { to: [number, number] }).to[0], 0.567);
  assert.equal(aL!.clip.length, 2, 'piciorul stâng are fanta');
  const slit = aL!.clip[1]!;
  const ys = slit.map((p) => p[1]);
  near(Math.min(...ys), 0.722);
  near(Math.max(...ys), 0.781);
  assert.ok(Math.max(...slit.map((p) => p[0])) < 0.7, 'fanta nu ajunge la piciorul drept');
  assert.equal(aR!.clip.length, 1);
  // O: inel cu raza mediană 0,435 centrat la 0,5, deschis printr-o fantă oblică în stânga, deasupra mijlocului.
  const o = strokes.find((s) => s.letter === 'O')!;
  const arc = o.segs[0] as { kind: 'A'; c: [number, number]; r: number; a0: number; a1: number };
  assert.equal(arc.kind, 'A');
  near(arc.r, 0.435);
  near(arc.c[1], 0.5);
  assert.ok(arc.a1 - arc.a0 > 5.8 && arc.a1 - arc.a0 < 2 * Math.PI, 'aproape tot cercul');
  assert.equal(o.clip.length, 2);
  const bandC = o.clip[1]!.reduce((acc, p) => [acc[0] + p[0] / 4, acc[1] + p[1] / 4], [0, 0]);
  assert.ok(bandC[0] < arc.c[0] - 0.3, 'fanta e în stânga');
  assert.ok(bandC[1] < 0.5 && bandC[1] > 0.4, 'fanta e puțin deasupra mijlocului');
  const e01: [number, number] = [o.clip[1]![1]![0] - o.clip[1]![0]![0], o.clip[1]![1]![1] - o.clip[1]![0]![1]];
  near(Math.atan2(e01[1], e01[0]), (28 * Math.PI) / 180, 0.01);
  // N: diagonala pe panta 0,922 (≈ 43°), trunchiurile decupate de marginile ei (poligoane cu 5 laturi).
  const [nL, nD, nR] = strokes.filter((s) => s.letter === 'N');
  const dTo = (nD!.segs[0] as { to: [number, number] }).to;
  near((dTo[0] - nD!.from[0]) / (dTo[1] - nD!.from[1]), 0.922, 0.001);
  assert.equal(nL!.clip[0]!.length, 5);
  assert.equal(nR!.clip[0]!.length, 5);
  // I: un singur trunchi vertical.
  const i = strokes.filter((s) => s.letter === 'I');
  assert.equal(i.length, 1);
  near((i[0]!.segs[0] as { to: [number, number] }).to[0], i[0]!.from[0], 1e-9);
});

test('căile SVG: o cale pe tușă cu grosimea și decuparea ei (evenodd), doar M/L/A/Z', () => {
  const paths = wordmarkPaths();
  assert.equal(paths.length, 11);
  assert.deepEqual(
    [...new Set(paths.map((p) => p.letter))],
    ['A', 'I', 'R', 'O', 'N'],
  );
  for (const p of paths) {
    assert.ok(p.d.startsWith('M'));
    assert.ok(!/[^MLA0-9 .\-]/.test(p.d), `comenzi neașteptate: ${p.d}`);
    assert.ok(/^M[-0-9. L]+Z( M[-0-9. L]+Z)*$/.test(p.clip), `decupare neașteptată: ${p.clip}`);
    assert.ok(p.width >= 14.89 && p.width <= 17.01, `grosimea ${p.width}`);
  }
  assert.equal((paths.find((p) => p.letter === 'O')!.d.match(/A/g) ?? []).length, 1);
  // Capetele segmentelor drepte din SVG coincid cu punctele poliliniei (scara 100).
  const n = wordmarkPolylines().filter((p) => p.letter === 'N')[1]!;
  const d = paths.filter((p) => p.letter === 'N')[1]!.d;
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
    const step = (len[k]! + 2 * CHUNK_OVERLAP) / 96;
    for (let j = 1; j <= 96; j++) {
      const d = Math.hypot(s[2 * j]! - s[2 * j - 2]!, s[2 * j + 1]! - s[2 * j - 1]!);
      assert.ok(d <= step * 1.001 + EPS, `fir ${k}, eșantion ${j}: pas ${d.toFixed(4)} > ${step.toFixed(4)}`);
    }
  }
  // polylineAt: capetele și mijlocul.
  const p = polys[3]!; // I
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
