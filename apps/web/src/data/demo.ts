// Date DEMO pentru pagina de previzualizare (build cu VITE_DEMO=1). Produce același obiect `Me` ca serverul,
// din generatorul real de calendar și din reguli de scor simulate deterministic. În aplicația reală nu se încarcă.

import type { Me, MeActivity } from '@core/api-types.js';
import { computeBar, type ScoredActivity } from '@core/bar/bar.js';
import { generatePlan } from '@core/calendar/generate.js';
import type { Color, FreeBlock, PlannedWorkout, Sport } from '@core/types.js';
import { diffDays } from '@core/util/dates.js';

const TODAY = '2026-12-07';
const RACE_DATE = '2027-09-12';
const PLAN_START = '2026-11-02';

const freeBlocks: FreeBlock[] = [
  { day: 0, startMin: 6 * 60 + 30, endMin: 9 * 60 + 30 },
  { day: 0, startMin: 12 * 60, endMin: 15 * 60 + 30 },
  { day: 0, startMin: 19 * 60 + 30, endMin: 21 * 60 + 30 },
  { day: 1, startMin: 6 * 60 + 30, endMin: 9 * 60 + 30 },
  { day: 1, startMin: 12 * 60, endMin: 15 * 60 + 30 },
  { day: 1, startMin: 19 * 60 + 30, endMin: 21 * 60 + 30 },
  { day: 2, startMin: 12 * 60 + 30, endMin: 15 * 60 + 30 },
  { day: 2, startMin: 19 * 60 + 30, endMin: 21 * 60 + 30 },
  { day: 3, startMin: 12 * 60 + 30, endMin: 15 * 60 + 30 },
  { day: 3, startMin: 19 * 60 + 30, endMin: 21 * 60 + 30 },
  { day: 4, startMin: 12 * 60 + 30, endMin: 15 * 60 + 30 },
  { day: 4, startMin: 19 * 60 + 30, endMin: 21 * 60 + 30 },
  { day: 5, startMin: 8 * 60, endMin: 14 * 60 },
  { day: 6, startMin: 8 * 60, endMin: 13 * 60 },
];

const PATTERN: Color[] = ['verde', 'verde', 'galben', 'verde', 'portocaliu', 'verde', 'galben', 'rosu', 'verde', 'verde', 'gri', 'galben', 'verde'];
const REASONS: Record<Color, string[]> = {
  verde: ['durată, zone și RPE în țintă'],
  galben: ['durată 84% din plan (75–90%)', 'RPE cu +2 peste așteptat'],
  portocaliu: ['timp în zona-țintă 44% (sub 50%)'],
  rosu: ['nicio activitate potrivită până la finalul zilei următoare'],
  gri: ['anulat de sistem: readiness roșu (HRV sub baseline 2 zile)'],
  albastru: ['activitate în afara planului'],
  asteptare: [],
};
const SPEED_KMH: Record<Sport, number> = { inot: 1.6, bicicleta: 27, alergare: 9.6, forta: 0 };

export function buildDemoMe(): Me {
  const generated = generatePlan({ startDate: PLAN_START, raceDate: RACE_DATE, goal: '70.3', freeBlocks, historyHoursPerWeek: [5, 6, 5.5, 6], intensityAllowed: 'Z2', swimContinuous400: false });
  if (!generated.ok) throw new Error(generated.reason);
  const plan: PlannedWorkout[] = generated.weeks.flatMap((w) => w.workouts);

  const scores: Me['scores'] = {};
  let i = 0;
  for (const w of plan) {
    if (diffDays(w.date, TODAY) <= 0) continue;
    const color = PATTERN[i % PATTERN.length]!;
    scores[w.id] = { color, reasons: REASONS[color], final: true };
    i += 1;
  }
  const colorOf = (w: PlannedWorkout): Color => (w.status === 'anulat_sistem' ? 'gri' : (scores[w.id]?.color ?? 'asteptare'));

  const executed = plan.filter((w) => ['verde', 'galben'].includes(colorOf(w)) && w.sport !== 'forta');
  const activities: MeActivity[] = executed.map((w) => ({
    id: `demo-${w.id}`,
    source: 'garmin',
    date: w.date,
    sport: w.sport,
    minutes: w.plannedMinutes,
    distanceKm: Math.round(((w.plannedMinutes / 60) * SPEED_KMH[w.sport]) * 10) / 10,
    avgHr: w.sport === 'alergare' ? 142 : w.sport === 'bicicleta' ? 128 : 118,
    maxHr: w.sport === 'alergare' ? 156 : w.sport === 'bicicleta' ? 144 : 140,
    name: null,
    unplanned: false,
    tipNeplanificat: null,
  }));
  activities.push({ id: 'demo-cursa-10k', source: 'garmin', date: '2026-12-05', sport: 'alergare', minutes: 55, distanceKm: 10, avgHr: 171, maxHr: 186, name: 'Alergare · 10 km', unplanned: true, tipNeplanificat: null });

  const scored: ScoredActivity[] = activities.map((a) => ({ id: a.id, date: a.date, sport: a.sport, minutes: a.minutes, distanceKm: a.distanceKm, avgHr: a.avgHr, maxHr: a.maxHr, color: a.unplanned ? 'albastru' : (scores[a.id.replace('demo-', '')]?.color ?? 'verde') }));
  const last4 = plan.filter((w) => diffDays(w.date, TODAY) > 0 && diffDays(w.date, TODAY) <= 28);
  const bar = computeBar({ today: TODAY, activities: scored, plannedColorsLast4Weeks: last4.map(colorOf), cssSecPer100m: null, ctl: 42, ctlTarget: 48, openFlags: [], goal: '70.3' });

  const planned2w = plan.filter((w) => w.sport === 'inot' && diffDays(w.date, TODAY) > 0 && diffDays(w.date, TODAY) <= 14).reduce((n, w) => n + w.plannedMinutes, 0);
  const done2w = activities.filter((a) => a.sport === 'inot' && diffDays(a.date, TODAY) > 0 && diffDays(a.date, TODAY) <= 14).reduce((n, a) => n + a.minutes, 0);

  return {
    user: { id: 'demo', email: 'demo@antrenor.app', name: 'Cuza', goal: '70.3', raceName: 'Ironman 70.3 România', raceDate: RACE_DATE, tz: 'Europe/Bucharest' },
    consent: true,
    intakeComplete: true,
    today: TODAY,
    phase: 'baza1',
    budgetHours: generated.budgetHours,
    plan,
    scores,
    activities,
    wellnessToday: { hrv: 27, rhr: 61, sleepMin: 432, bedtime: '23:40', sleepScore: 82, recoveryScore: 72, source: 'whoop' },
    readiness: { verdict: 'verde', reason: 'HRV 27 ms, în baseline; somn 7 h 12 min' },
    bar,
    messages: [
      { id: 'm1', kind: 'dimineata', body: 'Decizia: verde, HRV 27 ms în baseline [hrv.azi].\nAzi: alergare Z2 40 min, 128–147 bpm; forță 40 min seara.\nMâncare: 370 g carbohidrați, 140 g proteine; înainte: o banană; în timpul: apă.\nDe urmărit: cadența peste 170.', decision: 'verde', createdAt: `${TODAY}T06:31:00` },
      { id: 'm2', kind: 'dupa_antrenament', body: 'Ce a fost: alergare lungă 60 min, 9,6 km, FC medie 142.\nCe înseamnă: în Z2 tot timpul; bine.\nMâine: nimic nu se schimbă.\nMănâncă acum: nu urmează ședință în 24 h.', decision: 'verde', createdAt: '2026-12-06T19:40:00' },
    ],
    memento: null,
    forms: { intake: null, morning: null, evening: {}, weeklyDone: false },
    devices: [
      { provider: 'whoop', connectedAt: '2026-11-01T08:00:00Z', lastSync: `${TODAY}T06:30:00`, lastOk: true, detail: null },
      { provider: 'strava', connectedAt: '2026-11-01T08:05:00Z', lastSync: `${TODAY}T06:30:00`, lastOk: true, detail: null },
    ],
    lastSync: `${TODAY}T06:30:00`,
    zones: { run: 'Z2 128–147 bpm', bike: null, swim: null, source: 'provizoriu' },
    dataAvailability: {
      have: ['chestionar de intrare', 'program săptămânal', 'Whoop', 'Garmin / ceas (prin Strava)', 'analize de sânge', 'istoric de activități'],
      missing: ['aviz cardiologic', 'zone testate (CPET / test de teren)', 'Oura'],
    },
    warnings: planned2w > 0 && done2w / planned2w < 0.6 ? [{ title: 'Înot sub plan', text: `Ai înotat ${Math.round((done2w / planned2w) * 100)}% din minutele planificate în ultimele două săptămâni.`, fix: 'Săptămâna viitoare ședințele de înot se plasează primele.' }] : [],
  };
}
