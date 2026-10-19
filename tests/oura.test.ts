// Oura: noaptea principală, antrenamente, sesiuni, temperatura, fără dubluri cu alte surse.
import { it } from 'node:test';
import assert from 'node:assert/strict';
import { mainNights, normalizeOuraNight, normalizeOuraOther, normalizeOuraSession, normalizeOuraWorkout, type OuraSleep, type OuraWorkout } from '../src/collector/providers/oura.js';
import { dedupeActivities, mergeWellness } from '../src/collector/packet.js';
import type { SourceActivity } from '../src/collector/types.js';

const night = (p: Partial<OuraSleep>): OuraSleep => ({ id: 'x', day: '2026-10-19', type: 'long_sleep', bedtime_start: '2026-10-18T23:30:00+03:00', bedtime_end: '2026-10-19T07:00:00+03:00', total_sleep_duration: 7 * 3600, average_hrv: 45, lowest_heart_rate: 48, average_breath: 14.5, ...p });
const wk = (p: Partial<OuraWorkout>): OuraWorkout => ({ id: 'w1', activity: 'running', day: '2026-10-19', start_datetime: '2026-10-19T18:00:00+03:00', end_datetime: '2026-10-19T18:50:00+03:00', ...p });

it('noaptea principală: long_sleep; fără ea, cel mai lung somn de peste 3 ore; siesta nu devine noapte', () => {
  const ns = mainNights([night({ id: 'nap', type: 'late_nap', total_sleep_duration: 3600 }), night({ id: 'main' })]);
  assert.deepEqual(ns.map((n) => n.id), ['main']);
  const short = mainNights([night({ id: 's1', type: 'sleep', total_sleep_duration: 4 * 3600 }), night({ id: 's2', type: 'sleep', total_sleep_duration: 3600 })]);
  assert.deepEqual(short.map((n) => n.id), ['s1']);
  assert.equal(mainNights([night({ type: 'sleep', total_sleep_duration: 2 * 3600 })]).length, 0);
});

it('temperatura pielii (abaterea Oura) ajunge în ziua respectivă, alături de readiness', () => {
  const d = normalizeOuraNight(night({}), { day: '2026-10-19', score: 80 }, { day: '2026-10-19', score: 74, temperature_deviation: 0.42 })!;
  assert.equal(d.tempDevC, 0.42);
  assert.equal(d.recoveryScore, 74);
  assert.equal(mergeWellness([d])[0]!.tempDevC, 0.42);
});

it('antrenamente: cele patru sporturi devin activități; plimbarea și drumeția → mișcare în plus (și bula de mers)', () => {
  const run = normalizeOuraWorkout(wk({ distance: 8200, intensity: 'moderate' }))!;
  assert.equal(run.sport, 'alergare');
  assert.equal(run.minutes, 50);
  assert.equal(run.distanceKm, 8.2);
  assert.equal(run.startLocal, '18:00');
  assert.equal(normalizeOuraWorkout(wk({ activity: 'walking' })), null);
  const walk = normalizeOuraOther(wk({ activity: 'walking' }))!;
  assert.equal(walk.name, 'plimbare');
  assert.equal(walk.elapsedSec, 3000);
  assert.equal(walk.startUtc, '2026-10-19T15:00:00.000Z');
  assert.equal(normalizeOuraOther(wk({ activity: 'hiking' }))!.name, 'drumeție');
  assert.equal(normalizeOuraOther(wk({})), null);
});

it('sesiunile Oura: meditația și respirația devin recuperare; siesta nu', () => {
  const s = (type: string) => normalizeOuraSession({ id: 's', day: '2026-10-19', type, start_datetime: '2026-10-19T21:00:00+03:00', end_datetime: '2026-10-19T21:10:00+03:00' });
  assert.equal(s('meditation')?.name, 'meditație');
  assert.equal(s('breathing')?.kind, 'recuperare');
  assert.equal(s('nap'), null);
});

it('aceeași alergare din Oura și din Strava se numără o singură dată', () => {
  const oura = normalizeOuraWorkout(wk({ distance: 8200 }))!;
  const strava: SourceActivity = { id: 'strava-1', externalId: '1', source: 'strava', date: '2026-10-19', startLocal: '18:01', sport: 'alergare', minutes: 49, distanceKm: 8.21 };
  const d = dedupeActivities([oura, strava]);
  assert.equal(d.length, 1);
  assert.deepEqual([...(d[0]!.mergedSources ?? [])].sort(), ['oura', 'strava']);
});
