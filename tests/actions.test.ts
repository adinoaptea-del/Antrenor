// Acțiunile sportivului pe calendar: Actualizat, Mută, Fă-o ușoară, Plecat, întâlniri fixe.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { applyAway, changeSummary, easyWorkout, fixedBonus, moveOptions, moveWorkout, restoreAway, withOriginal } from '../src/calendar/actions.js';
import { generatePlan } from '../src/calendar/generate.js';
import type { PlannedWorkout } from '../src/types.js';

const AT = '2026-10-19T08:00:00Z';
const w = (id: string, date: string, sport: PlannedWorkout['sport'], type: PlannedWorkout['type'], min = 45, zones: PlannedWorkout['targetZones'] = [2]): PlannedWorkout => ({ id, date, sport, type, plannedMinutes: min, targetZones: zones, key: type === 'calitate' || type === 'lung', status: 'planificat' });

// Săptămâna 19–25 oct 2026 (luni–duminică).
const week = (): PlannedWorkout[] => [
  w('a', '2026-10-19', 'inot', 'tehnica', 40, [1, 2]),
  w('b', '2026-10-20', 'alergare', 'calitate', 50, [4]),
  w('c', '2026-10-21', 'bicicleta', 'z2', 60),
  w('d', '2026-10-22', 'bicicleta', 'calitate', 60, [3, 4]),
  w('e', '2026-10-23', 'inot', 'z2', 40),
  w('f', '2026-10-24', 'bicicleta', 'lung', 120, [2]),
  w('g', '2026-10-25', 'alergare', 'lung', 75, [2]),
];

describe('Actualizat', () => {
  it('păstrează forma din plan de dinainte de PRIMA schimbare și o descrie', () => {
    const x = week()[1]!;
    const once = withOriginal(x, { ...x, plannedMinutes: 40 }, AT);
    const twice = withOriginal(once, { ...once, targetZones: [2], type: 'z2' }, AT);
    assert.equal(twice.original!.plannedMinutes, 50);
    assert.deepEqual(changeSummary(twice), ['50 → 40 min', 'intensitate → ușor', 'Z4 → Z2']);
  });
  it('fără schimbare reală nu apare eticheta; revenirea la plan o scoate', () => {
    const x = week()[0]!;
    assert.equal(withOriginal(x, { ...x, note: 'doar o notă' }, AT).original, undefined);
    const changed = withOriginal(x, { ...x, plannedMinutes: 30 }, AT);
    assert.equal(withOriginal(changed, { ...changed, plannedMinutes: 40 }, AT).original, null);
  });
});

describe('Mută', () => {
  it('ședința grea nu ajunge lângă altă zi grea; cea ușoară se poate muta', () => {
    const plan = week();
    const opts = moveOptions(plan, 'b', '2026-10-19');
    assert.equal(opts.find((o) => o.date === '2026-10-21')!.ok, false); // lângă bicicleta de calitate de joi
    assert.equal(opts.find((o) => o.date === '2026-10-23')!.ok, false); // lângă joi
    assert.equal(opts.find((o) => o.date === '2026-10-19')!.ok, true);
    const easy = moveOptions(plan, 'c', '2026-10-19');
    assert.equal(easy.find((o) => o.date === '2026-10-24')!.ok, false); // are deja bicicletă
    assert.equal(easy.find((o) => o.date === '2026-10-25')!.ok, true);
  });
  it('nu în trecut, nu în altă săptămână, nu o ședință făcută', () => {
    const plan = week();
    assert.equal(moveOptions(plan, 'b', '2026-10-21').length, 0); // marți a trecut
    assert.ok(!moveOptions(plan, 'c', '2026-10-21').some((o) => o.date < '2026-10-21'));
    assert.equal(moveOptions(plan, 'c', '2026-10-19', ['c']).length, 0);
    assert.throws(() => moveWorkout(plan, 'c', '2026-10-27', '2026-10-19', AT));
    const moved = moveWorkout(plan, 'c', '2026-10-25', '2026-10-19', AT);
    assert.equal(moved.date, '2026-10-25');
    assert.deepEqual(changeSummary(moved), ['miercuri → duminică']);
  });
});

describe('Fă-o ușoară', () => {
  it('intensitatea iese, lunga rămâne lungă dar mai scurtă', () => {
    const plan = week();
    const q = easyWorkout(plan[1]!, AT);
    assert.equal(q.type, 'z2');
    assert.deepEqual(q.targetZones, [2]);
    assert.equal(q.key, false);
    const l = easyWorkout(plan[6]!, AT);
    assert.equal(l.type, 'lung');
    assert.equal(l.plannedMinutes, 55);
    assert.throws(() => easyWorkout(plan[2]!, AT), /deja ușoară/);
  });
});

describe('Plecat', () => {
  it('fără bazin: înotul devine alergare ușoară dacă ziua nu are deja alergare; anularea pune planul la loc', () => {
    const plan = week();
    const away = { dela: '2026-10-19', panala: '2026-10-23', ce: 'fara_bazin' as const };
    const ch = applyAway(plan, away, '2026-10-19', AT);
    assert.equal(ch.length, 2);
    assert.ok(ch.every((x) => x.sport === 'alergare' && x.type === 'z2'));
    const merged = plan.map((x) => ch.find((c) => c.id === x.id) ?? x);
    const back = restoreAway(merged, away, '2026-10-19', AT);
    assert.equal(back.length, 2);
    assert.ok(back.every((x) => x.sport === 'inot' && x.original === null));
  });
  it('nimic: totul se anulează în interval; ce e făcut și ce e după rămâne', () => {
    const ch = applyAway(week(), { dela: '2026-10-19', panala: '2026-10-21', ce: 'nimic' }, '2026-10-19', AT, ['a']);
    assert.deepEqual(ch.map((x) => x.id).sort(), ['b', 'c']);
    assert.ok(ch.every((x) => x.status === 'anulat_sistem'));
  });
  it('doar alergare: bicicleta lungă devine alergare scurtă, nu una lungă în plus', () => {
    const ch = applyAway(week(), { dela: '2026-10-24', panala: '2026-10-25', ce: 'doar_alergare' }, '2026-10-19', AT);
    assert.equal(ch.length, 1);
    assert.equal(ch[0]!.plannedMinutes, 45);
  });
});

describe('Întâlniri fixe', () => {
  it('bonusul doar pentru sportul și tipul potrivit', () => {
    const f = [{ zi: 5, sport: 'alergare' as const, tip: 'lung' as const }];
    assert.ok(fixedBonus(f, 5, 'alergare', 'lung') > 0);
    assert.equal(fixedBonus(f, 5, 'alergare', 'z2'), 0);
    assert.equal(fixedBonus(f, 6, 'alergare', 'lung'), 0);
  });
  it('generatorul pune alergarea lungă în ziua grupului (sâmbătă), nu duminică', () => {
    const blocks = [0, 1, 2, 3, 4].map((d) => ({ day: d as 0, startMin: 1080, endMin: 1200 })).concat([5, 6].map((d) => ({ day: d as 0, startMin: 420, endMin: 720 })));
    const base = { startDate: '2026-11-02', raceDate: '2027-09-26', goal: '70.3' as const, freeBlocks: blocks, historyHoursPerWeek: [6, 6, 7, 6], intensityAllowed: 'toate' as const, swimContinuous400: true };
    const r = generatePlan({ ...base, fixed: [{ zi: 5, sport: 'alergare', tip: 'lung' }] });
    assert.ok(r.ok);
    const longs = r.weeks.slice(4, 12).flatMap((x) => x.workouts).filter((x) => x.sport === 'alergare' && x.type === 'lung');
    assert.ok(longs.length > 0);
    const sat = longs.filter((x) => new Date(`${x.date}T00:00:00Z`).getUTCDay() === 6).length;
    assert.ok(sat / longs.length >= 0.8, `${sat}/${longs.length} sâmbăta`);
  });
});
