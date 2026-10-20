import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { swimPace100, longestContinuousSwim, mergeDetails, stepsFromCadence, stravaDetails } from '../src/collector/details.js';

describe('detaliile ședinței', () => {
  it('pași pe km = cadență × ritm; lungimea pasului din ei', () => {
    assert.deepEqual(stepsFromCadence(170, 6), { stepsPerKm: 1020, strideM: 0.98 });
    assert.deepEqual(stepsFromCadence(null, 6), { stepsPerKm: null, strideM: null });
  });

  it('Strava alergare: cel mai rapid km din best efforts, splits pe km întregi, cadența ×2', () => {
    const d = stravaDetails(
      {
        sport_type: 'Run', distance: 6100, moving_time: 2745, elapsed_time: 2800, average_cadence: 84, total_elevation_gain: 41.6,
        splits_metric: [{ distance: 1000, moving_time: 460, elapsed_time: 460 }, { distance: 1001, moving_time: 452, elapsed_time: 452 }, { distance: 100, moving_time: 40, elapsed_time: 40 }],
        best_efforts: [{ name: '1k', moving_time: 448, elapsed_time: 448 }, { name: '400m', moving_time: 170, elapsed_time: 170 }],
      },
      'alergare',
    );
    assert.equal(d.cadence, 168);
    assert.equal(d.fastestKmSec, 448);
    assert.deepEqual(d.splitsSecPerKm, [460, 452]);
    assert.equal(d.elevGainM, 42);
    assert.equal(d.bestEfforts?.['400 m'], 170);
    assert.equal(d.detailed, true);
  });

  it('Strava înot: ritm pe 100 m și cea mai rapidă tură', () => {
    const d = stravaDetails({ sport_type: 'Swim', distance: 1500, moving_time: 1950, elapsed_time: 2400, laps: [{ distance: 500, moving_time: 640, elapsed_time: 640 }, { distance: 25, moving_time: 20, elapsed_time: 20 }, { distance: 100, moving_time: 118, elapsed_time: 118 }] }, 'inot');
    assert.equal(d.pace100mSec, 130);
    assert.equal(d.fastestLap100mSec, 118);
  });

  it('aceeași ședință din două brățări: se completează, nu se suprascrie', () => {
    assert.deepEqual(mergeDetails({ fastestKmSec: 300, kcal: null }, { kcal: 500, fastestKmSec: 320, strain: 11 }), { fastestKmSec: 300, kcal: 500, strain: 11 });
  });
});

describe('traseu', () => {
  it('ia polyline-ul din rezumatul Strava', () => {
    const d = stravaDetails({ sport_type: 'Run', distance: 5000, moving_time: 1800, elapsed_time: 1800, map: { summary_polyline: '_p~iF~ps|U_ulLnnqC' } }, 'alergare');
    assert.equal(d.polyline, '_p~iF~ps|U_ulLnnqC');
  });
});

describe('înot fără oprire', () => {
  const L = (distance: number, sec: number, paused = 0) => ({ distance, moving_time: sec, elapsed_time: sec + paused });
  it('pauzele (ture fără distanță) întrerup șirul; se ia cel mai lung', () => {
    // ca la ședința reală din 14 oct: 25 m, pauză, 50 m, pauză, 75 m, pauză, 50 m
    const r = longestContinuousSwim([L(25, 14), L(0, 82), L(50, 41), L(0, 20), L(75, 61), L(0, 79), L(50, 30)]);
    assert.equal(r?.m, 75);
    // A03: sub 100 m nu se calculează ritm (o tură scurtă nu spune nimic despre 1.900 m)
    assert.equal(r?.pace100, null);
    assert.equal(longestContinuousSwim([L(50, 41), L(50, 40), L(100, 82)])?.pace100, 82);
  });
  it('A03: ritmul imposibil (0:53/100 m) nu apare nicăieri', () => {
    assert.equal(swimPace100(53, 100), null);
    assert.equal(swimPace100(14, 25), null);
    assert.equal(swimPace100(1500, 1000), 150);
    const d = stravaDetails({ sport_type: 'Swim', distance: 1000, moving_time: 530, elapsed_time: 900, laps: [{ distance: 25, moving_time: 14, elapsed_time: 14 }, { distance: 100, moving_time: 110, elapsed_time: 110 }] } as never, 'inot');
    assert.equal(d.pace100mSec, null);
    assert.equal(d.fastestLap100mSec, 110);
  });
  it('o tură imposibil de rapidă (atingere de perete) nu se numără și rupe șirul', () => {
    assert.equal(longestContinuousSwim([L(25, 30), L(75, 16), L(25, 30)])?.m, 25);
  });
  it('o tură cu pauză în interior nu contează ca înot continuu și nu se leagă de vecine', () => {
    assert.equal(longestContinuousSwim([L(50, 60), L(100, 120, 40), L(50, 60)])?.m, 50);
    // 500 m cu 5 minute oprit în interior nu devin 500 m fără oprire
    // Auditul v93, A41: o singură tură pe toată activitatea = necunoscut (null), nu 0 și nu 500.
    assert.equal(longestContinuousSwim([L(500, 600, 300)]), null);
    assert.equal(longestContinuousSwim([L(1000, 1200)]), null);
    // 20 × 50 m cu 8 s stat în fiecare tură nu sunt 1.000 m continuu.
    assert.equal(longestContinuousSwim(Array.from({ length: 20 }, () => L(50, 60, 8)))?.m, 0);
  });
});
