import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { scoreWorkout } from '../src/scoring/score.js';
import type { Activity, PlannedWorkout } from '../src/types.js';

const planned: PlannedWorkout = {
  id: 'w1',
  date: '2026-11-03',
  sport: 'alergare',
  type: 'z2',
  plannedMinutes: 50,
  targetZones: [2],
  key: false,
  status: 'planificat',
};

const activity = (over: Partial<Activity> = {}): Activity => ({
  id: 'a1',
  date: '2026-11-03',
  sport: 'alergare',
  minutes: 50,
  timeInZonesMin: { 1: 5, 2: 40, 3: 5 },
  ...over,
});

describe('scoreWorkout', () => {
  it('verde când durata, zona și RPE sunt în țintă', () => {
    const r = scoreWorkout({ planned, activity: activity(), questionnaire: { rpe: 4, painScore: 0 }, today: '2026-11-03' });
    assert.equal(r.color, 'verde');
    assert.equal(r.metrics.durationPct, 100);
    assert.equal(r.metrics.zonePct, 80);
    assert.equal(r.final, true);
  });

  it('galben când durata e 75–90% sau RPE +2', () => {
    assert.equal(scoreWorkout({ planned, activity: activity({ minutes: 42 }), questionnaire: { rpe: 4 }, today: '2026-11-03' }).color, 'galben');
    assert.equal(scoreWorkout({ planned, activity: activity(), questionnaire: { rpe: 6 }, today: '2026-11-03' }).color, 'galben');
  });

  it('galben la derivație cardiacă peste 8% la același efort', () => {
    const r = scoreWorkout({
      planned,
      activity: activity({ firstThirdHr: 140, lastThirdHr: 154, firstThirdOutput: 200, lastThirdOutput: 201 }),
      questionnaire: { rpe: 4 },
      today: '2026-11-03',
    });
    assert.equal(r.color, 'galben');
    assert.equal(r.flags.cardiacDrift, true);
  });

  it('portocaliu când zona e sub 50% sau durere 3–4', () => {
    assert.equal(scoreWorkout({ planned, activity: activity({ timeInZonesMin: { 2: 20, 3: 30 } }), questionnaire: { rpe: 4 }, today: '2026-11-03' }).color, 'portocaliu');
    const r2 = scoreWorkout({ planned, activity: activity(), questionnaire: { rpe: 4, painScore: 3 }, today: '2026-11-03' });
    assert.equal(r2.color, 'portocaliu');
    assert.equal(r2.flags.escalate, false);
  });

  it('durere ≥ 5 → portocaliu cu escaladare', () => {
    const r = scoreWorkout({ planned, activity: activity(), questionnaire: { rpe: 4, painScore: 6 }, today: '2026-11-03' });
    assert.equal(r.color, 'portocaliu');
    assert.equal(r.flags.escalate, true);
  });

  it('roșu sub 50% din durată și roșu după închiderea ferestrei fără activitate', () => {
    assert.equal(scoreWorkout({ planned, activity: activity({ minutes: 20 }), questionnaire: { rpe: 4 }, today: '2026-11-03' }).color, 'rosu');
    assert.equal(scoreWorkout({ planned, activity: null, today: '2026-11-05' }).color, 'rosu');
  });

  it('așteptare cât timp fereastra e deschisă; gri când e anulat de sistem', () => {
    assert.equal(scoreWorkout({ planned, activity: null, today: '2026-11-04' }).color, 'asteptare');
    assert.equal(scoreWorkout({ planned, activity: null, systemCancelled: true, today: '2026-11-04' }).color, 'gri');
  });

  it('fără chestionar: culoarea nu e definitivă în prima zi și devine definitivă după 24 h', () => {
    const r = scoreWorkout({ planned, activity: activity(), today: '2026-11-03' });
    assert.equal(r.color, 'verde');
    assert.equal(r.final, false);
    assert.equal(r.flags.noQuestionnaire, true);
    assert.equal(scoreWorkout({ planned, activity: activity(), today: '2026-11-05' }).final, true);
  });

  it('fără date de zone, criteriul de zonă nu se aplică și verde rămâne posibil', () => {
    const r = scoreWorkout({ planned, activity: activity({ timeInZonesMin: null }), questionnaire: { rpe: 4 }, today: '2026-11-03' });
    assert.equal(r.color, 'verde');
    assert.equal(r.flags.noZoneData, true);
  });

  it('ședință de calitate: intervalele în țintă decid zona; set abandonat = portocaliu', () => {
    const q: PlannedWorkout = { ...planned, type: 'calitate', targetZones: [4, 5], key: true };
    assert.equal(scoreWorkout({ planned: q, activity: activity({ intervalsHitPct: 80 }), questionnaire: { rpe: 7 }, today: '2026-11-03' }).color, 'verde');
    assert.equal(
      scoreWorkout({ planned: q, activity: activity({ intervalsHitPct: 80, mainSetAbandoned: true }), questionnaire: { rpe: 7 }, today: '2026-11-03' }).color,
      'portocaliu',
    );
  });
});
