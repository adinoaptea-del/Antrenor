// Echivalarea efortului (TRIMP Edwards / RPE), acoperirea zilei, echilibrul, „ești apt?”.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { activityLoad, dayCoverage, plannedLoad, rpeZone } from '../src/calendar/load.js';
import { balanceCheck } from '../src/calendar/balance.js';
import { dayVerdict, objectiveReadiness } from '../src/collector/readiness.js';
import { decideDay } from '../src/calendar/day.js';
import type { PlannedWorkout } from '../src/types.js';

const P = (o: Partial<PlannedWorkout> & { id: string; date: string }): PlannedWorkout => ({ sport: 'alergare', type: 'z2', plannedMinutes: 45, targetZones: [2], key: false, status: 'planificat', ...o });

describe('TRIMP Edwards', () => {
  it('minute în zone × pondere; minutele fără puls în proporția celor măsurate', () => {
    assert.equal(activityLoad({ minutes: 60, timeInZonesMin: { 2: 40, 3: 20 } })!.trimp, 140);
    assert.equal(activityLoad({ minutes: 60, timeInZonesMin: { 2: 30 } })!.trimp, 120);
  });
  it('fără puls: din RPE (CR-10 → zonă); fără nimic: null, nu ghicim', () => {
    assert.equal(rpeZone(7), 4);
    assert.deepEqual(activityLoad({ minutes: 60, timeInZonesMin: null }, 7), { trimp: 240, method: 'rpe' });
    assert.equal(activityLoad({ minutes: 60, timeInZonesMin: null }, null), null);
    assert.equal(activityLoad({ minutes: 60, timeInZonesMin: { 2: 10 } }, null), null, 'sub jumătate cu puls și fără RPE');
  });
  it('ședința planificată: aceeași scară (intervalele în zona lor, restul 1,5)', () => {
    assert.equal(plannedLoad(P({ id: 'a', date: 'x', plannedMinutes: 60, targetZones: [2] })), 120);
    assert.equal(plannedLoad(P({ id: 'b', date: 'x', type: 'calitate', plannedMinutes: 50, targetZones: [4], intervals: { count: 4, minutes: 4, zone: 4 } })), 16 * 4 + 34 * 1.5);
  });
});

describe('acoperirea zilei', () => {
  const plan = [P({ id: 'run', date: '2026-10-21', plannedMinutes: 60 }), P({ id: 'swim', date: '2026-10-21', sport: 'inot', type: 'tehnica', plannedMinutes: 40, targetZones: [1, 2] })];
  it('parțial: variante calculate (întreg / scurtat / gata pe azi); implicit sportul rămas în urmă', () => {
    const c = dayCoverage({ date: '2026-10-21', plan, acts: [{ id: 'b', sport: 'bicicleta', minutes: 45, timeInZonesMin: { 2: 45 } }], doneIds: [], behind: ['inot'] });
    assert.equal(c.stare, 'partial');
    assert.equal(c.facut, 90);
    assert.equal(c.planificat, 180);
    assert.ok(c.optiuni.some((o) => o.id === 'ajunge'));
    assert.equal(c.implicit, 'intreg-swim');
    const keepSwim = c.optiuni.find((o) => o.id === 'intreg-swim')!;
    assert.deepEqual(keepSwim.changes, [{ workoutId: 'run', action: 'anuleaza' }], 'o singură ședință în plus azi');
  });
  it('acoperit: efortul făcut ≥ planificat', () => {
    const c = dayCoverage({ date: '2026-10-21', plan, acts: [{ id: 'r', sport: 'alergare', minutes: 120, timeInZonesMin: { 3: 120 } }], doneIds: ['run'] });
    assert.equal(c.stare, 'acoperit');
  });
});

describe('echilibrul', () => {
  const plan: PlannedWorkout[] = [];
  for (let d = 1; d <= 20; d++) {
    const date = `2026-10-${String(d).padStart(2, '0')}`;
    if (d % 2) plan.push(P({ id: `s${d}`, date, sport: 'inot', type: 'tehnica', plannedMinutes: 40 }));
    else plan.push(P({ id: `r${d}`, date, plannedMinutes: 40 }));
    if (d % 7 === 3) plan.push(P({ id: `q${d}`, date, type: 'calitate', plannedMinutes: 50, targetZones: [4], intervals: { count: 4, minutes: 4, zone: 4 } }));
  }
  const acts = plan.filter((w) => w.sport === 'alergare').map((w) => ({ id: `a${w.id}`, date: w.date, sport: 'alergare' as const, minutes: w.plannedMinutes * 1.6, timeInZonesMin: { 2: w.plannedMinutes * 1.6 } }));
  it('alergare peste plan, înot neglijat: avertisment cu cifre; intensitate făcută în Z2: avertisment', () => {
    const b = balanceCheck('2026-10-21', plan, acts, 'Ironman 70.3');
    assert.deepEqual(b.in_urma, ['inot']);
    assert.ok(b.avertismente.some((a) => a.titlu === 'Înot rămâne în urmă' && /Ironman 70.3/.test(a.text)));
    assert.ok(b.avertismente.some((a) => a.titlu === 'Alergare: intensitatea lipsește'));
  });
});

describe('fără date de la brățări: întrebăm', () => {
  const none = objectiveReadiness({ hrv: null, hrvBaseline: null, rhr: null, rhrBaseline: null, resp: null, respBaseline: null, recovery: null, sleepMin: null });
  it('fără răspuns: întrebare, nu culoare ghicită; cu răspuns decide sportivul', () => {
    assert.equal(dayVerdict(none, null).intrebare, true);
    assert.equal(dayVerdict(none, null, { apt: 'da' }).verdict, 'verde');
    assert.equal(dayVerdict(none, null, { apt: 'partial' }).verdict, 'galben');
    assert.equal(dayVerdict(none, null, { apt: 'nu' }).verdict, 'rosu');
  });
  it('după efort peste plan, durerile musculare mari coboară ziua la galben (HRV-ul nu le vede)', () => {
    const good = objectiveReadiness({ hrv: 30, hrvBaseline: 28, rhr: 55, rhrBaseline: 56, resp: null, respBaseline: null, recovery: 85, sleepMin: 480 });
    assert.equal(dayVerdict(good, null, { efortIeri: true, dureri: 6 }).verdict, 'galben');
    assert.equal(dayVerdict(good, null, { efortIeri: false, dureri: 6 }).verdict, 'verde');
  });
  it('pe ecran: întrebarea, cu ședința de azi; stopul rămâne stop', () => {
    const d = decideDay({ state: null, readiness: null, restriction: null, todayPlan: [P({ id: 'x', date: '2026-10-18' })], ask: true })!;
    assert.equal(d.ask, true);
    assert.equal(d.action, 'Ești odihnit și apt de antrenament azi?');
    assert.equal(decideDay({ state: null, readiness: null, restriction: { verdict: 'stop', reason: 'febră' }, todayPlan: [P({ id: 'x', date: '2026-10-18' })], ask: true })!.level, 'stop');
  });
});
