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

  it('ieșitul din zonă nu e greșit: galben, eficiență mai mică, direcția „mai tare”; durerea 3–4 rămâne portocaliu', () => {
    const z = scoreWorkout({ planned, activity: activity({ timeInZonesMin: { 2: 20, 3: 30 } }), questionnaire: { rpe: 4 }, today: '2026-11-03' });
    assert.equal(z.color, 'galben');
    assert.equal(z.metrics.directie, 'mai_tare');
    assert.ok((z.metrics.eficienta ?? 0) < 100 && (z.metrics.eficienta ?? 0) >= 60);
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

  it('așteptare doar în ziua ședinței; de a doua zi, fără activitate, e nefăcută; gri când e anulat de sistem', () => {
    assert.equal(scoreWorkout({ planned, activity: null, today: '2026-11-03' }).color, 'asteptare');
    assert.equal(scoreWorkout({ planned, activity: null, today: '2026-11-04' }).color, 'rosu');
    assert.equal(scoreWorkout({ planned, activity: null, systemCancelled: true, today: '2026-11-04' }).color, 'gri');
  });

  it('fără chestionar: culoarea nu e definitivă în prima zi și devine definitivă după 24 h', () => {
    const r = scoreWorkout({ planned, activity: activity(), today: '2026-11-03' });
    assert.equal(r.color, 'verde');
    assert.equal(r.final, false);
    assert.equal(r.flags.noQuestionnaire, true);
    assert.equal(scoreWorkout({ planned, activity: activity(), today: '2026-11-05' }).final, true);
  });

  // Auditul v93, A72: culoarea rămâne verde (decizia proprietarului pe culori), dar evaluarea e marcată parțială:
  // „parțial — intensitate necunoscută” în motive (printre primele două, cât arată ecranele) și conform scopului = necunoscut.
  it('fără date de zone, criteriul de zonă nu se aplică: verde posibil, dar „parțial — intensitate necunoscută”', () => {
    const r = scoreWorkout({ planned, activity: activity({ timeInZonesMin: null }), questionnaire: { rpe: 4 }, today: '2026-11-03' });
    assert.equal(r.color, 'verde');
    assert.equal(r.flags.noZoneData, true);
    assert.equal(r.flags.intensityUnknown, true);
    assert.ok(r.reasons.slice(0, 2).some((x) => x.startsWith('parțial — intensitate necunoscută')), r.reasons.join(' | '));
    assert.equal(r.evaluare?.conformScop, null);
    assert.equal(r.evaluare?.partial, true);
  });

  it('ședință de calitate: intervalele în țintă decid zona; set abandonat = portocaliu', () => {
    const q: PlannedWorkout = { ...planned, type: 'calitate', targetZones: [4, 5], key: true };
    assert.equal(scoreWorkout({ planned: q, activity: activity({ intervalsHitPct: 80 }), questionnaire: { rpe: 7 }, today: '2026-11-03' }).color, 'verde');
    assert.equal(
      scoreWorkout({ planned: q, activity: activity({ intervalsHitPct: 80, mainSetAbandoned: true }), questionnaire: { rpe: 7 }, today: '2026-11-03' }).color,
      'portocaliu',
    );
  });

  it('altă ședință mai tare în aceeași zi nu repară zona ratată aici: rămâne doar observație', () => {
    const easy = activity({ timeInZonesMin: { 1: 30, 2: 20 } });
    const alone = scoreWorkout({ planned, activity: easy, questionnaire: { rpe: 4 }, today: '2026-11-03' });
    const comp = scoreWorkout({ planned, activity: easy, questionnaire: { rpe: 4 }, today: '2026-11-03', sameDay: [{ sport: 'alergare', directie: 'mai_tare' }] });
    assert.equal(alone.metrics.directie, 'mai_usor');
    assert.equal(alone.color, 'galben');
    assert.equal(comp.color, 'galben');
    assert.ok(comp.metrics.compensat);
    assert.equal(comp.metrics.eficienta, alone.metrics.eficienta);
  });

  it('un minut de puls într-o ședință de 50 min: intensitate neevaluată, nu 100% în zonă', () => {
    const r = scoreWorkout({ planned, activity: activity({ timeInZonesMin: { 2: 1 } }), questionnaire: { rpe: 4 }, today: '2026-11-03' });
    assert.equal(r.metrics.zonePct, null);
    assert.ok(r.reasons.some((x) => x.includes('neevaluată')));
  });

  it('nefăcut: marcat ca ratat, fără eficiență', () => {
    const r = scoreWorkout({ planned, activity: null, today: '2026-11-10' });
    assert.equal(r.flags.missed, true);
    assert.equal(r.metrics.eficienta, undefined);
  });
});
