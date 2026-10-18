import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chunkSamsung, parseSamsungCsv, samsungExport, samsungTableOf } from '../src/import/samsung-export.js';
import { unzipNeeded } from '../src/import/zip.js';
import { parseHealthConnect } from '../server/_lib/android.js';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const EX = `com.samsung.shealth.exercise,6313008,19
com.samsung.health.exercise.datauuid,com.samsung.health.exercise.start_time,com.samsung.health.exercise.end_time,com.samsung.health.exercise.time_offset,com.samsung.health.exercise.exercise_type,com.samsung.health.exercise.duration,com.samsung.health.exercise.distance,com.samsung.health.exercise.mean_heart_rate,com.samsung.health.exercise.max_heart_rate,com.samsung.health.exercise.comment
a1,2026-09-20 05:10:00.000,2026-09-20 05:55:30.000,UTC+0300,1002,2730000,7520.5,148.2,171,"ușor, cu prieteni"
a2,2026-09-21 15:00:00.000,2026-09-21 16:00:00.000,UTC+0300,11007,3600000,25000,132,160,
a3,2026-09-22 15:00:00.000,2026-09-22 15:40:00.000,UTC+0300,99999,2400000,,,,
`;
const SL = `com.samsung.shealth.sleep,6000,3
com.samsung.health.sleep.datauuid,com.samsung.health.sleep.start_time,com.samsung.health.sleep.end_time,com.samsung.health.sleep.time_offset
s1,2026-09-20 20:30:00.000,2026-09-21 04:30:00.000,UTC+0300
`;
const ST = `com.samsung.health.sleep_stage,1,3
com.samsung.health.sleep_stage.start_time,com.samsung.health.sleep_stage.end_time,com.samsung.health.sleep_stage.stage,com.samsung.health.sleep_stage.sleep_id
2026-09-20 20:30:00.000,2026-09-20 21:00:00.000,40001,s1
2026-09-20 21:00:00.000,2026-09-21 04:30:00.000,40002,s1
`;

test('fișierele exportului: doar cele folosite', () => {
  assert.equal(samsungTableOf('samsunghealth_x/com.samsung.shealth.exercise.20261018.csv'), 'exercise');
  assert.equal(samsungTableOf('com.samsung.health.sleep_stage.20261018.csv'), 'sleep_stage');
  assert.equal(samsungTableOf('com.samsung.shealth.tracker.heart_rate.20261018.csv'), null);
});

test('CSV cu metadate și virgule în ghilimele', () => {
  const r = parseSamsungCsv(EX);
  assert.equal(r.length, 3);
  assert.equal(r[0]!.exercise_type, '1002');
  assert.equal(r[0]!.comment, 'ușor, cu prieteni');
});

test('exportul ajunge antrenamente și somn în AIRON', () => {
  const imp = samsungExport([
    { name: 'com.samsung.shealth.exercise.1.csv', text: EX },
    { name: 'com.samsung.shealth.sleep.1.csv', text: SL },
    { name: 'com.samsung.health.sleep_stage.1.csv', text: ST },
  ]);
  assert.deepEqual(imp.unknownExercise, [99999]);
  const p = parseHealthConnect(imp.body, 'Europe/Bucharest');
  const run = p.workouts.find((w) => w.sport === 'alergare')!;
  assert.equal(run.date, '2026-09-20');
  assert.equal(run.start_local, '08:10');
  assert.equal(run.minutes, 46);
  assert.equal(run.distance_km, 7.52);
  assert.equal(run.avg_hr, 148);
  assert.equal(run.max_hr, 171);
  assert.ok(p.workouts.some((w) => w.sport === 'bicicleta'));
  const night = p.days.find((d) => d.date === '2026-09-21')!;
  assert.equal(night.sleep_min, 450); // 8 h minus 30 min treaz
  assert.equal(chunkSamsung(imp.body, 1).length, 3);
});

test('arhiva .zip se citește fără bibliotecă', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sh-'));
  writeFileSync(join(dir, 'com.samsung.shealth.exercise.1.csv'), EX);
  writeFileSync(join(dir, 'com.samsung.shealth.tracker.heart_rate.1.csv'), 'x');
  execFileSync('zip', ['-q', '-r', 'e.zip', '.'], { cwd: dir });
  const buf = readFileSync(join(dir, 'e.zip'));
  const files = await unzipNeeded(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  assert.equal(files.length, 1);
  assert.equal(parseSamsungCsv(files[0]!.text).length, 3);
});

test('alergare cu pauze: durata și ritmul pe timpul activ, totalul rămâne în detalii', () => {
  const csv = `com.samsung.shealth.exercise,1,1
com.samsung.health.exercise.datauuid,com.samsung.health.exercise.start_time,com.samsung.health.exercise.end_time,com.samsung.health.exercise.time_offset,com.samsung.health.exercise.exercise_type,com.samsung.health.exercise.duration,com.samsung.health.exercise.distance
p1,2026-10-04 06:00:00.000,2026-10-04 07:26:00.000,UTC+0300,1002,2760000,7640
`;
  const p = parseHealthConnect(samsungExport([{ name: 'com.samsung.shealth.exercise.1.csv', text: csv }]).body, 'Europe/Bucharest');
  const run = p.workouts[0]!;
  assert.equal(run.minutes, 46); // timpul activ, nu 86
  assert.equal(run.details?.elapsedMin, 86);
  assert.ok(run.avg_pace_min_km! > 5.9 && run.avg_pace_min_km! < 6.1); // ~6:01/km, nu 11:15/km
});

test('fără durată activă: viteza medie dă timpul activ; fără niciuna, rămâne start→stop', () => {
  const csv = `com.samsung.shealth.exercise,1,2
com.samsung.health.exercise.datauuid,com.samsung.health.exercise.start_time,com.samsung.health.exercise.end_time,com.samsung.health.exercise.time_offset,com.samsung.health.exercise.exercise_type,com.samsung.health.exercise.distance,com.samsung.health.exercise.mean_speed
q1,2026-10-05 06:00:00.000,2026-10-05 07:00:00.000,UTC+0300,1002,6000,2.5
q2,2026-10-06 06:00:00.000,2026-10-06 07:00:00.000,UTC+0300,1002,6000,
`;
  const p = parseHealthConnect(samsungExport([{ name: 'com.samsung.shealth.exercise.1.csv', text: csv }]).body, 'Europe/Bucharest');
  assert.equal(p.workouts.find((w) => w.date === '2026-10-05')!.minutes, 40);
  assert.equal(p.workouts.find((w) => w.date === '2026-10-06')!.minutes, 60);
});
