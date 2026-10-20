import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DISSOLVE_MS, PHASES, homeLight, impulse, lensPull, membraneScale, particleArrival, phaseAt, shellPresence, stateAt, textAlpha } from '../src/motion/teleport.js';
import { frontAt, meniscus } from '../src/motion/meniscus.js';

test('teleportarea: fazele vin în ordinea din brief, iar stările urmează idle → … → dissolve → idle', () => {
  assert.deepEqual([0, 200, 450, 600, 950, 2000].map((t) => phaseAt(t, null)), ['chemare', 'convergenta', 'curbare', 'materializare', 'mesaj', 'repaus']);
  assert.equal(phaseAt(1500, 100), 'reintegrare');
  assert.deepEqual([100, 500, 700, 1200].map((t) => stateAt(t, null)), ['attract', 'warp', 'materialize', 'readable']);
  assert.equal(stateAt(1500, 300), 'dissolve');
  assert.equal(stateAt(1500, DISSOLVE_MS), 'idle');
});

test('textul apare doar după stabilizarea recipientului și dispare primul la închidere', () => {
  assert.equal(textAlpha(PHASES.materializare[1] - 1, null), 0);
  assert.equal(textAlpha(PHASES.mesaj[1], null), 1);
  assert.ok(textAlpha(2000, 200) === 0, 'după 180 ms de la închidere textul nu se mai vede');
  assert.ok(shellPresence(2000, 200) > 0.5, 'recipientul încă e acolo când textul a dispărut');
  assert.equal(shellPresence(2000, DISSOLVE_MS), 0);
});

test('membrana trece puțin peste echilibru și se calmează (fără scale 0.96 → 1)', () => {
  const xs = Array.from({ length: 101 }, (_, i) => membraneScale(i / 100));
  assert.ok(Math.max(...xs) > 1.02, 'depășește echilibrul');
  assert.ok(Math.min(...xs) <= 0.56, 'pornește mică');
  assert.equal(membraneScale(1), 1);
});

test('un singur impuls, după tragerea lentilei; particulele nu sosesc toate deodată', () => {
  assert.ok(lensPull(490) > 0.8);
  assert.ok(lensPull(200) < 0.05 && lensPull(700) < 0.05);
  assert.equal(impulse(300), null);
  assert.ok(impulse(560) != null);
  assert.equal(impulse(1200), null);
  const early = particleArrival(300, 0, 1);
  const late = particleArrival(300, 1, 0);
  assert.ok(early > late, 'întârzieri și viteze diferite');
  assert.equal(particleArrival(PHASES.materializare[1], 1, 0), 1, 'toate au ajuns înainte de text');
});

test('bula de Acasă cedează lumina la chemare și o recapătă la reintegrare', () => {
  assert.equal(homeLight(0, null), 1);
  assert.ok(homeLight(500, null) < 0.3);
  assert.ok(homeLight(1500, DISSOLVE_MS) > 0.99);
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
  assert.ok(meniscus(5, W, r)!.detail < meniscus(50, W, r)!.detail, 'la 5% ondulația și particulele sunt mai mici');
  assert.equal(meniscus(150, W, r)!.fillW, W);
  assert.equal(meniscus(-3, W, r)!.fillW, 0);
});

test('întâmpinarea: Acasă abia se întrezărește (7–8%) și devine clar treptat la tranziție', async () => {
  const { welcomeVeil, WELCOME_VEIL, DISSOLVE_MS: D } = await import('../src/motion/teleport.js');
  const visible = (o: number | null) => 1 - welcomeVeil(o);
  assert.ok(visible(null) >= 0.07 && visible(null) <= 0.08);
  assert.equal(welcomeVeil(null), WELCOME_VEIL);
  const steps = [0, D * 0.25, D * 0.5, D * 0.75, D].map(visible);
  for (let i = 1; i < steps.length; i++) assert.ok(steps[i]! > steps[i - 1]!, 'din ce în ce mai vizibil');
  assert.equal(visible(D), 1);
});
