// Regulile proprietarului pentru forță și fitness (19.10.2026): ≥ 45 min cu încălzirea, 3–4 serii pe exercițiu,
// niciodată picioare + partea de sus în aceeași ședință; femei după structura unei antrenoare reale; bărbați PPL.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generatePlan } from '../src/calendar/generate.js';
import { fitnessProfile } from '../src/strength/fitness.js';
import { parseStrength, prescribe, prescribeFull, strengthStructure } from '../src/strength/ppl.js';
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
  const entry = (reps: number[]) => ({ date: '2026-10-12', exercise: 'fit-squat', sets: reps.map((r) => ({ reps: r, kg: 40 })), rir: 2 });
  const scheme = '20 / 15 / 12 / 8 — crești greutatea la fiecare serie';
  assert.equal(suggest('fit-squat', scheme, '2–3', [entry([20, 15, 12, 8])] as never).kind, 'creste');
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
