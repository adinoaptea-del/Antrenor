// Demo: `npm run demo`. Arată primele două săptămâni ale unui calendar, un scor, o adaptare și bara.
// Programul de mai jos e un exemplu (dimineți libere luni–marți, prânz miercuri–vineri, seri, weekend); se înlocuiește cu blocurile reale ale sportivului.

import { adapt } from '../src/calendar/adapt.js';
import { generatePlan } from '../src/calendar/generate.js';
import { computeBar } from '../src/bar/bar.js';
import { matchActivities } from '../src/scoring/match.js';
import { scoreWorkout } from '../src/scoring/score.js';
import type { Activity, FreeBlock } from '../src/types.js';
import { weekday } from '../src/util/dates.js';

const freeBlocks: FreeBlock[] = [
  { day: 0, startMin: 6 * 60, endMin: 9 * 60 },
  { day: 0, startMin: 19 * 60 + 30, endMin: 21 * 60 },
  { day: 1, startMin: 6 * 60, endMin: 9 * 60 },
  { day: 1, startMin: 19 * 60 + 30, endMin: 21 * 60 },
  { day: 2, startMin: 12 * 60 + 30, endMin: 15 * 60 },
  { day: 3, startMin: 12 * 60 + 30, endMin: 15 * 60 },
  { day: 3, startMin: 19 * 60 + 30, endMin: 21 * 60 },
  { day: 4, startMin: 12 * 60 + 30, endMin: 15 * 60 },
  { day: 5, startMin: 8 * 60, endMin: 13 * 60 },
  { day: 6, startMin: 8 * 60, endMin: 12 * 60 },
];

const DAYS = ['Lu', 'Ma', 'Mi', 'Jo', 'Vi', 'Sâ', 'Du'];

const plan = generatePlan({
  startDate: '2026-11-02',
  raceDate: '2027-09-12',
  goal: '70.3',
  freeBlocks,
  historyHoursPerWeek: [5, 6, 5.5, 6],
  intensityAllowed: 'Z2', // până la avizul cardiologic
  swimContinuous400: false,
});

if (!plan.ok) {
  console.log('Plan refuzat:', plan.reason, plan.options);
  process.exit(0);
}

console.log(`Buget: ${plan.budgetHours} h/săpt · ${plan.weeks.length} săptămâni până la cursă\n`);
for (const week of plan.weeks.slice(0, 2)) {
  console.log(`Săptămâna ${week.weekStart} · ${week.phase}${week.recovery ? ' (descărcare)' : ''} · țintă ${week.targetHours} h · planificat ${week.plannedHours} h`);
  for (const w of week.workouts) {
    console.log(`  ${DAYS[weekday(w.date)]} ${w.date}  ${w.sport.padEnd(9)} ${w.type.padEnd(8)} ${String(w.plannedMinutes).padStart(3)} min  Z${w.targetZones.join('-') || '-'}${w.key ? '  CHEIE' : ''}${w.structure ? `  · ${w.structure}` : ''}`);
  }
  for (const n of week.notes) console.log(`  · ${n}`);
  console.log();
}

// Scor: alergarea lungă din prima săptămână, executată 85% din durată, în zonă, RPE +2.
const first = plan.weeks[0]!;
const longRun = first.workouts.find((w) => w.sport === 'alergare' && w.type === 'lung')!;
const activities: Activity[] = [
  { id: 'strava-1', date: longRun.date, sport: 'alergare', minutes: Math.round(longRun.plannedMinutes * 0.85), distanceKm: 9.2, timeInZonesMin: { 1: 5, 2: 40, 3: 6 } },
  { id: 'strava-2', date: longRun.date, sport: 'inot', minutes: 25, distanceKm: 0.8 },
];
const matched = matchActivities(first.workouts, activities, longRun.date);
const m = matched.matches.find((x) => x.planned.id === longRun.id)!;
const score = scoreWorkout({ planned: longRun, activity: m.activity, questionnaire: { rpe: 7, painScore: 1 }, today: longRun.date });
console.log(`Scor ${longRun.sport} ${longRun.type} (${longRun.date}): ${score.color.toUpperCase()}`);
for (const r of score.reasons) console.log(`  - ${r}`);
console.log(`  neplanificate: ${matched.unplanned.map((a) => `${a.sport} ${a.minutes} min (albastru)`).join(', ') || '-'}\n`);

// Adaptare: readiness roșu în ziua turei lungi.
const longRide = first.workouts.find((w) => w.sport === 'bicicleta' && w.type === 'lung')!;
const adapted = adapt(first.workouts, { kind: 'readiness', date: longRide.date, verdict: 'rosu', reason: 'HRV sub baseline 2 zile' }, { today: longRide.date, freeBlocks, recentKeyScores: [] });
console.log('Adaptare la readiness roșu:');
for (const c of adapted.changes) console.log(`  - ${c}`);
console.log();

// Bara, cu puține date: arată pe ce se bazează.
const bar = computeBar({
  today: longRun.date,
  activities: activities.map((a, i) => ({ ...a, color: i === 0 ? score.color : 'albastru' })),
  plannedColorsLast4Weeks: [score.color, 'verde', 'galben', 'rosu'],
  openFlags: [],
  goal: '70.3',
});
console.log(`Bara: ${bar.total == null ? (bar.blocked ? `blocată: ${bar.blocked}` : 'fără date') : `${bar.total}%`} (${bar.basis})`);
for (const c of bar.components) console.log(`  ${c.name.padEnd(12)} ${c.value == null ? 'fără date' : `${c.value}%`.padEnd(9)} ${c.detail}`);
