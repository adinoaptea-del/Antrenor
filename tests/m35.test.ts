// Auditul „Bărbat 35 / 70.3” (19.10.2026): semnale individuale înaintea sumei, mese 1–4, ritm declarat, zone provizorii.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activeRestriction } from '../src/calendar/safety.js';
import { decideDay } from '../src/calendar/day.js';
import { DEFAULT_PREFS, nutritionDay } from '../src/nutrition/engine.js';
import { swimSet } from '../src/calendar/session-steps.js';
import { detailSteps } from '../src/calendar/session-detail.js';
import type { PlannedWorkout } from '../src/types.js';

const T = '2026-10-19';
const morning = (h: [number, number, number, number], extra: Record<string, unknown> = {}) => ({ date: T, semnale: {}, hooper: { somn: h[0], oboseala: h[1], stres: h[2], dureri: h[3] }, ...extra });

test('E01: 1/7/1/1 (epuizare 7) nu mai e „în regulă”: restricție galbenă cu explicație', () => {
  const r = activeRestriction({ today: T, morning: morning([1, 7, 1, 1]), evenings: [] });
  assert.equal(r?.verdict, 'galben');
  assert.match(r!.reason, /Epuizare 7\/7/);
  const d = decideDay({ state: { verdict: 'verde' }, readiness: null, restriction: r, todayPlan: [{ id: 'w', date: T, sport: 'alergare', type: 'z2', plannedMinutes: 40, targetZones: [2], key: false, status: 'planificat' }] });
  assert.equal(d?.level, 'galben');
  assert.match(d!.reason ?? '', /Epuizare/);
});

test('E01/C: 1/1/1/7 (dureri musculare 7) cere zona și decide pe ea; picioarele scot alergarea', () => {
  const none = activeRestriction({ today: T, morning: morning([1, 1, 1, 7]), evenings: [] });
  assert.match(none!.reason, /spune unde/);
  const legs = activeRestriction({ today: T, morning: morning([1, 1, 1, 7], { dureri_zona: 'picioare', dureri_mers: true }), evenings: [] });
  assert.match(legs!.reason, /fără alergare și fără picioare/);
  assert.match(legs!.reason, /durere, nu oboseală/);
});

test('E01: epuizarea persistentă (3 dimineți) cere verificarea cauzei; o notă bună azi nu ridică un semnal cardiac', () => {
  const mornings = [{ date: '2026-10-17', hooper: { oboseala: 7 } }, { date: '2026-10-18', hooper: { oboseala: 6 } }];
  const r = activeRestriction({ today: T, morning: morning([1, 7, 1, 1]), evenings: [], mornings: mornings as never });
  assert.match(r!.reason, /persistentă: verificăm cauza/);
  const c = activeRestriction({ today: '2026-10-20', morning: { date: '2026-10-20', semnale: {}, hooper: { oboseala: 1, dureri: 1 } } as never, evenings: [], mornings: [{ date: T, semnale: { simptom_cardiac: true } }] });
  assert.equal(c?.verdict, 'galben');
  assert.match(c!.reason, /cardiac/);
});

test('E02: 2 mese principale (prânz + cină) cu gustări acceptate; fără gustări → diferența spusă, nu tăiată', () => {
  const base = { date: T, athlete: { sex: 'm' as const, age: 35, heightCm: 180, weightKg: 78 }, goal: '70.3', sessions: [{ sport: 'bicicleta' as const, type: 'lung', minutes: 120, startMin: 480 }] };
  const two = nutritionDay({ ...base, prefs: { ...DEFAULT_PREFS, meals: 2 } });
  assert.deepEqual(two.meals.filter((m) => ['Prânz', 'Cină'].includes(m.label)).map((m) => m.slot), ['pranz', 'cina']);
  assert.ok(two.meals.every((m) => m.items.every((it) => it.qty < 1000)));
  assert.ok(two.meals.some((m) => m.label === 'Gustare în jurul antrenamentului'));
  const noSnack = nutritionDay({ ...base, prefs: { ...DEFAULT_PREFS, meals: 2, snacksOk: false } });
  assert.ok(!noSnack.meals.some((m) => m.label.startsWith('Gustare în jurul')));
  assert.ok(noSnack.warnings.some((w) => /nu încape în porții realiste: lipsesc ~\d+ kcal\. Nu tai din necesar/.test(w)));
  assert.equal(Math.round(noSnack.energy!.target), Math.round(two.energy!.target), 'numărul de mese nu scade necesarul');
  assert.equal(nutritionDay({ ...base, prefs: { ...DEFAULT_PREFS, meals: 1 } }).meals[0]!.slot, 'cina');
});

test('V01: timpul declarat pe 400 m înlocuiește ritmul presupus de 2:45 (și e etichetat ca declarat)', () => {
  const declared = swimSet({ type: 'tehnica', minutes: 30, css: null, date: T, continuousM: 400, declared400Sec: 8 * 60 + 30 });
  assert.match(declared.steps.at(-1)!.text, /din timpul tău declarat pe 400 m: ușor ~2:23\/100 m/);
  assert.match(swimSet({ type: 'tehnica', minutes: 30, css: null, date: T, continuousM: 400 }).steps.at(-1)!.text, /ritm presupus 2:45/);
});

test('E05/E06: zonele estimate sunt „reper provizoriu”; mobilitatea e în minutele încălzirii (30 = 30)', () => {
  const w: PlannedWorkout = { id: 'r', date: T, sport: 'alergare', type: 'z2', plannedMinutes: 30, targetZones: [2], key: false, status: 'planificat', structure: 'ușor + 3 accelerări de 20 s' };
  const st = detailSteps(w, { age: 35 });
  assert.match(st.find((s) => s.label === 'Plafon')!.text, /reper provizoriu, estimat din vârstă/);
  assert.ok(!st.some((s) => /opțional 3 min/.test(s.text)));
  const mins = st.filter((s) => ['Încălzire', 'Principal', 'Accelerări', 'Revenire'].includes(s.label)).reduce((n, s) => n + Number(/\((\d+) min\)/.exec(s.text)?.[1] ?? /^(\d+)/.exec(s.text)?.[1] ?? 0), 0);
  assert.equal(mins, 30);
});

test('G: orele recente declarate dau doza de start fără istoric importat (etichetate), dar nu deblochează 30/15', async () => {
  const { generatePlan } = await import('../src/calendar/generate.js');
  const blocks = [0, 1, 2, 3, 4, 5, 6].map((d) => ({ day: d as 0, startMin: d >= 5 ? 420 : 1020, endMin: d >= 5 ? 720 : 1170 }));
  const base = { startDate: '2026-10-26', raceDate: '2027-09-26', goal: '70.3' as const, freeBlocks: blocks, historyHoursPerWeek: [] as number[], intensityAllowed: 'toate' as const, swimContinuous400: true, sportHours: 12 };
  const none = generatePlan(base);
  const decl = generatePlan({ ...base, declaredRecentHours: 8 });
  assert.ok(none.ok && decl.ok);
  if (!none.ok || !decl.ok) return;
  assert.ok(decl.weeks[0]!.targetHours > none.weeks[0]!.targetHours, `${decl.weeks[0]!.targetHours} > ${none.weeks[0]!.targetHours}`);
  assert.match(decl.weeks[0]!.notes.join(' '), /declarate de tine/);
  const measured = generatePlan({ ...base, historyHoursPerWeek: [8, 8, 8, 8], declaredRecentHours: 2 });
  assert.ok(measured.ok && !measured.weeks[0]!.notes.join(' ').includes('declarate de tine'), 'istoricul măsurat are prioritate');
  const all = decl.weeks.flatMap((w) => w.workouts).map((w) => w.structure ?? '').join(' ');
  assert.ok(!/30\/15/.test(all), 'declarația nu deblochează 30/15');
});
