import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseStrides, stridesMinutes, swimSet } from '../src/calendar/session-steps.js';

test('accelerările din structură devin pas cu minutele lor', () => {
  const s = parseStrides('ușor + 6 accelerări de 20 s')!;
  assert.deepEqual(s, { n: 6, sec: 20 });
  assert.equal(stridesMinutes(s), 8);
  assert.equal(parseStrides('ușor, constant'), null);
});

test('înot tehnic de 30 min: metri, repetări, pauze și durată estimată, nu „30 min tehnică”', () => {
  const r = swimSet({ type: 'tehnica', minutes: 30, css: null, date: '2026-10-19' });
  assert.ok(r.meters >= 500 && r.meters <= 1000, String(r.meters));
  assert.ok(r.estMin <= 30 && r.estMin >= 20, String(r.estMin));
  assert.ok(r.steps.some((s) => /4 × 25 m exercițiu/.test(s.text)));
  assert.match(r.steps.at(-1)!.text, /estimată/);
});

test('fără CSS: niciun înot continuu prescris, doar repetări scurte cu pauză', () => {
  const r = swimSet({ type: 'z2', minutes: 45, css: null, date: '2026-10-19' });
  const main = r.steps.find((s) => s.label === 'Principal')!.text;
  assert.match(main, /× 50 m ușor, 30 s pauză/);
});

test('cu CSS: repetări de 100 m, iar calitatea e la ritmul pragului', () => {
  const r = swimSet({ type: 'calitate', minutes: 40, css: 120, date: '2026-10-19' });
  assert.match(r.steps.find((s) => s.label === 'Principal')!.text, /× 100 m la ritmul pragului \(2:00\/100 m\)/);
});

import { prescribe } from '../src/strength/ppl.js';
test('tot corpul: picioarele mari primele; la timp scurt rămâne câte o mișcare de picioare, împins și tras', () => {
  for (const s of ['fullA', 'fullB'] as const) {
    for (const m of [30, 45, 60]) {
      const r = prescribe({ session: s, block: 'baza', week: 2, len: 4 } as never, m);
      const pats = new Set(r.items.map((i) => i.ex.id.split('-')[0]));
      assert.ok(pats.has('legs') && pats.has('push') && pats.has('pull'), `${s} ${m}: ${[...pats].join(',')}`);
      assert.equal(r.items[0]!.ex.region, 'legs');
    }
  }
});
