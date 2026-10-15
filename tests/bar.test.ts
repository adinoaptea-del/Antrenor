import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeBar, type ScoredActivity } from '../src/bar/bar.js';

const a = (over: Partial<ScoredActivity>): ScoredActivity => ({ id: 'a', date: '2027-05-01', sport: 'alergare', minutes: 60, color: 'verde', ...over });

describe('computeBar', () => {
  it('fără date: componentele arată „fără date” și totalul e null, nu 0', () => {
    const r = computeBar({ today: '2027-05-10', activities: [], plannedColorsLast4Weeks: [], openFlags: [], goal: '70.3' });
    assert.equal(r.total, null);
    assert.ok(r.components.every((c) => c.value === null));
    assert.equal(r.basis, 'pe baza a 0 din 5 componente');
  });

  it('calculează doar din componentele cu date și spune pe câte se bazează', () => {
    const r = computeBar({
      today: '2027-05-10',
      activities: [a({ id: 'r1', distanceKm: 9, color: 'verde' }), a({ id: 'k1', sport: 'bicicleta', distanceKm: 45, color: 'galben' })],
      plannedColorsLast4Weeks: ['verde', 'verde', 'galben', 'rosu', 'gri'],
      openFlags: [],
      goal: '70.3',
    });
    assert.equal(r.basis, 'pe baza a 3 din 5 componente');
    assert.equal(r.components.find((c) => c.name === 'alergare')!.value, 30); // 0,6 × 9/18
    assert.equal(r.components.find((c) => c.name === 'bicicleta')!.value, 30); // 0,6 × 45/90, fără brick
    assert.equal(r.components.find((c) => c.name === 'consistenta')!.value, 75); // 3 din 4 (gri nu se numără)
    assert.equal(r.total, 40.4);
  });

  it('activitățile roșii sau neplanificate nu contează; fereastra e de 6 săptămâni', () => {
    const r = computeBar({
      today: '2027-05-10',
      activities: [a({ id: 'old', distanceKm: 20, date: '2027-03-01' }), a({ id: 'blue', distanceKm: 20, color: 'albastru' }), a({ id: 'ok', distanceKm: 10, color: 'galben' })],
      plannedColorsLast4Weeks: [],
      openFlags: [],
      goal: '70.3',
    });
    assert.equal(r.components.find((c) => c.name === 'alergare')!.evidence[0]!.activityId, 'ok');
  });

  it('un semnal deschis blochează bara', () => {
    const r = computeBar({ today: '2027-05-10', activities: [a({ distanceKm: 18 })], plannedColorsLast4Weeks: [], openFlags: ['durere 6/10 netratată'], goal: '70.3' });
    assert.equal(r.blocked, 'durere 6/10 netratată');
    assert.equal(r.total, null);
  });

  it('înot cu CSS: 70% distanță + 30% ritm; brick-ul ridică bicicleta și alergarea', () => {
    const r = computeBar({
      today: '2027-05-10',
      activities: [
        a({ id: 's', sport: 'inot', distanceKm: 1.9 }),
        a({ id: 'k', sport: 'bicicleta', distanceKm: 90 }),
        a({ id: 'b', distanceKm: 8, minutes: 50, afterBikeMinutes: 12 }),
        a({ id: 'l', distanceKm: 18 }),
      ],
      plannedColorsLast4Weeks: ['verde'],
      cssSecPer100m: 150,
      ctl: 60,
      ctlTarget: 60,
      openFlags: [],
      goal: '70.3',
    });
    assert.equal(r.total, 100);
    assert.equal(r.components.find((c) => c.name === 'inot')!.value, 100);
  });
});
