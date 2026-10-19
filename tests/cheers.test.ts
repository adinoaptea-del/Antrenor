// Felicitările: doar de la 60% în sus, potrivite sportului, cu afirmații adevărate.
import { it } from 'node:test';
import assert from 'node:assert/strict';
import { CHEER_COUNT, cheerFor, cheerTier } from '../src/cheers.js';

const base = { name: 'Marius Popa', minutes: 60, km: 10, nThisSport14: 1, seed: 'w1' };

it('sub 60% nu apare nimic; fără date nu apare nimic', () => {
  assert.equal(cheerFor({ ...base, sport: 'alergare', ratio: 0.59 }), null);
  assert.equal(cheerFor({ ...base, sport: 'alergare', ratio: null }), null);
  assert.equal(cheerTier(0.6), 'bine');
  assert.equal(cheerTier(0.95), 'fix');
  assert.equal(cheerTier(1.3), 'peste');
});

it('mesajul are numele și e despre sportul făcut', () => {
  for (const sport of ['alergare', 'bicicleta', 'inot', 'forta', 'mers'] as const) {
    for (let i = 0; i < 12; i++) {
      const c = cheerFor({ ...base, sport, ratio: 1, seed: `s${i}`, nSwimTotal: 20 })!;
      assert.ok(c.text.includes('Marius'), c.text);
      assert.ok(!c.text.includes('Popa'));
      const other = { alergare: /pedal|bicicl|înot|sala\b|mers de ai/i, bicicleta: /alerg|înot|sala\b/i, inot: /alerg|pedal|sala\b/i, forta: /alerg|pedal|înot/i, mers: /alerg|pedal|înot|sala\b/i }[sport];
      assert.ok(!other.test(c.text), `${sport}: ${c.text}`);
    }
  }
});

it('„fix cât trebuia” doar la execuție completă; „începi să înveți” doar la primele înoturi; între 30 și 40 de mesaje', () => {
  for (let i = 0; i < 20; i++) assert.ok(!/fix cât|exact/.test(cheerFor({ ...base, sport: 'alergare', ratio: 0.7, seed: `b${i}` })!.text));
  assert.match(cheerFor({ ...base, sport: 'inot', ratio: 1, nSwimTotal: 2 })!.text, /Începi să înveți să înoți/);
  assert.ok(!/Începi să înveți/.test(cheerFor({ ...base, sport: 'inot', ratio: 1, nSwimTotal: 30, seed: 'x' })!.text));
  assert.ok(CHEER_COUNT >= 30 && CHEER_COUNT <= 40, String(CHEER_COUNT));
  // „Din ce în ce mai bine” doar cu dovadă.
  for (let i = 0; i < 20; i++) assert.ok(!/din ce în ce|tot mai bine/i.test(cheerFor({ ...base, sport: 'alergare', ratio: 1, improving: false, seed: `i${i}` })!.text));
});
