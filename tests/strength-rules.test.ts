// Regulile proprietarului pentru forță și fitness (19.10.2026): ≥ 45 min cu încălzirea, 3–4 serii pe exercițiu,
// niciodată picioare + partea de sus în aceeași ședință; femei după structura unei antrenoare reale; bărbați PPL.
import { describe, it, test } from 'node:test';
import assert from 'node:assert/strict';
import { generatePlan } from '../src/calendar/generate.js';
import { fitnessProfile } from '../src/strength/fitness.js';
import { MIN_STRENGTH_MINUTES, parseStrength, prescribe, prescribeFull, strengthStructure } from '../src/strength/ppl.js';
import { generateFitnessPlan } from '../src/calendar/fitness-plan.js';
import { upgradeStrengthRules } from '../src/strength/split-upgrade.js';
import type { PlannedWorkout } from '../src/types.js';

const mixed = (rx: ReturnType<typeof prescribe>) => rx.items.some((r) => r.ex.region === 'legs') && rx.items.some((r) => r.ex.region === 'upper');

test('femeie: ședințele ca la antrenoare — încălzire concretă, piramidă cu greutatea crescută, superserii, cardio la final', () => {
  const l1 = prescribeFull({ session: 'l1', block: 'progres', week: 2, len: 4 });
  assert.match(l1.warmup.text, /10 min mers rapid.*50 de genuflexiuni/);
  assert.match(l1.finisher!.text, /scări/);
  assert.ok(l1.items.some((r) => /20 \/ 15 \/ 12 \/ 8 — crești greutatea/.test(r.reps)));
  assert.ok(l1.items.some((r) => r.ss === 'A'));
  const l2 = prescribeFull({ session: 'l2', block: 'progres', week: 2, len: 4 });
  assert.ok(l2.items.some((r) => /3 s ținut sus/.test(r.reps)) && l2.items.some((r) => r.ex.id === 'fit-hip-thrust' && r.sets === 4));
  for (const id of ['l1', 'l2', 'l3', 'u1', 'u2'] as const) {
    const p = prescribeFull({ session: id, block: 'progres', week: 2, len: 4 });
    assert.ok(!mixed(p), id);
    assert.ok(p.minutes >= 45 && p.items.every((r) => r.sets >= 3 && r.sets <= 4), id);
  }
});

test('bărbat la fitness: Push / Pull / Picioare, cu exerciții care se schimbă; ≥ 45 min; 3–4 serii', () => {
  const blocks = [0, 2, 4].map((day) => ({ day: day as 0, startMin: 18 * 60, endMin: 19 * 60 + 30 }));
  const r = generatePlan({ startDate: '2026-10-26', raceDate: '2027-04-26', goal: 'fit-masa', freeBlocks: blocks, historyHoursPerWeek: [], intensityAllowed: 'toate', swimContinuous400: false, athlete: { age: 35, sex: 'm' }, fitness: fitnessProfile('fit-masa', { experienta: 'stabila', zile: 3, minute: 75, acces: 'sala', miscare: 'activa' }) });
  assert.ok(r.ok);
  if (!r.ok) return;
  const all = r.weeks.flatMap((w) => w.workouts);
  const specs = all.map((w) => parseStrength(w.structure)!);
  assert.deepEqual(specs.slice(0, 6).map((s) => s.session), ['push', 'pull', 'legs', 'push', 'pull', 'legs']);
  assert.notEqual(specs[0]!.variant, specs[3]!.variant);
  for (const w of all) {
    const rx = prescribe(parseStrength(w.structure)!, w.plannedMinutes);
    assert.ok(w.plannedMinutes >= 45 && !mixed(rx) && rx.items.every((i) => i.sets >= 3 && i.sets <= 4), w.structure ?? '');
  }
});

test('planurile vechi: ședințele care combinau picioarele cu partea de sus și cele sub 45 min se rescriu (doar viitorul)', () => {
  const mk = (id: string, date: string, structure: string, minutes: number): PlannedWorkout => ({ id, date, sport: 'forta', type: 'forta', plannedMinutes: minutes, targetZones: [], key: false, status: 'planificat', structure });
  const plan = [
    mk('p', '2026-10-12', strengthStructure({ session: 'f1', block: 'acomodare', week: 1, len: 4 }), 35),
    mk('a', '2026-10-19', strengthStructure({ session: 'f1', block: 'acomodare', week: 2, len: 4 }), 35),
    mk('b', '2026-10-22', strengthStructure({ session: 'f2', block: 'acomodare', week: 2, len: 4 }), 35),
    mk('c', '2026-10-26', strengthStructure({ session: 'f1', block: 'acomodare', week: 3, len: 4 }), 35),
    mk('d', '2026-10-29', strengthStructure({ session: 'f2', block: 'acomodare', week: 3, len: 4 }), 35),
    mk('e', '2026-10-21', 'Tot corpul A · Bază, săpt. 2/4 · 3 repetări în rezervă', 40),
  ];
  const up = upgradeStrengthRules(plan, '2026-10-19');
  assert.ok(!up.some((w) => w.id === 'p'), 'trecutul nu se rescrie');
  const byId = new Map(up.map((w) => [w.id, w]));
  assert.deepEqual(['a', 'b', 'c', 'd'].map((id) => parseStrength(byId.get(id)!.structure)!.session), ['l1', 'u1', 'l2', 'u2']);
  assert.match(byId.get('e')!.structure!, /^Picioare și trunchi/);
  for (const w of up) {
    const rx = prescribe(parseStrength(w.structure)!, w.plannedMinutes);
    assert.ok(w.plannedMinutes >= 45 && !mixed(rx) && rx.items.every((i) => i.sets >= 3), w.id);
  }
  // A doua rulare nu mai schimbă nimic.
  const again = upgradeStrengthRules(plan.map((w) => byId.get(w.id) ?? w), '2026-10-19');
  assert.equal(again.length, 0);
});

test('piramida 20 / 15 / 12 / 8: sugestia nu o citește ca „minimum 20 de repetări”', async () => {
  const { suggest } = await import('../src/strength/log.js');
  const entry = (reps: number[], date = '2026-10-12') => ({ date, exercise: 'fit-squat', sets: reps.map((r) => ({ reps: r, kg: 40 })), rir: 2, source: 'ajustat' });
  const scheme = '20 / 15 / 12 / 8 — crești greutatea la fiecare serie';
  // Auditul v93, A54: o singură piramidă reușită nu mai crește greutatea; două la rând, cu rezervă, da.
  assert.equal(suggest('fit-squat', scheme, '2–3', [entry([20, 15, 12, 8])] as never).kind, 'ramai');
  assert.equal(suggest('fit-squat', scheme, '2–3', [entry([20, 15, 12, 8], '2026-10-05'), entry([20, 15, 12, 8])] as never).kind, 'creste');
  const r = suggest('fit-squat', scheme, '2–3', [entry([20, 14, 12, 8])] as never);
  assert.equal(r.kind, 'ramai');
  assert.doesNotMatch(r.today, /sub 20/);
});

test('jurnalul: ținta pe serie la piramidă; „3 s ținut” nu e o durată', async () => {
  const { repRange, repTargets } = await import('../src/strength/log.js');
  assert.deepEqual(repTargets('20 / 15 / 12 / 8 — crești greutatea la fiecare serie', 4), [20, 15, 12, 8]);
  assert.deepEqual(repTargets('8–12', 3), [8, 8, 8]);
  assert.deepEqual(repRange('40: 30 cu 3 s ținut sus + 10 rapide'), [40, 40]);
  assert.equal(repRange('30–45 s'), null);
});

test('femeie: fiecare zi are 3 variante din săptămânile antrenoarei; planul trece prin ele (exercițiile se schimbă)', () => {
  const blocks = [0, 2, 4].map((day) => ({ day: day as 0, startMin: 18 * 60, endMin: 19 * 60 + 30 }));
  const r = generatePlan({ startDate: '2026-10-26', raceDate: '2027-04-26', goal: 'fit-tonifiere', freeBlocks: blocks, historyHoursPerWeek: [], intensityAllowed: 'toate', swimContinuous400: false, athlete: { age: 30, sex: 'f' }, fitness: fitnessProfile('fit-tonifiere', { experienta: 'stabila', zile: 3, minute: 90, acces: 'sala', miscare: 'activa' }) });
  assert.ok(r.ok);
  if (!r.ok) return;
  const seen = new Map<string, Set<number>>();
  for (const w of r.weeks.flatMap((x) => x.workouts)) {
    const sp = parseStrength(w.structure)!;
    if (!seen.has(sp.session)) seen.set(sp.session, new Set());
    seen.get(sp.session)!.add(sp.variant ?? 0);
  }
  for (const id of ['l1', 'l2', 'l3', 'u1', 'u2']) assert.deepEqual([...(seen.get(id) ?? [])].sort(), [0, 1, 2], id);
  const a = prescribe({ session: 'l1', block: 'progres', week: 2, len: 4, variant: 0 }, 90).items.map((i) => i.ex.id).join();
  const b = prescribe({ session: 'l1', block: 'progres', week: 2, len: 4, variant: 2 }, 90).items.map((i) => i.ex.id).join();
  assert.notEqual(a, b);
});

describe('începutul ședinței de sală: bandă sau bicicletă după obiectiv (regula 25)', () => {
  it('slăbire: 20 min mers înclinat în zilele de sus, 10 în cele de picioare + cardio la final; intră în durată', () => {
    const up = prescribe({ session: 'u1', block: 'progres', week: 2, len: 4, opener: 'slabire' }, 75);
    assert.equal(up.warmup.min, 25);
    assert.match(up.warmup.text, /^20 min mers pe bandă înclinată: pornești de la 5% înclinație și 5 km\/h/);
    assert.match(up.warmup.text, /rotiri de umeri/);
    assert.equal(up.finisher, null);
    assert.ok(up.minutes <= 75 && up.minutes >= MIN_STRENGTH_MINUTES);
    const legs = prescribe({ session: 'l1', block: 'progres', week: 2, len: 4, opener: 'slabire' }, 60);
    assert.equal(legs.warmup.min, 15);
    assert.match(legs.warmup.text, /^10 min mers pe bandă înclinată/);
    assert.ok((legs.finisher?.min ?? 0) >= 5);
    assert.equal(legs.minutes, 60);
    assert.ok(legs.items.every((r) => r.sets >= 3 && r.sets <= 4));
  });

  it('slăbire: marcajul rămâne în textul din plan și se citește înapoi', () => {
    const spec = { session: 'u2' as const, block: 'progres' as const, week: 1, len: 4, opener: 'slabire' as const };
    assert.equal(parseStrength(strengthStructure(spec))?.opener, 'slabire');
  });

  it('anduranță: 5 min de pornire, pe alt aparat decât sportul zilei; niciodată 30 de minute', () => {
    const run = prescribe({ session: 'fullA', block: 'forta', week: 2, len: 4 }, 60, { goal: '70.3', sameDay: ['alergare'] });
    assert.equal(run.warmup.min, 10);
    assert.match(run.warmup.text, /^5 min bicicletă staționară/);
    const bike = prescribe({ session: 'fullB', block: 'forta', week: 2, len: 4 }, 60, { goal: '70.3', sameDay: ['bicicleta'] });
    assert.match(bike.warmup.text, /^5 min bandă, mers vioi \(fără alergare\)/);
    const both = prescribe({ session: 'fullB', block: 'forta', week: 2, len: 4 }, 60, { goal: '70.3', sameDay: ['bicicleta', 'alergare'] });
    assert.match(both.warmup.text, /^5 min eliptică sau aparat de vâslit/);
    assert.match(prescribe({ session: 'push', block: 'forta', week: 2, len: 4 }, 60, { goal: '10k' }).warmup.text, /^5 min bicicletă staționară/);
  });

  it('planul de fitness pentru slăbire scrie pornirea pe bandă înclinată în fiecare ședință', () => {
    const r = generateFitnessPlan({ startDate: '2026-10-19', raceDate: '2027-04-19', freeBlocks: [0, 2, 4].map((day) => ({ day: day as 0, startMin: 1080, endMin: 1170 })), fitness: { goal: 'fit-slabire', days: 3, minutes: 75, beginner: false } as never });
    assert.ok(r.ok);
    if (!r.ok) return;
    const ws = r.weeks[4]!.workouts;
    assert.ok(ws.length > 0 && ws.every((w) => /cardio înclinat la început/.test(w.structure ?? '')));
  });
});
