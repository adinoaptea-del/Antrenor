import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { assignStrengthDays, generatePlan } from '../src/calendar/generate.js';
import { CATALOG, SESSIONS, estimateMinutes, parseStrength, prescribe, prescribeFull, strengthBlocks, strengthStructure, type Block } from '../src/strength/ppl.js';
import type { PlannedWorkout } from '../src/types.js';

const w = (date: string, type: PlannedWorkout['type'], key = false, minutes = 55): PlannedWorkout => ({ id: `${type}-${date}`, date, sport: type === 'forta' ? 'forta' : 'alergare', type, plannedMinutes: minutes, targetZones: [], key, status: 'planificat' });
const count = (bw: { block: Block }[], b: Block) => bw.filter((x) => x.block === b).length;

describe('forța: programul AIRON Push / Pull / Legs adaptiv', () => {
  it('cele șase ședințe A/B și tot corpul A/B; A diferă de B; toate exercițiile există în catalog', () => {
    assert.deepEqual(['pushA', 'pullA', 'legsA', 'pushB', 'pullB', 'legsB'].map((id) => SESSIONS[id as 'pushA'].name), ['Push A', 'Pull A', 'Legs A', 'Push B', 'Pull B', 'Legs B']);
    assert.notDeepEqual(SESSIONS.pushA.exercises, SESSIONS.pushB.exercises);
    for (const s of Object.values(SESSIONS)) for (const id of [...s.exercises, ...s.completions.map((c) => c.id), ...(s.legSwap ? [s.legSwap] : [])]) assert.ok(CATALOG[id], `${s.id}: ${id}`);
    assert.equal(CATALOG['push-db-bench']!.reps, '6–10');
    assert.equal(CATALOG['pull-farmer']!.reps, '20–30 m');
  });

  it('referința: 26 de săptămâni = 4 acomodare, 4 × 5 blocuri de dezvoltare și consolidare, 2 înainte de cursă', () => {
    const b = strengthBlocks(26);
    assert.equal(b.length, 26);
    assert.deepEqual(['acomodare', 'baza', 'forta', 'hipertrofie', 'integrare', 'consolidare', 'precursa'].map((x) => count(b, x as Block)), [4, 4, 4, 4, 4, 4, 2]);
  });

  it('12 săptămâni: 2 de calibrare, 6 de dezvoltare, 2 de consolidare, 2 reduse — nu 26 înghesuite', () => {
    const b = strengthBlocks(12);
    assert.equal(b.length, 12);
    assert.equal(count(b, 'acomodare'), 2);
    assert.equal(count(b, 'baza') + count(b, 'forta') + count(b, 'hipertrofie') + count(b, 'integrare'), 6);
    assert.equal(count(b, 'consolidare'), 2);
    assert.equal(count(b, 'precursa'), 2);
    assert.equal(count(b, 'hipertrofie'), 0); // la anduranță, hipertrofia e prima care cade
  });

  it('40 de săptămâni: baza prelungită, blocuri productive repetate, finalul aliniat cursei', () => {
    const b = strengthBlocks(40);
    assert.equal(b.length, 40);
    assert.equal(count(b, 'baza'), 8);
    assert.ok(count(b, 'forta') >= 8);
    assert.equal(b[39]!.block, 'precursa');
    assert.equal(b[37]!.block, 'consolidare');
  });

  it('obiectiv foarte apropiat (4 săptămâni): familiarizare, menținere, ultima redusă', () => {
    assert.deepEqual(strengthBlocks(4).map((x) => x.block), ['acomodare', 'mentinere', 'mentinere', 'precursa']);
  });

  it('volumul nu se înmulțește cu raportul 26 / timp: la 12 săptămâni, baza are aceleași seturi ca la 26', () => {
    const s26 = prescribeFull({ session: 'pushA', block: 'baza', week: 2, len: 4 });
    const s12 = prescribeFull({ session: 'pushA', block: 'baza', week: 2, len: 2 });
    assert.deepEqual(s12.items.map((r) => r.sets), s26.items.map((r) => r.sets));
  });

  it('doza pe blocuri: acomodare 1–2 seturi la 3–4 RIR; forță 5–8 la prima mișcare; înainte de cursă jumătate din seturi', () => {
    const a = prescribeFull({ session: 'legsA', block: 'acomodare', week: 1, len: 4 });
    assert.ok(a.items.every((r) => r.sets <= 2 && r.rir === '3–4'));
    const f = prescribeFull({ session: 'pushA', block: 'forta', week: 1, len: 4 });
    assert.equal(f.items[0]!.reps, '5–8');
    assert.ok(f.items.some((r) => r.completion), 'completările intră în volum');
    const p = prescribeFull({ session: 'pullA', block: 'precursa', week: 1, len: 2 });
    assert.ok(p.items.every((r) => !r.completion && r.rir === '3–4'));
    assert.equal(p.items[0]!.sets, 2);
  });

  it('Legs din bază: două seturi din prima mișcare devin fandare / treaptă, fără volum în plus', () => {
    const base = prescribeFull({ session: 'legsA', block: 'baza', week: 2, len: 4 });
    assert.equal(base.items[0]!.ex.id, 'legs-press');
    assert.equal(base.items[0]!.sets, 2, 'minimum două serii de lucru');
    assert.equal(base.items[1]!.ex.id, 'legs-split-squat');
    assert.equal(base.items[1]!.sets, 2);
  });

  it('încape în timpul dat: întâi cad completările și accesoriile, pauzele principale rămân 2–3 min', () => {
    const full = prescribeFull({ session: 'pushA', block: 'baza', week: 2, len: 4 });
    assert.ok(full.minutes >= 40, `complet: ${full.minutes}`);
    const short = prescribe({ session: 'pushA', block: 'baza', week: 2, len: 4 }, 30);
    assert.ok(estimateMinutes(short.items) <= 30);
    assert.ok(short.items.every((r) => !r.completion));
    assert.equal(short.items[0]!.ex.id, 'push-db-bench');
    assert.equal(short.items[0]!.sets, 3);
    assert.equal(short.items[0]!.rest, 150);
    assert.ok(short.trimmed.length > 0);
    // Cu timp mai mult nu se adaugă volum.
    const long = prescribe({ session: 'pushA', block: 'baza', week: 2, len: 4 }, 120);
    assert.equal(long.minutes, full.minutes);
  });

  it('textul din plan se citește înapoi exact', () => {
    const spec = { session: 'legsB' as const, block: 'consolidare' as const, week: 2, len: 4, recovery: true, legs: 'usor' as const };
    const t = strengthStructure(spec);
    assert.equal(t, 'Legs B · Consolidare, săpt. 2/4 · 3 repetări în rezervă · descărcare · picioare ușoare');
    assert.deepEqual(parseStrength(t), spec);
    assert.equal(parseStrength('Push 1 · programul complet'), null);
  });

  it('2 ședințe pe săptămână → tot corpul A/B; 3 → PPL în ordine; Legs nu cade în ajunul ședinței-cheie', () => {
    const two = [
      { weekStart: '2026-11-02', phase: 'baza1' as const, recovery: false, targetHours: 6, plannedHours: 6, notes: [], workouts: [w('2026-11-03', 'forta'), w('2026-11-05', 'forta')] },
      { weekStart: '2026-11-09', phase: 'baza1' as const, recovery: false, targetHours: 6, plannedHours: 6, notes: [], workouts: [w('2026-11-10', 'forta'), w('2026-11-12', 'forta')] },
    ];
    assignStrengthDays(two);
    assert.deepEqual(two.flatMap((x) => x.workouts.map((y) => y.structure!.split(' · ')[0])), ['Tot corpul A', 'Tot corpul B', 'Tot corpul A', 'Tot corpul B']);
    const three = [{ weekStart: '2026-11-02', phase: 'baza2' as const, recovery: false, targetHours: 6, plannedHours: 6, notes: [], workouts: [w('2026-11-02', 'forta'), w('2026-11-03', 'forta'), w('2026-11-06', 'forta'), w('2026-11-07', 'lung', true)] }, { weekStart: '2026-11-09', phase: 'baza2' as const, recovery: false, targetHours: 6, plannedHours: 6, notes: [], workouts: [w('2026-11-09', 'forta'), w('2026-11-11', 'forta'), w('2026-11-13', 'forta')] }];
    assignStrengthDays(three);
    const names = three.flatMap((x) => x.workouts.filter((y) => y.type === 'forta').map((y) => y.structure!.split(' · ')[0]));
    assert.deepEqual(names, ['Push A', 'Pull A', 'Push B', 'Legs A', 'Pull B', 'Legs B']);
  });

  it('în plan: ședința de forță durează cât conținutul ei și încape în timpul alocat; fără picioare în ultimele 10 zile', () => {
    const r = generatePlan({ startDate: '2026-10-19', raceDate: '2027-01-31', goal: '5k', freeBlocks: [1, 3, 5, 6].map((day) => ({ day: day as 1, startMin: 9 * 60, endMin: 11 * 60 })), sportHours: 4, historyHoursPerWeek: [3, 3], intensityAllowed: 'toate', swimContinuous400: false, athlete: { age: 46, sex: 'm' }, run: { goalPaceSecKm: 300, canDoDistance: true, longestRunKm: 8 } });
    assert.ok(r.ok);
    if (!r.ok) return;
    const forta = r.weeks.flatMap((x) => x.workouts).filter((x) => x.type === 'forta');
    assert.ok(forta.length > 0);
    for (const x of forta) {
      const spec = parseStrength(x.structure);
      assert.ok(spec, x.structure ?? "");
      const rx = prescribe(spec!, x.plannedMinutes);
      assert.ok(estimateMinutes(rx.items) <= x.plannedMinutes + 0.01 || rx.items.length === 1, `${x.date} ${x.structure} ${x.plannedMinutes}`);
      if (x.date >= '2027-01-21') assert.equal(spec!.legs, 'fara');
    }
  });

  it('a treia ședință (PPL) apare în bază doar când programul total o permite', () => {
    const blocks = [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day: day as 0, startMin: 6 * 60, endMin: 8 * 60 }));
    const r = generatePlan({ startDate: '2026-10-19', raceDate: '2027-05-30', goal: '10k', freeBlocks: blocks, sportHours: 7, historyHoursPerWeek: [5, 5, 5], intensityAllowed: 'toate', swimContinuous400: false, run: { goalPaceSecKm: 300, canDoDistance: true, longestRunKm: 12 } });
    assert.ok(r.ok);
    if (!r.ok) return;
    const base = r.weeks.filter((x) => x.phase === 'baza1' && !x.recovery);
    assert.ok(base.some((x) => x.workouts.filter((y) => y.type === 'forta').length === 3));
    assert.ok(r.weeks.flatMap((x) => x.workouts).some((y) => /^Push A/.test(y.structure ?? '')));
  });
});

describe('minimum două serii de lucru pe exercițiu, în orice bloc și orice ședință', () => {
  it('nicio prescripție nu are o singură serie', () => {
    const blocks: Block[] = ['acomodare', 'baza', 'forta', 'hipertrofie', 'integrare', 'consolidare', 'evaluare', 'mentinere', 'precursa', 'construire', 'progres', 'tranzitie'];
    for (const id of Object.keys(SESSIONS) as (keyof typeof SESSIONS)[])
      for (const block of blocks)
        for (const recovery of [false, true])
          for (const minutes of [30, 45, 60]) {
            const p = prescribe({ session: id, block, week: 1, len: 4, recovery, legs: 'usor' }, minutes);
            assert.ok(p.items.every((r) => r.sets >= 2), `${id} ${block} ${recovery} ${minutes}: ${p.items.map((r) => `${r.ex.id}×${r.sets}`).join(' ')}`);
          }
  });
});

describe('plafon pe ședință: cel mult 10 serii de lucru pe același mușchi', () => {
  it('nicio ședință, în niciun bloc sau variantă, nu trece de 10 serii pe grupa principală', () => {
    for (const id of Object.keys(SESSIONS) as (keyof typeof SESSIONS)[])
      for (const block of ['baza', 'forta', 'hipertrofie', 'integrare', 'construire', 'progres'] as Block[])
        for (const variant of [0, 1, 2]) {
          const m: Record<string, number> = {};
          for (const r of prescribeFull({ session: id, block, week: 2, len: 4, variant }).items) {
            const g = r.ex.group.split(/[,(]/)[0]!.trim();
            m[g] = (m[g] ?? 0) + r.sets;
          }
          for (const [g, n] of Object.entries(m)) assert.ok(n <= 10, `${id} ${block} v${variant}: ${g} ${n} serii`);
        }
  });
});
