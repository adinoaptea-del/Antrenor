import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generatePlan } from '../src/calendar/generate.js';
import { ALL_GOALS, isFitnessGoal } from '../src/calendar/phases.js';
import { detailSteps } from '../src/calendar/session-detail.js';
import { coherenceIssues, normalizeWorkout } from '../src/calendar/coherence.js';
import { swimSet, longestSegment } from '../src/calendar/session-steps.js';
import { shortenWorkout } from '../src/calendar/validate.js';
import { AGES, LEVELS, input } from '../scripts/audit-profiles.js';
import type { PlannedWorkout } from '../src/types.js';

const base: PlannedWorkout = { id: 'x', date: '2027-01-04', sport: 'alergare', type: 'calitate', plannedMinutes: 45, targetZones: [4, 5], key: true, status: 'planificat' };

test('T01 durate: testul de alergare scurtat la 45 min are pașii 10 + 30 + 5', () => {
  const w = normalizeWorkout({ ...base, structure: 'TEST: 15 min ușor, 30 min cât de tare poți constant (x), 5 min ușor' });
  const s = detailSteps(w, { age: 40 });
  const mins = ['Încălzire', 'Testul', 'Revenire'].map((l) => Number(/(\d+) min/.exec(s.find((x) => x.label === l)!.text)![1]));
  assert.equal(mins.reduce((a, b) => a + b, 0), 45);
  assert.deepEqual(coherenceIssues(w, s), []);
});

test('T01 brick: titlul, rezumatul și pașii au aceleași componente; alergarea nu crește ca să umple timpul', () => {
  const w = normalizeWorkout({ ...base, sport: 'bicicleta', type: 'brick', plannedMinutes: 200, targetZones: [2], structure: 'tură 180 min Z2 + alergare 30 min imediat după' });
  const m = /tură (\d+) min.*tranziție (\d+) min.*alergare (\d+) min/.exec(w.structure!)!;
  assert.equal(Number(m[1]) + Number(m[2]) + Number(m[3]), 200, 'V2-11: total = bicicletă + tranziție + alergare');
  m[2] = m[3]!;
  assert.ok(Number(m[2]) <= 30, w.structure!);
  assert.deepEqual(coherenceIssues(w, detailSteps(w, { age: 40 })), []);
  const short = shortenWorkout(w, 90);
  const m2 = /tură (\d+) min.*tranziție (\d+) min.*alergare (\d+) min/.exec(short.structure!)!;
  assert.equal(Number(m2[1]) + Number(m2[2]) + Number(m2[3]), 90);
  m2[2] = m2[3]!;
  assert.ok(Number(m2[2]) <= 30);
});

test('T02 intensități: la Z5 ținta nu depășește plafonul; repetările scurte nu cer pulsul instant', () => {
  const w: PlannedWorkout = { ...base, plannedMinutes: 55, targetZones: [5], structure: '4 × 4 min la 90–95% din pulsul maxim (4×4 norvegian, Z5), 3 min ușor între', intervals: { count: 4, minutes: 4, zone: 5 } };
  const s = detailSteps(w, { age: 40 });
  assert.deepEqual(coherenceIssues(w, s), []);
  const v5: PlannedWorkout = { ...base, plannedMinutes: 45, targetZones: [5], structure: 'V5: 6 × 1 min alert' };
  const sv = detailSteps({ ...v5, structure: undefined, intervals: { count: 6, minutes: 1, zone: 5 } }, { age: 40 });
  assert.match(sv.find((x) => x.label === 'Principal')!.text, /nu apucă să urce/);
});

test('T02 pauzele condiționate: durata e aproximativă și spune cât se poate prelungi', () => {
  const w: PlannedWorkout = { ...base, plannedMinutes: 55, targetZones: [4], structure: '5 × 6 min la prag (Z4), 2 min ușor între', intervals: { count: 5, minutes: 6, zone: 4 } };
  const d = detailSteps(w, { age: 40 }).find((x) => x.label === 'Durata');
  assert.ok(d && /≈ 55 min/.test(d.text) && /prelungi|lungești/.test(d.text));
});

test('T03 înot începător (25 m fără oprire): niciun segment peste 25 m', () => {
  for (const type of ['tehnica', 'z2', 'lung'] as const) {
    const r = swimSet({ type, minutes: 30, css: null, date: '2027-01-04', continuousM: 25, structure: type === 'z2' ? 'piramidă 100-200-300-200-100 m' : null });
    assert.ok(longestSegment(r.steps) <= 25, `${type}: ${r.steps.map((s) => s.text).join(' | ')}`);
  }
});

test('T04 înot fără CSS dar cu 800 m continuu: ședință continuă, fără ritm inventat', () => {
  const w: PlannedWorkout = { ...base, sport: 'inot', type: 'lung', plannedMinutes: 60, targetZones: [2, 3], structure: 'distanța de cursă continuu' };
  const s = detailSteps(w, { swimContinuousM: 800 });
  const main = s.find((x) => x.label === 'Principal')!.text;
  assert.match(main, /\d+ m continuu/);
  assert.ok(!/\/100 m/.test(main), main);
  assert.match(s.at(-1)!.text, /presupus/);
});

test('coerență pe toate planurile simulate (obiective × vârste × niveluri): nicio contradicție', () => {
  const issues: string[] = [];
  for (const goal of ALL_GOALS) {
    if (isFitnessGoal(goal)) continue;
    for (const age of AGES) for (const level of LEVELS) {
      const inp = input({ goal, sex: 'm', age, level, intens: 'toate' });
      const r = generatePlan(inp);
      if (!r.ok) continue;
      for (const w of r.weeks.flatMap((x) => x.workouts)) {
        const steps = detailSteps(w, { age, swimContinuousM: inp.swim?.continuousM ?? null });
        issues.push(...coherenceIssues(w, steps, inp.swim?.continuousM ?? null).map((i) => `${goal}/${age}/${level} ${i}`));
      }
    }
  }
  assert.deepEqual(issues.slice(0, 15), []);
});

test('T09 testele maximale respectă restricțiile: fără test de teren de la 55 de ani sau cu intensitate limitată', () => {
  for (const age of [55, 65]) {
    const r = generatePlan(input({ goal: '70.3', sex: 'f', age, level: 'intermediar', intens: 'toate' }));
    assert.ok(r.ok);
    assert.ok(!r.weeks.flatMap((w) => w.workouts).some((w) => /^TEST/.test(w.structure ?? '')));
  }
  const y = generatePlan(input({ goal: '70.3', sex: 'f', age: 35, level: 'intermediar', intens: 'toate' }));
  assert.ok(y.ok && y.weeks.flatMap((w) => w.workouts).some((w) => /^TEST/.test(w.structure ?? '')));
});

import { unlockedDays, daysAt } from '../src/strength/fitness.js';

test('T05 sală: două zile ținute luni de zile nu devin automat patru; urcă doar după prezență reală', () => {
  const p = { days: 4 as const, beginner: true };
  // 6 săptămâni cu 2 din 2 ședințe: deblochează a treia zi (după 3 săptămâni bune), apoi a patra (după încă 3).
  assert.equal(unlockedDays(p, Array(3).fill({ planned: 2, done: 2 })), 3);
  // Prezență slabă: rămâne la 2, oricât timp trece.
  assert.equal(unlockedDays(p, Array(20).fill({ planned: 2, done: 1 })), 2);
  // Fără date de prezență, planul nu trece peste frecvența de început, nici în săptămâna 20.
  assert.equal(daysAt({ ...p }, 20), 2);
  assert.equal(daysAt({ ...p, unlocked: 3 }, 20), 3);
  // A ales 2 zile: niciodată mai mult.
  assert.equal(daysAt({ days: 2, beginner: false, unlocked: 4 }, 20), 2);
});

import { addDays } from '../src/util/dates.js';
test('T12 obiectiv prea aproape: refuz cu motiv, fără să comprime luni de pregătire în câteva săptămâni', () => {
  const i = input({ goal: 'maraton', sex: 'm', age: 40, level: 'debutant', intens: 'toate', hours: 10 });
  const r = generatePlan({ ...i, raceDate: addDays(i.startDate, 6 * 7) });
  assert.equal(r.ok, false);
  assert.ok(!r.ok && /cel puțin 20/.test(r.reason));
  const exp = input({ goal: 'maraton', sex: 'm', age: 40, level: 'avansat', intens: 'toate' });
  assert.equal(generatePlan({ ...exp, raceDate: addDays(exp.startDate, 14 * 7) }).ok, true);
});

import { activeRestriction, activePain } from '../src/calendar/safety.js';
test('V2-01 restricția de durere: nu expiră singură, se ridică doar la o raportare mai mică', () => {
  const ev = [{ date: '2026-11-03', durere: { scor: 5, loc: 'genunchi' } }];
  const r1 = activeRestriction({ today: '2026-11-10', morning: null, evenings: ev });
  assert.equal(r1?.verdict, 'rosu');
  // altă durere mică în alt loc nu o ridică
  const r2 = activeRestriction({ today: '2026-11-10', morning: null, evenings: [...ev, { date: '2026-11-06', durere: { scor: 1, loc: 'umăr' } }] });
  assert.equal(r2?.verdict, 'rosu');
  // raportarea mai mică pentru același loc (sau „durerea a trecut” fără loc) o ridică
  assert.equal(activeRestriction({ today: '2026-11-10', morning: null, evenings: [...ev, { date: '2026-11-07', durere: { scor: 2, loc: 'genunchi' } }] }), null);
  assert.equal(activePain([...ev, { date: '2026-11-07', durere: { scor: 0, loc: null } }], '2026-11-10'), null);
});

import { objectiveReadiness } from '../src/collector/readiness.js';
test('V2-02: scorul de recuperare al brățării nu se adună lângă HRV/puls/somn (aceleași dovezi de două ori)', () => {
  const base = { hrv: 40, hrvBaseline: 40, rhr: 52, rhrBaseline: 52, resp: null, respBaseline: null, sleepMin: 450 };
  const a = objectiveReadiness({ ...base, recovery: null });
  const b = objectiveReadiness({ ...base, recovery: 10 });
  assert.equal(a.scor, b.scor);
  assert.equal(b.componente.recuperare.scor, null);
  // fără inimă, scorul proprietar e singurul semnal al recuperării: atunci se folosește, etichetat
  const c = objectiveReadiness({ hrv: null, hrvBaseline: null, rhr: null, rhrBaseline: null, resp: null, respBaseline: null, sleepMin: 450, recovery: 40 });
  assert.equal(c.componente.recuperare.scor, 40);
});

import { eventKey } from '../src/calendar/adapt.js';
import { dedupeActivities } from '../src/collector/packet.js';
test('V2-03 două alergări într-o zi rămân două; aceeași alergare de pe două brățări rămâne una', () => {
  const morning = { id: 'g1', source: 'garmin', externalId: 'g1', date: '2026-11-03', sport: 'alergare', minutes: 40, startLocal: '07:00' } as const;
  const evening = { id: 'g2', source: 'garmin', externalId: 'g2', date: '2026-11-03', sport: 'alergare', minutes: 35, startLocal: '18:30' } as const;
  const sameFromWhoop = { id: 'w1', source: 'whoop', externalId: 'w1', date: '2026-11-03', sport: 'alergare', minutes: 41, startLocal: '07:02' } as const;
  const kept = dedupeActivities([morning, evening, sameFromWhoop] as never);
  assert.equal(kept.length, 2);
  const k = (a: typeof morning | typeof evening | typeof sameFromWhoop) => eventKey({ kind: 'neplanificat', activity: a as never, tip: 'antrenament' });
  assert.notEqual(k(morning), k(evening));
  assert.equal(k(morning), k(sameFromWhoop), 'retransmiterea aceleiași ședințe de pe altă brățară nu e un eveniment nou');
});

import { swimCapacity } from '../src/calendar/swim-capacity.js';
import { declaredSwimM } from '../src/bar/sport-readiness.js';
test('V2-04 înot fără capacitate declarată: nu apare o capacitate inventată de 50 m', () => {
  assert.equal(declaredSwimM('nu_stiu'), null);
  const c = swimCapacity({ declaredM: null, today: '2026-11-03' });
  assert.deepEqual([c.meters, c.source], [null, null]);
  const r = swimSet({ type: 'z2', minutes: 40, css: null, date: '2026-11-03', continuousM: null });
  const all = r.steps.map((s) => s.text).join(' ');
  assert.doesNotMatch(all, /50 m demonstra|cel mult 50 m/);
  assert.match(all, /NECUNOSCUTĂ/);
  assert.ok(r.steps.some((s) => s.label === 'Evaluare'));
  // proveniența: ceasul bate declarația; declarația rămâne „user_reported”
  const m = swimCapacity({ declaredM: 400, today: '2026-11-03', activities: [{ date: '2026-10-20', sport: 'inot', details: { continuousM: 650 } }] });
  assert.deepEqual([m.meters, m.source], [650, 'measured']);
  assert.equal(swimCapacity({ declaredM: 400, today: '2026-11-03' }).source, 'user_reported');
});
