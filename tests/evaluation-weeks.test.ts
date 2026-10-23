// Evaluarea după date (decizia proprietarului, 23.10.2026): cu istoric măsurat pe brățări / Health, sportivul nu e luat
// de la zero — evaluarea se scurtează la o săptămână sau dispare, iar testele care lipsesc nu se pierd.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluationWeeksFor, generatePlan } from '../src/calendar/generate.js';
import { demonstrated } from '../src/calendar/demonstrated.js';
import { phaseLengths, phaseWeeks } from '../src/calendar/phases.js';
import { input } from '../scripts/audit-profiles.js';
import { addDays } from '../src/util/dates.js';
import type { Sport } from '../src/types.js';

const TODAY = '2026-10-25';
const hist = (sport: Sport, per = 3, min = 50) => Array.from({ length: 6 }, (_, w) => Array.from({ length: per }, (_, i) => ({ date: addDays(TODAY, -(w * 7 + 1 + i * 2)), sport, minutes: min }))).flat();

test('fără date măsurate: 3 săptămâni de evaluare (ca înainte); doar o parte din sporturi: 1; toate: 0', () => {
  const tri = input({ goal: '70.3', sex: 'm', age: 35, level: 'intermediar', intens: 'toate' });
  assert.equal(evaluationWeeksFor({ ...tri, historyHoursPerWeek: [], demonstrated: demonstrated([], TODAY) }).weeks, 3);
  const partial = evaluationWeeksFor({ ...tri, historyHoursPerWeek: [5, 5, 5, 5], demonstrated: demonstrated([...hist('alergare'), ...hist('bicicleta')], TODAY) });
  assert.equal(partial.weeks, 1);
  assert.deepEqual(partial.without, ['inot']);
  assert.equal(evaluationWeeksFor({ ...tri, historyHoursPerWeek: [5, 5, 5, 5], demonstrated: demonstrated([...hist('alergare'), ...hist('bicicleta'), ...hist('inot', 2, 45)], TODAY) }).weeks, 0);
  const run = input({ goal: '10k', sex: 'm', age: 35, level: 'intermediar', intens: 'toate' });
  assert.equal(evaluationWeeksFor({ ...run, historyHoursPerWeek: [4, 4, 4, 4], demonstrated: demonstrated(hist('alergare'), TODAY) }).weeks, 0, 'la alergare contează doar alergarea');
});

test('cu toate datele: planul pornește direct din bază, cu modulele de calitate din prima săptămână; testele lipsă vin în bază', () => {
  const base = { ...input({ goal: '10k', sex: 'm', age: 35, level: 'intermediar', intens: 'toate' }), historyHoursPerWeek: [4, 4, 4, 4, 4, 4], demonstrated: demonstrated(hist('alergare', 3, 60), TODAY) };
  const r = generatePlan(base);
  assert.ok(r.ok && r.evaluationWeeks === 0);
  if (!r.ok) return;
  assert.ok(!r.weeks.some((w) => w.phase === 'evaluare'), 'nicio săptămână de evaluare');
  assert.equal(r.weeks[0]!.phase, 'baza1');
  const first2 = r.weeks.slice(0, 2).flatMap((w) => w.workouts);
  assert.ok(first2.some((w) => /^TEST/.test(w.structure ?? '')), 'testul de alergare lipsă e în primele săptămâni de bază');
  // Fără date: evaluarea de 3 săptămâni rămâne.
  const none = generatePlan({ ...base, historyHoursPerWeek: [0, 0, 0, 0], declaredRecentHours: 4, demonstrated: demonstrated([], TODAY) });
  assert.ok(none.ok && none.evaluationWeeks === 3);
  // Orizontul de 25 de săptămâni scurtează proporțional evaluarea implicită (2 aici): aceeași ca înainte de schimbare.
  if (none.ok) assert.equal(none.weeks.filter((w) => w.phase === 'evaluare').length, phaseWeeks(base.startDate, base.raceDate, 4, '10k').filter((w) => w.phase === 'evaluare').length);
});

test('fazele recalculate din plan (calendar, insigne, faza zilei) folosesc aceeași evaluare salvată', () => {
  const a = phaseWeeks('2026-10-26', '2027-09-12', 4, '70.3', undefined, 0);
  const b = phaseWeeks('2026-10-26', '2027-09-12', 4, '70.3');
  assert.equal(a.length, b.length, 'aceeași durată totală');
  assert.equal(a.filter((w) => w.phase === 'evaluare').length, 0);
  assert.equal(b.filter((w) => w.phase === 'evaluare').length, 3, 'planurile vechi (fără valoare salvată) rămân cu 3');
  assert.equal(phaseLengths(10, 1, 1).evaluare <= 1, true, 'orizont scurt: nu mai mult decât s-a cerut');
});
