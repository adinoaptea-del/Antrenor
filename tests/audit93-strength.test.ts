// Auditul v93, forță și fitness (A49–A60, A91, A104, A105), cu deciziile proprietarului din 20.10.2026.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { adapt } from '../src/calendar/adapt.js';
import { generateFitnessPlan } from '../src/calendar/fitness-plan.js';
import { assignStrengthDays, type WeekPlan } from '../src/calendar/generate.js';
import { shortenWorkout } from '../src/calendar/validate.js';
import { SESSIONS, sessionKind, type SessionId } from '../src/strength/ppl.js';
import { CATALOG, MIN_STRENGTH_MINUTES, estimateMinutes, parseStrength, prescribe, prescribeFull, setSides, setWorkSec, strengthStructure, weekSetTotals, type Rx, type StrengthSpec } from '../src/strength/ppl.js';
import { FITNESS_WEEK_ACTION, fitnessProfile, unlockDecision } from '../src/strength/fitness.js';
import { upgradeStrengthRules } from '../src/strength/split-upgrade.js';
import type { FreeBlock, PlannedWorkout } from '../src/types.js';
import { STRENGTH_LOG_CONFLICT, cleanEntry, isMeasured, parseKgInput, strengthLogRow, suggest, type StrengthLogEntry } from '../src/strength/log.js';
import { readFileSync } from 'node:fs';

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

describe('A52 / T33 / T88: durata seriilor și totalul săptămânii', () => {
  const rx = (id: string, reps: string, sets = 3, rest = 60): Rx => ({ ex: CATALOG[id]!, sets, reps, rir: '2–3', rest });

  it('T33: 40 de repetări cu 3 s ținut nu sunt 53 s; ambele părți, menținerile și pauzele intră în durată', () => {
    assert.ok(setWorkSec(rx('fit-abduction', '40, ții 3 s la fiecare deschidere; la ultima ții 10 s')) >= 200);
    assert.ok(setWorkSec(rx('fit-abduction', '50: 30 cu 3 s ținut la deschidere + 20 rapide')) >= 170);
    assert.ok(setWorkSec(rx('fit-glute-bridge', '40: 30 cu 3 s ținut sus + 10 rapide')) >= 160);
    // Pe un picior, cu mențineri: lucrul pe o parte × 2 + schimbarea părții, la fiecare serie, plus pauza.
    const uni = rx('fit-straight-leg', '30 pe picior: 20 cu 3 s sus + 10 rapide (greutăți la glezne)', 3, 60);
    assert.equal(setSides(uni), 2);
    const perSide = setWorkSec(uni);
    assert.ok(perSide >= 110, String(perSide));
    // + ~90 s de reglaj al aparatului / serii de acomodare la fiecare exercițiu de fitness.
    assert.ok(Math.abs(estimateMinutes([uni], 0) * 60 - (3 * (2 * perSide + 15 + 60) + 90)) < 1);
    // „20 (10 pe fiecare picior)” e totalul pe ambele picioare: nu se dublează.
    assert.equal(setSides(rx('fit-walking-lunge', '20 (10 pe fiecare picior)')), 1);
    // Piramida: fiecare serie cu repetările ei.
    const pyr = rx('fit-squat', '20 / 15 / 12 / 8 — crești greutatea la fiecare serie', 4, 120);
    assert.deepEqual([0, 1, 2, 3].map((i) => setWorkSec(pyr, i)), [60, 45, 36, 24]);
  });

  it('circuitul, piramida și exercițiul pe un picior încap efectiv în durata promisă', () => {
    for (const session of ['l1', 'l2', 'l3', 'u1', 'u2'] as const)
      for (const variant of [0, 1, 2])
        for (const minutes of [45, 60, 75]) {
          const p = prescribe({ session, block: 'construire', week: 2, len: 4, variant }, minutes);
          const work = estimateMinutes(p.items, p.warmup.min) + (p.finisher?.min ?? 0);
          assert.ok(work <= p.minutes + 0.01, `${session} v${variant} ${minutes}: ${work.toFixed(1)} > ${p.minutes}`);
          assert.ok(p.minutes <= Math.max(45, minutes), `${session} v${variant} ${minutes}: ${p.minutes}`);
        }
  });

  it('T88: totalul de serii al fiecărei săptămâni e vizibil, iar trecerea 2 → 3 și 3 → 4 zile spune creșterea cu cifre', () => {
    const FREE: FreeBlock[] = [0, 1, 2, 3, 4, 5, 6].map((d) => ({ day: d as 0, startMin: 17 * 60, endMin: 19 * 60 }));
    for (const [zile, experienta] of [[3, 'incepatoare'], [4, 'stabila']] as const) {
      const fitness = { ...fitnessProfile('fit-tonifiere', { experienta, zile, minute: 60, acces: 'sala', miscare: 'plimbari' }), unlocked: zile };
      const r = generateFitnessPlan({ startDate: '2026-10-26', raceDate: '2027-04-26', freeBlocks: FREE, fitness });
      assert.ok(r.ok);
      if (!r.ok) return;
      const totals = r.weeks.map((w) => weekSetTotals(w.workouts.map((x) => prescribe(parseStrength(x.structure)!, x.plannedMinutes))).total);
      r.weeks.forEach((w, i) => assert.ok(w.notes.some((n) => n.startsWith(`serii de lucru în săptămână: ${totals[i]} `)), `${zile} săpt. ${i + 1}: ${w.notes.join(' | ')}`));
      const t = r.weeks.findIndex((w) => w.workouts.some((x) => parseStrength(x.structure)!.transition));
      assert.ok(t > 0, 'există o săptămână de trecere');
      assert.ok(totals[t]! > totals[t - 1]!, 'o ședință în plus adaugă serii');
      const pct = Math.round(((totals[t]! - totals[t - 1]!) / totals[t - 1]!) * 100);
      assert.ok(r.weeks[t]!.notes.some((n) => n.includes(`de la ${totals[t - 1]} la ${totals[t]} (+${pct}%)`)), r.weeks[t]!.notes.join(' | '));
    }
    // Nicio promisiune falsă de „volum distribuit fără creștere” în textele pentru sportivă.
    assert.ok(!/distribuie (volumul|doza)[^.]*(nu (îl|o) (crește|adaugă)|fără serii în plus)/.test(FITNESS_WEEK_ACTION[9]! + unlockDecision({ days: 3, beginner: true }, Array(4).fill({ planned: 2, done: 2, feedback: 2 })).why));
  });
});

describe('A54: piramida crește greutatea doar după două ședințe în țintă, cu rezervă', () => {
  const PYR = '20 / 15 / 12 / 8 — crești greutatea la fiecare serie';
  const e = (date: string, reps: number[], opts: { rir?: number | null; source?: StrengthLogEntry['source']; kg?: number[] } = {}): StrengthLogEntry => ({ date, exercise: 'fit-squat', sets: reps.map((n, i) => ({ kg: (opts.kg ?? [20, 25, 30, 35])[i] ?? null, reps: n })), rir: opts.rir === undefined ? 2 : opts.rir, source: opts.source ?? 'ajustat' });
  it('o singură piramidă reușită nu crește greutatea; a doua la rând, cu rezervă, da', () => {
    assert.equal(suggest('fit-squat', PYR, '2–3', [e('2026-11-02', [20, 15, 12, 8])]).kind, 'ramai');
    assert.equal(suggest('fit-squat', PYR, '2–3', [e('2026-11-02', [20, 15, 12, 8]), e('2026-11-09', [20, 15, 12, 8])]).kind, 'creste');
  });
  it('o serie ratată nu declanșează creșterea, nici după o piramidă reușită', () => {
    assert.equal(suggest('fit-squat', PYR, '2–3', [e('2026-11-02', [20, 15, 12, 8]), e('2026-11-09', [20, 15, 12, 6])]).kind, 'ramai');
  });
  it('fără rezervă (RIR 0) nu se crește; nici cu greutăți diferite între cele două ședințe', () => {
    assert.equal(suggest('fit-squat', PYR, '2–3', [e('2026-11-02', [20, 15, 12, 8]), e('2026-11-09', [20, 15, 12, 8], { rir: 0 })]).kind, 'ramai');
    assert.equal(suggest('fit-squat', PYR, '2–3', [e('2026-11-02', [20, 15, 12, 8], { kg: [15, 20, 25, 30] }), e('2026-11-09', [20, 15, 12, 8])]).kind, 'ramai');
  });
  it('nota din prescripție nu mai cere creșterea necondiționată la fiecare serie', () => {
    const p = prescribeFull({ session: 'l1', block: 'construire', week: 2, len: 4 });
    const note = p.notes.find((n) => /20 \/ 15 \/ 12 \/ 8/.test(n))!;
    assert.match(note, /doar dacă seria de dinainte a ieșit curat/);
  });
});

describe('A57 / T34: jurnalul păstrează fiecare serie, pe ședință și pe apariție', () => {
  it('patru serii cu greutăți diferite și rezerva pe serie se păstrează separat', () => {
    const x = cleanEntry({ exercise: 'fit-squat', workoutId: '2026-11-02-1', instance: 2, source: 'ajustat', rir: 2, sets: parseKgInput('20/22,5/25/27,5', 4).map((kg, i) => ({ kg, reps: [20, 15, 12, 8][i], rir: 3 - (i > 2 ? 1 : 0) })) }, '2026-11-02')!;
    assert.deepEqual(x.sets.map((s) => s.kg), [20, 22.5, 25, 27.5]);
    assert.deepEqual(x.sets.map((s) => s.reps), [20, 15, 12, 8]);
    assert.deepEqual(x.sets.map((s) => s.rir), [3, 3, 3, 2]);
    assert.equal(x.workoutId, '2026-11-02-1');
    assert.equal(x.instance, 2);
    assert.equal(x.unit, 'kg');
  });
  it('două ședințe în aceeași zi (sau același exercițiu de două ori) au chei diferite; rândul vechi rămâne valabil', () => {
    const a = cleanEntry({ exercise: 'fit-squat', workoutId: 'w1', instance: 0, source: 'ajustat', sets: [{ kg: 20, reps: 10 }] }, '2026-11-02')!;
    const b = cleanEntry({ exercise: 'fit-squat', workoutId: 'w2', instance: 0, source: 'ajustat', sets: [{ kg: 30, reps: 8 }] }, '2026-11-02')!;
    const c = cleanEntry({ exercise: 'fit-squat', workoutId: 'w2', instance: 4, source: 'ajustat', sets: [{ kg: 25, reps: 8 }] }, '2026-11-02')!;
    const keys = [a, b, c].map((x) => STRENGTH_LOG_CONFLICT.split(',').map((k) => (strengthLogRow('u', x) as Record<string, unknown>)[k]).join('|'));
    assert.equal(new Set(keys).size, 3, keys.join(' ; '));
    // Un client vechi (fără ședință): cheia veche, ziua + exercițiul.
    const old = cleanEntry({ exercise: 'fit-squat', source: 'ajustat', sets: [{ kg: 20, reps: 10 }] }, '2026-11-02')!;
    assert.deepEqual([strengthLogRow('u', old).workout_id, strengthLogRow('u', old).instance], ['', 0]);
    // Migrarea nouă există, e separată de cele vechi și schimbă cheia.
    const sql = readFileSync(new URL('../supabase/migrations/0003_strength_log_sets.sql', import.meta.url), 'utf8');
    assert.match(sql, /primary key \(user_id, date, exercise, workout_id, instance\)/);
    assert.match(sql, /declarat_conform/);
  });
});

describe('A58 / T35: „am făcut cum scrie” e declarat conform, nu măsurătoare', () => {
  it('confirmarea nu primește rezerva minimă ca valoare măsurată (nici de la un client vechi)', () => {
    const x = cleanEntry({ exercise: 'fit-hip-thrust', source: 'confirmat', rir: 2, sets: [{ kg: 40, reps: 12, rir: 2 }] }, '2026-11-02')!;
    assert.equal(x.source, 'declarat_conform');
    assert.equal(x.rir, null);
    assert.equal(x.sets[0]!.rir, undefined);
    assert.equal(isMeasured(x), false);
    assert.equal(cleanEntry({ exercise: 'fit-hip-thrust', source: 'ajustat', rir: 2, sets: [{ kg: 40, reps: 12 }] }, '2026-11-02')!.rir, 2);
  });
  it('două confirmări „cum scrie” nu cresc greutatea; o ședință cu valori scrise de sportiv, da', () => {
    const mk = (date: string, source: StrengthLogEntry['source']): StrengthLogEntry => ({ date, exercise: 'fit-lat', sets: [{ kg: 30, reps: 15 }, { kg: 30, reps: 15 }, { kg: 30, reps: 15 }], rir: null, source });
    assert.notEqual(suggest('fit-lat', '15', '2–3', [mk('2026-11-02', 'declarat_conform'), mk('2026-11-09', 'declarat_conform')]).kind, 'creste');
    assert.equal(suggest('fit-lat', '15', '2–3', [mk('2026-11-02', 'declarat_conform'), mk('2026-11-09', 'ajustat')]).kind, 'creste');
    const pyr = (date: string, source: StrengthLogEntry['source']): StrengthLogEntry => ({ date, exercise: 'fit-squat', sets: [20, 15, 12, 8].map((n, i) => ({ kg: 20 + 5 * i, reps: n })), rir: null, source });
    assert.equal(suggest('fit-squat', '20 / 15 / 12 / 8', '2–3', [pyr('2026-11-02', 'declarat_conform'), pyr('2026-11-09', 'declarat_conform')]).kind, 'ramai');
    assert.match(suggest('fit-squat', '20 / 15 / 12 / 8', '2–3', [pyr('2026-11-02', 'declarat_conform')]).last ?? '', /cum scria/);
  });
});

describe('A104 / T76: zilele de picioare se recunosc din metadate (inclusiv fa / fc și acasă)', () => {
  const ids = (Object.keys(SESSIONS) as SessionId[]).filter((id) => !SESSIONS[id].maintenance);
  it('clasa fiecărei ședințe corespunde exercițiilor ei, pe toate variantele, la sală și acasă', () => {
    assert.equal(sessionKind('fa'), 'L');
    assert.equal(sessionKind('fc'), 'L');
    assert.equal(sessionKind('fb'), 'U');
    assert.equal(sessionKind('b3'), 'U', 'b3 vechi = spate și biceps acum');
    assert.equal(sessionKind('c3'), 'L', 'c3 vechi = picioare B acum');
    for (const id of ids)
      for (const place of ['sala', 'acasa'] as const)
        for (const variant of [0, 1, 2]) {
          const items = prescribeFull({ session: id, block: 'construire', week: 2, len: 4, variant, place }).items;
          const legs = items.some((r) => r.ex.region === 'legs');
          const upper = items.some((r) => r.ex.region === 'upper');
          const k = sessionKind(id);
          if (k === 'L') assert.ok(!upper, `${id} ${place} v${variant}: L cu exerciții de sus`);
          if (k === 'U') assert.ok(!legs, `${id} ${place} v${variant}: U cu exerciții de picioare`);
          if (k === 'F') assert.ok(legs && upper, `${id} ${place} v${variant}: tot corpul fără una din părți`);
        }
  });
  it('slăbire: în zilele de picioare 10 min la început și cardio la final; în zilele de sus 20 min la început, fără dublarea cardio-ului', () => {
    for (const id of ids)
      for (const place of ['sala', 'acasa'] as const)
        for (const minutes of [45, 60, 75]) {
          const p = prescribe({ session: id, block: 'construire', week: 2, len: 4, place, opener: 'slabire' }, minutes);
          const tag = `${id} ${place} ${minutes}: încălzire ${p.warmup.min}, final ${p.finisher?.min ?? 0}`;
          if (sessionKind(id) !== 'U') {
            assert.equal(p.warmup.min, 15, tag);
            assert.match(p.warmup.text, /^10 min .*restul de cardio la final/, tag);
            assert.ok(p.finisher && p.finisher.min >= 5, tag);
          } else {
            assert.equal(p.warmup.min, 25, tag);
            assert.match(p.warmup.text, /^20 min /, tag);
            // Fără cardio „la final” în plus: doar completarea până la 45 de minute, dacă e nevoie.
            assert.ok(!p.finisher || p.minutes <= 45, tag);
          }
          // Durata = încălzire + exerciții + final (cardio-ul nu e numărat de două ori).
          const work = Math.ceil(estimateMinutes(p.items, p.warmup.min));
          assert.ok(p.minutes - work - (p.finisher?.min ?? 0) < 5 && p.minutes >= work, tag);
        }
  });
});

describe('A59 / T36: ratarea repetată a ultimei zile de sală nu elimină aceeași categorie', () => {
  /** Simulează săptămânile: toate ședințele în afară de ultima se fac, ultima se ratează; întoarce ce s-a făcut. */
  const simulate = (plan0: PlannedWorkout[], weeks: string[], freeBlocks: FreeBlock[]) => {
    let plan = plan0.map((w) => ({ ...w }));
    const done: string[] = [];
    const executed: SessionId[][] = [];
    for (const ws of weeks) {
      const end = new Date(Date.parse(`${ws}T12:00:00Z`) + 7 * 86_400_000).toISOString().slice(0, 10);
      const gyms = plan.filter((w) => w.type === 'forta' && w.date >= ws && w.date < end && (w.status === 'planificat' || w.status === 'mutat')).sort((a, b) => (a.date < b.date ? -1 : 1));
      const last = gyms.at(-1)!;
      const made = gyms.slice(0, -1);
      done.push(...made.map((w) => w.id));
      executed.push(made.map((w) => parseStrength(w.structure)!.session));
      const today = new Date(Date.parse(`${last.date}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
      plan = adapt(plan, { kind: 'forta-ratat', workoutId: last.id }, { today, freeBlocks, recentKeyScores: [], done }).plan;
    }
    return { executed, plan };
  };

  it('femeie, 3 zile (picioare, sus, picioare): partea de sus nu lipsește o lună', () => {
    const FREE: FreeBlock[] = [0, 2, 4].map((d) => ({ day: d as 0, startMin: 17 * 60, endMin: 19 * 60 }));
    const r = generateFitnessPlan({ startDate: '2026-11-02', raceDate: '2027-05-03', freeBlocks: FREE, fitness: { goal: 'fit-tonifiere', days: 3, minutes: 60, beginner: false, activity: 'plimbari', unlocked: 3 } });
    assert.ok(r.ok);
    if (!r.ok) return;
    const weeks = r.weeks.slice(0, 6).map((w) => w.weekStart);
    const { executed, plan } = simulate(r.weeks.flatMap((w) => w.workouts), weeks, FREE);
    const kinds = executed.map((s) => s.map((x) => sessionKind(x)));
    for (let i = 0; i + 1 < kinds.length; i++) {
      const two = [...kinds[i]!, ...kinds[i + 1]!];
      assert.ok(two.includes('U') && two.includes('L'), `săpt. ${i + 1}–${i + 2}: ${executed[i]!.join(',')} | ${executed[i + 1]!.join(',')}`);
    }
    // Nimic dublat: o singură ședință pe zi, același număr de ședințe.
    assert.equal(plan.length, r.weeks.flatMap((w) => w.workouts).length);
    const perDay = new Map<string, number>();
    for (const w of plan) perDay.set(w.date, (perDay.get(w.date) ?? 0) + 1);
    assert.ok([...perDay.values()].every((n) => n <= 1));
  });

  it('femeie, 2 zile (picioare, sus): ultima zi ratată 6 săptămâni la rând nu șterge partea de sus', () => {
    const FREE: FreeBlock[] = [0, 3].map((d) => ({ day: d as 0, startMin: 17 * 60, endMin: 19 * 60 }));
    const r = generateFitnessPlan({ startDate: '2026-11-02', raceDate: '2027-05-03', freeBlocks: FREE, fitness: { goal: 'fit-tonifiere', days: 2, minutes: 60, beginner: true } });
    assert.ok(r.ok);
    if (!r.ok) return;
    const { executed } = simulate(r.weeks.flatMap((w) => w.workouts), r.weeks.slice(0, 6).map((w) => w.weekStart), FREE);
    const kinds = executed.flat().map((x) => sessionKind(x));
    assert.ok(kinds.filter((k) => k === 'U').length >= 2 && kinds.filter((k) => k === 'L').length >= 2, executed.map((s) => s.join(',')).join(' | '));
  });

  it('bărbat, PPL 3 zile: picioarele ratate nu dispar săptămână de săptămână', () => {
    const DAYS = ['2026-11-02', '2026-11-04', '2026-11-06'];
    const ws: WeekPlan[] = [0, 1, 2, 3, 4, 5].map((k) => ({ weekStart: new Date(Date.parse('2026-11-02T12:00:00Z') + k * 7 * 86_400_000).toISOString().slice(0, 10), phase: 'baza1', recovery: false, targetHours: 6, plannedHours: 6, notes: [], workouts: DAYS.map((d, i) => ({ id: `m${k}-${i}`, date: new Date(Date.parse(`${d}T12:00:00Z`) + k * 7 * 86_400_000).toISOString().slice(0, 10), sport: 'forta' as const, type: 'forta' as const, plannedMinutes: 60, targetZones: [], key: false, status: 'planificat' as const })) }));
    assignStrengthDays(ws, undefined, 'ppl');
    const FREE: FreeBlock[] = [0, 2, 4].map((d) => ({ day: d as 0, startMin: 17 * 60, endMin: 19 * 60 }));
    const { executed } = simulate(ws.flatMap((w) => w.workouts), ws.map((w) => w.weekStart), FREE);
    for (let i = 0; i + 1 < executed.length; i++) assert.ok([...executed[i]!, ...executed[i + 1]!].includes('legs'), `săpt. ${i + 1}–${i + 2}: ${executed[i]!.join(',')} | ${executed[i + 1]!.join(',')}`);
  });
});
