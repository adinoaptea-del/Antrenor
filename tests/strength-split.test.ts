import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { assignStrengthDays, type WeekPlan } from '../src/calendar/generate.js';
import { CATALOG, SESSIONS, STRENGTH_RULES, estimateMinutes, parseStrength, prescribe, prescribeFull, sessionExercises, strengthStructure } from '../src/strength/ppl.js';
import { upgradeToSplit } from '../src/strength/split-upgrade.js';
import type { PlannedWorkout } from '../src/types.js';

const w = (date: string, type: PlannedWorkout['type'], key = false, minutes = 55, structure?: string): PlannedWorkout => ({ id: `${type}-${date}`, date, sport: type === 'forta' ? 'forta' : 'alergare', type, plannedMinutes: minutes, targetZones: [], key, status: 'planificat', ...(structure ? { structure } : {}) });
const week = (weekStart: string, workouts: PlannedWorkout[]): WeekPlan => ({ weekStart, phase: 'baza1', recovery: false, targetHours: 6, plannedHours: 6, notes: [], workouts });
const groups = (id: 'push' | 'pull' | 'legs', v: number) => sessionExercises(SESSIONS[id], v).map((x) => CATALOG[x]!.group).join(' | ');

describe('forța la bărbați: Push / Pull / Picioare cu exerciții care se schimbă', () => {
  it('Push = piept + umeri (fața și lateral) + triceps, abdomen opțional; nimic de spate sau picioare', () => {
    for (const v of [0, 1, 2]) {
      const g = groups('push', v);
      for (const need of ['piept', 'umeri (fața', 'umeri (lateral)|umeri (fața și lateral)', 'triceps', 'abdomen|trunchi']) assert.ok(need.split('|').some((n) => g.includes(n)), `push v${v}: lipsește ${need} (${g})`);
      for (const x of sessionExercises(SESSIONS.push, v)) assert.ok(CATALOG[x]!.region !== 'legs' && !/spate|biceps/.test(CATALOG[x]!.group), x);
    }
  });

  it('Pull = spate + umeri (spate) + trapez + biceps, abdomen opțional', () => {
    for (const v of [0, 1, 2]) {
      const g = groups('pull', v);
      for (const need of ['spate', 'umăr posterior|umeri (spate)', 'trapez', 'biceps', 'abdomen|trunchi']) assert.ok(need.split('|').some((n) => g.includes(n)), `pull v${v}: lipsește ${need} (${g})`);
      for (const x of sessionExercises(SESSIONS.pull, v)) assert.ok(CATALOG[x]!.region !== 'legs' && !/piept|triceps/.test(CATALOG[x]!.group), x);
    }
  });

  it('Picioare = cvadriceps, femurali, fesieri, adductori, abductori, gambe; nimic de sus', () => {
    for (const v of [0, 1, 2]) {
      const g = groups('legs', v);
      for (const need of ['cvadriceps', 'femurali', 'fesieri', 'adductori', 'abductori', 'gambe']) assert.ok(g.includes(need), `legs v${v}: lipsește ${need} (${g})`);
      for (const x of sessionExercises(SESSIONS.legs, v)) assert.ok(CATALOG[x]!.region !== 'upper', x);
    }
  });

  it('ședințe consecutive de același tip nu repetă niciun exercițiu; toate există în catalog', () => {
    for (const id of ['push', 'pull', 'legs'] as const) {
      for (const v of [0, 1, 2, 3, 4, 5]) {
        const a = sessionExercises(SESSIONS[id], v);
        const b = sessionExercises(SESSIONS[id], v + 1);
        for (const x of [...a, ...b]) assert.ok(CATALOG[x], x);
        assert.deepEqual(a.filter((x) => b.includes(x)), [], `${id} v${v} → v${v + 1}`);
      }
    }
  });

  it('2 ședințe pe săptămână la bărbat: Push → Pull → Picioare în continuare, cu variantă crescătoare; femeia rămâne la tot corpul', () => {
    const mk = () => [week('2026-11-02', [w('2026-11-03', 'forta'), w('2026-11-05', 'forta')]), week('2026-11-09', [w('2026-11-10', 'forta'), w('2026-11-12', 'forta')]), week('2026-11-16', [w('2026-11-17', 'forta'), w('2026-11-19', 'forta')])];
    const men = mk();
    assignStrengthDays(men, undefined, 'ppl');
    const s = men.flatMap((x) => x.workouts.map((y) => parseStrength(y.structure)!));
    assert.deepEqual(s.map((x) => `${x.session}${x.variant}`), ['push0', 'pull0', 'legs0', 'push1', 'pull1', 'legs1']);
    const women = mk();
    assignStrengthDays(women);
    assert.deepEqual(women.flatMap((x) => x.workouts.map((y) => y.structure!.split(' · ')[0])), ['Tot corpul A', 'Tot corpul B', 'Tot corpul A', 'Tot corpul B', 'Tot corpul A', 'Tot corpul B']);
  });

  it('Picioarele nu cad în ajunul ședinței-cheie: trec la următoarea zi de sală', () => {
    const plan = [week('2026-11-02', [w('2026-11-02', 'forta'), w('2026-11-03', 'forta'), w('2026-11-05', 'forta'), w('2026-11-06', 'lung', true)]), week('2026-11-09', [w('2026-11-10', 'forta')])];
    assignStrengthDays(plan, undefined, 'ppl');
    const s = plan.flatMap((x) => x.workouts.filter((y) => y.type === 'forta').map((y) => parseStrength(y.structure)!.session));
    assert.deepEqual(s, ['push', 'pull', 'push', 'legs']);
  });

  it('textul din plan se citește înapoi, cu varianta', () => {
    const spec = { session: 'legs' as const, block: 'baza' as const, week: 2, len: 4, recovery: false, legs: 'normal' as const, variant: 4 };
    const t = strengthStructure(spec);
    assert.equal(t, 'Picioare · varianta 5 · Bază, săpt. 2/4 · 2–3 repetări în rezervă');
    assert.deepEqual(parseStrength(t), spec);
  });

  it('încape în 55 min; abdomenul (opțional) cade primul, pauzele grele rămân', () => {
    for (const id of ['push', 'pull', 'legs'] as const) {
      const full = prescribeFull({ session: id, block: 'baza', week: 2, len: 4, variant: 0 });
      assert.ok(full.items.at(-1)!.optional, `${id}: abdomenul e ultimul și opțional`);
      const r = prescribe({ session: id, block: 'baza', week: 2, len: 4, variant: 0 }, 55);
      assert.ok(estimateMinutes(r.items) <= 55, `${id}: ${estimateMinutes(r.items)}`);
      if (r.trimmed.length) assert.ok(!r.items.some((x) => x.optional), `${id}: abdomenul pleacă înaintea exercițiilor mari`);
      assert.equal(r.items[0]!.rest, 150);
    }
    // Picioarele la 55 min păstrează adductorii și abductorii.
    const legs = prescribe({ session: 'legs', block: 'baza', week: 2, len: 4, variant: 0 }, 55);
    assert.ok(legs.items.some((x) => /adductori/.test(x.ex.group)) && legs.items.some((x) => /abductori/.test(x.ex.group)));
  });

  it('planul salvat cu tot corpul trece la Push / Pull / Picioare doar în viitor; a doua oară nu mai schimbă nimic', () => {
    const old = (d: string, s: string) => w(d, 'forta', false, 50, `${s} · Bază, săpt. 1/4 · 3 repetări în rezervă`);
    const plan = [old('2026-10-13', 'Tot corpul A'), old('2026-10-15', 'Tot corpul B'), old('2026-10-20', 'Tot corpul A'), old('2026-10-22', 'Tot corpul B'), w('2026-10-24', 'lung', true), old('2026-10-23', 'Tot corpul A'), old('2026-10-27', 'Tot corpul B')];
    const up = upgradeToSplit(plan, '2026-10-19');
    assert.deepEqual(up.map((x) => x.date), ['2026-10-20', '2026-10-22', '2026-10-23', '2026-10-27']);
    assert.deepEqual(up.map((x) => parseStrength(x.structure)!.session), ['push', 'pull', 'push', 'legs'], 'picioarele nu în ajunul ieșirii lungi');
    assert.ok(up.every((x) => x.plannedMinutes === 50));
    const merged = plan.map((x) => up.find((u) => u.id === x.id) ?? x);
    assert.deepEqual(upgradeToSplit(merged, '2026-10-19'), []);
    assert.equal(merged[0]!.structure!.split(' · ')[0], 'Tot corpul A', 'trecutul nu se rescrie');
  });

  it('explicațiile sunt pe înțeles: fără „RIR”, „calibr…”, „unilateral”, „amplitudine”, „lombar” în ce vede sportivul', () => {
    const texts: string[] = [...STRENGTH_RULES.map((r) => r.d)];
    for (const id of ['push', 'pull', 'legs'] as const)
      for (const v of [0, 1, 2]) {
        const p = prescribe({ session: id, block: 'forta', week: 2, len: 4, variant: v }, 45);
        texts.push(...p.notes, ...p.items.map((r) => `${r.ex.name} ${r.ex.cue} ${r.ex.alt} ${r.ex.group}`));
      }
    for (const t of texts) assert.ok(!/\bRIR\b|calibr|unilateral|amplitudin|lombar|toleran|progresie dublă/i.test(t), t);
  });
});
