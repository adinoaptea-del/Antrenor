// Principiile Sang / Kaptagat și regulile din cele trei rapoarte Kotcha, adaptate la triatlon.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { adapt } from '../src/calendar/adapt.js';
import { detectReturn } from '../src/calendar/pause.js';
import { enforceSpacing, isHard, shortenWorkout } from '../src/calendar/validate.js';
import { generatePlan } from '../src/calendar/generate.js';
import { scoreWorkout } from '../src/scoring/score.js';
import { fadePct } from '../src/collector/details.js';
import { aerobicEfficiency } from '../src/collector/efficiency.js';
import { addDays } from '../src/util/dates.js';
import type { FreeBlock, PlannedWorkout } from '../src/types.js';

const P = (o: Partial<PlannedWorkout>): PlannedWorkout => ({ id: 'p', date: '2026-10-19', sport: 'alergare', type: 'z2', plannedMinutes: 45, targetZones: [2], key: false, status: 'planificat', ...o });
const ctx = (today: string) => ({ today, freeBlocks: [], recentKeyScores: [] });

describe('1 · revenirea după pauză', () => {
  const habit = Array.from({ length: 12 }, (_, i) => ({ date: addDays('2026-09-06', i * 2), minutes: 50 })); // ultima: 28.09
  it('prima alergare după 14 zile fără nimic, la un sportiv cu obicei → revenire', () => {
    const r = detectReturn([...habit, { date: '2026-10-18', minutes: 30 }], '2026-10-18');
    assert.ok(r);
    assert.ok(r!.zile >= 10);
  });
  it('fără obicei înainte sau pauză scurtă → nimic', () => {
    assert.equal(detectReturn([{ date: '2026-10-01', minutes: 30 }, { date: '2026-10-18', minutes: 30 }], '2026-10-18'), null);
    assert.equal(detectReturn([...habit, { date: '2026-10-20', minutes: 40 }], '2026-10-20') && detectReturn([...habit, { date: '2026-10-18', minutes: 40 }, { date: '2026-10-20', minutes: 40 }], '2026-10-20'), null);
  });
  it('planul: 7 zile fără intensitate la 60%, apoi 7 zile la 80%', () => {
    const plan = [P({ id: 'a', date: '2026-10-19', type: 'calitate', targetZones: [4], key: true, plannedMinutes: 60, intervals: { count: 5, minutes: 6, zone: 4 } }), P({ id: 'b', date: '2026-10-27', plannedMinutes: 50 })];
    const r = adapt(plan, { kind: 'revenire', date: '2026-10-18', zile: 14, dela: '2026-10-03' }, ctx('2026-10-18'));
    const a = r.plan.find((w) => w.id === 'a')!;
    assert.equal(a.type, 'z2');
    assert.equal(a.plannedMinutes, 35);
    assert.equal(r.plan.find((w) => w.id === 'b')!.plannedMinutes, 40);
  });
});

describe('2 · motivul abaterii', () => {
  it('scurtată din cauza timpului: galben, nu roșu, și marcată logistic', () => {
    const r = scoreWorkout({ planned: P({ date: '2026-10-18', plannedMinutes: 60 }), activity: { id: 'x', date: '2026-10-18', sport: 'alergare', minutes: 25 }, questionnaire: { rpe: 4, whatInterfered: 'timp' }, today: '2026-10-18' });
    assert.equal(r.color, 'galben');
    assert.equal(r.flags.logistic, true);
  });
  it('cu durere, timpul nu mai e scuza: rămâne regula normală', () => {
    const r = scoreWorkout({ planned: P({ date: '2026-10-18', plannedMinutes: 60 }), activity: { id: 'x', date: '2026-10-18', sport: 'alergare', minutes: 25 }, questionnaire: { rpe: 4, whatInterfered: 'timp', painScore: 6 }, today: '2026-10-18' });
    assert.equal(r.color, 'rosu');
    assert.equal(r.flags.escalate, true);
  });
});

describe('4 · zi tare, zi ușoară, cel mult 3 grele pe săptămână', () => {
  it('5 ședințe grele și două zile grele la rând → cel mult 3, fără zile grele consecutive', () => {
    const ws = [
      P({ id: 'r', date: '2026-10-19', type: 'calitate', key: true, targetZones: [4] }),
      P({ id: 'b', date: '2026-10-20', sport: 'bicicleta', type: 'calitate', targetZones: [4] }),
      P({ id: 's', date: '2026-10-21', sport: 'inot', type: 'calitate', targetZones: [4] }),
      P({ id: 'b2', date: '2026-10-23', sport: 'bicicleta', type: 'calitate', targetZones: [4] }),
      P({ id: 'br', date: '2026-10-24', sport: 'bicicleta', type: 'brick', key: true, plannedMinutes: 150 }),
    ];
    const out = enforceSpacing(ws).workouts.filter(isHard);
    assert.ok(out.length <= 3);
    const days = out.map((w) => w.date).sort();
    for (let i = 1; i < days.length; i++) assert.notEqual(addDays(days[i - 1]!, 1), days[i]);
    assert.ok(out.some((w) => w.id === 'br'));
  });
  it('planul generat respectă regula în toate săptămânile', () => {
    const blocks: FreeBlock[] = [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day: day as FreeBlock['day'], startMin: 360, endMin: day >= 5 ? 720 : 540 }));
    const r = generatePlan({ startDate: '2026-10-19', raceDate: '2027-09-26', goal: '70.3', freeBlocks: blocks, historyHoursPerWeek: [7, 7, 7, 7], intensityAllowed: 'toate', swimContinuous400: true });
    assert.equal(r.ok, true);
    if (!r.ok) return;
    for (const w of r.weeks) {
      const hard = w.workouts.filter(isHard);
      assert.ok(hard.length <= 3, `${w.weekStart}: ${hard.length} grele`);
    }
    const all = r.weeks.flatMap((w) => w.workouts).filter(isHard).map((w) => w.date).sort();
    const consecutive = all.filter((d, i) => i > 0 && addDays(all[i - 1]!, 1) === d).length;
    assert.ok(consecutive <= 2, `${consecutive} perechi de zile grele la rând`);
  });
});

describe('5–6 · ieșirea lungă și biblioteca', () => {
  const blocks: FreeBlock[] = [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day: day as FreeBlock['day'], startMin: 360, endMin: day >= 5 ? 720 : 540 }));
  const r = generatePlan({ startDate: '2026-10-19', raceDate: '2027-09-26', goal: '70.3', freeBlocks: blocks, historyHoursPerWeek: [7, 7, 7, 7], intensityAllowed: 'toate', swimContinuous400: true });
  it('lunga alternează: săptămâni scurte constante și săptămâni pline cu final progresiv', () => {
    if (!r.ok) return assert.fail();
    const longs = r.weeks.flatMap((w) => w.workouts).filter((w) => w.sport === 'alergare' && w.type === 'lung');
    assert.ok(longs.some((w) => /săptămâna scurtă/.test(w.structure ?? '')));
    assert.ok(longs.some((w) => /progresiv/.test(w.structure ?? '')));
  });
  it('progresivul și fartlek-ul apar; ședințele cu repetări au regula „prima repetare mai ușor”', () => {
    if (!r.ok) return assert.fail();
    const q = r.weeks.flatMap((w) => w.workouts).filter((w) => w.sport === 'alergare' && w.type === 'calitate' && !(w.structure ?? '').startsWith('TEST'));
    assert.ok(q.some((w) => /^progresiv/.test(w.structure ?? '')));
    assert.ok(q.some((w) => /fartlek/.test(w.structure ?? '')));
    for (const w of q.filter((x) => /×/.test(x.structure ?? ''))) assert.match(w.structure ?? '', /prima repetare/);
  });
  it('căderea pe final se vede din kilometri', () => {
    assert.equal(fadePct([300, 300, 300, 330, 330, 330]), 10);
    assert.ok((fadePct([310, 305, 300, 295, 290, 285]) ?? 0) < 0);
    assert.equal(fadePct([300, 300]), null);
    const s = scoreWorkout({ planned: P({ type: 'lung', plannedMinutes: 90, date: '2026-10-18' }), activity: { id: 'x', date: '2026-10-18', sport: 'alergare', minutes: 92, distanceKm: 15, details: { splitsSecPerKm: [330, 330, 330, 330, 330, 330, 330, 360, 365, 370, 375, 380, 385, 390] } } as never, questionnaire: { rpe: 5 }, today: '2026-10-18' });
    // V2-15: fără puls, încetinirea e semnal de urmărit, nu penalizare; cu același puls pe final, e posibilă oboseală.
    assert.ok(s.reasons.some((x) => /mai lentă: de urmărit, nu e automat o problemă/.test(x)));
    assert.equal(s.color, 'verde');
    const s2 = scoreWorkout({ planned: P({ type: 'lung', plannedMinutes: 90, date: '2026-10-18' }), activity: { id: 'x', date: '2026-10-18', sport: 'alergare', minutes: 92, distanceKm: 15, firstThirdHr: 140, lastThirdHr: 146, details: { splitsSecPerKm: [330, 330, 330, 330, 330, 330, 330, 360, 365, 370, 375, 380, 385, 390] } } as never, questionnaire: { rpe: 5 }, today: '2026-10-18' });
    assert.ok(s2.reasons.some((x) => /la același puls: posibil oboseală/.test(x)));
  });
});

describe('7 · bilanțul de duminică', () => {
  it('obosit: prima intensitate de săptămâna viitoare devine ușoară și progresul nu mai adaugă', () => {
    const plan = [P({ id: 'q', date: '2026-10-20', type: 'calitate', key: true, targetZones: [4] }), P({ id: 'e', date: '2026-10-21', plannedMinutes: 60 }), P({ id: 'e0', date: '2026-10-14', plannedMinutes: 60 })];
    const r = adapt(plan, { kind: 'bilant', date: '2026-10-18', obosit: true, motiv: 'energie 2/5' }, ctx('2026-10-18'));
    assert.equal(r.plan.find((w) => w.id === 'q')!.type, 'z2');
    const p = adapt(r.plan, { kind: 'progres', date: '2026-10-18' }, ctx('2026-10-18'));
    assert.equal(p.changes.length, 0);
  });
});

describe('8 · eficiența la același puls', () => {
  it('mai repede la același puls în ultimele 3 săptămâni → creștere', () => {
    const run = (date: string, km: number) => ({ date, sport: 'alergare', minutes: 50, distanceKm: km, avgHr: 140, maxHr: 185 });
    const acts = [run('2026-08-25', 8), run('2026-08-30', 8), run('2026-09-05', 8.1), run('2026-09-20', 8), run('2026-10-02', 8.6), run('2026-10-08', 8.7), run('2026-10-14', 8.8)];
    const e = aerobicEfficiency(acts, '2026-10-18');
    assert.equal(e[0]?.sport, 'alergare');
    assert.ok(e[0]!.schimbare_pct > 5);
  });
  it('alergarea pe munte nu intră în comparație', () => {
    const hill = { date: '2026-10-17', sport: 'alergare', minutes: 229, distanceKm: 21.3, avgHr: 140, maxHr: 181, details: { elevGainM: 1199 } };
    assert.deepEqual(aerobicEfficiency([hill], '2026-10-18'), []);
  });
});

describe('9 · „Am doar X minute”', () => {
  it('calitatea de 60 min scurtată la 30: repetările care încap, nimic negativ', () => {
    const w = shortenWorkout(P({ type: 'calitate', plannedMinutes: 60, targetZones: [4], structure: '5 × 6 min la prag (Z4), 2 min ușor între', intervals: { count: 5, minutes: 6, zone: 4 } }), 30);
    assert.equal(w.plannedMinutes, 30);
    assert.match(w.structure ?? '', /^2 × 6 min/);
    assert.match(w.note ?? '', /nu se recuperează/);
  });
  it('brick-ul își scurtează ambele părți', () => {
    const w = shortenWorkout(P({ sport: 'bicicleta', type: 'brick', plannedMinutes: 120, structure: 'tură 100 min Z2 + alergare 20 min imediat după' }), 60);
    assert.match(w.structure ?? '', /tură 47 min Z2 \+ tranziție 3 min \+ alergare 10 min/); // V2-11: tranziția intră în total
  });
});
