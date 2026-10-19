// Regresiile din auditul extins (17.10.2026), pe date sintetice. Numerele din titluri = ID-ul din audit / testul T.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { activeRestriction, stricter } from '../src/calendar/safety.js';
import { labsGateFrom } from '../server/_lib/plan.js';
import { phaseLengths, phaseWeeks } from '../src/calendar/phases.js';
import { normalizeBlocks, weeklyBudget } from '../src/calendar/budget.js';
import { fitStructure } from '../src/calendar/validate.js';
import { generatePlan } from '../src/calendar/generate.js';
import { matchActivities } from '../src/scoring/match.js';
import { normalizeWhoopNight, normalizeWhoopWorkout } from '../src/collector/providers/whoop.js';
import { toTestForm, type TestReading } from '../server/_lib/test-extract.js';
import { allowedForAI } from '../src/collector/permissions.js';
import { sportReadiness } from '../src/bar/sport-readiness.js';
import { buildPacket } from '../src/collector/packet.js';
import type { CollectorInput } from '../src/collector/types.js';
import type { Activity, FreeBlock, PlannedWorkout } from '../src/types.js';

const P = (o: Partial<PlannedWorkout>): PlannedWorkout => ({ id: 'p', date: '2026-10-15', sport: 'alergare', type: 'z2', plannedMinutes: 40, targetZones: [2], key: false, status: 'planificat', ...o });
const A = (o: Partial<Activity> & { startLocal?: string }): Activity => ({ id: 'a', date: '2026-10-16', sport: 'alergare', minutes: 40, ...o });

describe('02 / T02 · restricția activă nu e ridicată de somn bun', () => {
  it('durere 7/10 ieri → roșu, oricât de bună e recuperarea', () => {
    const r = activeRestriction({ today: '2026-10-17', morning: null, evenings: [{ date: '2026-10-16', durere: { scor: 7, loc: 'genunchi' } }] });
    assert.equal(r?.verdict, 'rosu');
    assert.equal(stricter('verde', r!.verdict), 'rosu');
  });
  it('febră declarată azi → stop chiar fără stop salvat', () => {
    assert.equal(activeRestriction({ today: '2026-10-17', morning: { date: '2026-10-17', semnale: { febra: true } }, evenings: [] })?.verdict, 'stop');
  });
  it('durerea nu dispare dacă ultima ședință a zilei a fost fără durere', () => {
    const r = activeRestriction({ today: '2026-10-17', morning: null, evenings: [{ date: '2026-10-17', durere: { scor: 0, loc: null } }, { date: '2026-10-17', durere: { scor: 6, loc: 'tibie' } }] });
    assert.equal(r?.verdict, 'rosu');
  });
  it('pachetul agenților poartă aceeași restricție', () => {
    const input: CollectorInput = { today: '2026-10-17', event: 'dimineata', athlete: { obiectiv: '70.3', raceDate: '2027-09-26', phase: 'baza1' }, wellness: [], activities: [], plan: [], zones: null, evenings: [{ date: '2026-10-16', rpe: 5, fata_de_asteptari: null, durere: { scor: 7, loc: 'genunchi' }, ce_a_incurcat: null, fueling_conform: null, comentariu: null }], load: null, aviz: { cardiolog: 'nu', intensitate_permisa: 'Z2' } };
    assert.equal(buildPacket(input).restrictie_activa?.verdict, 'rosu');
  });
});

describe('07 / T07 · analizele nu „vindecă” singure o limită', () => {
  const low = { drawn_at: '2026-03-01', feritina: 18, other: null };
  it('analiză nouă fără feritină nu ascunde feritina mică de dinainte', () => {
    const g = labsGateFrom([{ drawn_at: '2026-09-01', feritina: null, other: { valori: [{ nume: 'Glicemie' }] } }, low], '2026-10-17');
    assert.equal(g.limitIntensity, true);
  });
  it('analiză expirată: limita rămâne până la o valoare nouă', () => {
    const g = labsGateFrom([{ drawn_at: '2025-01-01', feritina: 18, other: null }], '2026-10-17');
    assert.equal(g.valid, false);
    assert.equal(g.limitIntensity, true);
  });
  it('feritina refăcută peste 30 ridică limita', () => {
    assert.equal(labsGateFrom([{ drawn_at: '2026-10-01', feritina: 45, other: null }, low], '2026-10-17').limitIntensity, false);
  });
});

describe('19 / T19 · planul nu trece de cursă', () => {
  it('19.10 → cursă 15.11 (4 săptămâni): fazele însumează exact orizontul, taper-ul e în săptămâna cursei', () => {
    const l = phaseLengths(4);
    assert.equal(Object.values(l).reduce((a, b) => a + b, 0), 4);
    const w = phaseWeeks('2026-10-19', '2026-11-15');
    assert.equal(w.length, 4);
    assert.equal(w.at(-1)!.phase, 'taper');
    assert.ok(w.at(-1)!.weekStart <= '2026-11-15');
  });
  it('cursă miercuri: nicio ședință după cursă', () => {
    const blocks: FreeBlock[] = [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day: day as FreeBlock['day'], startMin: 360, endMin: 540 }));
    const r = generatePlan({ startDate: '2026-10-19', raceDate: '2027-01-13', goal: 'sprint', freeBlocks: blocks, historyHoursPerWeek: [5, 5, 5], intensityAllowed: 'toate', swimContinuous400: true });
    assert.equal(r.ok, true);
    if (r.ok) assert.ok(r.weeks.flatMap((x) => x.workouts).every((x) => x.date < '2027-01-13'));
  });
});

describe('20 · blocuri libere suprapuse', () => {
  it('10:00–11:00 + 10:30–11:30 = 90 min, nu 120', () => {
    const b: FreeBlock[] = [
      { day: 2, startMin: 600, endMin: 660 },
      { day: 2, startMin: 630, endMin: 690 },
    ];
    assert.equal(normalizeBlocks(b).length, 1);
    assert.equal(weeklyBudget(b).hours, 1.2);
  });
});

describe('21 / T21 · durata și repetările din aceleași cifre', () => {
  it('30 min cu „3 × 10 min tempo, 3 min ușor între” → câte repetări încap', () => {
    const w = fitStructure(P({ type: 'calitate', plannedMinutes: 30, targetZones: [3, 4], structure: '3 × 10 min tempo (Z3–Z4), 3 min ușor între', intervals: { count: 3, minutes: 10, zone: 4 } }));
    assert.match(w.structure ?? '', /^1 × 10 min/);
    assert.equal(w.intervals?.count, 1);
  });
  it('10 min de calitate → ședință ușoară, fără repetări', () => {
    const w = fitStructure(P({ type: 'calitate', plannedMinutes: 10, targetZones: [4], structure: '2 × 15 min la prag (Z4), 5 min ușor între' }));
    assert.equal(w.type, 'z2');
    assert.equal(w.intervals, undefined);
  });
});

describe('17 / T17 · doza de start după ce poate sportivul', () => {
  it('istoric 1 h/săpt., tură max 15 min, alergare max 1 km → prima săptămână cel mult +2 h, ture scurte', () => {
    const blocks: FreeBlock[] = [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day: day as FreeBlock['day'], startMin: 360, endMin: 600 }));
    const r = generatePlan({ startDate: '2026-10-19', raceDate: '2027-09-26', goal: '70.3', freeBlocks: blocks, historyHoursPerWeek: [1, 1, 1, 1], intensityAllowed: 'Z2', swimContinuous400: false, level: { longestRideH: 0.25, longestRunKm: 1, easyPaceSecKm: 480 } });
    assert.equal(r.ok, true);
    if (!r.ok) return;
    const first = r.weeks[0]!;
    assert.ok(first.targetHours <= 3.3, `prima săptămână ${first.targetHours} h`); // 1 h + 2 h pentru minimul de sporturi, +10%
    const longRide = first.workouts.find((w) => w.sport === 'bicicleta' && w.type === 'lung');
    if (longRide) assert.ok(longRide.plannedMinutes <= 40, `tura lungă ${longRide.plannedMinutes} min`);
  });
});

describe('24–25 / T24–T26 · asocierea plan–execuție', () => {
  it('activitatea de azi rămâne la planul de azi, nu la cel ratat ieri', () => {
    const m = matchActivities([P({ id: 'ieri', date: '2026-10-15' }), P({ id: 'azi', date: '2026-10-16' })], [A({ id: 'x', date: '2026-10-16' })], '2026-10-16');
    assert.equal(m.matches.find((x) => x.planned.id === 'azi')!.activity?.id, 'x');
    assert.equal(m.matches.find((x) => x.planned.id === 'ieri')!.activity, null);
  });
  it('o singură activitate nu acoperă trei ședințe', () => {
    const m = matchActivities([P({ id: '12', date: '2026-10-12' }), P({ id: '13', date: '2026-10-13' }), P({ id: '14', date: '2026-10-14' })], [A({ id: 'x', date: '2026-10-13' })], '2026-10-16');
    assert.equal(m.matches.filter((x) => x.activity).length, 1);
  });
  it('brick din două fișiere: alergarea la 5 min după bicicletă se atașează', () => {
    const m = matchActivities(
      [P({ id: 'b', date: '2026-10-16', sport: 'bicicleta', type: 'brick', plannedMinutes: 120, structure: 'tură 90 min Z2 + alergare 30 min imediat după' })],
      [A({ id: 'bike', sport: 'bicicleta', minutes: 90, startLocal: '08:00' }), A({ id: 'run', minutes: 30, startLocal: '09:35' })],
      '2026-10-16',
    );
    assert.equal(m.matches[0]!.extraActivity?.id, 'run');
  });
});

describe('29–30 / T30 · WHOOP: somn fără „no data”, distanțe exacte', () => {
  it('390 min în stadii + 60 min fără date → 390 min somn, nu 450', () => {
    const n = normalizeWhoopNight(
      { id: 's', user_id: 1, start: '2026-10-15T21:00:00Z', end: '2026-10-16T05:00:00Z', timezone_offset: '+03:00', nap: false, score_state: 'SCORED', score: { stage_summary: { total_in_bed_time_milli: 480 * 60000, total_awake_time_milli: 30 * 60000, total_no_data_time_milli: 60 * 60000, total_light_sleep_time_milli: 200 * 60000, total_slow_wave_sleep_time_milli: 100 * 60000, total_rem_sleep_time_milli: 90 * 60000, sleep_cycle_count: 4, disturbance_count: 3 } } } as never,
      null,
    );
    assert.equal(n?.sleepMin, 390);
  });
  it('25 m de înot nu devin 0 km', () => {
    const w = normalizeWhoopWorkout({ id: 'w', user_id: 1, start: '2026-10-16T06:00:00Z', end: '2026-10-16T06:20:00Z', timezone_offset: '+03:00', sport_name: 'swimming', score_state: 'SCORED', score: { strain: 3, average_heart_rate: 120, max_heart_rate: 140, kilojoule: 300, distance_meter: 25, zone_durations: null } } as never);
    assert.equal(w?.distanceKm, 0.025);
  });
});

describe('47 / T46 · testul fără ergometru nu pune pragurile la alergare', () => {
  it('praguri fără sport → zonele rămân goale, cu explicație', () => {
    const r = toTestForm({ lizibil: true, tip: 'cpet', data_testului: '2026-10-01', clinica: null, ergometru: null, fc_max: 180, vo2max_ml_kg_min: null, prag1_fc: 130, prag2_fc: 160, prag2_ritm_min_km: null, prag2_putere_w: null, ftp_w: null, zone_alergare_fc_max: null, zone_bicicleta_fc_max: null } as unknown as TestReading);
    assert.ok(r.form.alergare_z.every((z) => z == null));
    assert.ok(r.form.bicicleta_z.every((z) => z == null));
  });
});

describe('12 / T11 · registrul surselor pentru AI (v4: Strava temporar, până la Health)', () => {
  it('fără date din Health, Strava ajunge la antrenorul sportivului', () => {
    const rows = allowedForAI([{ source: 'strava' }, { source: 'whoop' }, { source: null }]);
    assert.deepEqual(rows.map((r) => r.source), ['strava', 'whoop', null]);
  });
  it('când apar activitățile din Apple Health / Health Connect, Strava iese automat', () => {
    assert.deepEqual(allowedForAI([{ source: 'strava' }, { source: 'apple' }]).map((r) => r.source), ['apple']);
    assert.deepEqual(allowedForAI([{ source: 'strava' }, { source: 'android' }, { source: 'whoop' }]).map((r) => r.source), ['android', 'whoop']);
  });
});

describe('62 / T60 · obiectiv nesuportat', () => {
  it('„full” nu strică ecranul: fără bară', () => {
    assert.deepEqual(sportReadiness('full' as never, [], '2026-10-17'), []);
  });
});

import { adapt } from '../src/calendar/adapt.js';
import { extraOn } from '../src/calendar/load.js';
describe('organism viu · efortul peste plan: ziua se echivalează, mâine decid datele', () => {
  // Azuga: 3 h 49, 21 km, mult în Z3–Z4 (minute din ceas), în locul unei lungi de 90 min Z2 + un înot de 30 min.
  const run = { id: 'azuga', date: '2026-10-17', sport: 'alergare' as const, minutes: 229, distanceKm: 21.3, timeInZonesMin: { 1: 10, 2: 40, 3: 90, 4: 80, 5: 9 } };
  const plan: PlannedWorkout[] = [
    P({ id: 'lung', date: '2026-10-17', type: 'lung', plannedMinutes: 90, key: true }),
    P({ id: 'inot', date: '2026-10-17', sport: 'inot', type: 'tehnica', plannedMinutes: 30, targetZones: [1, 2] }),
    P({ id: 'luni', date: '2026-10-19', sport: 'bicicleta', type: 'z2', plannedMinutes: 60 }),
    P({ id: 'marti', date: '2026-10-20', sport: 'alergare', type: 'calitate', plannedMinutes: 50, targetZones: [4], key: true, intervals: { count: 5, minutes: 4, zone: 4 } }),
  ];
  it('3 h 49 de munte: efortul (TRIMP) acoperă ziua → înotul se anulează; zilele următoare rămân cum sunt', () => {
    const { extra, coverage } = extraOn('2026-10-17', plan, [run as never]);
    assert.equal(extra, true, 'mult peste lunga planificată');
    assert.equal(coverage.stare, 'acoperit');
    assert.ok(coverage.facut > coverage.planificat);
    const r = adapt(plan, { kind: 'acoperit', date: '2026-10-17', facut: coverage.facut, planificat: coverage.planificat }, { today: '2026-10-17', freeBlocks: [], recentKeyScores: [], done: ['lung'] });
    assert.equal(r.plan.find((w) => w.id === 'lung')!.status, 'planificat');
    assert.equal(r.plan.find((w) => w.id === 'inot')!.status, 'anulat_sistem');
    assert.deepEqual(r.plan.find((w) => w.id === 'luni')!.targetZones, [2]);
    assert.equal(r.plan.find((w) => w.id === 'marti')!.type, 'calitate');
  });
  it('restricția de sănătate nu mai vine din durata efortului', () => {
    const r = activeRestriction({ today: '2026-10-17', morning: null, evenings: [], todayActivities: [{ sport: 'alergare', minutes: 229 }] });
    assert.equal(r, null);
  });
});

describe('4×4 norvegian în plan', () => {
  const blocks: FreeBlock[] = [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day: day as FreeBlock['day'], startMin: 360, endMin: 600 }));
  it('cu aviz: apare în build (o săptămână din două) și în peak; fără aviz: niciodată', () => {
    const ok = generatePlan({ startDate: '2026-10-19', raceDate: '2027-09-26', goal: '70.3', freeBlocks: blocks, historyHoursPerWeek: [8, 8, 8, 8], intensityAllowed: 'toate', swimContinuous400: true });
    assert.equal(ok.ok, true);
    if (!ok.ok) return;
    const ff = (ph: string) => ok.weeks.filter((w) => w.phase === ph).flatMap((w) => w.workouts).filter((x) => /4×4/.test(x.structure ?? ''));
    assert.ok(ff('build').length >= 3);
    assert.ok(ff('peak').length >= 1);
    assert.equal(ff('baza1').length + ff('evaluare').length, 0);
    for (const x of [...ff('build'), ...ff('peak')]) assert.equal(x.intervals?.count, 4);
    const no = generatePlan({ startDate: '2026-10-19', raceDate: '2027-09-26', goal: '70.3', freeBlocks: blocks, historyHoursPerWeek: [8, 8, 8, 8], intensityAllowed: 'Z2', swimContinuous400: true });
    if (no.ok) assert.equal(no.weeks.flatMap((w) => w.workouts).filter((x) => /4×4/.test(x.structure ?? '')).length, 0);
  });
});
