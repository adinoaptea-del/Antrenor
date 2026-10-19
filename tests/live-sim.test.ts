// Auditul „Simulări live: oboseală, pauze, regenerare și semnal cardiac” (19.10.2026): un test pe constatare.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generatePlan } from '../src/calendar/generate.js';
import { detailSteps } from '../src/calendar/session-detail.js';
import { coherenceIssues } from '../src/calendar/coherence.js';
import { applyAway, easyWorkout, moveWorkout } from '../src/calendar/actions.js';
import { carryAdjustments, planSignature, weekTotals } from '../src/calendar/regen-carry.js';
import { CARDIAC_ACTION, activeRestriction, pendingCardiac, stopAction } from '../src/calendar/safety.js';
import { decideDay } from '../src/calendar/day.js';
import { outcomeFeedback, type Outcome } from '../src/calendar/outcomes.js';
import { decideFamily, FAMILIES, type Execution } from '../src/calendar/progression.js';
import type { PlannedWorkout } from '../src/types.js';

const AT = '2026-10-19T08:00:00Z';
const TODAY = '2026-10-19';
const W = (o: Partial<PlannedWorkout>): PlannedWorkout => ({ id: 'w', date: '2026-10-31', sport: 'alergare', type: 'z2', plannedMinutes: 30, targetZones: [2], key: false, status: 'planificat', ...o });

// Profilul din audit: 10 km în 56:00, 46 de ani, luni/marți/joi/sâmbătă 06–08, 4 h/săpt.
const FREE = [0, 1, 3, 5].map((day) => ({ day, startMin: 360, endMin: 480 }));
const tenK = () => {
  const r = generatePlan({ startDate: '2026-10-26', raceDate: '2027-09-12', goal: '10k', freeBlocks: FREE as never, sportHours: 4, historyHoursPerWeek: [], intensityAllowed: 'toate', swimContinuous400: false, athlete: { age: 46, sex: 'm' }, level: { longestRunKm: 5, easyPaceSecKm: 405 } as never, run: { goalPaceSecKm: 336, canDoDistance: false, longestRunKm: 5, branch: 'timp', beginner: false } as never });
  assert.ok(r.ok);
  return r as Extract<typeof r, { ok: true }>;
};

test('L-SIM-01: „Fă-o ușoară” pe alergarea lungă de sâmbătă rămâne după „Refă planul” (40 → 30 min)', () => {
  const long = W({ id: 'old-l', date: '2026-10-31', type: 'lung', plannedMinutes: 40, structure: 'ușor, conversațional' });
  const adjusted = easyWorkout(long, AT);
  assert.equal(adjusted.plannedMinutes, 30);
  // Planul nou (candidat) are din nou alergarea lungă de 40 min în aceeași zi.
  const candidate = [W({ id: 'new-l', date: '2026-10-31', type: 'lung', plannedMinutes: 40, structure: 'ușor, conversațional' }), W({ id: 'new-z', date: '2026-10-27' })];
  const r = carryAdjustments(candidate, [adjusted], '2026-10-26', TODAY, AT);
  const l = r.workouts.find((x) => x.id === 'new-l')!;
  assert.equal(l.plannedMinutes, 30);
  assert.deepEqual(l.targetZones, [1, 2]);
  assert.match(r.kept[0]!, /sâmbătă 31\.10, alergare: rămâne ușoară \(30 min\)/);
  assert.deepEqual(r.dropped, []);
});

test('L-SIM-01: o ajustare care nu se mai poate aplica nu dispare în tăcere: motivul apare în previzualizare', () => {
  const moved = moveWorkout([W({ id: 'a', date: '2026-10-27' }), W({ id: 'b', date: '2026-10-29' })], 'a', '2026-10-28', TODAY, AT);
  const r = carryAdjustments([W({ id: 'n1', date: '2026-10-29', sport: 'bicicleta' })], [moved], '2026-10-26', TODAY, AT);
  assert.equal(r.kept.length, 0);
  assert.match(r.dropped[0]!, /marți 27\.10, alergare .*planul nou nu mai are ședința/);
});

test('L-SIM-02: previzualizarea numără exact ce se activează (anulatele din pauză nu intră în totaluri)', () => {
  const week = [W({ id: '1', date: '2026-10-26', sport: 'forta', type: 'forta' }), W({ id: '2', date: '2026-10-27' }), W({ id: '3', date: '2026-10-29' }), W({ id: '4', date: '2026-10-31', type: 'lung', plannedMinutes: 40 })];
  const changed = new Map(applyAway(week, { dela: '2026-10-27', panala: '2026-10-29', ce: 'nimic' }, TODAY, AT).map((w) => [w.id, w]));
  const candidate = week.map((w) => changed.get(w.id) ?? w);
  // Înainte: previzualizarea lua planul fără pauză (4 ședințe); acum, totalul candidatului: 2 ședințe, 70 min.
  assert.deepEqual(weekTotals(candidate, '2026-10-26', '2026-11-02'), { sessions: 2, hours: 1.2 });
  // Aceleași intrări → aceeași amprentă (a doua confirmare nu creează altă versiune); orice schimbare o modifică.
  assert.equal(planSignature(candidate), planSignature(candidate.map((w) => ({ ...w, id: `x-${w.id}` }))));
  assert.notEqual(planSignature(candidate), planSignature(week));
});

test('L-SIM-03: simptomul cardiac are prioritate peste notele bune, cu aceeași acțiune în formular și pe Home', () => {
  const r = activeRestriction({ today: TODAY, morning: { date: TODAY, semnale: { simptom_cardiac: true } }, evenings: [] });
  assert.equal(r?.verdict, 'stop');
  assert.equal(stopAction(r!.reason), CARDIAC_ACTION);
  const day = decideDay({ state: { verdict: 'verde' }, readiness: { verdict: 'verde', reason: null }, restriction: r, todayPlan: [W({ date: TODAY })] });
  assert.equal(day?.level, 'stop');
  assert.equal(day?.action, CARDIAC_ACTION);
  assert.match(CARDIAC_ACTION, /evaluare medicală azi/);
});

test('L-SIM-03: a doua zi după simptomul cardiac: doar ușor (fără teste), până la evaluarea medicală declarată', () => {
  const mornings = [{ date: '2026-10-19', semnale: { simptom_cardiac: true } }];
  const next = activeRestriction({ today: '2026-10-20', morning: null, evenings: [], mornings });
  assert.equal(next?.verdict, 'galben');
  assert.match(next!.reason, /fără teste, intervale/);
  assert.equal(pendingCardiac(mornings, '2026-11-02'), '2026-10-19');
  // Scorul bun de dimineață nu stinge restricția; doar bifa de evaluare o ridică.
  assert.equal(activeRestriction({ today: '2026-10-21', morning: { date: '2026-10-21', semnale: { simptom_cardiac: false } }, evenings: [], mornings })?.verdict, 'galben');
  assert.equal(activeRestriction({ today: '2026-10-21', morning: { date: '2026-10-21', semnale: { simptom_cardiac: false, cardiac_evaluat: true } }, evenings: [], mornings }), null);
});

test('L-SIM-07: rezumatul și pașii spun același număr de accelerări, în tot planul de 10 km', () => {
  const r = tenK();
  const issues = r.weeks.flatMap((w) => w.workouts).flatMap((w) => coherenceIssues(w, detailSteps(w, { age: 46 })));
  assert.deepEqual(issues, []);
  const first = r.weeks[0]!.workouts.find((w) => w.date === '2026-10-27')!;
  assert.equal(first.plannedMinutes, 30);
  assert.match(first.structure ?? '', /^ușor \+ 3 accelerări/);
});

test('L-SIM-08: alimentația pentru efort lung apare doar peste 75 de minute', () => {
  const short = detailSteps(W({ type: 'lung', plannedMinutes: 30 }), { age: 46 });
  const long = detailSteps(W({ type: 'lung', plannedMinutes: 90 }), { age: 46 });
  assert.ok(!short.some((s) => /carbohidrați/.test(s.text)));
  assert.ok(long.some((s) => /carbohidrați/.test(s.text)));
});

test('L-SIM-10: nicio săptămână nu trece de bugetul declarat (4 h = 240 min)', () => {
  const r = tenK();
  const over = r.weeks.map((w) => [w.weekStart, w.workouts.reduce((n, x) => n + x.plannedMinutes, 0)] as const).filter(([, m]) => m > 240);
  assert.deepEqual(over, []);
});

test('T02: notele proaste într-o zi fără ședințe spun explicit că planul rămâne și când se reevaluează', () => {
  const d = decideDay({ state: { verdict: 'rosu', motiv: 'cum te simți azi (24/28) coboară ziua la rosu' }, readiness: null, restriction: null, todayPlan: [] });
  assert.match(d!.action, /era deja pauză.*Planul rămâne/);
});

const plan = [W({ id: 'm1', date: '2026-10-17' }), W({ id: 'm2', date: '2026-10-18' }), W({ id: 'q', date: '2026-10-22', type: 'calitate', key: true, targetZones: [4], plannedMinutes: 45, structure: '3 × 8 min Z4' }), W({ id: 'z', date: '2026-10-24' })];
const o = (id: string, date: string, motiv: Outcome['motiv']): Outcome => ({ workoutId: id, date, status: 'ratat', motiv });

test('Ședință nefăcută din lipsă de timp: nu se dublează, nimic nu se schimbă, explicat', () => {
  const r = outcomeFeedback(plan, [o('m1', '2026-10-17', 'timp')], o('m1', '2026-10-17', 'timp'), TODAY, AT);
  assert.equal(r.decision, 'pastrat');
  assert.deepEqual(r.changed, []);
  assert.match(r.message, /Nu o recuperăm prin dublare\. Următoarea ședință .* rămâne cum e: lipsa de timp nu înseamnă că nu poți/);
});

test('Două ședințe nefăcute din oboseală în 7 zile: următoarea ședință grea devine ușoară, cu dovezile', () => {
  const outs = [o('m1', '2026-10-17', 'oboseala'), o('m2', '2026-10-18', 'oboseala')];
  const r = outcomeFeedback(plan, outs, outs[1]!, TODAY, AT);
  assert.equal(r.decision, 'modificat');
  assert.equal(r.changed[0]!.id, 'q');
  assert.equal(r.changed[0]!.type, 'z2');
  assert.equal(r.changed[0]!.key, false);
  assert.match(r.changed[0]!.note ?? '', /2 ședințe nefăcute sau parțiale din oboseală .*declarat de tine/);
  assert.ok(r.changed[0]!.original, 'forma din plan rămâne vizibilă (Actualizat)');
  assert.match(r.message, /Despre obiectiv: neschimbat deocamdată/);
});

test('Progresia: oboseala declarată nu e toleranță; timpul e neutru', () => {
  const f = FAMILIES.find((x) => x.id === 'T')!;
  const green = (id: string): Execution => ({ workoutId: id, color: 'verde', rpe: 5, pain: 0 });
  const tired = (id: string): Execution => ({ workoutId: id, color: null, outcome: { status: 'ratat', motiv: 'oboseala' } });
  const time = (id: string): Execution => ({ workoutId: id, color: null, outcome: { status: 'ratat', motiv: 'timp' }, shortenedForTime: true });
  const past = (exs: Execution[]) => exs.map((ex, i) => ({ date: `2026-10-0${i + 1}`, step: 0, ex }));
  assert.equal(decideFamily(f, past([green('a'), tired('b')]), 1, '2026-10-08').decision, 'keep');
  assert.equal(decideFamily(f, past([tired('a'), tired('b')]), 1, '2026-10-08').decision, 'regress');
  const t = decideFamily(f, past([green('a'), time('b')]), 1, '2026-10-08');
  assert.equal(t.decision, 'keep');
  assert.match(t.evidence, /lipsă de timp.*nu e incapacitate/);
});

test('Pauză de 12 zile: din boală se reia o treaptă mai jos, din lipsă de timp la aceeași treaptă', () => {
  const f = FAMILIES.find((x) => x.id === 'T')!;
  const done = { date: '2026-11-02', step: 1, ex: { workoutId: 'a', color: 'verde' as const, rpe: 5, pain: 0 } };
  const miss = (motiv: 'boala' | 'timp') => ({ date: '2026-11-06', step: 1, ex: { workoutId: 'b', color: null, outcome: { status: 'ratat' as const, motiv } } });
  const ill = decideFamily(f, [done, miss('boala')], 1, '2026-11-14');
  assert.equal(ill.decision, 'recalibrate');
  assert.match(ill.evidence, /12 zile .* boală/);
  assert.equal(decideFamily(f, [done, miss('timp')], 1, '2026-11-14').decision, 'keep');
});
