import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DISSOLVE_MS, ENTRY_MS, EXIT, EXIT_MS, PHASES, SHAKE, impulse, lensPull, membraneScale, openAt, particleArrival, phaseAt, sceneOpacity, shakeAt, stateAt, textAlpha } from '../src/motion/teleport.js';
import { frontAt, meniscus } from '../src/motion/meniscus.js';

test('brief v2: stările merg covered → attract → warp → materialize → readable → dissolve → revealHome → idle', () => {
  assert.deepEqual([100, 600, 1200, 1800, 2600].map((t) => stateAt(t, null)), ['covered', 'attract', 'warp', 'materialize', 'readable']);
  assert.deepEqual([0, 2000, DISSOLVE_MS, EXIT_MS].map((o) => stateAt(3000, o)), ['dissolve', 'dissolve', 'revealHome', 'idle']);
  assert.equal(phaseAt(1350, null), 'impuls');
  assert.deepEqual([100, 600, 1500, 2200, 2700].map((o) => phaseAt(3000, o)), ['estompare', 'deschidere', 'fragmentare', 'ecou', 'dezvaluire']);
});

test('ritmul: intrare ≈2,5 s, ieșire ≈2,6 s plus Acasă ≈0,5 s', () => {
  assert.equal(ENTRY_MS, 2500);
  assert.equal(DISSOLVE_MS, 2600);
  assert.equal(EXIT_MS - DISSOLVE_MS, 500);
});

test('Acasă e complet ascuns până la revealHome, apoi apare treptat', () => {
  for (const o of [null, 0, 250, 900, 1900, DISSOLVE_MS - 1]) assert.equal(sceneOpacity(o), 1, `opac la ${o}`);
  const xs = [DISSOLVE_MS, DISSOLVE_MS + 125, DISSOLVE_MS + 250, DISSOLVE_MS + 375, EXIT_MS].map(sceneOpacity);
  for (let i = 1; i < xs.length; i++) assert.ok(xs[i]! < xs[i - 1]!);
  assert.equal(xs.at(-1), 0);
});

test('textul apare după condensare și se stinge primul (în 250 ms)', () => {
  assert.equal(textAlpha(PHASES.condensare[1] - 1, null), 0);
  assert.equal(textAlpha(PHASES.mesaj[1], null), 1);
  assert.equal(textAlpha(3000, EXIT.estompare[1]), 0);
});

test('un singur shake, ~2 px, ~180 ms, două oscilații amortizate, doar la impuls', () => {
  assert.deepEqual(shakeAt(SHAKE.at - 1), { x: 0, y: 0 });
  assert.deepEqual(shakeAt(SHAKE.at + SHAKE.ms + 1), { x: 0, y: 0 });
  assert.deepEqual(shakeAt(2600), { x: 0, y: 0 }, 'nu tremură textul cât e citit');
  const xs = Array.from({ length: 181 }, (_, i) => shakeAt(SHAKE.at + i).x);
  assert.ok(Math.max(...xs.map(Math.abs)) <= SHAKE.px);
  let crossings = 0;
  for (let i = 1; i < xs.length; i++) if (Math.sign(xs[i]!) !== Math.sign(xs[i - 1]!) && xs[i] !== 0) crossings++;
  assert.ok(crossings >= 2 && crossings <= 4, `două oscilații (${crossings} treceri prin zero)`);
  const first = Math.max(...xs.slice(0, 60).map(Math.abs));
  const last = Math.max(...xs.slice(120).map(Math.abs));
  assert.ok(last < first * 0.5, 'amortizat');
});

test('membrana se deschide asimetric: o latură cedează prima, partea opusă rămâne până la ~900 ms', () => {
  const side = -0.5;
  assert.equal(Math.round(openAt(side, side)), EXIT.deschidere[0]);
  assert.equal(Math.round(openAt(side + Math.PI, side)), EXIT.deschidere[1]);
  assert.ok(openAt(side + 0.5, side) < openAt(side + 2, side));
});

test('convergență fără îngrămădire; deformare lină; un singur impuls; condensare peste echilibru', () => {
  assert.ok(particleArrival(700, 0, 1) > particleArrival(700, 1, 0));
  assert.equal(particleArrival(PHASES.condensare[0], 1, 0), 1, 'toate au ajuns înainte de condensare');
  assert.ok(lensPull(PHASES.liniste[1]) === 0 && lensPull(1300) > 0.8 && lensPull(2000) < 0.05);
  assert.equal(impulse(1200), null);
  assert.ok(impulse(1400) != null);
  assert.equal(impulse(2100), null);
  const xs = Array.from({ length: 101 }, (_, i) => membraneScale(i / 100));
  assert.ok(Math.max(...xs) > 1.02 && membraneScale(1) === 1);
});

test('tubul: fără date ≠ 0, 0 fără umplere, 100 închide complet, la procente mici detaliul scade', () => {
  const W = 300;
  const r = 10;
  assert.equal(meniscus(null, W, r), null);
  assert.deepEqual(meniscus(0, W, r), { fillW: 0, bulge: 0, detail: 0, full: false });
  const full = meniscus(100, W, r)!;
  assert.ok(full.full && full.bulge === 0 && frontAt(full, 1) === W && frontAt(full, 0) === W);
  for (const p of [5, 50, 93]) {
    const m = meniscus(p, W, r)!;
    assert.equal(Math.round(frontAt(m, 0)), Math.round((W * p) / 100), `centrul meniscului = valoarea (${p}%)`);
    assert.ok(frontAt(m, 1) <= frontAt(m, 0));
  }
  assert.ok(meniscus(5, W, r)!.detail < meniscus(50, W, r)!.detail);
  assert.equal(meniscus(150, W, r)!.fillW, W);
  assert.equal(meniscus(-3, W, r)!.fillW, 0);
});

test('transferul în bula Acasă: textul se stinge înainte, toată materia ajunge, apoi antrenamentele, apoi restul', async () => {
  const m = await import('../src/motion/teleport.js');
  const { TRANSFER: T } = m;
  assert.ok(T.estompare[1] <= T.desprindere[0], 'mesajul se stinge înaintea transferului');
  // Orice particulă eliberată în fereastra de desprindere ajunge până la sfârșitul transferului (fără resturi în aer).
  for (const rel of [T.desprindere[0], 800, T.desprindere[1] + 200]) {
    for (const base of [900, 1500, 2400]) {
      const dur = m.travelDur(rel, base);
      assert.equal(m.travel(T.transfer[1], rel, dur), 1, `rel ${rel}, dur ${base}`);
    }
  }
  // Accelerare și încetinire line: viteza e mică la plecare și la sosire, mare la mijloc.
  const v = (x: number) => m.travel(x + 10, 0, 1000) - m.travel(x, 0, 1000);
  assert.ok(v(0) < v(495) / 5 && v(990) < v(495) / 5);
  assert.equal(m.contentAlpha(T.continut[0] - 1), 0, 'antrenamentele apar doar după ce bula e formată');
  assert.equal(m.contentAlpha(T.continut[1]), 1);
  assert.equal(m.transferSceneOpacity(T.continut[1]), 1, 'cardurile și navigația nu se văd înainte');
  assert.equal(m.transferSceneOpacity(m.TRANSFER_MS), 0);
  assert.deepEqual([100, 600, 2000, 3000, 3600].map(m.transferPhaseAt), ['estompare', 'desprindere', 'transfer', 'continut', 'interfata']);
});

test('întâmpinarea-sferă: curbare și vibrație înainte de desprindere, textul lizibil cât se curbează, transfer ~3 s, interfața 0,5–0,8 s', async () => {
  const m = await import('../src/motion/teleport.js');
  const E = m.SPHERE_EXIT;
  assert.ok(m.sphereLens(400) > 0.8 && m.sphereLens(E.desprindere[0] + 50) < 0.05, 'curbarea vine înaintea desprinderii');
  assert.ok(m.sphereWave(700) != null && m.sphereWave(1900) == null);
  const sh = Array.from({ length: 400 }, (_, i) => Math.abs(m.sphereShake(i * 10).x));
  assert.ok(sh.filter((x) => x > 0).length > 0 && sh.findIndex((x) => x > 0) * 10 >= 600 && (sh.length - 1 - [...sh].reverse().findIndex((x: number) => x > 0)) * 10 <= E.desprindere[0], 'o singură vibrație, înainte de desprindere');
  assert.equal(m.sphereTextAlpha(3000, 500), 1, 'textul rămâne lizibil în curbare');
  assert.equal(m.sphereTextAlpha(3000, E.estompare[1]), 0, 'și se stinge înainte de transfer');
  const tr = E.transfer[1] - E.transfer[0];
  assert.ok(tr >= 3000 && tr <= 4000);
  const ui = E.interfata[1] - E.interfata[0];
  assert.ok(ui >= 500 && ui <= 800);
  // Toată materia ajunge, oricând ar pleca în fereastra de desprindere.
  for (const s of [-1, 0, 1]) {
    const rel = m.sphereRelease(s * 100, 100, 80);
    assert.equal(m.travel(E.transfer[1], rel, m.sphereTravelDur(rel, 2200)), 1);
  }
  assert.ok(m.sphereRelease(100, 100) < m.sphereRelease(-100, 100), 'întâi partea dinspre bulă');
  assert.equal(m.sphereSceneOpacity(E.interfata[0]), 1);
  assert.equal(m.sphereSceneOpacity(m.SPHERE_EXIT_MS), 0);
});

test('furtuna: fără trepte — energia e un clopot lin, rotația pornește și se oprește lin, etapele se suprapun', async () => {
  const m = await import('../src/motion/teleport.js');
  // Continuitate: nicio variație mare între două cadre (16 ms) la nicio curbă, pe toată ieșirea.
  const curves = [m.stormEnergy, m.stormRecomposeGlow, (o: number) => m.stormSpin(o) / 10, (o: number) => m.stormTextAlpha(5000, o), (o: number) => m.stormBody(5000, o), m.stormParticleFade, m.stormHomeBuild, m.stormContentAlpha, m.stormSceneOpacity];
  for (const f of curves) for (let o = 0; o < m.STORM_OUT_MS; o += 16) assert.ok(Math.abs(f(o + 16) - f(o)) < 0.08, `salt la ${o} ms`);
  for (let t = 0; t < 5000; t += 16) assert.ok(Math.abs(m.stormTextAlpha(t + 16, null) - m.stormTextAlpha(t, null)) < 0.08 && Math.abs(m.stormBody(t + 16, null) - m.stormBody(t, null)) < 0.08);
  // Rotația: crește monoton și se oprește (viteza ~0 la capete).
  const s1 = m.stormSpin(m.STORM_OUT.recompunere[1]);
  assert.ok(s1 > 6 && s1 < 16, `rotații totale ~1–2 ture (${s1.toFixed(1)} rad)`);
  assert.ok(m.stormSpin(m.STORM_OUT.vartej[0] + 50) < 0.01 && Math.abs(m.stormSpin(m.STORM_OUT_MS) - s1) < 1e-9);
  // Suprapuneri: bula de Acasă începe să se construiască înainte ca vârtejul să se fi oprit; antrenamentele după.
  assert.ok(m.STORM_OUT.preluare[0] < m.STORM_OUT.recompunere[1]);
  assert.ok(m.stormHomeBuild(m.STORM_OUT.continut[0]) > 0.9);
  assert.equal(m.stormSceneOpacity(m.STORM_OUT.continut[1] - 200), 1, 'interfața rămâne ascunsă până la final');
  assert.ok(m.STORM_READY_MS >= m.STORM_IN.forma[1]);
});
