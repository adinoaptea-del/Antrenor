import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generatePlan } from '../src/calendar/generate.js';
import { goalKind, goalSports } from '../src/calendar/phases.js';
import { daysAt, fitnessWeeks } from '../src/strength/fitness.js';
import { parseStrength, prescribe, prescribeFull, SESSIONS } from '../src/strength/ppl.js';
import { pickFitnessDays } from '../src/calendar/fitness-plan.js';
import type { FreeBlock } from '../src/types.js';

const week = (mins = 90): FreeBlock[] => [0, 1, 2, 3, 4, 5, 6].map((d) => ({ day: d as FreeBlock['day'], startMin: 18 * 60, endMin: 18 * 60 + mins }));

const plan = (fitness: Parameters<typeof generatePlan>[0]['fitness'], blocks = week()) =>
  generatePlan({ startDate: '2026-10-19', raceDate: '2027-04-19', goal: fitness!.goal, freeBlocks: blocks, historyHoursPerWeek: [], intensityAllowed: 'Z2', swimContinuous400: false, fitness });

test('fitness: obiectivul e un singur „sport”, forța', () => {
  assert.equal(goalKind('fit-slabire'), 'fitness');
  assert.deepEqual(goalSports('fit-masa'), ['forta']);
});

test('începătoare cu 4 zile și prezență demonstrată: 2 zile în S1–4, 3 în S5–8, 4 din S9; trecerile marcate', () => {
  // Fără prezență demonstrată rămâne la 2 (vezi T05 în coherence.test.ts); aici zilele sunt deblocate.
  const ws = fitnessWeeks({ goal: 'fit-tonifiere', days: 4, minutes: 60, beginner: true, unlocked: 4 });
  assert.equal(ws.length, 26);
  assert.deepEqual([ws[0]!.days, ws[4]!.days, ws[8]!.days], [2, 3, 4]);
  assert.equal(ws[4]!.transition, true);
  assert.equal(ws[8]!.transition, true);
  assert.equal(ws[5]!.transition, false);
  assert.deepEqual(ws.map((w) => w.block).filter((b, i, a) => a.indexOf(b) === i), ['acomodare', 'construire', 'progres', 'consolidare', 'tranzitie', 'mentinere']);
  // S12 e punct de evaluare, nu descărcare obligatorie (programul din 19.10.2026).
  assert.equal(ws[11]!.recovery, false);
  assert.equal(ws[11]!.evaluation, true);
});

test('cu două zile alese: picioare + partea de sus în fiecare săptămână, prin toate cele 5 ședințe, niciodată amestecate', () => {
  assert.equal(daysAt({ days: 2, beginner: false }, 20), 2);
  const r = plan({ goal: 'fit-slabire', days: 2, minutes: 60, beginner: true });
  assert.ok(r.ok);
  if (!r.ok) return;
  for (const w of r.weeks) assert.equal(w.workouts.length, 2);
  const names = new Set(r.weeks.flatMap((w) => w.workouts.map((x) => parseStrength(x.structure)!.session)));
  assert.deepEqual([...names].sort(), ['l1', 'l2', 'l3', 'u1', 'u2']);
  for (const w of r.weeks) {
    const s = w.workouts.map((x) => parseStrength(x.structure)!.session);
    assert.ok(s.filter((x) => x.startsWith('l')).length === 1 && s.filter((x) => x.startsWith('u')).length === 1, s.join());
  }
  for (const x of r.weeks.flatMap((w) => w.workouts)) {
    const rx = prescribe(parseStrength(x.structure)!, x.plannedMinutes);
    const regions = new Set(rx.items.map((i) => (i.ex.region === 'legs' ? 'legs' : i.ex.region === 'upper' ? 'upper' : 'other')));
    assert.ok(!(regions.has('legs') && regions.has('upper')), `${x.structure}: picioare + partea de sus`);
    assert.ok(x.plannedMinutes >= 45 && rx.items.every((i) => i.sets >= 3 && i.sets <= 4));
  }
});

test('întreținere: acomodare, apoi menținere', () => {
  const ws = fitnessWeeks({ goal: 'fit-intretinere', days: 3, minutes: 45, beginner: false });
  assert.equal(ws[0]!.block, 'acomodare');
  assert.equal(ws[2]!.block, 'mentinere');
});

test('S1: 3 serii pe exercițiu (acomodare); în progres 3–4, cel mult 10 pe mușchi; ședințele vechi F1/A3… dau ședința nouă', () => {
  const s1 = prescribeFull({ session: 'l1', block: 'acomodare', week: 1, len: 4 });
  assert.ok(s1.items.every((r) => r.sets === 3));
  for (const id of ['l1', 'l2', 'l3', 'u1', 'u2'] as const) {
    const p = prescribeFull({ session: id, block: 'progres', week: 2, len: 4 });
    assert.ok(p.items.every((r) => r.sets >= 3 && r.sets <= 4), id);
    assert.ok(p.minutes >= 45, id);
  }
  assert.equal(prescribeFull({ session: 'f1', block: 'progres', week: 2, len: 4 }).session.id, 'l1');
  assert.equal(prescribeFull({ session: 'b3', block: 'progres', week: 2, len: 4 }).session.id, 'u1');
});

test('ședința are cel puțin 45 de minute: cu 35 min cerute rămâne la 45, cu exercițiile principale și cardio scurt la final', () => {
  const rx = prescribe({ session: 'u1', block: 'progres', week: 2, len: 4 }, 35);
  assert.equal(rx.minutes, 45);
  assert.ok(rx.items.some((r) => r.ex.id === 'fit-lat'));
  assert.ok(rx.items.length >= 3 && rx.items.every((r) => r.sets >= 3));
  assert.equal(rx.warmup.min, 10);
});

test('zilele de sală: cât mai depărtate, din ferestrele libere', () => {
  assert.deepEqual(pickFitnessDays(week(), 2, 45), [0, 3]);
  assert.deepEqual(pickFitnessDays(week(), 3, 45), [0, 2, 4]);
  const two = pickFitnessDays([{ day: 1, startMin: 600, endMin: 700 }, { day: 2, startMin: 600, endMin: 700 }, { day: 5, startMin: 600, endMin: 700 }], 2, 45);
  assert.deepEqual(two, [1, 5]);
});

test('fără ferestre libere: fără plan, cu motiv', () => {
  const r = plan({ goal: 'fit-masa', days: 3, minutes: 45, beginner: false }, []);
  assert.equal(r.ok, false);
});

test('numele ședințelor nu conțin separatorul din plan', () => {
  for (const s of Object.values(SESSIONS)) assert.ok(!s.name.includes(' · '));
});
