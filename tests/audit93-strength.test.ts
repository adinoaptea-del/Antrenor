// Auditul v93, forță și fitness (A49–A60, A91, A104, A105), cu deciziile proprietarului din 20.10.2026.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { adapt } from '../src/calendar/adapt.js';
import { assignStrengthDays, type WeekPlan } from '../src/calendar/generate.js';
import { shortenWorkout } from '../src/calendar/validate.js';
import { MIN_STRENGTH_MINUTES, parseStrength, prescribe, prescribeFull, strengthStructure, type StrengthSpec } from '../src/strength/ppl.js';
import { upgradeStrengthRules } from '../src/strength/split-upgrade.js';
import type { PlannedWorkout } from '../src/types.js';

const gym = (id: string, date: string, spec: StrengthSpec, minutes = 60): PlannedWorkout => ({ id, date, sport: 'forta', type: 'forta', plannedMinutes: minutes, targetZones: [], key: false, status: 'planificat', structure: strengthStructure(spec) });
const L1: StrengthSpec = { session: 'l1', block: 'construire', week: 2, len: 4 };
const PUSH: StrengthSpec = { session: 'pushA', block: 'baza', week: 2, len: 4 };
const ctx = (today: string) => ({ today, freeBlocks: [], recentKeyScores: [] });

describe('A49: 45 de minute și 3 serii rămân implicite; excepțiile au varianta scurtă cu motiv', () => {
  it('fără excepție, regula 20 rămâne exact: 25 de minute cerute → tot 45, 3–4 serii', () => {
    for (const spec of [L1, PUSH]) {
      const p = prescribe(spec, 25);
      assert.equal(p.minutes, MIN_STRENGTH_MINUTES);
      assert.ok(p.items.every((r) => r.sets >= 3 && r.sets <= 4));
    }
  });

  it('timpul declarat sub 45 („Am doar 25 de minute”): ședință utilă de ≤ 25 min, minimum 2 serii, motivul în ședință', () => {
    for (const spec of [L1, PUSH, { session: 'push', block: 'baza', week: 1, len: 4, variant: 1 } as StrengthSpec]) {
      const w = shortenWorkout(gym('f', '2026-11-03', spec, 60), 25);
      const back = parseStrength(w.structure)!;
      assert.deepEqual(back.reduced, { why: 'timp', minutes: 25 }, w.structure ?? "");
      const rx = prescribe(back, w.plannedMinutes);
      assert.equal(w.plannedMinutes, rx.minutes, 'o singură durată');
      assert.ok(rx.minutes <= 25 && rx.minutes >= 15, `${spec.session}: ${rx.minutes}`);
      assert.ok(rx.items.length >= 1 && rx.items.every((r) => r.sets >= 2 && r.sets <= 4), rx.items.map((r) => r.sets).join(','));
      assert.ok(rx.notes.some((n) => /variantă scurtă \(timpul tău de azi\)/.test(n)));
      assert.equal(rx.finisher, null, 'fără cardio de umplutură până la 45');
    }
    // 45 sau mai mult cerut: regula obișnuită.
    const w45 = shortenWorkout(gym('g', '2026-11-03', L1, 60), 45);
    assert.equal(parseStrength(w45.structure)!.reduced, undefined);
    assert.equal(w45.plannedMinutes, 45);
  });

  it('după febră: varianta scurtă (2 serii, ~jumătate din durată), nu 45 de minute', () => {
    const r = adapt([gym('f', '2026-10-24', L1, 60)], { kind: 'febra', date: '2026-10-19' }, ctx('2026-10-19'));
    const x = r.plan[0]!;
    const spec = parseStrength(x.structure)!;
    assert.equal(spec.reduced?.why, 'boala');
    const rx = prescribe(spec, x.plannedMinutes);
    assert.equal(x.plannedMinutes, rx.minutes);
    assert.ok(x.plannedMinutes <= 30 && x.plannedMinutes < 45, String(x.plannedMinutes));
    assert.ok(rx.items.every((i) => i.sets === 2 && i.rir === '3–4'));
  });

  it('recuperare la jumătate (galben) și durere la umăr: sugestia de forță e varianta scurtă, nu 45 de minute', () => {
    const g = adapt([gym('f', '2026-10-20', PUSH, 55)], { kind: 'readiness', date: '2026-10-20', verdict: 'galben', reason: 'HRV sub medie' }, ctx('2026-10-20')).plan[0]!;
    assert.equal(g.plannedMinutes, 55, 'planul rămâne; e doar sugestie');
    assert.ok(g.suggestion!.minutes < 45 && g.suggestion!.minutes >= 20, String(g.suggestion!.minutes));
    assert.equal(parseStrength(g.suggestion!.structure)!.reduced?.why, 'siguranta');
    const p = adapt([gym('f', '2026-10-20', PUSH, 55)], { kind: 'durere', date: '2026-10-20', score: 4, loc: 'umăr' }, ctx('2026-10-20')).plan[0]!;
    assert.ok(p.suggestion!.minutes < 45);
  });

  it('efortul în plus (regula 29) rămâne cu greutăți mai mici, ≥ 45 de minute (nu e o excepție de siguranță)', () => {
    const c = adapt([gym('f', '2026-10-20', PUSH, 55)], { kind: 'acoperit', date: '2026-10-20', facut: 80, planificat: 60 }, ctx('2026-10-20')).plan[0]!;
    assert.ok(c.suggestion!.minutes >= 45);
    assert.equal(parseStrength(c.suggestion!.structure)!.reduced, undefined);
  });

  it('taper (ultimele săptămâni dinaintea cursei): varianta scurtă de ~30 min', () => {
    const wk = (ws: string, d: string): WeekPlan => ({ weekStart: ws, phase: 'taper', recovery: false, targetHours: 5, plannedHours: 5, notes: [], workouts: [gym(`f${d}`, d, PUSH, 50)] });
    const weeks = [wk('2026-11-02', '2026-11-03'), wk('2026-11-09', '2026-11-10')];
    assignStrengthDays(weeks, '2026-11-15');
    const pre = weeks.flatMap((w) => w.workouts).filter((x) => parseStrength(x.structure)!.block === 'precursa');
    assert.ok(pre.length >= 1);
    for (const x of pre) {
      const spec = parseStrength(x.structure)!;
      assert.equal(spec.reduced?.why, 'taper', x.structure ?? "");
      assert.ok(x.plannedMinutes <= 30, `${x.date}: ${x.plannedMinutes}`);
      assert.ok(prescribe(spec, x.plannedMinutes).items.every((r) => r.sets >= 2 && r.sets <= 3));
    }
  });

  it('T37: refresh / deschiderea aplicației (upgradeStrengthRules) nu restaurează seriile și durata tăiate', () => {
    const r = adapt([gym('f', '2026-10-24', L1, 60)], { kind: 'febra', date: '2026-10-19' }, ctx('2026-10-19'));
    const x = r.plan[0]!;
    const up = upgradeStrengthRules([x], '2026-10-19', 'fit-tonifiere');
    const after = up.find((u) => u.id === x.id) ?? x;
    assert.equal(after.plannedMinutes, x.plannedMinutes);
    assert.equal(parseStrength(after.structure)!.reduced?.why, 'boala');
    // A doua oară: nimic de schimbat.
    assert.deepEqual(upgradeStrengthRules([after], '2026-10-19', 'fit-tonifiere'), []);
  });
});

describe('A91: modulul de întreținere al fizioterapeutului nu devine 45 de minute și 3 serii', () => {
  it('modulul A și B: 12–20 min, 1–2 serii, rezervă mare, fără cardio de umplutură, și după text', () => {
    for (const session of ['intA', 'intB'] as const) {
      const spec: StrengthSpec = { session, block: 'mentinere', week: 1, len: 4 };
      for (const minutes of [15, 45, 60]) {
        const rx = prescribe(spec, minutes);
        assert.ok(rx.minutes >= 10 && rx.minutes <= 20, `${session} ${minutes}: ${rx.minutes}`);
        assert.ok(rx.items.every((r) => r.sets >= 1 && r.sets <= 2), rx.items.map((r) => `${r.ex.id}×${r.sets}`).join(' '));
        assert.ok(rx.items.every((r) => r.rir === '3–4'));
        assert.equal(rx.finisher, null);
      }
      const back = parseStrength(strengthStructure(spec))!;
      assert.equal(prescribeFull(back).items.length, 4);
    }
  });
});
