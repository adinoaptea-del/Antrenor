import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseHealthConnect, collectRecords } from '../server/_lib/android.js';

describe('Samsung Health prin Health Connect (parser tolerant)', () => {
  const tz = 'Europe/Bucharest';
  it('listă de înregistrări cu „type”: somn (cu stadii treze scăzute), HRV de noapte, puls de repaus, alergare cu distanță', () => {
    const body = {
      records: [
        { type: 'SleepSessionRecord', startTime: '2026-10-17T20:30:00Z', endTime: '2026-10-18T04:10:00Z', stages: [{ stage: 1, startTime: '2026-10-18T01:00:00Z', endTime: '2026-10-18T01:20:00Z' }] },
        { type: 'HeartRateVariabilityRmssdRecord', time: '2026-10-18T02:00:00Z', heartRateVariabilityMillis: 44 },
        { type: 'HeartRateVariabilityRmssdRecord', time: '2026-10-18T03:00:00Z', heartRateVariabilityMillis: 48 },
        { type: 'HeartRateVariabilityRmssdRecord', time: '2026-10-18T14:00:00Z', heartRateVariabilityMillis: 30 },
        { type: 'RestingHeartRateRecord', time: '2026-10-18T05:00:00Z', beatsPerMinute: 52 },
        { type: 'ExerciseSessionRecord', exerciseType: 56, title: 'Alergare de seară', startTime: '2026-10-17T16:00:00Z', endTime: '2026-10-17T16:45:00Z', distance: { inMeters: 8200 }, averageHeartRate: 148 },
        { type: 'StepsRecord', startTime: '2026-10-17T00:00:00Z', endTime: '2026-10-17T23:59:00Z', count: 9000 },
        { type: 'BloodGlucoseRecord', time: '2026-10-17T10:00:00Z', level: 5 },
      ],
    };
    const p = parseHealthConnect(body, tz);
    const d = p.days.find((x) => x.date === '2026-10-18')!;
    assert.equal(d.sleep_min, 460 - 20); // 7 h 40 − 20 min treaz
    assert.equal(d.bedtime, '23:30');
    assert.equal(d.wake_time, '07:10');
    assert.equal(d.hrv, 46); // doar măsurătorile de noapte, nu cea de după-amiază
    assert.equal(d.rhr, 52);
    assert.equal(p.workouts.length, 1);
    assert.equal(p.workouts[0]!.sport, 'alergare');
    assert.equal(p.workouts[0]!.date, '2026-10-17');
    assert.equal(p.workouts[0]!.start_local, '19:00');
    assert.equal(p.workouts[0]!.distance_km, 8.2);
    assert.equal(p.workouts[0]!.minutes, 45);
    assert.deepEqual(p.unknownTypes, ['bloodglucose']);
  });
  it('înregistrări grupate pe tip (cheia e numele tipului), ore ca epoch ms, înot în bazin cu cod 74', () => {
    const body = { data: { SleepSessionRecord: [{ startTime: 1792178000000, endTime: 1792205000000 }], ExerciseSessionRecord: [{ exerciseType: 74, startTime: '2026-10-16T17:00:00+03:00', endTime: '2026-10-16T17:40:00+03:00', distanceMeters: 1000 }], WeightRecord: [{ time: '2026-10-16T06:00:00Z', weight: { inKilograms: 78.4 } }] } };
    const p = parseHealthConnect(body, tz);
    assert.equal(p.days.find((x) => x.weight_kg === 78.4)?.date, '2026-10-16');
    assert.equal(p.workouts[0]!.sport, 'inot');
    assert.equal(p.workouts[0]!.start_local, '17:00');
    assert.equal(p.workouts[0]!.details.pace100mSec, 240);
    assert.ok(p.days.some((x) => x.sleep_min === 450));
    assert.equal(collectRecords(body).length, 3);
  });
  it('yoga și mers nu sunt antrenamente: intră la recuperare / mișcare în plus', () => {
    const p = parseHealthConnect({ records: [{ type: 'ExerciseSessionRecord', exerciseType: 83, startTime: '2026-10-17T06:00:00Z', endTime: '2026-10-17T06:30:00Z' }] }, tz);
    assert.equal(p.workouts.length, 0);
    assert.equal(p.others.length, 1);
    assert.equal(p.others[0]!.source, 'android');
  });
});
