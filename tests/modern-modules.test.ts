import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bikeQuality, shortIntervalSteps, swimQuality } from '../src/calendar/bike-swim-modules.js';
import { swimSet } from '../src/calendar/session-steps.js';
import { libraryFor } from '../src/knowledge/workouts.js';

test('bicicleta: calitatea progresează săptămânal în baza2 (nu aceeași ședință toată faza)', () => {
  const s = [0, 1, 2, 3].map((w) => bikeQuality('baza2', w)!.structure);
  assert.equal(new Set(s).size, 4);
  assert.match(s[0]!, /^3 × 10 min sweet spot/);
  assert.match(s[2]!, /^2 × 20 min/);
});

test('bicicleta: build alternează pragul cu over-under; peak are 30/15 cu pașii lor', () => {
  assert.match(bikeQuality('build', 0)!.structure, /la prag/);
  assert.match(bikeQuality('build', 1)!.structure, /over-under/);
  const p = bikeQuality('peak', 0)!;
  assert.match(p.structure, /30 s tare \/ 15 s ușor/);
  const steps = shortIntervalSteps(p.structure, p.minutes)!;
  assert.equal(steps.length, 3);
  assert.match(steps[1]!.text, /3 serii × 10 repetări/);
});

test('înot: setul CSS crește din săptămână în săptămână, iar pașii urmează exact setul din plan', () => {
  const sets = [0, 1, 2, 3].map((w) => swimQuality('build', w)!);
  assert.equal(new Set(sets).size, 4);
  const r = swimSet({ type: 'calitate', minutes: 45, css: 110, date: '2026-10-19', structure: sets[2] });
  assert.match(r.steps.find((s) => s.label === 'Principal')!.text, /^5 × 200 m la 3:40 pe repetare/);
});

test('biblioteca pentru agenți are ședințele noi, pe faze', () => {
  assert.ok(libraryFor('bicicleta', 'bike', 'bike-100', 'peak').some((w) => w.id === 'bike-3015'));
  assert.ok(libraryFor('alergare', 'run', '10k', 'baza2').some((w) => w.id === 'run-subT'));
  assert.ok(libraryFor('inot', 'tri', '70.3', 'build').some((w) => w.id === 'swim-css-prog'));
});
