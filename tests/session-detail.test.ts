import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detailSteps, hrFor } from '../src/calendar/session-detail.js';
import { moduleStructure } from '../src/calendar/run-modules.js';
import type { PlannedWorkout } from '../src/types.js';

const w = (x: Partial<PlannedWorkout>): PlannedWorkout => ({ id: 'w', date: '2026-10-20', sport: 'alergare', type: 'z2', plannedMinutes: 45, targetZones: [2], key: false, status: 'planificat', ...x });
const mins = (t: string) => Number(/^(\d+) min/.exec(t)?.[1] ?? 0);

test('puls estimat din vârstă (46 ani: max ≈ 176), etichetat ca estimare', () => {
  const h = hrFor('alergare', { age: 46 })!;
  assert.equal(h.fcmax, 176);
  assert.equal(h.up[0], 123);
  assert.equal(h.estimated, true);
  const s = detailSteps(w({}), { age: 46 });
  assert.ok(s.some((x) => x.label === 'Puls' && /ESTIMATE/.test(x.text)));
  assert.ok(s.some((x) => x.label === 'Plafon' && /141 bpm/.test(x.text)));
});

test('zonele testate au prioritate și nu mai apare nota de estimare', () => {
  const s = detailSteps(w({}), { age: 46, zonesRun: [130, 145, 155, 165, 180] });
  assert.ok(!s.some((x) => x.label === 'Puls'));
  assert.ok(s.some((x) => /131–145 bpm/.test(x.text)));
});

test('calitate (T1): școala alergării în încălzire, pauză după puls, plafon; minutele însumate = durata', () => {
  const b = moduleStructure('T1');
  const s = detailSteps(w({ type: 'calitate', plannedMinutes: b.minutes, targetZones: [3], structure: b.text }), { age: 40 });
  assert.ok(s.some((x) => x.label === 'Școala alergării' && /genunchi la piept/.test(x.text) && /călcâie la șezut/.test(x.text)));
  assert.match(s.find((x) => x.label === 'Principal')!.text, /pornește când pulsul e sub ~\d+ bpm/);
  assert.ok(s.some((x) => x.label === 'Plafon'));
});

test('fără vârstă și fără test: doar efort și testul vorbirii, fără cifre de puls inventate', () => {
  const s = detailSteps(w({}), {});
  assert.ok(!s.some((x) => /\d+ bpm/.test(x.text)));
  assert.ok(s.some((x) => x.label === 'Plafon' && /poți vorbi/.test(x.text)));
});

test('ușor cu accelerări: suma minutelor pașilor = durata planificată', () => {
  const s = detailSteps(w({ structure: 'ușor + 6 accelerări de 20 s', plannedMinutes: 40 }), { age: 35 });
  const total = s.filter((x) => ['Încălzire', 'Principal', 'Revenire'].includes(x.label)).reduce((n, x) => n + mins(x.text), 0) + Number(/\((\d+) min\)/.exec(s.find((x) => x.label === 'Accelerări')!.text)![1]);
  assert.equal(total, 40);
});
