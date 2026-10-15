import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { weeklyBudget } from '../src/calendar/budget.js';
import { generatePlan, type WeekPlan } from '../src/calendar/generate.js';
import { phaseLengths, phaseWeeks } from '../src/calendar/phases.js';
import type { FreeBlock } from '../src/types.js';
import { weekday } from '../src/util/dates.js';

// Program de tip „job cu ore fixe după-amiaza”: dimineți libere luni–marți, prânz miercuri–vineri, seri și weekend.
export const blocks: FreeBlock[] = [
  { day: 0, startMin: 6 * 60, endMin: 9 * 60 },
  { day: 0, startMin: 19 * 60 + 30, endMin: 21 * 60 },
  { day: 1, startMin: 6 * 60, endMin: 9 * 60 },
  { day: 1, startMin: 19 * 60 + 30, endMin: 21 * 60 },
  { day: 2, startMin: 12 * 60 + 30, endMin: 15 * 60 },
  { day: 3, startMin: 12 * 60 + 30, endMin: 15 * 60 },
  { day: 3, startMin: 19 * 60 + 30, endMin: 21 * 60 },
  { day: 4, startMin: 12 * 60 + 30, endMin: 15 * 60 },
  { day: 5, startMin: 8 * 60, endMin: 13 * 60 },
  { day: 6, startMin: 8 * 60, endMin: 12 * 60 },
];

describe('weeklyBudget', () => {
  it('ignoră blocurile sub 45 de minute și aplică factorul 0,8', () => {
    const b = weeklyBudget([
      { day: 0, startMin: 0, endMin: 30 },
      { day: 1, startMin: 0, endMin: 120 },
    ]);
    assert.equal(b.blocks.length, 1);
    assert.equal(b.hours, 1.6);
  });
});

describe('phases', () => {
  it('alocă taper 2, peak 4, build 12, baza2 8, evaluare 3 când sunt destule săptămâni', () => {
    assert.deepEqual(phaseLengths(48), { evaluare: 3, baza1: 19, baza2: 8, build: 12, peak: 4, taper: 2 });
  });

  it('orizont scurt: toate fazele au minimum o săptămână și totalul e exact', () => {
    const l = phaseLengths(12);
    assert.equal(Object.values(l).reduce((a, b) => a + b, 0), 12);
    assert.ok(l.taper >= 1);
    assert.ok(l.build >= 1);
  });

  it('săptămâna cursei e ultima săptămână de taper și a 4-a săptămână e de descărcare', () => {
    const w = phaseWeeks('2026-10-19', '2027-09-12');
    assert.equal(w.at(-1)!.phase, 'taper');
    assert.equal(w.at(-1)!.weekStart, '2027-09-06');
    assert.ok(w.filter((x) => x.recovery).length > 5);
    assert.ok(w.every((x) => weekday(x.weekStart) === 0));
  });
});

describe('generatePlan', () => {
  it('refuză planul când orele nu ajung și dă variante, nu un plan comprimat', () => {
    const r = generatePlan({
      startDate: '2026-11-02',
      raceDate: '2027-09-12',
      goal: '70.3',
      freeBlocks: [
        { day: 5, startMin: 8 * 60, endMin: 12 * 60 },
        { day: 6, startMin: 8 * 60, endMin: 11 * 60 },
      ],
      historyHoursPerWeek: [],
      intensityAllowed: 'Z2',
      swimContinuous400: false,
    });
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.equal(r.minimumHours, 8);
      assert.equal(r.options.length, 3);
    }
  });

  it('construiește un plan plasat în blocurile reale, cu antrenamentele-cheie în zile diferite', () => {
    const r = generatePlan({
      startDate: '2026-11-02',
      raceDate: '2027-09-12',
      goal: '70.3',
      freeBlocks: blocks,
      historyHoursPerWeek: [5, 6, 5.5, 6],
      intensityAllowed: 'Z2',
      swimContinuous400: false,
    });
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.ok(r.weeks.length > 40);
    for (const week of r.weeks) {
      const byDate = new Map<string, number>();
      for (const w of week.workouts.filter((x) => x.key)) byDate.set(w.date, (byDate.get(w.date) ?? 0) + 1);
      for (const n of byDate.values()) assert.equal(n, 1);
      assert.ok(week.plannedHours <= r.budgetHours + 0.01, `${week.weekStart}: ${week.plannedHours} > ${r.budgetHours}`);
    }
    const first = r.weeks[0]!;
    assert.ok(first.workouts.some((w) => w.type === 'lung' && w.sport === 'bicicleta'));
    assert.ok(first.workouts.some((w) => w.type === 'lung' && w.sport === 'alergare'));
    assert.ok(!first.workouts.some((w) => w.type === 'calitate' && w.sport === 'alergare'), 'fără aviz nu există calitate la alergare');
  });

  it('cu intensitatea permisă apare ședința de calitate; în build apare brick-ul; descărcarea nu are chei și are mai puține ore', () => {
    const r = generatePlan({
      startDate: '2026-11-02',
      raceDate: '2027-09-12',
      goal: '70.3',
      freeBlocks: blocks,
      historyHoursPerWeek: [7, 7, 8, 8],
      intensityAllowed: 'toate',
      swimContinuous400: true,
    });
    assert.equal(r.ok, true);
    if (!r.ok) return;
    const base = r.weeks.find((w) => w.phase === 'baza1' && !w.recovery)!;
    assert.ok(base.workouts.some((w) => w.type === 'calitate' && w.sport === 'alergare' && w.key));
    const build = r.weeks.find((w) => w.phase === 'build' && !w.recovery)!;
    assert.ok(build.workouts.some((w) => w.type === 'brick'));
    const idx = r.weeks.findIndex((w) => w.recovery);
    const rec = r.weeks[idx]!;
    assert.ok(rec.workouts.every((w) => !w.key));
    assert.ok(rec.targetHours < r.weeks[idx - 1]!.targetHours);
  });

  it('progresia nu depășește ținta fazei și nu sare peste +10% pe săptămână', () => {
    const r = generatePlan({
      startDate: '2026-11-02',
      raceDate: '2027-09-12',
      goal: '70.3',
      freeBlocks: blocks,
      historyHoursPerWeek: [4],
      intensityAllowed: 'toate',
      swimContinuous400: true,
    });
    assert.equal(r.ok, true);
    if (!r.ok) return;
    let prev = r.weeks[0]!.targetHours;
    for (let i = 1; i < r.weeks.length; i++) {
      const w: WeekPlan = r.weeks[i]!;
      if (!w.recovery) {
        assert.ok(w.targetHours <= prev * 1.1 + 0.11, `${w.weekStart}: ${w.targetHours} vs ${prev}`);
        assert.ok(w.targetHours <= 14);
        prev = w.targetHours;
      }
    }
  });
});
