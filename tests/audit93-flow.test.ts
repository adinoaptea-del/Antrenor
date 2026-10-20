// Auditul v93 — fluxuri: ținta de alergare (A101), ratări repetate din lipsă de timp (A66), mers-alergare (A103).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runTargetProblem } from '../src/goals/intake-check.js';

test('T73 / A101: „finalizare” fără timp trece; „timp” fără țintă citibilă nu trece', () => {
  assert.equal(runTargetProblem({ ramura: 'finalizare', tinta: null }), null);
  assert.equal(runTargetProblem(undefined), null);
  assert.match(runTargetProblem({ ramura: 'timp', tinta: null }) ?? '', /scrie ținta/);
  assert.match(runTargetProblem({ ramura: 'timp', tinta: { mod: 'ritm', valoare: 'repede' } }) ?? '', /scrie ținta/);
  assert.equal(runTargetProblem({ ramura: 'timp', tinta: { mod: 'ritm', valoare: '5:30' } }), null);
  assert.equal(runTargetProblem({ ramura: 'timp', tinta: { mod: 'timp', valoare: '52:00' } }), null);
});

test('T16 / A66: 3 ratări din lipsă de timp în aceeași zi a săptămânii → propunere de program, planul rămâne', async () => {
  const { outcomeFeedback } = await import('../src/calendar/outcomes.js');
  const plan = [{ id: 'n', date: '2026-11-10', sport: 'alergare', type: 'z2', plannedMinutes: 45, targetZones: [2], key: false, status: 'planificat' }] as never;
  const o = (d: string) => ({ workoutId: `w${d}`, date: d, status: 'ratat' as const, motiv: 'timp' as const });
  const outs = [o('2026-10-20'), o('2026-10-27'), o('2026-11-03')];
  const f = outcomeFeedback(plan, outs, outs[2]!, '2026-11-03', '2026-11-03T20:00:00Z');
  assert.equal(f.decision, 'pastrat');
  assert.equal(f.changed.length, 0);
  assert.match(f.message, /a 3-a oară.*marți/);
  const one = outcomeFeedback(plan, [outs[2]!], outs[2]!, '2026-11-03', '2026-11-03T20:00:00Z');
  assert.doesNotMatch(one.message, /propun/);
});

test('T75 / A103: treapta de mers-alergare nu stă blocată cât lunga e la plafon', async () => {
  const { generatePlan } = await import('../src/calendar/generate.js');
  const blocks = [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day: day as 0, startMin: 360, endMin: day >= 5 ? 720 : 540 }));
  const r = generatePlan({ startDate: '2026-10-26', raceDate: '2027-05-30', goal: '5k', freeBlocks: blocks, historyHoursPerWeek: [], intensityAllowed: 'toate', swimContinuous400: false, run: { goalPaceSecKm: null, canDoDistance: false, longestRunKm: 1, branch: 'finalizare', beginner: true } });
  assert.ok(r.ok);
  if (!r.ok) return;
  const steps = r.weeks.filter((w) => !w.recovery).map((w) => /× \((\d+) min alergare/.exec(w.workouts.find((x) => x.type === 'lung')?.structure ?? '')?.[1]).filter((x): x is string => !!x);
  let streak = 1;
  for (let i = 1; i < steps.length; i++) {
    streak = steps[i] === steps[i - 1] ? streak + 1 : 1;
    assert.ok(streak <= 3, `treapta ${steps[i]} min stă ${streak} săptămâni`);
  }
  assert.ok(steps.length > 0 && r.weeks.some((w) => w.workouts.some((x) => x.type === 'lung' && !/mers-alergare/.test(x.structure ?? ''))), 'ajunge la alergare continuă');
});

test('T72 / A100: la 5 km „finalizare” sunt 3 ieșiri pe săptămână din prima săptămână (în afară de săptămâna cursei)', async () => {
  const { generatePlan } = await import('../src/calendar/generate.js');
  const blocks = [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day: day as 0, startMin: 360, endMin: day >= 5 ? 720 : 540 }));
  for (const beginner of [true, false]) {
    const r = generatePlan({ startDate: '2026-10-26', raceDate: '2027-04-25', goal: '5k', freeBlocks: blocks, historyHoursPerWeek: beginner ? [] : [3, 3, 3, 3], intensityAllowed: 'toate', swimContinuous400: false, run: { goalPaceSecKm: null, canDoDistance: !beginner, longestRunKm: beginner ? 1 : 6, branch: 'finalizare', beginner } });
    assert.ok(r.ok);
    if (!r.ok) return;
    for (const w of r.weeks.slice(0, -1)) assert.ok(w.workouts.filter((x) => x.sport === 'alergare').length >= 3, `${beginner ? 'debutant' : 'nedebutant'} ${w.weekStart}: ${w.workouts.filter((x) => x.sport === 'alergare').length}`);
  }
});

test('T67 / A65: plecare „doar alergare” 3 zile la rând → fără alergări de înlocuire în zile consecutive, cel mult 2/săpt.', async () => {
  const { applyAway } = await import('../src/calendar/actions.js');
  const mk = (id: string, date: string, sport: string, type: string, m: number) => ({ id, date, sport, type, plannedMinutes: m, targetZones: [2], key: false, status: 'planificat' }) as never;
  const plan = [mk('a', '2026-10-20', 'bicicleta', 'z2', 60), mk('b', '2026-10-21', 'inot', 'tehnica', 40), mk('c', '2026-10-22', 'bicicleta', 'lung', 120), mk('d', '2026-10-23', 'inot', 'z2', 40)];
  const ch = applyAway(plan, { dela: '2026-10-20', panala: '2026-10-23', ce: 'doar_alergare' }, '2026-10-19', '2026-10-19T08:00:00Z');
  const runs = ch.filter((x) => x.sport === 'alergare' && x.status !== 'anulat_sistem').map((x) => x.date).sort();
  assert.ok(runs.length <= 2, runs.join(','));
  for (let i = 1; i < runs.length; i++) assert.notEqual(new Date(runs[i]!).getTime() - new Date(runs[i - 1]!).getTime(), 86_400_000, 'zile la rând');
  const blocked = applyAway(plan, { dela: '2026-10-20', panala: '2026-10-23', ce: 'doar_alergare' }, '2026-10-19', '2026-10-19T08:00:00Z', [], ['alergare']);
  assert.ok(blocked.every((x) => x.status === 'anulat_sistem'), 'cu durere la picioare nu se pune alergare');
});

test('T14 / A65: mutarea ține cont de program și de plecări', async () => {
  const { moveOptions } = await import('../src/calendar/actions.js');
  const mk = (id: string, date: string, sport: string, m: number) => ({ id, date, sport, type: 'z2', plannedMinutes: m, targetZones: [2], key: false, status: 'planificat' }) as never;
  const plan = [mk('x', '2026-10-20', 'alergare', 50)];
  // Program: luni 60 min, miercuri 30 min, vineri 90 min (0 = luni).
  const freeBlocks = [{ day: 0, startMin: 360, endMin: 420 }, { day: 2, startMin: 360, endMin: 390 }, { day: 4, startMin: 360, endMin: 450 }];
  const opts = moveOptions(plan, 'x', '2026-10-19', [], { freeBlocks, away: [{ dela: '2026-10-23', panala: '2026-10-23', ce: 'nimic' }] });
  const by = Object.fromEntries(opts.map((o) => [o.date, o]));
  assert.equal(by['2026-10-19']!.ok, true);
  assert.match(by['2026-10-21']!.reason ?? '', /fereastra liberă are 30/);
  assert.match(by['2026-10-22']!.reason ?? '', /nu ai timp liber/);
  assert.match(by['2026-10-23']!.reason ?? '', /plecat/);
});

test('T82 / A110: fiecare modul activ apare undeva în matricea obiectiv × ramură; T2 apare și în build; D1 e rezervat', async () => {
  const { generatePlan } = await import('../src/calendar/generate.js');
  const { RUN_MODULES, RESERVED_RUN_MODULES } = await import('../src/calendar/run-modules.js');
  const blocks = [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day: day as 0, startMin: 360, endMin: day >= 5 ? 720 : 540 }));
  const seen = new Set<string>();
  let t2InBuild = false;
  for (const goal of ['5k', '10k', 'semimaraton', 'maraton'] as const) {
    for (const age of [35, 60]) {
      const r = generatePlan({ startDate: '2026-10-26', raceDate: '2027-09-26', goal, freeBlocks: blocks, historyHoursPerWeek: [5, 5, 5, 5], intensityAllowed: 'toate', swimContinuous400: false, athlete: { age, sex: 'm' }, run: { goalPaceSecKm: 300, canDoDistance: true, longestRunKm: 21, branch: 'timp', beginner: false } });
      assert.ok(r.ok);
      if (!r.ok) continue;
      for (const w of r.weeks) for (const x of w.workouts) {
        const m = /^([A-Z0-9a-z]+) · /.exec(x.structure ?? '');
        if (m) seen.add(m[1]!);
        if (w.phase === 'build' && m?.[1] === 'T2' && (goal === 'semimaraton' || goal === 'maraton')) t2InBuild = true;
      }
    }
  }
  const missing = Object.keys(RUN_MODULES).filter((id) => !RESERVED_RUN_MODULES.includes(id) && !seen.has(id));
  assert.deepEqual(missing, [], `module active care nu apar: ${missing.join(', ')}`);
  assert.ok(t2InBuild, 'T2 în build la semi/maraton');
});

test('T71 / A99: faza zilei la fitness vine din același calendar ca ședințele (o singură structură)', async () => {
  const { phaseWeeks } = await import('../src/calendar/phases.js');
  const { fitnessWeeks, fitnessProfile } = await import('../src/strength/fitness.js');
  for (const [goal, exp] of [['fit-intretinere', 'stabila'], ['fit-intretinere', 'incepator'], ['fit-tonifiere', 'stabila']] as const) {
    const prof = fitnessProfile(goal, { experienta: exp, zile: 3, minute: 60 } as never);
    const a = phaseWeeks('2026-10-26', '2027-04-26', 4, goal, prof).slice(0, 26).map((w) => [w.phase, w.recovery]);
    const b = fitnessWeeks(prof, a.length).map((w) => [w.phase, w.recovery]);
    assert.deepEqual(a, b, `${goal} ${exp}`);
  }
});

test('A15: la model ajung doar intrările de jurnal scrise de cod', async () => {
  const { journalForAI } = await import('../server/_lib/agents.js');
  assert.equal(journalForAI('calendar: progres: T1 → T2'), true);
  assert.equal(journalForAI('declarat de sportiv: ...'), true);
  assert.equal(journalForAI('ai: sportivul pare obosit'), false);
  assert.equal(journalForAI('respins: fiziolog - ...'), false);
  assert.equal(journalForAI('model căzut: timeout'), false);
  assert.equal(journalForAI('Sportivul are probabil o accidentare'), false);
});

test('A19: CrossFit / Workout pe Strava sunt „forță generică”; WeightTraining e sală', async () => {
  const { normalizeStravaActivity } = await import('../src/collector/providers/strava.js');
  const base = { id: 1, name: 'x', start_date_local: '2026-10-20T10:00:00Z', start_date: '2026-10-20T08:00:00Z', moving_time: 3600, elapsed_time: 3600, distance: 0 } as never as Record<string, unknown>;
  const cf = normalizeStravaActivity({ ...base, sport_type: 'Crossfit' } as never);
  const wt = normalizeStravaActivity({ ...base, sport_type: 'WeightTraining' } as never);
  assert.equal(cf?.sport, 'forta');
  assert.equal((cf?.details as { genericStrength?: boolean })?.genericStrength, true);
  assert.ok(!(wt?.details as { genericStrength?: boolean })?.genericStrength);
});

test('T36 / A62: ședința ușurată revine la plan după o execuție verde a aceluiași sport; fără ea, rămâne ușoară', async () => {
  const { restoreEased } = await import('../src/calendar/outcomes.js');
  const orig = { date: '2026-10-25', sport: 'alergare', type: 'calitate', plannedMinutes: 60, targetZones: [4], structure: '3 × 10 min', key: true, status: 'planificat' };
  const eased = { id: 'q', date: '2026-10-25', sport: 'alergare', type: 'z2', plannedMinutes: 60, targetZones: [2], key: false, status: 'planificat', note: 'ușurată: 2 ședințe nefăcute din oboseală', original: orig, changedAt: '2026-10-21T08:00:00Z' };
  const run = { id: 'r', date: '2026-10-22', sport: 'alergare', type: 'z2', plannedMinutes: 45, targetZones: [2], key: false, status: 'planificat' };
  const plan = [eased, run] as never;
  assert.equal(restoreEased(plan, [], '2026-10-23', 'x').length, 0, 'fără execuție');
  assert.equal(restoreEased(plan, [{ workoutId: 'r', color: 'verde', pain: 4 }], '2026-10-23', 'x').length, 0, 'cu durere');
  const back = restoreEased(plan, [{ workoutId: 'r', color: 'verde', pain: 0 }], '2026-10-23', 'x');
  assert.equal(back.length, 1);
  assert.equal(back[0]!.type, 'calitate');
  assert.equal(back[0]!.original, null);
});

test('T81 / A109: poarta de progres verifică și forma (TSB), nu doar minutele', async () => {
  const { progresStatus } = await import('../src/collector/packet.js');
  const by = { inot: 1, bicicleta: 1, alergare: 1, forta: 1, mers: 1 } as never;
  const base = { today: '2026-10-20', history: { greenStreak: 10, lastIncrease: null } } as never as Record<string, unknown>;
  const ok = progresStatus({ ...base, load: { ctl: 60, atl: 70, tsb: -10 } } as never, 1.0, by, { planificate: 10, facute: 10 });
  const tired = progresStatus({ ...base, load: { ctl: 60, atl: 95, tsb: -35 } } as never, 1.0, by, { planificate: 10, facute: 10 });
  assert.equal(ok.eligibil, true);
  assert.equal(tired.eligibil, false);
  assert.match(tired.motiv, /TSB/);
});
