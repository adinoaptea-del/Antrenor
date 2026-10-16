// Date DEMO: calendarul vine din nucleu (generatePlan), scorurile trecutului sunt simulate deterministic.
// Nimic de aici nu e datele sportivului; aplicația reală primește aceleași structuri de la server.

import { computeBar, type BarResult, type ScoredActivity } from '@core/bar/bar.js';
import { generatePlan, type WeekPlan } from '@core/calendar/generate.js';
import type { Color, FreeBlock, PlannedWorkout, Sport } from '@core/types.js';
import { addDays, diffDays, weekStart, weekday } from '@core/util/dates.js';

export const TODAY = '2026-12-07';
export const RACE = { name: 'Ironman 70.3 România', date: '2027-09-12' };
export const ATHLETE = { name: 'Cuza' };

// Program de tip radio 16–19 luni–vineri și TV miercuri–vineri 8–12 (exemplu).
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

const PLAN_START = '2026-11-02';

const generated = generatePlan({
  startDate: PLAN_START,
  raceDate: RACE.date,
  goal: '70.3',
  freeBlocks,
  historyHoursPerWeek: [5, 6, 5.5, 6],
  intensityAllowed: 'Z2', // până la avizul cardiologic
  swimContinuous400: false,
});

if (!generated.ok) throw new Error(generated.reason);

export const weeks: WeekPlan[] = generated.weeks;
export const budgetHours = generated.budgetHours;
export const allWorkouts: PlannedWorkout[] = weeks.flatMap((w) => w.workouts);

export interface ScoreView {
  color: Color;
  reasons: string[];
}

// Scoruri simulate pentru trecut: un tipar fix, ca demo-ul să fie același la fiecare deschidere.
const PATTERN: Color[] = ['verde', 'verde', 'galben', 'verde', 'portocaliu', 'verde', 'galben', 'rosu', 'verde', 'verde', 'gri', 'galben', 'verde'];
const REASONS: Record<Color, string[]> = {
  verde: ['durată, zone și RPE în țintă'],
  galben: ['durată 84% din plan (75–90%)', 'RPE cu +2 peste așteptat'],
  portocaliu: ['timp în zona-țintă 44% (sub 50%)'],
  rosu: ['nicio activitate potrivită până la finalul zilei următoare'],
  gri: ['anulat de sistem: readiness roșu (HRV sub baseline 2 zile)'],
  albastru: ['activitate neplanificată'],
  asteptare: [],
};

export const scores = new Map<string, ScoreView>();
{
  let i = 0;
  for (const w of allWorkouts) {
    if (diffDays(w.date, TODAY) <= 0) continue; // viitor sau azi
    const color = PATTERN[i % PATTERN.length]!;
    scores.set(w.id, { color, reasons: REASONS[color] });
    i += 1;
  }
}

export function colorOf(w: PlannedWorkout): Color {
  if (w.status === 'anulat_sistem') return 'gri';
  return scores.get(w.id)?.color ?? 'asteptare';
}

// Activități derivate din antrenamentele executate (verde/galben), pentru bară.
const SPEED_KMH: Record<Sport, number> = { inot: 1.6, bicicleta: 27, alergare: 9.6, forta: 0 };
export const activities: ScoredActivity[] = allWorkouts
  .filter((w) => ['verde', 'galben'].includes(colorOf(w)) && w.sport !== 'forta')
  .map((w) => ({
    id: `demo-${w.id}`,
    date: w.date,
    sport: w.sport,
    minutes: w.plannedMinutes,
    distanceKm: Math.round(((w.plannedMinutes / 60) * SPEED_KMH[w.sport]) * 10) / 10,
    color: colorOf(w),
  }));

const last4 = allWorkouts.filter((w) => diffDays(w.date, TODAY) > 0 && diffDays(w.date, TODAY) <= 28);
export const bar: BarResult = computeBar({
  today: TODAY,
  activities,
  plannedColorsLast4Weeks: last4.map(colorOf),
  cssSecPer100m: null,
  ctl: 42,
  ctlTarget: 48,
  openFlags: [],
  goal: '70.3',
});

export const daysToRace = diffDays(TODAY, RACE.date);
export const dayIndex = diffDays(PLAN_START, TODAY) + 1;
export const totalDays = diffDays(PLAN_START, RACE.date);

export const readiness = {
  verdict: 'verde' as 'verde' | 'galben' | 'rosu',
  reason: 'HRV 27 ms, în baseline; somn 7 h 12 min',
  hrv: 27,
  hrvBaseline: 26,
  rhr: 61,
  sleep: '7 h 12',
  hooper: 11,
};

export const zones = {
  run: { label: 'provizorii, din cursele din 2026', z2: '128–147 bpm', threshold: '5:45–5:50 /km' },
  bike: { label: 'fără FTP', ftp: null as number | null },
  swim: { css: null as number | null },
};

export const dataAvailability = {
  have: ['chestionar de intrare', 'program săptămânal', 'Garmin', 'Whoop', 'analize (aug 2026)', 'compoziție corporală', 'istoric de activități'],
  missing: ['aviz cardiologic', 'test de efort (CPET)', 'CSS la înot', 'FTP pe bicicletă'],
};

export const coachMessages = [
  {
    when: 'azi, 06:31',
    lines: [
      'Decizia: verde, HRV 27 ms în baseline.',
      'Azi: alergare Z2 40 min, 128–147 bpm; forță 40 min seara.',
      'Mâncare: 370 g carbohidrați, 140 g proteine; înainte: o banană; în timpul: apă.',
      'De urmărit: cadența peste 170.',
    ],
  },
  {
    when: 'duminică, 19:40',
    lines: [
      'Ce a fost: alergare lungă 60 min, 9,6 km, FC medie 142.',
      'Ce înseamnă: în Z2 tot timpul; bine.',
      'Mâine: nimic nu se schimbă.',
      'Mănâncă acum: nu urmează ședință în 24 h.',
    ],
  },
];

export const warnings = [
  {
    title: 'Înot sub plan',
    text: 'Ai înotat 55% din orele planificate în ultimele două săptămâni; componenta de înot a barei stă la 42%.',
    fix: 'Săptămâna viitoare ședințele de înot se plasează primele.',
  },
];

export const swimTip = 'Expiră complet sub apă înainte să întorci capul. Un singur lucru, până apare în date.';

// Mesajul de întâmpinare: un fapt real din date, cu o dată.
function longest(sport: Sport): ScoredActivity | null {
  return activities.filter((a) => a.sport === sport).sort((a, b) => (b.distanceKm ?? 0) - (a.distanceKm ?? 0))[0] ?? null;
}
const DAY_NAMES = ['luni', 'marți', 'miercuri', 'joi', 'vineri', 'sâmbătă', 'duminică'];
export function greeting(): string {
  const ride = longest('bicicleta');
  if (!ride) return `Ziua ${dayIndex} din ${totalDays}.`;
  const h = Math.floor(ride.minutes / 60);
  const m = ride.minutes % 60;
  const dur = h ? `${h} h${m ? ` ${m}` : ''}` : `${m} min`;
  return `Ziua ${dayIndex} din ${totalDays}. ${cap(DAY_NAMES[weekday(ride.date)]!)} ai pedalat ${dur} fără oprire, cel mai mult de când ai început.`;
}
function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Ordinea de afișare: cheia întâi, apoi anduranța, forța la final.
const ORDER: Record<Sport, number> = { bicicleta: 1, alergare: 1, inot: 2, forta: 3 };
export function workoutsOn(date: string): PlannedWorkout[] {
  return allWorkouts
    .filter((w) => w.date === date && w.status !== 'sters')
    .sort((a, b) => Number(b.key) - Number(a.key) || ORDER[a.sport] - ORDER[b.sport]);
}

// Următoarea ședință neexecutată a unui sport (azi inclusiv).
export function nextWorkout(sport: Sport): PlannedWorkout | null {
  return (
    allWorkouts
      .filter((w) => w.sport === sport && w.status !== 'sters' && diffDays(TODAY, w.date) >= 0 && colorOf(w) === 'asteptare')
      .sort((x, y) => diffDays(y.date, x.date))[0] ?? null
  );
}

export function thisWeekDates(): string[] {
  const start = weekStart(TODAY);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

// ---------- Starea de azi (demo: în aplicația reală vin din Whoop/Garmin prin colector) ----------
export const todayState = {
  recovery: 72, // Whoop recovery, %
  recoveryLabel: 'Bună',
  sleep: '7 h 12',
  sleepMin: 432,
  hrv: 27,
  hrvAvg7: 26,
  rhr: 61,
};

export const weather = {
  tempC: 4,
  windKmh: 18,
  humidity: 71,
  sky: 'senin',
  verdict: 'Bune',
  verdictSub: 'alergare afară',
  rule: 'fără furtună, fără ploaie, sub 30 °C: antrenamentul rămâne afară',
};

export const insight = {
  title: 'Observația zilei',
  text: `HRV ${todayState.hrv} ms, cu ${Math.round(((todayState.hrv - todayState.hrvAvg7) / todayState.hrvAvg7) * 100)}% peste media ta din ultimele 7 zile. Alergarea Z2 de azi rămâne la ${'128–147 bpm'}; cadența peste 170.`,
};

export const lastRun = { date: '2026-12-06', avgHr: 142, km: 9.6, minutes: 60, hrTrend: [138, 141, 139, 144, 140, 143, 142] }; // FC medie pe ultimele 7 alergări (demo)

// Săptămânile de până acum (din activitățile executate), pentru grafice.
const weekStarts: string[] = [];
{
  let s = weekStart(PLAN_START);
  const cur = weekStart(TODAY);
  while (diffDays(s, cur) >= 0) {
    weekStarts.push(s);
    s = addDays(s, 7);
  }
}
const MONTH_SHORT = ['ian', 'feb', 'mar', 'apr', 'mai', 'iun', 'iul', 'aug', 'sept', 'oct', 'nov', 'dec'];
function weekLabel(iso: string): string {
  return `${Number(iso.slice(8))} ${MONTH_SHORT[Number(iso.slice(5, 7)) - 1]}`;
}
function inWeek(date: string, start: string): boolean {
  const d = diffDays(start, date);
  return d >= 0 && d < 7;
}

export const weeklyHours = weekStarts.map((s) => {
  const mins = activities.filter((a) => inWeek(a.date, s)).reduce((acc, a) => acc + a.minutes, 0);
  const plannedMins = allWorkouts.filter((w) => inWeek(w.date, s) && w.sport !== 'forta').reduce((acc, w) => acc + w.plannedMinutes, 0);
  return { start: s, label: weekLabel(s), hours: Math.round((mins / 60) * 10) / 10, plannedHours: Math.round((plannedMins / 60) * 10) / 10, current: s === weekStart(TODAY) };
});

export const weeklyExecution = weekStarts.map((s) => {
  const ws = allWorkouts.filter((w) => inWeek(w.date, s) && diffDays(w.date, TODAY) > 0);
  if (ws.length === 0) return { label: weekLabel(s), pct: null as number | null };
  const good = ws.filter((w) => ['verde', 'galben'].includes(colorOf(w))).length;
  return { label: weekLabel(s), pct: Math.round((good / ws.length) * 100) };
});

export function weeklyKm(sport: Sport): number[] {
  return weekStarts.filter((s) => s !== weekStart(TODAY)).map((s) =>
    Math.round(activities.filter((a) => a.sport === sport && inWeek(a.date, s)).reduce((acc, a) => acc + (a.distanceKm ?? 0), 0) * 10) / 10,
  );
}

export function sessionsInWeek(start: string): { perDay: number[]; done: number; planned: number } {
  const dates = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const perDay = dates.map((d) => workoutsOn(d).filter((w) => ['verde', 'galben'].includes(colorOf(w))).length);
  const planned = dates.reduce((acc, d) => acc + workoutsOn(d).length, 0);
  return { perDay, done: perDay.reduce((a, b) => a + b, 0), planned };
}

export const SPORT_LABEL: Record<Sport, string> = { inot: 'Înot', bicicleta: 'Bicicletă', alergare: 'Alergare', forta: 'Forță' };
export const TYPE_LABEL: Record<PlannedWorkout['type'], string> = {
  z2: 'Z2',
  tehnica: 'tehnică',
  calitate: 'calitate',
  lung: 'lung',
  brick: 'brick',
  forta: 'forță',
  odihna: 'odihnă',
};
export const COLOR_LABEL: Record<Color, string> = {
  verde: 'executat bine',
  galben: 'executat mediu',
  portocaliu: 'executat slab',
  rosu: 'nefăcut',
  gri: 'anulat de sistem',
  albastru: 'neplanificat',
  asteptare: 'urmează',
};
