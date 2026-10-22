// Deciziile proprietarului din 22.10.2026, după auditul consolidat: avizul declarat Da / Nu și starea zilei ca medie
// între calculul aplicației și brățări.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayVerdict, deviceScoresOf, objectiveReadiness } from '../src/collector/readiness.js';
import { generatePlan } from '../src/calendar/generate.js';
import { input } from '../scripts/audit-profiles.js';

const base = { hrv: 60, hrvBaseline: 60, rhr: 50, rhrBaseline: 50, resp: null, respBaseline: null, recovery: null, sleepMin: 450 };

test('starea zilei = media dintre calculul aplicației și media brățărilor', () => {
  // Aplicația: totul la media ta → 100; WHOOP 62, Oura 70 → brățări 66 → starea 83.
  const r = objectiveReadiness({ ...base, recovery: 62, deviceScores: [{ source: 'whoop', score: 62 }, { source: 'oura', score: 70 }] });
  assert.equal(r.scor_aplicatie, 100);
  assert.equal(r.scor_bratari, 66);
  assert.equal(r.scor, 83);
  assert.match(dayVerdict(r, null).motiv, /media dintre calculul aplicației \(100\) și brățări \(66\)/);
  // Doar brățări (nimic de calculat în aplicație): scorul lor.
  assert.equal(objectiveReadiness({ ...base, hrv: null, rhr: null, sleepMin: null, deviceScores: [{ source: 'whoop', score: 55 }] }).scor, 55);
  // Fără brățări cu scor: calculul aplicației, ca înainte.
  assert.equal(objectiveReadiness(base).scor, 100);
  // Semnalul mare al inimii plafonează tot la galben, oricât de bună ar fi media.
  const heart = objectiveReadiness({ ...base, hrv: 38, deviceScores: [{ source: 'whoop', score: 95 }] });
  assert.equal(heart.verdict, 'galben');
  assert.deepEqual(deviceScoresOf({ perDevice: { whoop: { recuperare: 62 }, garmin: { recuperare: null } } }), [{ source: 'whoop', score: 62 }]);
});

test('fără aviz (declarat „Nu”): plan ușor, iar prima săptămână spune că nu duce la obiectiv', () => {
  const r = generatePlan({ ...input({ goal: '10k', sex: 'm', age: 40, level: 'intermediar', intens: 'Z2' }), noClearance: true });
  assert.ok(r.ok);
  assert.ok(r.weeks.flatMap((w) => w.workouts).every((w) => Math.max(0, ...w.targetZones) <= 2));
  assert.match(r.weeks[0]!.notes.join(' '), /nu ai aviz medical pentru efort intens: antrenamentele rămân ușoare \(Z1–Z2\) și nu te pot duce la obiectivul tău/);
});
