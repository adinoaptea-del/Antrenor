// Auditul de coaching (IntervalCoach · Athletica · TriDot · CoachCat, 20.10.2026): corecțiile din motor, pe cazurile
// Q05, Q09, Q10, Q12, Q13, Q14 și pe coerența ședinței (brick cu o singură definiție, jurnalul de decizie).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { localLoadConflicts, shortenWorkout } from '../src/calendar/validate.js';
import { moveOptions } from '../src/calendar/actions.js';
import { weatherSwap } from '../src/calendar/weather-swap.js';
import { generatePlan } from '../src/calendar/generate.js';
import { ALL_GOALS, isFitnessGoal } from '../src/calendar/phases.js';
import { LEVELS, input } from '../scripts/audit-profiles.js';
import { moduleStructure } from '../src/calendar/run-modules.js';
import { strengthStructure } from '../src/strength/ppl.js';
import { declaredVsWatch } from '../src/scoring/score.js';
import { demonstrated, IMPLAUSIBLE_MIN } from '../src/calendar/demonstrated.js';
import { describeChange, thresholdChanges } from '../src/goals/thresholds.js';
import { validTz } from '../src/util/dates.js';
import type { PlannedWorkout, Sport } from '../src/types.js';

const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const AT = '2026-10-20T08:00:00Z';
const w = (id: string, date: string, sport: PlannedWorkout['sport'], type: PlannedWorkout['type'], min = 45, zones: PlannedWorkout['targetZones'] = [2], structure?: string): PlannedWorkout => ({ id, date, sport, type, plannedMinutes: min, targetZones: zones, key: type === 'calitate' || type === 'lung', status: 'planificat', structure });
const legs = (id: string, date: string, mode: 'normal' | 'usor' = 'normal') => w(id, date, 'forta', 'forta', 50, [], strengthStructure({ session: 'legs', block: 'baza', week: 1, len: 4, legs: mode, variant: 0 }));
const upper = (id: string, date: string) => w(id, date, 'forta', 'forta', 50, [], strengthStructure({ session: 'push', block: 'baza', week: 1, len: 4, variant: 0 }));

describe('Q05 — solicitarea locală: picioare la sală lângă alergare/bicicletă grea', () => {
  it('se detectează în aceeași zi, în ajun, a doua zi și peste granița săptămânii; picioarele ușoare și partea de sus nu sunt conflict', () => {
    // Duminică 25.10 alergare lungă; luni 26.10 picioare (altă săptămână).
    const plan = [w('long', '2026-10-25', 'alergare', 'lung', 90), legs('L1', '2026-10-26'), w('q', '2026-10-28', 'bicicleta', 'calitate', 60, [3, 4]), legs('L2', '2026-10-28'), legs('L3', '2026-10-30', 'usor'), w('q2', '2026-10-31', 'alergare', 'calitate', 50, [4]), upper('U', '2026-10-31'), w('swim', '2026-11-02', 'inot', 'calitate', 50, [3]), legs('L4', '2026-11-02')];
    const c = localLoadConflicts(plan);
    assert.deepEqual(c.map((x) => `${x.strengthId}/${x.enduranceId}/${x.gapDays}`).sort(), ['L1/long/-1', 'L2/q/0']);
    assert.match(c.find((x) => x.strengthId === 'L1')!.text, /a doua zi după alergare lung/);
  });
  it('„Mută” refuză ziua de lângă picioare pentru o ședință grea de alergare, și ziua de lângă o ședință grea pentru picioare', () => {
    const plan = [legs('L', '2026-10-27'), w('q', '2026-10-29', 'alergare', 'calitate', 50, [4]), w('e', '2026-10-30', 'inot', 'tehnica', 40, [1, 2])];
    const opts = moveOptions(plan, 'q', '2026-10-26');
    assert.match(opts.find((o) => o.date === '2026-10-26')!.reason ?? '', /ziua de picioare/);
    assert.match(opts.find((o) => o.date === '2026-10-28')!.reason ?? '', /ziua de picioare/);
    assert.equal(opts.find((o) => o.date === '2026-10-31')!.ok, true);
    const l = moveOptions(plan, 'L', '2026-10-26');
    assert.match(l.find((o) => o.date === '2026-10-28')!.reason ?? '', /alergare sau bicicletă/);
  });
  it('inversarea după vreme respectă aceeași regulă: bicicleta nu ajunge lângă ziua de picioare', () => {
    const SUN = { tmax: 19, tmin: 8, resimtita_max: 19, ploaie_mm: 0, vant_kmh: 12, prob_ploaie: 10 };
    const RAIN = { tmax: 12, tmin: 7, resimtita_max: 11, ploaie_mm: 9, vant_kmh: 20, prob_ploaie: 90 };
    const plan = [legs('L', '2026-10-20'), w('swim', '2026-10-21', 'inot', 'tehnica', 45, [1, 2]), w('bike', '2026-10-22', 'bicicleta', 'calitate', 60, [3, 4])];
    assert.equal(weatherSwap(plan, { date: '2026-10-21', w: SUN }, { date: '2026-10-22', w: RAIN }, '2026-10-20', AT), null);
  });
  it('planurile generate (toate obiectivele × nivelurile) nu mai au niciun conflict: picioarele sunt ușoare lângă ședințele grele', () => {
    let plans = 0;
    const conflicts: string[] = [];
    for (const goal of ALL_GOALS) {
      if (isFitnessGoal(goal)) continue;
      for (const level of LEVELS) {
        const r = generatePlan(input({ goal, sex: 'm', age: 35, level, intens: 'toate' }));
        if (!r.ok) continue;
        plans += 1;
        conflicts.push(...localLoadConflicts(r.weeks.flatMap((x) => x.workouts)).map((c) => `${goal}/${level} ${c.text}`));
      }
    }
    assert.ok(plans >= 10, `planuri generate: ${plans}`);
    assert.deepEqual(conflicts.slice(0, 5), []);
  });
});

describe('Q14 — timp scurt: nicio structură mai lungă decât minutele cerute', () => {
  it('modulul de alergare care nu încape devine ședință ușoară în minutele cerute și spune ce stimul s-a pierdut', () => {
    const t1 = moduleStructure('T1', 40, 330);
    const q: PlannedWorkout = { ...w('x', '2026-10-21', 'alergare', 'calitate', 40, [4]), structure: t1.text, intervals: { count: t1.count, minutes: t1.work, zone: 4 } };
    const s25 = shortenWorkout(q, 25);
    assert.equal(s25.type, 'calitate');
    assert.equal(s25.plannedMinutes, 25);
    assert.match(s25.structure!, /^T1 · 8 min încălzire/);
    const s20 = shortenWorkout(q, 20);
    assert.equal(s20.type, 'z2');
    assert.equal(s20.plannedMinutes, 20);
    assert.match(s20.structure!, /prea scurt pentru T1: forma lui minimă are 25 min/);
    assert.equal(s20.intervals, undefined);
  });
  it('setul de înot se scurtează proporțional (minimum 2 repetări); sub 25 min rămâne tehnică', () => {
    const sw = w('s', '2026-10-21', 'inot', 'calitate', 50, [3], '8 × 100 m susținut, 20 s pauză');
    assert.equal(shortenWorkout(sw, 30).structure, '4 × 100 m susținut, 20 s pauză');
    const t = shortenWorkout(sw, 20);
    assert.equal(t.type, 'tehnica');
    assert.match(t.structure!, /20 min/);
  });
  it('serverul acceptă doar între 15 și durata din plan − 5 (aceeași regulă ca în mesaj)', () => {
    assert.match(src('server/forms/[kind].ts'), /minutes < 15 \|\| minutes > row\.planned_minutes - 5/);
  });
});

describe('coerența ședinței', () => {
  it('brick-ul are o singură definiție: potrivirea activităților folosește împărțirea din coherence.ts', () => {
    const m = src('src/scoring/match.ts');
    assert.match(m, /import \{ brickSplit as brickSplitShared \} from '\.\.\/calendar\/coherence\.js'/);
    assert.ok(!/plannedMinutes \* 0\.75/.test(m));
  });
  it('verificarea de coerență rulează pe candidatul real și intră în jurnalul de decizie cu versiuni și amprentă', () => {
    const p = src('server/_lib/plan.ts');
    assert.match(p, /coherenceIssues\(w, detailSteps\(/);
    assert.match(p, /localLoadConflicts\(future\)/);
    assert.match(p, /calendar \(decizie\): plan refăcut — versiunea \$\{prev\[0\]\?\.version \?\? 0\} → /);
    assert.match(p, /amprenta \$\{sigOld \?\? 'fără plan'\} → \$\{signature\}/);
    const f = src('server/forms/[kind].ts');
    assert.match(f, /calendar \(sportivul\): timp scurt — /);
    assert.match(f, /a ales varianta ușoară pentru/);
  });
  it('o propunere respinsă de validator nu rămâne „activă” în mesaj: textul primește rândul explicit', () => {
    assert.match(src('src/agents/runner.ts'), /n-a trecut verificarea aplicației: planul de azi rămâne cum e/);
  });
});

describe('Q09 — declarația față de ceas', () => {
  it('semnalează contrazicerea fără să decidă cine are dreptate', () => {
    assert.match(declaredVsWatch('mai_usor', 2)!, /nu decide singur ceasul/);
    assert.match(declaredVsWatch('mai_tare', -2)!, /zonele pot fi vechi/);
    assert.equal(declaredVsWatch('mai_usor', 1), null);
    assert.equal(declaredVsWatch('conform', 3), null);
    assert.equal(declaredVsWatch('mai_tare', null), null);
  });
});

describe('Q10 — prag vechi, GPS corupt, sport greșit', () => {
  it('o singură activitate implauzibilă nu devine „cea mai lungă ședință”; o alergare lungă reală rămâne', () => {
    const acts = [{ date: '2026-10-10', sport: 'alergare' as Sport, minutes: 60 }, { date: '2026-10-14', sport: 'alergare' as Sport, minutes: 229 }, { date: '2026-10-18', sport: 'alergare' as Sport, minutes: 50 }];
    assert.equal(demonstrated(acts, '2026-10-20').longest.alergare, 229);
    const watch = [...acts, { date: '2026-10-19', sport: 'alergare' as Sport, minutes: IMPLAUSIBLE_MIN.alergare! + 60 }];
    assert.equal(demonstrated(watch, '2026-10-20').longest.alergare, 229);
  });
  it('un prag nou care sare cu peste 15% cere confirmare; sub prag sau fără prag vechi, nu', () => {
    const prev = { swim_css_sec_100m: 150, bike_ftp_w: 200, run_threshold_pace_sec_km: 330, hr_max_test: 185, run_hr_zones: [120, 140, 155, 170, 185] };
    const c = thresholdChanges(prev, { swim_css_sec_100m: 100, bike_ftp_w: 215, run_hr_zones: [120, 170, 175, 180, 185] });
    assert.deepEqual(c.map((x) => x.field), ['swim_css_sec_100m', 'run_hr_zones']);
    assert.equal(describeChange(c[0]!), 'CSS: 150 → 100 s/100 m (-33%)');
    assert.deepEqual(thresholdChanges(null, { swim_css_sec_100m: 100 }), []);
    assert.deepEqual(thresholdChanges(prev, { hr_max_test: 190 }), []);
    assert.match(src('server/forms/[kind].ts'), /confirmat !== true/);
  });
});

describe('Q12 / Q13 — fusul sportivului și idempotența rulărilor', () => {
  it('fusul trimis de telefon e validat IANA și salvat pe cont', () => {
    assert.equal(validTz('Europe/Bucharest'), 'Europe/Bucharest');
    assert.equal(validTz('America/New_York'), 'America/New_York');
    assert.equal(validTz('Mars/Olympus'), null);
    assert.equal(validTz('../etc'), null);
    assert.equal(validTz(42), null);
    assert.match(src('server/me.ts'), /x-airon-tz/);
    assert.match(src('apps/web/src/data/api.ts'), /'x-airon-tz': deviceTz\(\)/);
  });
  it('runAgents ia o încuietoare atomică pe (sportiv, eveniment, zi) înainte să scrie mesajul', () => {
    const a = src('server/_lib/agents.ts');
    assert.match(a, /const lockKey = `run:\$\{event\}:\$\{today\}`;/);
    assert.match(a, /acquireLock\(userId, lockKey, 10 \* 60_000\)/);
  });
});
