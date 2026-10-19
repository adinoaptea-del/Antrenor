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

test('capacitate necunoscută (V2-04, V2-10): lungimi de 25 m ca familiarizare, volum plafonat, fără să umple timpul', () => {
  const r = swimSet({ type: 'z2', minutes: 45, css: null, date: '2026-10-19' });
  const main = r.steps.find((s) => s.label === 'Principal')!.text;
  assert.match(main, /12 × 25 m ușor, 30 s pauză/);
  assert.match(main, /plafonat la 300 m/);
  assert.ok(r.estMin < 45);
});

test('V2-10 volumul recent măsurat ridică plafonul cel mult +10%', () => {
  const r = swimSet({ type: 'z2', minutes: 60, css: null, date: '2026-10-19', continuousM: 50, recentMaxM: 800 });
  const main = r.steps.find((s) => s.label === 'Principal')!.text;
  const m = /(\d+) × (\d+) m/.exec(main)!;
  assert.ok(Number(m[1]) * Number(m[2]) <= 875, main);
});

test('cu CSS: repetări de 100 m, iar calitatea e la ritmul pragului', () => {
  const r = swimSet({ type: 'calitate', minutes: 40, css: 120, date: '2026-10-19' });
  assert.match(r.steps.find((s) => s.label === 'Principal')!.text, /× 100 m la ritmul pragului \(2:00\/100 m\)/);
});

import { prescribe } from '../src/strength/ppl.js';
test('două ședințe pe săptămână: picioarele și partea de sus separat, niciodată în aceeași ședință; cel puțin 45 min', () => {
  for (const m of [30, 45, 60]) {
    const a = prescribe({ session: 'fullA', block: 'baza', week: 2, len: 4 } as never, m);
    const b = prescribe({ session: 'fullB', block: 'baza', week: 2, len: 4 } as never, m);
    assert.ok(a.items.every((i) => i.ex.region !== 'upper') && a.items[0]!.ex.region === 'legs', `fullA ${m}`);
    const pats = new Set(b.items.map((i) => i.ex.id.split('-')[0]));
    assert.ok(b.items.every((i) => i.ex.region !== 'legs') && pats.has('push') && pats.has('pull'), `fullB ${m}: ${[...pats].join(',')}`);
    assert.ok(a.minutes >= 45 && b.minutes >= 45);
  }
});
