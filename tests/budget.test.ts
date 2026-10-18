import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
const expect = (x: unknown) => ({ toBe: (y: unknown) => assert.equal(x, y), toEqual: (y: unknown) => assert.deepEqual(x, y) });
import { weeklyBudget, perDayMinutes } from '../src/calendar/budget.js';
import type { FreeBlock } from '../src/types.js';

const blk = (day: number, startH: number, endH: number): FreeBlock => ({ day: day as FreeBlock['day'], startMin: startH * 60, endMin: endH * 60 });

describe('bugetul de sport (A01)', () => {
  it('5 × 120 min + 2 × 240 min = 18 h libere → 14,4 h', () => {
    const b = weeklyBudget([0, 1, 2, 3, 4].map((d) => blk(d, 18, 20)).concat([blk(5, 8, 12), blk(6, 8, 12)]));
    expect(b.freeHours).toBe(18);
    expect(b.hours).toBe(14.4);
    expect(b.valid).toBe(true);
  });

  it('toată grila bifată (16 h/zi) nu mai dă 89,6 h: max 5 h/zi și cere orele de sport', () => {
    const all = [0, 1, 2, 3, 4, 5, 6].flatMap((d) => [blk(d, 6, 8), blk(d, 8, 12), blk(d, 12, 15), blk(d, 15, 19), blk(d, 19, 22)]);
    const b = weeklyBudget(all);
    expect(b.freeHours).toBe(112);
    expect(b.hours).toBe(28);
    expect(b.valid).toBe(false);
    const c = weeklyBudget(all, undefined, 10);
    expect(c.hours).toBe(10);
    expect(c.valid).toBe(true);
    expect(perDayMinutes(all)).toEqual([300, 300, 300, 300, 300, 300, 300]);
  });

  it('plafonul declarat nu urcă bugetul peste ferestre', () => {
    expect(weeklyBudget([blk(0, 18, 20)], undefined, 12).hours).toBe(1.6);
  });

  it('intervale invalide sau sub 45 min nu contează', () => {
    const b = weeklyBudget([{ day: 9 as FreeBlock['day'], startMin: 0, endMin: 600 }, blk(1, 20, 19), { day: 2, startMin: 600, endMin: 630 }]);
    expect(b.hours).toBe(0);
    expect(b.valid).toBe(false);
  });
});
