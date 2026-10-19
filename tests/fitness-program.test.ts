// Testele obligatorii din „AIRON — Fitness pentru femei, program de 26 de săptămâni” (19.10.2026), pe motorul real.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generatePlan } from '../src/calendar/generate.js';
import { adapt } from '../src/calendar/adapt.js';
import { fitnessProfile, fitnessWeeks, daysAt, unlockedDays, wideEligible } from '../src/strength/fitness.js';
import { prescribe, prescribeFull, parseStrength, estimateMinutes, CATALOG, SESSIONS } from '../src/strength/ppl.js';
import { suggest, type StrengthLogEntry } from '../src/strength/log.js';
import type { FreeBlock, PlannedWorkout } from '../src/types.js';

const FREE: FreeBlock[] = [0, 1, 2, 3, 4, 5, 6].map((d) => ({ day: d as 0, startMin: 17 * 60, endMin: 19 * 60 }));
const START = '2026-10-26';
const plan = (zile: 2 | 3 | 4, experienta: 'incepatoare' | 'stabila', miscare: 'sedentara' | 'plimbari' | 'activa', minute = 60, unlocked?: 2 | 3 | 4) => {
  const f = { ...fitnessProfile('fit-tonifiere', { experienta, zile, minute, acces: 'sala', miscare }), ...(unlocked ? { unlocked } : {}) };
  const r = generatePlan({ startDate: START, raceDate: '2027-04-26', goal: 'fit-tonifiere', freeBlocks: FREE, historyHoursPerWeek: [], intensityAllowed: 'toate', swimContinuous400: false, fitness: f });
  assert.ok(r.ok);
  return r.weeks;
};
const sessionsOf = (w: { workouts: PlannedWorkout[] }) => w.workouts.map((x) => parseStrength(x.structure)!.session);

test('1) începătoarea nu primește automat patru zile (nici varianta A–D)', () => {
  const ws = plan(4, 'incepatoare', 'sedentara');
  assert.ok(ws.every((w) => w.workouts.length <= 2), 'fără prezență demonstrată rămâne la 2');
  assert.equal(wideEligible(fitnessProfile('fit-tonifiere', { experienta: 'incepatoare', zile: 4, minute: 75 })), false);
  const unlocked = plan(4, 'incepatoare', 'sedentara', 60, 4);
  assert.ok(unlocked.flatMap(sessionsOf).every((s) => !['fa', 'fb', 'fc', 'fd'].includes(s)), 'chiar cu 4 zile deblocate, începătoarea are L/U, nu A–D');
});

test('A–D doar pentru profilul eligibil: experiență, ≥ 55 min, patru zile ținute', () => {
  const active = plan(4, 'stabila', 'activa', 60);
  assert.deepEqual(sessionsOf(active[0]!), ['fa', 'fb', 'fc', 'fd']);
  const short = plan(4, 'stabila', 'activa', 45);
  assert.deepEqual(sessionsOf(short[0]!), ['l1', 'u1', 'l2', 'u2']);
  const notYet = plan(4, 'stabila', 'plimbari', 60);
  assert.equal(notYet[0]!.workouts.length, 3, 'fără antrenament regulat acum: 3 zile până la prezență demonstrată');
});

test('2) fără greutăți înregistrate nu apar kilograme inventate', () => {
  const s = suggest('fit-hip-thrust', '8–12', '2–3', []);
  assert.equal(s.kind, 'prima');
  assert.doesNotMatch(s.today, /\d+\s*kg/);
  const noKg: StrengthLogEntry[] = [{ date: '2026-11-02', exercise: 'fit-hip-thrust', sets: [{ kg: null, reps: 12 }, { kg: null, reps: 12 }], rir: 2, source: 'confirmat' }];
  const t = suggest('fit-hip-thrust', '8–12', '2–3', noKg);
  assert.equal(t.kind, 'fara-kg');
  assert.doesNotMatch(t.today, /\d+\s*kg/);
});

const log = (reps: number[][], kg = 40): StrengthLogEntry[] => reps.map((r, i) => ({ date: `2026-11-${String(2 + i * 7).padStart(2, '0')}`, exercise: 'fit-hip-thrust', sets: r.map((n) => ({ kg, reps: n })), rir: 2, source: 'ajustat' }));

test('3) două expuneri valide la capătul de sus declanșează progresia; una singură nu', () => {
  // Exemplul din program: 10/9/8 → 11/10/9 → 12/12/11 → 12/12/12 → 12/12/12, abia apoi increment.
  const steps = [[10, 9, 8], [11, 10, 9], [12, 12, 11], [12, 12, 12], [12, 12, 12]];
  const kinds = steps.map((_, i) => suggest('fit-hip-thrust', '8–12', '2–3', log(steps.slice(0, i + 1))).kind);
  assert.deepEqual(kinds, ['repetari', 'repetari', 'repetari', 'repetari', 'creste']);
});

test('stagnare: aceleași repetări nu cresc greutatea; scăderea de două ori cere revizuire, nu mai mult', () => {
  const flat = log([[10, 10, 9], [10, 10, 9], [10, 10, 9], [10, 10, 9]]);
  assert.equal(suggest('fit-hip-thrust', '8–12', '2–3', flat).kind, 'stagnare');
  const down = log([[12, 11, 10], [11, 10, 9], [10, 9, 8]]);
  assert.equal(suggest('fit-hip-thrust', '8–12', '2–3', down).kind, 'scade');
});

test('4) durata include ambele picioare și schimbarea părții', () => {
  const bul = { ex: CATALOG['fit-bulgarian']!, sets: 2, reps: '8–10/picior', rir: '2–3', rest: 105 };
  const bilat = { ...bul, ex: { ...bul.ex, unilateral: false } };
  assert.ok(estimateMinutes([bul]) - estimateMinutes([bilat]) >= (2 * (30 + 15)) / 60 - 0.01);
  const a = prescribeFull({ session: 'fa', block: 'construire', week: 1, len: 4 });
  assert.ok(a.minutes >= 55 && a.minutes <= 75, `A durează ${a.minutes} min (programul: 55–70)`);
});

test('5) o zi ratată nu se dublează: rotația continuă, nimic adăugat', () => {
  const ws = plan(4, 'stabila', 'activa', 60);
  const week = ws[5]!.workouts;
  const before = week.map((w) => parseStrength(w.structure)!.session);
  const r = adapt(ws.flatMap((w) => w.workouts), { kind: 'forta-ratat', workoutId: week[0]!.id }, { today: week[1]!.date, freeBlocks: FREE, recentKeyScores: [] });
  const after = r.plan.filter((w) => week.some((x) => x.id === w.id)).map((w) => parseStrength(w.structure)!.session);
  assert.deepEqual(after.slice(1), before.slice(0, 3), 'următoarele sloturi iau A, B, C; D nu se mai face săptămâna asta');
  assert.equal(r.plan.length, ws.flatMap((w) => w.workouts).length, 'nicio ședință în plus');
  const sameDay = new Map<string, number>();
  for (const w of r.plan) sameDay.set(w.date, (sameDay.get(w.date) ?? 0) + 1);
  assert.ok([...sameDay.values()].every((n) => n <= 1));
});

test('6) simptomele opresc progresia', () => {
  const top = log([[12, 12, 12], [12, 12, 12]]);
  assert.equal(suggest('fit-hip-thrust', '8–12', '2–3', top).kind, 'creste');
  assert.equal(suggest('fit-hip-thrust', '8–12', '2–3', top, { pain: true }).kind, 'stop-durere');
});

test('7) timpul redus păstrează o ședință coerentă: accesoriile pleacă, pauzele și mișcările principale rămân', () => {
  const full = prescribe({ session: 'fa', block: 'construire', week: 2, len: 4 }, 90);
  for (const m of [60, 45, 35]) {
    const r = prescribe({ session: 'fa', block: 'construire', week: 2, len: 4 }, m);
    // Cel puțin 45 de minute (regula proprietarului): sub 45 nu se scurtează mai mult.
    assert.ok(r.minutes <= Math.max(45, m) && r.minutes >= 45, `${m}: ${r.minutes}`);
    assert.ok(r.items.every((x) => x.sets >= 3 && x.sets <= 4));
    assert.ok(r.items.some((x) => x.ex.id === 'fit-hip-thrust') && r.items.some((x) => x.ex.id === 'fit-leg-press'), 'principalele rămân');
    for (const x of r.items) assert.equal(x.rest, full.items.find((y) => y.ex.id === x.ex.id)!.rest, 'pauza nu se comprimă');
  }
});

test('8) menținerea nu escaladează: 3 serii pe exercițiu, constant; sugestia nu cere creștere', () => {
  const ws = fitnessWeeks({ goal: 'fit-tonifiere', days: 4, minutes: 60, beginner: false, activity: 'activa' });
  const maint = ws.filter((w) => w.block === 'mentinere');
  const sets = maint.map((w) => prescribeFull({ session: 'fa', block: w.block, week: w.blockWeek, len: w.blockLen }).items.reduce((n, r) => n + r.sets, 0));
  assert.ok(sets.every((n, i) => i === 0 || n <= sets[i - 1]!), `seriile în menținere: ${sets.join(', ')}`);
  for (const w of maint) assert.ok(prescribeFull({ session: 'fa', block: w.block, week: w.blockWeek, len: w.blockLen }).items.every((r) => r.sets === 3));
  assert.equal(suggest('fit-hip-thrust', '8–12', '2–3', log([[12, 12, 12], [12, 12, 12]]), { maintain: true }).kind, 'mentine');
});

test('punctele de evaluare (4, 8, …, 24) nu sunt descărcări automate; revizuirea vine din oboseală', () => {
  const ws = fitnessWeeks({ goal: 'fit-tonifiere', days: 4, minutes: 60, beginner: false, activity: 'activa' });
  assert.deepEqual(ws.filter((w) => w.evaluation).map((w) => w.week), [4, 8, 12, 16, 20, 24]);
  assert.ok(ws.every((w) => !w.recovery));
  const p = plan(4, 'stabila', 'activa', 60);
  const all = p.flatMap((w) => w.workouts);
  const sunday = '2026-12-06';
  const r = adapt(all, { kind: 'bilant', date: sunday, obosit: true, motiv: 'energie 2/5' }, { today: sunday, freeBlocks: FREE, recentKeyScores: [] });
  const next = r.plan.filter((w) => w.date > sunday && w.date <= '2026-12-13');
  assert.ok(next.length > 0 && next.every((w) => parseStrength(w.structure)!.recovery));
  const rx = prescribeFull(parseStrength(next[0]!.structure)!);
  assert.ok(rx.items.every((x) => x.rir === '3–4'));
});

test('varietatea controlată (săpt. 13–16): un singur element schimbat pe ședință, recalibrat', () => {
  for (const id of ['fa', 'fb', 'fc', 'fd'] as const) {
    const base = prescribeFull({ session: id, block: 'progres', week: 1, len: 4 }).items.map((x) => x.ex.id);
    const v = prescribeFull({ session: id, block: 'consolidare', week: 1, len: 4 });
    const diff = v.items.map((x) => x.ex.id).filter((x) => !base.includes(x));
    assert.ok(diff.length <= 1, `${id}: ${diff.join(', ')}`);
    if (diff.length) assert.ok(v.notes.some((n) => /cauți din nou greutatea/.test(n)));
  }
  assert.equal(SESSIONS.fa.exercises.length, 7);
});

test('frecvența: urcă doar după prezență; 2 zile alese rămân 2', () => {
  assert.equal(unlockedDays({ days: 4, beginner: true }, Array(12).fill({ planned: 2, done: 1 })), 2);
  // 3 săptămâni bune la 2 zile → 3; abia 3 săptămâni bune la 3 zile → 4 (săptămânile la 2 nu dovedesc 3).
  assert.equal(unlockedDays({ days: 4, beginner: true }, Array(6).fill({ planned: 2, done: 2 })), 3);
  assert.equal(unlockedDays({ days: 4, beginner: true }, [...Array(3).fill({ planned: 2, done: 2 }), ...Array(3).fill({ planned: 3, done: 3 })]), 4);
  assert.equal(daysAt({ days: 2, beginner: false, activity: 'activa' }, 1), 2);
});
