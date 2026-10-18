import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeWhoopNight, normalizeWhoopWorkout, whoopConfig } from '../src/collector/providers/whoop.js';
import { normalizeStravaActivity, stravaConfig } from '../src/collector/providers/strava.js';
import { normalizeOuraNight } from '../src/collector/providers/oura.js';
import { authorizeUrl, localDate, localHm } from '../src/collector/providers/oauth.js';

describe('adaptoare de producător', () => {
  it('noaptea Whoop din 16 oct 2026 (forma v2 reală) → ziua trezirii, culcare 01:08, 386 min dormite', () => {
    const night = normalizeWhoopNight(
      {
        id: '745de569',
        user_id: 1,
        start: '2026-10-15T22:08:52.530Z',
        end: '2026-10-16T04:57:21.070Z',
        timezone_offset: '+03:00',
        nap: false,
        score_state: 'SCORED',
        score: {
          stage_summary: { total_in_bed_time_milli: 24508540, total_awake_time_milli: 1358020, total_no_data_time_milli: 0, total_light_sleep_time_milli: 13629360, total_slow_wave_sleep_time_milli: 4956100, total_rem_sleep_time_milli: 4565060, sleep_cycle_count: 4, disturbance_count: 12 },
          sleep_needed: { baseline_milli: 27222147, need_from_sleep_debt_milli: 3479765, need_from_recent_strain_milli: 625916, need_from_recent_nap_milli: 0 },
          respiratory_rate: 14.279297,
          sleep_performance_percentage: 82,
        },
      },
      { cycle_id: 1, sleep_id: '745de569', user_id: 1, created_at: '', updated_at: '', score_state: 'SCORED', score: { user_calibrating: false, recovery_score: 80, resting_heart_rate: 67, hrv_rmssd_milli: 27.877893 } },
    );
    assert.ok(night);
    assert.equal(night.date, '2026-10-16');
    assert.equal(night.bedtime, '01:08');
    assert.equal(night.wakeTime, '07:57');
    assert.equal(night.sleepMin, 386);
    assert.equal(night.hrv, 27.9);
    assert.equal(night.rhr, 67);
    assert.equal(night.recoveryScore, 80);
  });

  it('somnul scurt (nap) și nopțile nescorate nu devin zile', () => {
    assert.equal(normalizeWhoopNight({ id: 'n', user_id: 1, start: '2026-10-16T12:00:00Z', end: '2026-10-16T12:40:00Z', timezone_offset: '+03:00', nap: true, score_state: 'SCORED' }, null), null);
  });

  it('antrenamentul Whoop: sport mapat, plimbarea ignorată, zonele Whoop doar ca referință', () => {
    const w = normalizeWhoopWorkout({ id: 'w1', user_id: 1, start: '2026-10-14T16:02:00Z', end: '2026-10-14T16:47:35Z', timezone_offset: '+03:00', sport_name: 'running', score_state: 'SCORED', score: { strain: 9.1, average_heart_rate: 142, max_heart_rate: 154, kilojoule: 1800, percent_recorded: 100, distance_meter: 6007, zone_durations: { zone_zero_milli: 0, zone_one_milli: 600000, zone_two_milli: 1500000, zone_three_milli: 600000, zone_four_milli: 0, zone_five_milli: 0 } } });
    assert.ok(w);
    assert.equal(w.sport, 'alergare');
    assert.equal(w.date, '2026-10-14');
    assert.equal(w.startLocal, '19:02');
    assert.equal(w.minutes, 46);
    assert.equal(w.distanceKm, 6.007); // precizia de la sursă, rotunjirea doar la afișare
    assert.equal(w.timeInZonesMin, null);
    assert.equal(normalizeWhoopWorkout({ id: 'w2', user_id: 1, start: '2026-10-11T10:00:00Z', end: '2026-10-11T10:30:00Z', timezone_offset: '+03:00', sport_name: 'walking', score_state: 'SCORED', score: { strain: 3, average_heart_rate: 90, max_heart_rate: 110, kilojoule: 300, percent_recorded: 100 } }), null);
  });

  it('activitatea Strava: semimaratonul din 11 oct → 21,4 km, 127 min, cadență ×2 la alergare', () => {
    const a = normalizeStravaActivity({ id: 9001, name: 'București Alergare', sport_type: 'Run', start_date_local: '2026-10-11T08:19:17Z', elapsed_time: 7700, moving_time: 7619, distance: 21381.16, average_heartrate: 165.2, max_heartrate: 187, average_cadence: 85.4, average_watts: 295, device_name: 'Garmin fenix 9 Pro' });
    assert.ok(a);
    assert.equal(a.date, '2026-10-11');
    assert.equal(a.startLocal, '08:19');
    assert.equal(a.minutes, 127);
    assert.equal(a.distanceKm, 21.4);
    assert.equal(a.avgCadence, 171);
    assert.equal(a.avgHr, 165);
    assert.equal(a.avgPaceMinKm, 5.93);
    assert.equal(normalizeStravaActivity({ id: 1, name: 'Walk', sport_type: 'Walk', start_date_local: '2026-10-11T18:00:00Z', elapsed_time: 1800, moving_time: 1700, distance: 2000 }), null);
    // Înot în bazin: ședința e de la start la stop (cu pauzele de la perete), nu cele 5 minute de lungimi din moving_time.
    const swim = normalizeStravaActivity({ id: 2, name: 'Înot în bazin', sport_type: 'Swim', start_date_local: '2026-10-12T19:36:45Z', elapsed_time: 2992, moving_time: 300, distance: 450 })!;
    assert.equal(swim.minutes, 50);
    assert.equal(swim.details?.movingMin, 5);
    assert.equal(swim.details?.elapsedMin, 50);
  });

  it('noaptea Oura → rând normalizat; naps ignorate', () => {
    const n = normalizeOuraNight({ id: 'o', day: '2026-10-16', type: 'long_sleep', bedtime_start: '2026-10-16T01:10:00+03:00', bedtime_end: '2026-10-16T07:55:00+03:00', total_sleep_duration: 23400, average_hrv: 31, lowest_heart_rate: 52, efficiency: 90 }, { day: '2026-10-16', score: 78 }, { day: '2026-10-16', score: 81 });
    assert.ok(n);
    assert.equal(n.sleepMin, 390);
    assert.equal(n.bedtime, '01:10');
    assert.equal(n.recoveryScore, 81);
    assert.equal(normalizeOuraNight({ id: 'p', day: '2026-10-16', type: 'late_nap', bedtime_start: '2026-10-16T14:00:00+03:00', bedtime_end: '2026-10-16T14:30:00+03:00', total_sleep_duration: 1800 }, null, null), null);
  });

  it('URL-urile de autorizare au scope-urile și separatorul fiecărui producător', () => {
    const w = authorizeUrl(whoopConfig({ WHOOP_CLIENT_ID: 'id', WHOOP_CLIENT_SECRET: 's', WHOOP_REDIRECT_URI: 'https://antrenor.app/api/oauth/whoop' }), 'st');
    assert.match(w, /^https:\/\/api\.prod\.whoop\.com\/oauth\/oauth2\/auth\?/);
    assert.match(decodeURIComponent(w).replace(/\+/g, ' '), /scope=read:recovery read:cycles read:sleep read:workout read:body_measurement read:profile offline/);
    const s = authorizeUrl(stravaConfig({ STRAVA_CLIENT_ID: 'id', STRAVA_CLIENT_SECRET: 's', STRAVA_REDIRECT_URI: 'https://antrenor.app/api/oauth/strava' }), 'st');
    assert.match(decodeURIComponent(s), /scope=read,activity:read_all/);
    assert.match(s, /approval_prompt=auto/);
  });

  it('ora locală din ISO + offset', () => {
    assert.equal(localHm('2026-10-15T22:08:52.530Z', '+03:00'), '01:08');
    assert.equal(localDate('2026-10-15T22:08:52.530Z', '+03:00'), '2026-10-16');
    assert.equal(localHm('2026-10-16T04:57:21.070Z', '-05:00'), '23:57');
  });
});

describe('Apple Health (Health Auto Export)', () => {
  it('ia HRV (media pe zi), pulsul de repaus și somnul pe ziua trezirii', async () => {
    const { parseHealthExport } = await import('../server/_lib/apple.js');
    const days = parseHealthExport({
      data: {
        metrics: [
          { name: 'heart_rate_variability', units: 'ms', data: [{ date: '2026-10-16 03:10:00 +0300', qty: 40 }, { date: '2026-10-16 05:10:00 +0300', qty: 50 }] },
          { name: 'resting_heart_rate', units: 'count/min', data: [{ date: '2026-10-16 00:00:00 +0300', qty: 52.4 }] },
          { name: 'sleep_analysis', units: 'hr', data: [{ date: '2026-10-16 00:00:00 +0300', totalSleep: 7.25, sleepStart: '2026-10-15 23:40:00 +0300', sleepEnd: '2026-10-16 07:05:00 +0300' }] },
        ],
      },
    });
    assert.deepEqual(days, [{ date: '2026-10-16', hrv: 45, rhr: 52, sleep_min: 435, bedtime: '23:40', wake_time: '07:05' }]);
  });
});

describe('citirea analizelor: calculul din cod', () => {
  it('semnalează ce e în afara intervalului și convertește unitățile', async () => {
    const { finalize } = await import('../server/_lib/labs-extract.js');
    const r = finalize({
      lizibil: true, data_recoltarii: '2026-10-10', laborator: 'Synevo',
      valori: [
        { nume: 'Feritina', cod: 'feritina', valoare: 22, valoare_text: null, unitate: 'ng/mL', ref_min: 30, ref_max: 400, ref_text: '30-400' },
        { nume: '25-OH Vitamina D', cod: 'vitamina_d', valoare: 75, valoare_text: null, unitate: 'nmol/L', ref_min: 75, ref_max: 250, ref_text: '75-250' },
        { nume: 'Hemoglobina', cod: 'hemoglobina', valoare: 152, valoare_text: null, unitate: 'g/L', ref_min: 130, ref_max: 170, ref_text: '130-170' },
        { nume: 'CRP', cod: 'crp', valoare: 0.3, valoare_text: null, unitate: 'mg/dL', ref_min: null, ref_max: 0.5, ref_text: '<0,5' },
        { nume: 'Glicemie', cod: 'altul', valoare: 112, valoare_text: null, unitate: 'mg/dL', ref_min: 70, ref_max: 100, ref_text: '70-100' },
      ],
    });
    assert.deepEqual(r.cele5, { feritina: 22, vitamina_d: 30.05, hemoglobina: 15.2, ck: null, crp: 3 });
    assert.deepEqual(r.valori.map((v) => v.in_afara), ['sub', null, null, null, 'peste']);
  });
});
