// Testele cerute de „AIRON — Audit v2, corecturi rămase” (19.10.2026), secțiunea 06, pe motorul real.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adapt, eventKey } from '../src/calendar/adapt.js';
import { activeRestriction } from '../src/calendar/safety.js';
import { dedupeActivities, mergeWellness } from '../src/collector/packet.js';
import { swimCapacity } from '../src/calendar/swim-capacity.js';
import { swimSet } from '../src/calendar/session-steps.js';
import { FAMILIES, decideFamily, applyProgression } from '../src/calendar/progression.js';
import { generatePlan } from '../src/calendar/generate.js';
import { runLongitudinal } from '../src/sim/longitudinal.js';
import { unlockDecision, fitnessPlanWeeks, fitnessProfile } from '../src/strength/fitness.js';
import { bikeQuality } from '../src/calendar/bike-swim-modules.js';
import { brickSplit, normalizeWorkout, coherenceIssues } from '../src/calendar/coherence.js';
import { detailSteps } from '../src/calendar/session-detail.js';
import { validateProposal, claimsActivation } from '../src/agents/proposal.js';
import { input } from '../scripts/audit-profiles.js';
import { moduleStructure, parseModule } from '../src/calendar/run-modules.js';
import type { PlannedWorkout } from '../src/types.js';

const W = (o: Partial<PlannedWorkout>): PlannedWorkout => ({ id: 'w', date: '2026-11-04', sport: 'alergare', type: 'z2', plannedMinutes: 45, targetZones: [2], key: false, status: 'planificat', ...o });

test('Restricție activă: calendar, mesaj și alternativă respectă aceeași restricție; fără bicicletă automată la genunchi', () => {
  const plan = [W({ id: 'a', date: '2026-11-04' }), W({ id: 'b', date: '2026-11-06', type: 'calitate', key: true })];
  const r5 = adapt(plan, { kind: 'durere', date: '2026-11-04', score: 6, loc: 'genunchi' }, { today: '2026-11-04', freeBlocks: [], recentKeyScores: [] });
  assert.equal(r5.plan.find((w) => w.id === 'a')!.status, 'anulat_sistem');
  assert.ok(!r5.plan.some((w) => w.sport === 'bicicleta'));
  const restr = activeRestriction({ today: '2026-11-06', morning: null, evenings: [{ date: '2026-11-04', durere: { scor: 6, loc: 'genunchi' } }] });
  assert.equal(restr?.verdict, 'rosu', 'ziua de joi e tot roșie: restricția nu expiră în 2 zile');
  const r3 = adapt(plan, { kind: 'durere', date: '2026-11-04', score: 3, loc: 'genunchi' }, { today: '2026-11-04', freeBlocks: [], recentKeyScores: [] });
  const b = r3.plan.find((w) => w.id === 'b')!;
  assert.equal(b.sport, 'alergare');
  assert.equal(b.suggestion?.accepted, null);
});

test('Două alergări într-o zi: ambele rămân; retransmiterea nu dublează sarcina', () => {
  const a1 = { id: 'g1', source: 'garmin', externalId: 'g1', date: '2026-11-04', sport: 'alergare', minutes: 40, startLocal: '07:00' } as const;
  const a2 = { id: 'g2', source: 'garmin', externalId: 'g2', date: '2026-11-04', sport: 'alergare', minutes: 30, startLocal: '18:00' } as const;
  const again = { ...a1, id: 'w9', source: 'whoop', externalId: 'w9', startLocal: '07:01' } as const;
  assert.equal(dedupeActivities([a1, a2, again] as never).length, 2);
  const k = (a: unknown) => eventKey({ kind: 'efort', activity: a as never, rpe: 7, planned: false });
  assert.notEqual(k(a1), k(a2));
  // Cheia se calculează pe ședința unită (așa rulează serverul, auditul v93 A21): retransmiterea nu schimbă cheia.
  const merged = dedupeActivities([a1, a2, again] as never).find((x) => x.startLocal !== '18:00')!;
  const mergedOther = dedupeActivities([again, a2, a1] as never).find((x) => x.startLocal !== '18:00')!;
  assert.equal(k(merged), k(mergedOther));
  assert.equal(k(merged), k(dedupeActivities([a1] as never)[0]));
});

test('Două dispozitive: observațiile redundante nu capătă influență dublă; dezacordul rămâne vizibil', () => {
  const rows = [
    { date: '2026-11-04', source: 'whoop', hrv: 40, rhr: 52, sleepMin: 420 },
    { date: '2026-11-04', source: 'oura', hrv: 40, rhr: 52, sleepMin: 420 },
  ] as never;
  const m = mergeWellness(rows)[0]!;
  const single = mergeWellness([{ date: '2026-11-04', source: 'whoop', hrv: 40, rhr: 52, sleepMin: 420 }] as never)[0]!;
  assert.deepEqual([m.hrv, m.rhr, m.sleepMin], [single.hrv, single.rhr, single.sleepMin]);
  assert.ok(m.perDevice && Object.keys(m.perDevice).length === 2, 'fiecare device rămâne vizibil');
});

test('Înot fără capacitate declarată: nu apare o capacitate inventată de 50 m', () => {
  assert.equal(swimCapacity({ declaredM: null, today: '2026-11-04' }).meters, null);
  const r = swimSet({ type: 'tehnica', minutes: 40, css: null, date: '2026-11-04', continuousM: null });
  assert.ok(!r.steps.some((s) => /50 m (demonstra|declara)/.test(s.text)));
});

const T = FAMILIES.find((f) => f.id === 'T')!;
test('Progresie reușită: două expuneri tolerate duc la T2; calendarul singur nu produce progres', () => {
  const ok = (d: string) => ({ date: d, step: 0, ex: { workoutId: d, color: 'verde' as const, rpe: 5, pain: 0 } });
  assert.equal(decideFamily(T, [ok('2026-11-02'), ok('2026-11-09')], 1, '2026-11-16').decision, 'progress');
  // Planul cere T2 (calendar), dar există o singură expunere: rămâne T1.
  const plan = [W({ id: 'p1', date: '2026-11-02', type: 'calitate', plannedMinutes: 40, structure: moduleStructure('T1', 40).text }), W({ id: 'p2', date: '2026-11-16', type: 'calitate', plannedMinutes: 45, structure: moduleStructure('T2', 45).text })];
  const r = applyProgression(plan, [{ workoutId: 'p1', color: 'verde', rpe: 5, pain: 0 }], '2026-11-15');
  assert.equal(parseModule(r.plan.find((w) => w.id === 'p2')!.structure)!.id, 'T1');
  assert.equal(r.decisions[0]!.decision, 'keep');
});

test('Stagnare sau feedback absent: regresie / repetare / clarificare cu motive distincte', () => {
  const at = (d: string, ex: { color: 'verde' | 'portocaliu' | 'rosu' | null; rpe: number | null; pain?: number }) => ({ date: d, step: 1, ex: ex.color == null ? null : { workoutId: d, color: ex.color, rpe: ex.rpe, pain: ex.pain ?? 0 } });
  const bad = decideFamily(T, [at('2026-11-02', { color: 'rosu', rpe: 9 }), at('2026-11-09', { color: 'portocaliu', rpe: 8 })], 1, '2026-11-16');
  assert.equal(bad.decision, 'regress');
  const noFb = decideFamily(T, [at('2026-11-02', { color: 'verde', rpe: null }), at('2026-11-09', { color: 'verde', rpe: null })], 1, '2026-11-16');
  assert.equal(noFb.decision, 'keep');
  assert.match(noFb.evidence, /fără feedback/);
  const missing = decideFamily(T, [at('2026-11-09', { color: null, rpe: null })], 1, '2026-11-16');
  assert.match(missing.evidence, /lipsa datelor nu e toleranță/);
  const gap = decideFamily(T, [at('2026-10-01', { color: 'verde', rpe: 5 })], 1, '2026-11-16');
  assert.equal(gap.decision, 'recalibrate');
  for (const sc of ['stagnare', 'fara-feedback'] as const) {
    const L = runLongitudinal(input({ goal: '10k', sex: 'm', age: 35, level: 'intermediar', intens: 'toate' }), 8, 7, sc, '2026-12-28');
    assert.equal(L.steps.progress, 0, sc);
    assert.deepEqual(L.violations, []);
  }
});

test('Începător 70.3 eligibil (orizont și buget suficiente): adaptarea e testată, nu doar refuzul', () => {
  const inp = input({ goal: '70.3', sex: 'f', age: 35, level: 'debutant', intens: 'toate', hours: 10 });
  assert.equal(generatePlan(inp).ok, true);
  for (const sc of ['mixt', 'succes'] as const) {
    const L = runLongitudinal(inp, 10, 7, sc);
    assert.deepEqual(L.violations, []);
    assert.ok(L.counts.done > 0);
  }
  // Refuzul rămâne testat separat: 5 h nu ajung.
  assert.equal(generatePlan(input({ goal: '70.3', sex: 'f', age: 35, level: 'debutant', intens: 'toate' })).ok, false);
});

test('Fitness cu trei zile: creșterea frecvenței cere preferință, timp, feedback, doză; nu doar prezență', () => {
  const p = { days: 4 as const, beginner: false, activity: 'plimbari' as const };
  const good = Array(3).fill({ planned: 3, done: 3, feedback: 3 });
  assert.equal(unlockDecision(p, good).days, 4);
  assert.equal(unlockDecision(p, Array(3).fill({ planned: 3, done: 3, feedback: 0 })).days, 3, 'fără feedback');
  assert.equal(unlockDecision(p, good, { freeDays: 3 }).days, 3, 'fără timp pentru încă o zi');
  assert.equal(unlockDecision(p, good, { restricted: true }).days, 3, 'restricție activă');
  assert.equal(unlockDecision({ ...p, days: 3 }, good).days, 3, 'nu vrea mai mult');
  // Ponderat: 8 din 9 (89%) trece, deși o săptămână a fost 2/3; la 2 ședințe/săpt., 5/6 trece.
  assert.equal(unlockDecision(p, [{ planned: 3, done: 3, feedback: 3 }, { planned: 3, done: 2, feedback: 2 }, { planned: 3, done: 3, feedback: 3 }]).days, 4);
  assert.equal(unlockDecision({ days: 3, beginner: true }, [{ planned: 2, done: 2, feedback: 2 }, { planned: 2, done: 1, feedback: 1 }, { planned: 2, done: 2, feedback: 2 }]).days, 3);
});

test('Test FTP fără istoric relevant: nu deblochează singur 30/15', () => {
  const inp = input({ goal: 'bike-100', sex: 'm', age: 35, level: 'debutant', intens: 'toate', hours: 8 });
  const r = generatePlan({ ...inp, tests: { alergare: false, bicicleta: true, inot: false } });
  assert.ok(r.ok);
  assert.ok(!r.weeks.flatMap((w) => w.workouts).some((w) => /30 s tare/.test(w.structure ?? '')));
  // Chiar dacă planul l-ar avea, fără două ședințe de prag tolerate devine ritm de obiectiv.
  const plan = [W({ id: 'x', sport: 'bicicleta', type: 'calitate', date: '2026-11-06', structure: bikeQuality('peak', 0, { experienced: true })!.structure })];
  const g = applyProgression(plan, [], '2026-11-05');
  // Auditul v93, A38: înlocuirea are doză comparabilă (2 × 12 min la prag), nu 3 × 15 la ritmul de cursă.
  assert.match(g.plan[0]!.structure!, /2 × 12 min la prag/);
});

test('800 m la înot: rotunjirea și procentul se potrivesc (875 m, nu 900); ținta nu devine realizare', () => {
  const r = swimSet({ type: 'lung', minutes: 60, css: null, date: '2026-11-04', structure: 'distanța de cursă continuu', continuousM: 800 });
  const main = r.steps.find((s) => s.label === 'Principal')!.text;
  assert.match(main, /țintă propusă: 875 m continuu/);
  assert.match(main, /\+9,4%/);
  assert.match(main, /distanța până la prima oprire/);
});

test('Brick cu tranziție: totalul și ocuparea calendarului folosesc aceeași definiție', () => {
  const w = normalizeWorkout(W({ sport: 'bicicleta', type: 'brick', plannedMinutes: 150, structure: 'tură 120 min Z2 + alergare 30 min imediat după' }));
  const s = brickSplit(w.structure, 150);
  assert.equal(s.bike + s.transition + s.run, 150);
  assert.ok(s.transition > 0);
  assert.deepEqual(coherenceIssues(w, detailSteps(w, { age: 40 })), []);
  const r = generatePlan(input({ goal: '70.3', sex: 'm', age: 35, level: 'intermediar', intens: 'toate' }));
  assert.ok(r.ok);
  for (const b of r.weeks.flatMap((x) => x.workouts).filter((x) => x.type === 'brick')) {
    const sp = brickSplit(b.structure, b.plannedMinutes);
    assert.equal(sp.bike + sp.transition + sp.run, b.plannedMinutes, b.structure!);
  }
});

test('Fitness 26 de săptămâni: etapele însumează 26; plan, calendar și explicație din aceeași structură', () => {
  const f = fitnessProfile('fit-tonifiere', { experienta: 'stabila', zile: 3, minute: 60 });
  const weeks = fitnessPlanWeeks('2026-10-26', '2027-04-26', f);
  assert.equal(weeks.length, 26);
  const r = generatePlan({ startDate: '2026-10-26', raceDate: '2027-04-26', goal: 'fit-tonifiere', freeBlocks: [0, 2, 4].map((d) => ({ day: d as 0, startMin: 1020, endMin: 1140 })), historyHoursPerWeek: [], intensityAllowed: 'toate', swimContinuous400: false, fitness: f });
  assert.ok(r.ok);
  assert.equal(r.weeks.length, 26);
  assert.deepEqual(r.weeks.map((w) => w.weekStart), weeks.map((w) => w.weekStart));
  assert.ok(r.weeks.every((w) => !w.recovery), 'fără descărcări automate');
  assert.ok(r.weeks.flatMap((w) => w.workouts).every((w) => w.date < '2027-04-26'), 'data finală exclusă');
});

test('Feedback întârziat / ordine inversată: decizia finală coerentă, aplicată o singură dată', () => {
  const inp = input({ goal: '10k', sex: 'm', age: 35, level: 'intermediar', intens: 'toate' });
  const now = runLongitudinal(inp, 8, 7, 'succes', '2026-12-28');
  const late = runLongitudinal(inp, 8, 7, 'intarziat', '2026-12-28');
  assert.deepEqual(late.violations, []);
  assert.deepEqual(late.reached, now.reached, 'aceleași trepte atinse, doar mai târziu');
  assert.ok(late.counts.duplicatesIgnored > 0);
});

test('Propunere AI respinsă: nu modifică planul și nu e prezentată ca activă', () => {
  const packet = { plan_azi_toate: [{ id: 'q', sport: 'alergare', tip: 'calitate', durata_planificata: 50, cheie: true }], plan_maine_toate: [], hrv: { azi: 30 } } as never;
  assert.equal(validateProposal({ actiune: 'scurteaza', tinta: 'azi', index: 0, minute: 10, dovezi: ['hrv.azi'], motiv: 'x' }, packet, 'verde')!.ok, false, 'sub limită');
  assert.equal(validateProposal({ actiune: 'usureaza', tinta: 'azi', index: 0, minute: null, dovezi: ['somn.inexistent'], motiv: 'x' }, packet, 'verde')!.ok, false, 'fără dovezi');
  assert.equal(validateProposal({ actiune: 'usureaza', tinta: 'azi', index: 0, minute: null, dovezi: ['hrv.azi'], motiv: 'x' }, packet, 'rosu')!.ok, false, 'zi roșie');
  const ok = validateProposal({ actiune: 'usureaza', tinta: 'azi', index: 0, minute: null, dovezi: ['hrv.azi'], motiv: 'HRV mic' }, packet, 'verde')!;
  assert.equal(ok.ok, true);
  // Acceptată → doar SUGESTIE (o activează sportivul); planul în sine nu se schimbă.
  const plan = [W({ id: 'q', type: 'calitate', plannedMinutes: 50, targetZones: [4], key: true, date: '2026-11-04' })];
  const r = adapt(plan, { kind: 'propunere', date: '2026-11-04', workoutId: 'q', actiune: 'usureaza', minutes: null, motiv: 'HRV mic' }, { today: '2026-11-04', freeBlocks: [], recentKeyScores: [] });
  const q = r.plan[0]!;
  assert.deepEqual([q.type, q.plannedMinutes, q.targetZones], ['calitate', 50, [4]]);
  assert.equal(q.suggestion?.accepted, null);
  assert.equal(claimsActivation('Am redus ședința de azi la 40 de minute.'), true);
  assert.equal(claimsActivation('Îți propun o variantă mai ușoară azi.'), false);
});
