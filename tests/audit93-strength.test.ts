// Auditul v93, forță și fitness (A49–A60, A91, A104, A105), cu deciziile proprietarului din 20.10.2026.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { adapt } from '../src/calendar/adapt.js';
import { generateFitnessPlan } from '../src/calendar/fitness-plan.js';
import { assignStrengthDays, type WeekPlan } from '../src/calendar/generate.js';
import { shortenWorkout } from '../src/calendar/validate.js';
import { MIN_STRENGTH_MINUTES, parseStrength, prescribe, prescribeFull, strengthStructure, type StrengthSpec } from '../src/strength/ppl.js';
import { upgradeStrengthRules } from '../src/strength/split-upgrade.js';
import type { FreeBlock, PlannedWorkout } from '../src/types.js';

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

describe('A50 / T32: structura după frecvență (1 = tot corpul, 2 = sus / jos, 3+ = PPL), nu după sex', () => {
  const DAYS = ['2026-11-02', '2026-11-04', '2026-11-06', '2026-11-07'];
  const plusDays = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
  const weeksOf = (n: number, keyAfterEach = false): WeekPlan[] =>
    [0, 1, 2, 3, 4, 5].map((k) => {
      const gyms: PlannedWorkout[] = DAYS.slice(0, n).map((d, i) => ({ id: `f${k}-${i}`, date: plusDays(d, 7 * k), sport: 'forta', type: 'forta', plannedMinutes: 60, targetZones: [], key: false, status: 'planificat' }));
      // Cheie a doua zi după fiecare zi de sală: picioarele ar fi mereu „blocate”.
      const keys: PlannedWorkout[] = keyAfterEach ? gyms.map((g) => ({ ...g, id: `k${g.id}`, date: plusDays(g.date, 1), sport: 'alergare', type: 'calitate', key: true })) : [];
      return { weekStart: plusDays('2026-11-02', 7 * k), phase: 'baza1' as const, recovery: false, targetHours: 6, plannedHours: 6, notes: [], workouts: [...gyms, ...keys] };
    });
  const exposure = (ws: WeekPlan[]) =>
    ws.map((w) => {
      const items = w.workouts.filter((x) => x.type === 'forta').flatMap((x) => prescribe(parseStrength(x.structure)!, x.plannedMinutes).items);
      return { legs: items.some((r) => r.ex.region === 'legs'), push: items.some((r) => /piept/.test(r.ex.group)), pull: items.some((r) => /spate/.test(r.ex.group)) };
    });

  for (const n of [1, 2, 3, 4]) {
    it(`${n} ședință(e) pe săptămână: picioarele, împinsul și trasul apar în fiecare săptămână, la bărbat și la femeie`, () => {
      for (const split of ['ppl', undefined] as const) {
        const ws = weeksOf(n);
        assignStrengthDays(ws, undefined, split);
        const sessions = ws.flatMap((w) => w.workouts.filter((x) => x.type === 'forta').map((x) => parseStrength(x.structure)!.session));
        if (n === 1) assert.ok(sessions.every((s) => s === 'full'), sessions.join(','));
        if (n === 2) assert.ok(sessions.every((s) => s === 'fullA' || s === 'fullB'), sessions.join(','));
        exposure(ws).forEach((e, i) => assert.deepEqual(e, { legs: true, push: true, pull: true }, `${split ?? 'femeie'} ${n}/săpt., săpt. ${i + 1}: ${sessions.join(',')}`));
      }
    });
  }

  it('la 1–2 ședințe pe săptămână, sexul nu schimbă structura (aceeași doză pe tipar)', () => {
    for (const n of [1, 2]) {
      const m = weeksOf(n);
      const f = weeksOf(n);
      assignStrengthDays(m, undefined, 'ppl');
      assignStrengthDays(f);
      assert.deepEqual(m.flatMap((w) => w.workouts.map((x) => x.structure)), f.flatMap((w) => w.workouts.map((x) => x.structure)));
    }
  });

  it('PPL cu picioarele mereu „în ajunul cheii”: picioarele nu dispar, vin ușoare cel puțin o dată la 2 săptămâni', () => {
    const ws = weeksOf(3, true);
    assignStrengthDays(ws, undefined, 'ppl');
    const legs = ws.map((w) => w.workouts.filter((x) => x.type === 'forta').map((x) => parseStrength(x.structure)!).filter((s) => s.session === 'legs'));
    assert.ok(legs.flat().length >= 3, `picioare în 6 săptămâni: ${legs.flat().length}`);
    for (let i = 0; i + 1 < legs.length; i++) assert.ok(legs[i]!.length + legs[i + 1]!.length >= 1, `săpt. ${i + 1}–${i + 2} fără picioare`);
    assert.ok(legs.flat().every((s) => s.legs === 'usor'), 'în ajunul cheii: picioare ușoare (greutăți mai mici)');
  });

  it('fitness: o zi pe săptămână = tot corpul (femeie și bărbat); bărbatul cu 2 zile = sus / jos, nu PPL', () => {
    const one: FreeBlock[] = [{ day: 0, startMin: 17 * 60, endMin: 19 * 60 }];
    const two: FreeBlock[] = [{ day: 0, startMin: 17 * 60, endMin: 19 * 60 }, { day: 3, startMin: 17 * 60, endMin: 19 * 60 }];
    const gen = (blocks: FreeBlock[], male: boolean) => generateFitnessPlan({ startDate: '2026-11-02', raceDate: '2027-05-03', freeBlocks: blocks, fitness: { goal: 'fit-tonifiere', days: 2, minutes: 60, beginner: true }, male });
    for (const male of [false, true]) {
      const r = gen(one, male);
      assert.ok(r.ok);
      if (!r.ok) return;
      for (const w of r.weeks.slice(0, 4)) {
        const items = w.workouts.flatMap((x) => prescribe(parseStrength(x.structure)!, x.plannedMinutes).items);
        assert.ok(items.some((i) => i.ex.region === 'legs') && items.some((i) => i.ex.region === 'upper'), `${male ? 'bărbat' : 'femeie'}: ${w.workouts.map((x) => x.structure).join(' | ')}`);
      }
    }
    const m2 = gen(two, true);
    assert.ok(m2.ok);
    if (!m2.ok) return;
    assert.deepEqual(m2.weeks.slice(0, 3).map((w) => w.workouts.map((x) => parseStrength(x.structure)!.session).join('+')), ['fullA+fullB', 'fullA+fullB', 'fullA+fullB']);
  });
});
