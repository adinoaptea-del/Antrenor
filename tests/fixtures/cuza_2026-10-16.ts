// Datele reale ale lui Cuza din 16 oct 2026, așa cum au venit prin AthleteData (Whoop + Garmin). Fixture pentru colector.
import type { SourceActivity, SourceDaily } from '../../src/collector/types.js';

export const wellness: SourceDaily[] = [
  { date: '2026-10-09', source: 'whoop', hrv: 25.5, rhr: 71, sleepMin: 380, sleepScore: 83, recoveryScore: 60 },
  { date: '2026-10-10', source: 'whoop', hrv: 22.3, rhr: 76, sleepMin: 477, sleepScore: 82, recoveryScore: 47 },
  { date: '2026-10-11', source: 'whoop', hrv: 23.0, rhr: 74, sleepMin: 349, sleepScore: 78, recoveryScore: 45 },
  { date: '2026-10-11', source: 'garmin', weightKg: 72.5 },
  { date: '2026-10-12', source: 'whoop', hrv: 18.8, rhr: 79, sleepMin: 477, sleepScore: 79, recoveryScore: 35 },
  { date: '2026-10-13', source: 'whoop', hrv: 28.9, rhr: 69, sleepMin: 442, sleepScore: 82, recoveryScore: 78 },
  { date: '2026-10-14', source: 'whoop', hrv: 28.0, rhr: 73, sleepMin: 419, sleepScore: 85, recoveryScore: 73 },
  { date: '2026-10-15', source: 'whoop', hrv: 21.9, rhr: 73, sleepMin: 395, sleepScore: 81, recoveryScore: 48, bedtime: '23:49' },
  { date: '2026-10-16', source: 'whoop', hrv: 27.9, rhr: 67, sleepMin: 386, sleepScore: 82, recoveryScore: 80, bedtime: '01:08', wakeTime: '07:57' },
];

export const activities: SourceActivity[] = [
  { id: 'g1', externalId: '24661968431', source: 'garmin', date: '2026-10-09', sport: 'inot', minutes: 36, distanceKm: 0.425, avgHr: 112, maxHr: 144 },
  { id: 'g2', externalId: '24681877392', source: 'garmin', date: '2026-10-11', sport: 'alergare', minutes: 127, distanceKm: 21.4, avgHr: 165, maxHr: 187, avgPaceMinKm: 5.94, avgCadence: 171, avgWatts: 295, name: 'București Alergare' },
  { id: 's2', externalId: 'strava-9001', source: 'strava', date: '2026-10-11', sport: 'alergare', minutes: 127, distanceKm: 21.38, avgHr: 165 },
  { id: 'g3', externalId: '24699917045', source: 'garmin', date: '2026-10-12', sport: 'inot', minutes: 50, distanceKm: 0.45, avgHr: 113, maxHr: 164 },
  { id: 'g4', externalId: '24707457236', source: 'garmin', date: '2026-10-13', sport: 'forta', minutes: 75, avgHr: 106, maxHr: 155 },
  { id: 'g5', externalId: '24711975222', source: 'garmin', date: '2026-10-13', sport: 'inot', minutes: 54, distanceKm: 0.45, avgHr: 117, maxHr: 171 },
  { id: 'g6', externalId: '24724037824', source: 'garmin', date: '2026-10-14', sport: 'inot', minutes: 30, distanceKm: 0.65, avgHr: 116, maxHr: 148 },
  { id: 'g7', externalId: '24725267622', source: 'garmin', date: '2026-10-14', sport: 'alergare', minutes: 46, distanceKm: 6.0, avgHr: 142, maxHr: 154, avgPaceMinKm: 7.59, avgCadence: 165 },
  { id: 'g8', externalId: '24731779624', source: 'garmin', date: '2026-10-15', sport: 'forta', minutes: 40, avgHr: 102, maxHr: 137 },
];
