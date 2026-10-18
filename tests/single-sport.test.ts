import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generatePlan } from '../src/calendar/generate.js';
import { goalKind, goalSports, isGoal } from '../src/calendar/phases.js';
import { currentFromIntake, gainFactor, planTarget, runTarget, riegel } from '../src/goals/run-target.js';
import { raceReady } from '../src/bar/race-ready.js';
import { sportReadiness } from '../src/bar/sport-readiness.js';

const blocks = ([0, 1, 2, 3, 4, 5, 6] as const).map((day) => ({ day, startMin: 6 * 60, endMin: day >= 5 ? 10 * 60 : 8 * 60 }));

describe('un singur sport: alergare 5 / 10 km', () => {
  it('felul obiectivului și sporturile din plan', () => {
    assert.equal(goalKind('5k'), 'run');
    assert.equal(goalKind('inot-1900'), 'swim');
    assert.equal(goalKind('bike-100'), 'bike');
    assert.equal(goalKind('70.3'), 'tri');
    assert.equal(goalKind('full'), null);
    assert.deepEqual(goalSports('10k'), ['alergare', 'forta']);
    assert.deepEqual(goalSports('inot-1500'), ['inot', 'forta']);
    assert.deepEqual(goalSports('sprint'), ['inot', 'bicicleta', 'alergare', 'forta']);
    assert.ok(isGoal('5k') && !isGoal('full'));
  });

  it('5 km cu ritm-țintă: doar alergare și forță, modulul V5 la ritmul de 5 km, ieșirea lungă nu trece de 75 min', () => {
    const r = generatePlan({ startDate: '2026-10-19', raceDate: '2027-03-14', goal: '5k', freeBlocks: blocks, historyHoursPerWeek: [3, 3, 3], intensityAllowed: 'toate', swimContinuous400: false, run: { goalPaceSecKm: 300, canDoDistance: true, longestRunKm: 8 } });
    assert.ok(r.ok);
    if (!r.ok) return;
    const all = r.weeks.flatMap((w) => w.workouts);
    assert.ok(all.every((w) => w.sport === 'alergare' || w.sport === 'forta'));
    assert.ok(all.some((w) => /^V5b? · .*orientativ 5:00\/km/.test(w.structure ?? '')), 'V5 la ritmul de 5 km');
    assert.ok(all.filter((w) => w.type === 'lung').every((w) => w.plannedMinutes <= 75));
    assert.ok(all.filter((w) => w.type === 'lung').every((w) => !/ritm de cursă/.test(w.structure ?? '')), 'la 5 km ieșirea lungă rămâne ușoară');
  });

  it('săptămâna cursei: fără ieșire lungă și fără forță, deschidere scurtă, dezmorțire în ajun; nimic în ziua cursei', () => {
    const r = generatePlan({
      startDate: '2026-10-19',
      raceDate: '2027-01-31',
      goal: '5k',
      freeBlocks: [1, 3, 5, 6].map((day) => ({ day: day as 1 | 3 | 5 | 6, startMin: 9 * 60, endMin: 11 * 60 })),
      sportHours: 4,
      historyHoursPerWeek: [3, 3, 3],
      intensityAllowed: 'toate',
      swimContinuous400: false,
      athlete: { age: 46, sex: 'm' },
      run: { goalPaceSecKm: 300, canDoDistance: true, longestRunKm: 8 },
    });
    assert.ok(r.ok);
    if (!r.ok) return;
    const last = r.weeks[r.weeks.length - 1]!;
    assert.equal(last.weekStart, '2027-01-25');
    assert.ok(last.workouts.every((w) => w.date < '2027-01-31'));
    assert.ok(last.workouts.every((w) => w.type !== 'lung' && w.type !== 'forta'));
    assert.ok(last.workouts.every((w) => w.plannedMinutes <= 35));
    const eve = last.workouts.find((w) => w.date === '2027-01-30');
    assert.ok(eve && /dezmorțire/.test(eve.structure ?? ''), 'ajunul cursei e dezmorțire');
    // Forța la un singur sport nu pomenește bicicleta.
    const forta = r.weeks.flatMap((w) => w.workouts).filter((w) => w.sport === 'forta');
    assert.ok(forta.length > 0 && forta.every((w) => !/bicicleta/.test(w.structure ?? '')));
  });

  it('10 km: V10 (4 × 5 min solicitant controlat) la ritmul de 10 km, alternat cu tempo fragmentat', () => {
    const r = generatePlan({ startDate: '2026-10-19', raceDate: '2027-04-18', goal: '10k', freeBlocks: blocks, historyHoursPerWeek: [3, 3, 3], intensityAllowed: 'toate', swimContinuous400: false, run: { goalPaceSecKm: 330, canDoDistance: true, longestRunKm: 10 } });
    assert.ok(r.ok);
    if (!r.ok) return;
    const all = r.weeks.flatMap((w) => w.workouts);
    assert.ok(all.some((w) => /^V10 · .*× \(5 min solicitant controlat, RPE 7 \(orientativ 5:30\/km\)/.test(w.structure ?? '')));
    assert.ok(all.some((w) => /^T[12] · /.test(w.structure ?? '')));
    // Modulele: toate minutele (încălzire + repetări + pauze + revenire) încap în durata ședinței.
    for (const w of all.filter((x) => /^(V|T|H|M|R)\w* · /.test(x.structure ?? ''))) {
      const nums = /^\w+ · (\d+) min .*?\+ (\d+) × \(([\d:]+)(?: min| s) .*?\+ ([\d:]+)(?: min| s) ușor\) \+ (\d+) min revenire/.exec(w.structure!);
      assert.ok(nums, w.structure ?? "");
    }
  });

  it('ramura „finalizare” la 5 km: 3 ieșiri pe săptămână, fără intervale; debutantul pornește cu mers-alergare', () => {
    const r = generatePlan({ startDate: '2026-10-19', raceDate: '2027-04-18', goal: '5k', freeBlocks: blocks, historyHoursPerWeek: [], intensityAllowed: 'toate', swimContinuous400: false, run: { goalPaceSecKm: null, canDoDistance: false, longestRunKm: 1, branch: 'finalizare', beginner: true } });
    assert.ok(r.ok, r.ok ? '' : r.reason);
    if (!r.ok) return;
    const runs = (w: (typeof r.weeks)[number]) => w.workouts.filter((x) => x.sport === 'alergare');
    assert.ok(r.weeks.every((w) => runs(w).length <= 3), 'cel mult 3 ieșiri');
    const all = r.weeks.flatMap((w) => w.workouts);
    assert.ok(!all.some((w) => /^V5|^V10|4 × 4/.test(w.structure ?? '')), 'fără intervale pe ramura finalizare');
    assert.ok(/mers-alergare: 5 min mers \+ \d+ × \(1 min alergare ușoară/.test(runs(r.weeks[0]!)[0]!.structure ?? ''), runs(r.weeks[0]!)[0]!.structure ?? "");
    assert.ok(!all.some((w) => /orientativ \d/.test(w.structure ?? '')), 'fără ritmuri fictive fără date');
  });

  it('ieșirea lungă nu sare: crește după două expuneri, cu cel mult 10 min', () => {
    const r = generatePlan({ startDate: '2026-10-19', raceDate: '2027-06-13', goal: 'semimaraton', freeBlocks: blocks, historyHoursPerWeek: [4, 4, 4], intensityAllowed: 'toate', swimContinuous400: false, run: { goalPaceSecKm: 330, canDoDistance: false, longestRunKm: 12 } });
    assert.ok(r.ok);
    if (!r.ok) return;
    const longs = r.weeks.filter((w) => !w.recovery && w.phase !== 'taper').map((w) => w.workouts.find((x) => x.type === 'lung')?.plannedMinutes ?? 0).filter((x) => x > 0);
    let max = longs[0]!;
    for (const m of longs.slice(1)) {
      assert.ok(m - max <= 10, `salt ${max} → ${m}`);
      max = Math.max(max, m);
    }
  });

  it('semimaraton / maraton pe „timp”: în săptămâna cu final la efort de cursă nu mai e altă calitate', () => {
    const r = generatePlan({ startDate: '2026-10-19', raceDate: '2027-06-13', goal: 'maraton', freeBlocks: blocks, historyHoursPerWeek: [5, 5, 5], intensityAllowed: 'toate', swimContinuous400: false, run: { goalPaceSecKm: 330, canDoDistance: false, longestRunKm: 20 } });
    assert.ok(r.ok);
    if (!r.ok) return;
    const withFinish = r.weeks.filter((w) => w.workouts.some((x) => x.type === 'lung' && /efort de cursă/.test(x.structure ?? '')));
    assert.ok(withFinish.length > 0);
    for (const w of withFinish) assert.ok(!w.workouts.some((x) => x.type === 'calitate'), w.weekStart);
    assert.ok(r.weeks.some((w) => w.workouts.some((x) => /^M · /.test(x.structure ?? ''))));
  });
});

describe('ținta la alergare: realistă, ambițioasă sau nerealistă', () => {
  it('Riegel: 25:00 pe 5 km ≈ 52:07 pe 10 km', () => {
    assert.equal(Math.round(riegel(1500, 5, 10)), 3127);
  });
  it('10 km în 13:20 (1:20/km) e nerealist, oricare ar fi nivelul', () => {
    const v = runTarget({ goal: '10k', targetSec: 800, current: { km: 10, sec: 50 * 60 }, weeks: 30 });
    assert.equal(v.verdict, 'nerealist');
    assert.ok(/elită/.test(v.reasons[0]!));
  });
  it('de la 55:00 la 52:00 pe 10 km în 20 de săptămâni: realist (5,5%)', () => {
    const v = runTarget({ goal: '10k', targetSec: 52 * 60, current: { km: 10, sec: 55 * 60 }, weeks: 20 });
    assert.equal(v.verdict, 'realist');
    assert.equal(v.improvementPct, 5.5);
  });
  it('de la 55:00 la 45:00 pe 10 km în 12 săptămâni: nerealist (18% în ~3 luni)', () => {
    const v = runTarget({ goal: '10k', targetSec: 45 * 60, current: { km: 10, sec: 55 * 60 }, weeks: 12 });
    assert.equal(v.verdict, 'nerealist');
  });
  it('de la 27:00 pe 5 km la 52:00 pe 10 km în 16 săptămâni: realist pentru un amator la nivelul ăsta (echivalentul de acum ≈ 56:17, −7,6%)', () => {
    const v = runTarget({ goal: '10k', targetSec: 52 * 60, current: { km: 5, sec: 27 * 60 }, weeks: 16 });
    assert.ok(v.equivalentNowSec! > 3360 && v.equivalentNowSec! < 3400);
    assert.equal(v.verdict, 'realist');
  });
  it('marja depinde de nivel: un amator foarte bun progresează ~1,5%/lună, unul la 27:30 pe 5 km ~2,4%/lună', () => {
    assert.equal(gainFactor('5k', 17 * 60), 1);
    assert.equal(gainFactor('5k', 27 * 60 + 30), 1.63);
    assert.equal(gainFactor('5k', 40 * 60), 2); // plafon
    // 46 de ani, 27:30 → 26:00 în 15 săptămâni: realist; → 25:00: ambițios; → 22:00: nerealist.
    const cur = { km: 5, sec: 27 * 60 + 30 };
    assert.equal(runTarget({ goal: '5k', targetSec: 26 * 60, current: cur, weeks: 15 }).verdict, 'realist');
    assert.equal(runTarget({ goal: '5k', targetSec: 25 * 60, current: cur, weeks: 15 }).verdict, 'ambitios');
    assert.equal(runTarget({ goal: '5k', targetSec: 22 * 60, current: cur, weeks: 15 }).verdict, 'nerealist');
    // Un amator foarte bun: 18:00 → 17:00 (5,6%) în 15 săptămâni e nerealist (1,5%/lună → ~5,2% realist, ~8,7% ambițios → ambițios).
    assert.equal(runTarget({ goal: '5k', targetSec: 17 * 60, current: { km: 5, sec: 18 * 60 }, weeks: 15 }).verdict, 'ambitios');
  });
  it('fără niciun rezultat: necunoscut, nu ghicim', () => {
    assert.equal(runTarget({ goal: '5k', targetSec: 25 * 60, current: null, weeks: 20 }).verdict, 'necunoscut');
  });
  it('promisiunea din chestionar: la o țintă nerealistă planul se face pe timpul realist, nu pe țintă', () => {
    // 46 de ani, 5 km în 27:00 acum, vrea 21:00 în 15 săptămâni (22%): nerealist → planul pe timpul realist (~27:00 − 8%, ≈ 24:50).
    const t = planTarget('5k', { mod: 'timp', valoare: '21:00' }, { km: 5, sec: 27 * 60 }, 15);
    assert.equal(t.verdict!.verdict, 'nerealist');
    assert.equal(t.targetSec, 21 * 60);
    assert.ok(t.adjusted);
    assert.ok(t.planSec! > 24 * 60 && t.planSec! < 25.5 * 60, `planSec=${t.planSec}`);
    assert.ok(Math.abs(t.paceSecKm! - t.planSec! / 5) < 0.01);
    // Țintă ambițioasă: ținta rămâne, dar ritmurile de antrenament pornesc din ce poate acum (nu din timpul dorit).
    const a = planTarget('5k', { mod: 'timp', valoare: '24:00' }, { km: 5, sec: 27 * 60 }, 15);
    assert.equal(a.verdict!.verdict, 'ambitios');
    assert.equal(a.targetSec, 24 * 60);
    assert.ok(a.planSec! > 24 * 60 && a.planSec! < 27 * 60, `planSec=${a.planSec}`);
    assert.ok(!a.adjusted);
    // Fără niciun rezultat: fără ritm în plan.
    assert.equal(planTarget('5k', { mod: 'timp', valoare: '25:00' }, null, 15).paceSecKm, null);
    // Sub podeaua de elită, fără rezultat: fără ritm de cursă în plan.
    const e = planTarget('10k', { mod: 'ritm', valoare: '1:20' }, null, 30);
    assert.equal(e.verdict!.verdict, 'nerealist');
    assert.equal(e.paceSecKm, null);
    // Nivelul de acum din chestionar: distanța cursei dacă a alergat-o, altfel 10 km, altfel 5 km (57:00 pe 10 km = minute).
    assert.deepEqual(currentFromIntake({ obiectiv: '5k', alergare: { poateDistanta: true, rezultatActual: { mod: 'timp', valoare: '27:00' } } })?.sec, 27 * 60);
    assert.equal(currentFromIntake({ obiectiv: '5k', alergare: { poateDistanta: false }, evaluare: { alergare10k: '57:00' } })?.km, 10);
    assert.equal(currentFromIntake({ obiectiv: '5k', alergare: { poateDistanta: false }, evaluare: { alergare10k: '57:00' } })?.sec, 57 * 60);
    assert.equal(currentFromIntake({ obiectiv: '5k', alergare: { poateDistanta: false } }), null);
  });
});

describe('un singur sport: înot și bicicletă', () => {
  it('înot 1.900 m fără 400 m continuu: doar înot și forță, totul tehnică + bucăți legate, nimic „continuu” sau CSS', () => {
    const r = generatePlan({ startDate: '2026-10-19', raceDate: '2027-06-13', goal: 'inot-1900', freeBlocks: blocks, historyHoursPerWeek: [], intensityAllowed: 'toate', swimContinuous400: false, swim: { continuousM: 50 } });
    assert.ok(r.ok, r.ok ? '' : r.reason);
    if (!r.ok) return;
    const all = r.weeks.flatMap((w) => w.workouts);
    assert.ok(all.every((w) => w.sport === 'inot' || w.sport === 'forta'));
    assert.ok(all.filter((w) => w.sport === 'inot').every((w) => w.type === 'tehnica'));
    assert.ok(all.some((w) => /bucăți legate/.test(w.structure ?? '')));
  });
  it('înot 1.500 m cu 400 m continuu: ședința lungă crește spre 40 min și apare setul CSS din baza2', () => {
    const r = generatePlan({ startDate: '2026-10-19', raceDate: '2027-06-13', goal: 'inot-1500', freeBlocks: blocks, historyHoursPerWeek: [2, 2, 2], intensityAllowed: 'toate', swimContinuous400: true, swim: { continuousM: 600 } });
    assert.ok(r.ok);
    if (!r.ok) return;
    const all = r.weeks.flatMap((w) => w.workouts);
    const longs = all.filter((w) => w.sport === 'inot' && w.type === 'lung');
    assert.ok(longs.length > 0 && Math.max(...longs.map((w) => w.plannedMinutes)) <= 40);
    assert.ok(all.some((w) => /set CSS/.test(w.structure ?? '')));
  });
  it('bicicletă 100 km: doar bicicletă și forță, tura lungă crește și nu trece de 4 h', () => {
    const r = generatePlan({ startDate: '2026-10-19', raceDate: '2027-06-13', goal: 'bike-100', freeBlocks: [...blocks, { day: 6, startMin: 10 * 60, endMin: 14 * 60 }], historyHoursPerWeek: [4, 4, 5], intensityAllowed: 'toate', swimContinuous400: false, level: { longestRideH: 1.5 } });
    assert.ok(r.ok, r.ok ? '' : r.reason);
    if (!r.ok) return;
    const all = r.weeks.flatMap((w) => w.workouts);
    assert.ok(all.every((w) => w.sport === 'bicicleta' || w.sport === 'forta'));
    const longs = all.filter((w) => w.type === 'lung').map((w) => w.plannedMinutes);
    assert.ok(Math.max(...longs) <= 240 && Math.max(...longs) > Math.min(...longs));
  });
  it('reperele: la înot doar veriga de înot; la bicicletă doar bicicleta; fără „Cumul”', () => {
    const acts = [{ id: 's', source: 'strava', externalId: 's', date: '2026-10-10', sport: 'inot', minutes: 40, distanceKm: 1.2, details: { continuousM: 800 } }] as never[];
    const r = raceReady({ goal: 'inot-1900', today: '2026-10-18', acts, plan: [], fueledDates: [] });
    assert.deepEqual(r.links.map((l) => l.name), ['Înot']);
    assert.equal(r.links[0]!.pct, 42);
    assert.equal(sportReadiness('bike-100', [], '2026-10-18').map((x) => x.sport).join(), 'bicicleta');
  });
  it('alergare cu țintă: timpul estimat și verdictul din cel mai bun efort de pe ceas', () => {
    const acts = [{ id: 'r', source: 'strava', externalId: 'r', date: '2026-10-10', sport: 'alergare', minutes: 36, distanceKm: 6, details: { bestEfforts: { '5 km': 1620 }, fastestKmSec: 300 } }] as never[];
    const r = raceReady({ goal: '10k', today: '2026-10-18', acts, plan: [{ id: 'x', date: '2027-02-21', sport: 'alergare', type: 'z2', plannedMinutes: 30, targetZones: [2], key: false, status: 'planificat' }], fueledDates: [], targetSec: 55 * 60 });
    assert.ok(r.target);
    assert.equal(r.target!.best!.km, 5);
    assert.ok(r.target!.predictedSec! > 3300 && r.target!.predictedSec! < 3500);
    assert.equal(r.target!.verdict.verdict, 'realist');
    assert.ok(r.benchmarks.some((b) => b.id === 'ritm-cursa' && b.done));
    // Obiectiv de timp: a doua verigă e ritmul (ținta / timpul estimat), iar „Gata de 10 km” e cea mai slabă verigă, nu doar distanța.
    const ritm = r.links.find((l) => l.name === 'Ritm');
    assert.ok(ritm && ritm.pct != null);
    assert.equal(ritm!.pct, Math.min(100, Math.round(((55 * 60) / r.target!.predictedSec!) * 100)));
    assert.ok(r.ready != null && r.ready <= ritm!.pct!);
    // Fără efort pe ceas: veriga de ritm rămâne „fără date”, nu 0.
    const r2 = raceReady({ goal: '10k', today: '2026-10-18', acts: [] as never[], plan: [], fueledDates: [], targetSec: 55 * 60 });
    assert.equal(r2.links.find((l) => l.name === 'Ritm')?.pct, null);
    assert.equal(r2.ready, null);
  });
});

describe('alergare: taper după distanță și distanța înaintea timpului', () => {
  it('taper: 5 km o săptămână, semimaraton două, maraton trei', async () => {
    const { phaseWeeks } = await import('../src/calendar/phases.js');
    const t = (g: string) => phaseWeeks('2026-10-19', '2027-09-12', 4, g).filter((w) => w.phase === 'taper').length;
    assert.equal(t('5k'), 1);
    assert.equal(t('10k'), 1);
    assert.equal(t('semimaraton'), 2);
    assert.equal(t('maraton'), 3);
    assert.equal(t('70.3'), 2);
  });
  it('debutant cu 2 km și maraton în 20 de săptămâni: avertisment, propune semimaratonul', async () => {
    const { distanceFeasibility } = await import('../src/goals/run-target.js');
    const f = distanceFeasibility('maraton', 2, 20);
    assert.equal(f.ok, false);
    assert.equal(f.suggest, 'semimaraton');
    assert.ok(distanceFeasibility('maraton', 18, 30).ok);
    assert.ok(distanceFeasibility('5k', 0, 6).ok);
  });
});
