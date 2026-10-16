// Regresiile din auditul din 17.10.2026: fiecare test reproduce un caz găsit în audit și cere comportamentul corect.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildPacket } from '../src/collector/packet.js';
import type { CollectorInput } from '../src/collector/types.js';
import { runPyramid, safetyDecision, type ModelClient } from '../src/agents/runner.js';
import { PROMPTS } from '../src/prompts/bundle.js';
import { adapt, eventKey } from '../src/calendar/adapt.js';
import { generatePlan } from '../src/calendar/generate.js';
import { enforceLimits, limitViolations } from '../src/calendar/validate.js';
import { morningSafetyEvents, painSafetyEvents } from '../src/calendar/safety.js';
import { scoreWorkout } from '../src/scoring/score.js';
import { measurementClaims, verifyResponse } from '../src/agents/verify.js';
import { PPL, dosed } from '../src/strength/ppl.js';
import { localDayStartUtc } from '../src/util/dates.js';
import { appleActivityId, appleOtherId, wellnessGroups } from '../server/webhooks/apple.js';
import { isActiveWorkout, type PlannedWorkout } from '../src/types.js';
import type { FreeBlock } from '../src/types.js';

const blocks: FreeBlock[] = [
  { day: 0, startMin: 6 * 60, endMin: 9 * 60 },
  { day: 1, startMin: 6 * 60, endMin: 9 * 60 },
  { day: 2, startMin: 12 * 60 + 30, endMin: 15 * 60 },
  { day: 3, startMin: 12 * 60 + 30, endMin: 15 * 60 },
  { day: 3, startMin: 19 * 60 + 30, endMin: 21 * 60 },
  { day: 4, startMin: 12 * 60 + 30, endMin: 15 * 60 },
  { day: 5, startMin: 8 * 60, endMin: 13 * 60 },
  { day: 6, startMin: 8 * 60, endMin: 12 * 60 },
];

const base: CollectorInput = {
  today: '2026-10-16',
  event: 'dimineata',
  athlete: { obiectiv: 'Ironman 70.3', raceDate: '2027-09-26', phase: 'evaluare' },
  wellness: [],
  activities: [],
  plan: [{ id: 'a', date: '2026-10-16', sport: 'alergare', type: 'z2', plannedMinutes: 60, targetZones: [2], key: false, status: 'planificat' }],
  zones: null,
  morning: { date: '2026-10-16', hooper: { somn: 3, oboseala: 3, stres: 3, dureri: 3 }, semnale: { boala: false, febra: true, deplasare: false, simptom_cardiac: true } },
  evenings: [],
  load: null,
  aviz: { cardiolog: 'nu', intensitate_permisa: 'Z2' },
};

const ctx = { today: '2026-10-16', freeBlocks: [], recentKeyScores: [] };

describe('audit 1 · siguranța nu depinde de AI', () => {
  it('febră + simptom cardiac, modelul aruncă eroare la fiecare apel → stop, evenimente de protecție, mesaj cu 112', async () => {
    const broken: ModelClient = { json: () => Promise.reject(new Error('timeout')) };
    const p = buildPacket(base);
    assert.equal(safetyDecision(p), 'stop');
    const r = await runPyramid({ packet: p, files: {}, journal: [], prompts: PROMPTS, models: { specialist: 's', head: 'h' } }, broken);
    assert.equal(r.decision, 'stop');
    assert.equal(r.fallbackUsed, true);
    assert.ok(r.failures.length >= 2);
    assert.ok(r.events.some((e) => e.kind === 'febra'));
    assert.ok(r.events.some((e) => e.kind === 'readiness' && e.verdict === 'stop'));
    assert.match(r.head.mesaj, /112/);
  });

  it('JSON invalid de la un specialist nu oprește restul piramidei', async () => {
    const p = buildPacket({ ...base, morning: { ...base.morning!, semnale: { boala: false, febra: false, deplasare: false, simptom_cardiac: false } } });
    const client: ModelClient = {
      async json<T>(req: { system: string }): Promise<T> {
        if (/NUTRITIONIST/.test(req.system)) throw new Error('model: răspuns incomplet');
        if (/HEAD COACH/i.test(req.system)) return { decizie: 'galben', mesaj: 'Azi ușor.', memento: '', jurnal: [], intrebare: null } as T;
        return { agent: 'x', verdict: 'tacere', ce: [], pentru_viitor: '-', lipseste: [] } as T;
      },
    };
    const r = await runPyramid({ packet: p, files: {}, journal: [], prompts: PROMPTS, models: { specialist: 's', head: 'h' } }, client);
    assert.ok(r.failures.some((f) => f.startsWith('nutritionist')));
    assert.equal(r.head.mesaj, 'Azi ușor.');
  });

  it('chestionarul de dimineață produce protecția la salvare: cardiac/febră = stop, boală = roșu', () => {
    const c = morningSafetyEvents('2026-10-16', { simptom_cardiac: true });
    assert.equal(c.verdict, 'stop');
    assert.match(c.message ?? '', /112/);
    assert.deepEqual(morningSafetyEvents('2026-10-16', { boala: true }).verdict, 'rosu');
    assert.equal(morningSafetyEvents('2026-10-16', {}).events.length, 0);
    const pain = painSafetyEvents('2026-10-16', { scor: 7, loc: 'genunchi' });
    assert.equal(pain.events[0]?.kind, 'durere');
    assert.match(pain.message ?? '', /fizioterapeut/);
  });
});

describe('audit 2 · o ședință mutată rămâne activă', () => {
  it('ședință „mutat” de 60 min + stop → anulată', () => {
    const plan: PlannedWorkout[] = [{ id: 'm', date: '2026-10-16', sport: 'alergare', type: 'z2', plannedMinutes: 60, targetZones: [2], key: false, status: 'mutat' }];
    assert.ok(isActiveWorkout(plan[0]!));
    const r = adapt(plan, { kind: 'readiness', date: '2026-10-16', verdict: 'stop' }, ctx);
    assert.equal(r.plan[0]!.status, 'anulat_sistem');
  });

  it('planul zilei din pachet include ședințele mutate și toate ședințele zilei', () => {
    const p = buildPacket({
      ...base,
      morning: undefined,
      plan: [
        { id: 'm', date: '2026-10-16', sport: 'bicicleta', type: 'z2', plannedMinutes: 60, targetZones: [2], key: false, status: 'mutat' },
        { id: 'n', date: '2026-10-16', sport: 'inot', type: 'tehnica', plannedMinutes: 30, targetZones: [1, 2], key: false, status: 'planificat' },
      ],
    });
    assert.ok(p.plan_azi);
    assert.equal(p.plan_azi_toate.length, 2);
  });
});

describe('audit 3 · validatorul final al planului', () => {
  it('Z2 + fără 400 m continuu: niciun săptămână, de la evaluare la taper, nu trece de limite', () => {
    const r = generatePlan({ startDate: '2026-10-19', raceDate: '2027-09-26', goal: '70.3', freeBlocks: blocks, historyHoursPerWeek: [6, 6, 6, 6], intensityAllowed: 'Z2', swimContinuous400: false });
    assert.equal(r.ok, true);
    if (!r.ok) return;
    const all = r.weeks.flatMap((w) => w.workouts);
    assert.deepEqual(limitViolations(all, { intensityAllowed: 'Z2', swimContinuous400: false }), []);
    assert.ok(!all.some((w) => /continuu/.test(w.structure ?? '') && w.sport === 'inot'));
  });

  it('cu aviz și 400 m continuu, peak-ul păstrează înotul pe distanța cursei', () => {
    const r = generatePlan({ startDate: '2026-10-19', raceDate: '2027-09-26', goal: '70.3', freeBlocks: blocks, historyHoursPerWeek: [6, 6, 6, 6], intensityAllowed: 'toate', swimContinuous400: true });
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.ok(r.weeks.flatMap((w) => w.workouts).some((w) => w.sport === 'inot' && /continuu/.test(w.structure ?? '')));
  });

  it('enforceLimits coboară o bicicletă Z3–Z4 din taper la Z2', () => {
    const w: PlannedWorkout = { id: 't', date: '2027-09-20', sport: 'bicicleta', type: 'calitate', plannedMinutes: 40, targetZones: [3, 4], key: false, status: 'planificat', structure: '3 × 5 min la pace de cursă' };
    const out = enforceLimits([w], { intensityAllowed: 'Z2', swimContinuous400: true }).workouts[0]!;
    assert.deepEqual(out.targetZones, [2]);
    assert.equal(out.type, 'z2');
    assert.doesNotMatch(out.structure ?? '', /pace de cursă/);
  });
});

describe('audit 4 · durerea mare se escaladează mereu', () => {
  it('20 din 60 min, durere 7/10 → alertă, chiar dacă ședința e roșie pe durată', () => {
    const r = scoreWorkout({
      planned: { id: 'p', date: '2026-10-16', sport: 'alergare', type: 'z2', plannedMinutes: 60, targetZones: [2], key: false, status: 'planificat' },
      activity: { id: 'a', date: '2026-10-16', sport: 'alergare', minutes: 20 },
      questionnaire: { rpe: 6, painScore: 7, painLoc: 'genunchi' },
      today: '2026-10-16',
    });
    assert.equal(r.color, 'rosu');
    assert.equal(r.flags.escalate, true);
  });
});

describe('audit 6 · importurile Apple sunt izolate pe cont', () => {
  it('aceeași ședință trimisă de doi sportivi primește două ID-uri', () => {
    assert.notEqual(appleActivityId('user-a', 'apple-XYZ'), appleActivityId('user-b', 'apple-XYZ'));
    assert.equal(appleActivityId('user-a', 'apple-XYZ'), 'apple-user-a-XYZ');
    assert.notEqual(appleOtherId('user-a', 'X'), appleOtherId('user-b', 'X'));
  });
});

describe('audit 7 · evenimentele se aplică o singură dată', () => {
  it('cheia evenimentului e stabilă și febra a doua zi nu mai înjumătățește a doua oară', () => {
    const ev = { kind: 'febra' as const, date: '2026-10-16' };
    assert.equal(eventKey(ev), eventKey({ ...ev }));
    const plan: PlannedWorkout[] = [{ id: 'f', date: '2026-10-21', sport: 'bicicleta', type: 'z2', plannedMinutes: 60, targetZones: [2], key: false, status: 'planificat' }];
    const once = adapt(plan, ev, ctx).plan;
    assert.equal(once[0]!.plannedMinutes, 30);
    const twice = adapt(once, { kind: 'febra', date: '2026-10-17' }, ctx).plan;
    assert.equal(twice[0]!.plannedMinutes, 30);
  });
});

describe('audit 12 · un export Apple parțial nu șterge valori', () => {
  it('o zi doar cu HRV nu trimite somn = null', () => {
    const groups = wellnessGroups('u', [
      { date: '2026-10-16', hrv: 40, rhr: null, sleep_min: null, bedtime: null, wake_time: null },
      { date: '2026-10-15', hrv: 38, rhr: 52, sleep_min: 420, bedtime: '23:10', wake_time: '06:30' },
    ]);
    assert.equal(groups.length, 2);
    const hrvOnly = groups.flat().find((r) => r.date === '2026-10-16')!;
    assert.ok(!('sleep_min' in hrvOnly));
    assert.ok(!('rhr' in hrvOnly));
    assert.equal(hrvOnly.hrv, 40);
  });
});

describe('audit 13 · ziua locală', () => {
  it('ziua începe la miezul nopții în fusul sportivului (vară și iarnă)', () => {
    assert.equal(localDayStartUtc('2026-10-17', 'Europe/Bucharest'), '2026-10-16T21:00:00.000Z');
    assert.equal(localDayStartUtc('2026-12-01', 'Europe/Bucharest'), '2026-11-30T22:00:00.000Z');
    assert.equal(localDayStartUtc('2026-10-25', 'Europe/Bucharest'), '2026-10-24T21:00:00.000Z');
  });
});

describe('audit 14 · o „regulă” nu poate acoperi o măsurătoare', () => {
  it('„Pulsul tău este 250 bpm” cu camp=regula este respins', () => {
    const r = verifyResponse({ agent: 'fiziolog', verdict: 'verde', ce: [{ text: 'Pulsul tău este 250 bpm', cifre: [{ valoare: 250, camp: 'regula' }] }], pentru_viitor: '-', lipseste: [] }, { puls_repaus: { azi: 52 } });
    assert.equal(r.ce[0]!.stare, 'respins');
  });

  it('o prescripție rămâne acceptată', () => {
    const r = verifyResponse({ agent: 'antrenor_alergare', verdict: 'ok', ce: [{ text: '10 min încălzire, apoi 3 × 5 min ușor', cifre: [{ valoare: 10, camp: 'prescriptie' }, { valoare: 3, camp: 'prescriptie' }, { valoare: 5, camp: 'prescriptie' }] }], pentru_viitor: '-', lipseste: [] }, {});
    assert.equal(r.ce[0]!.stare, 'acceptat');
    assert.deepEqual(measurementClaims('somn 6:26, HRV 48 ms'), [48]);
  });
});

describe('audit 21 · forța în faza de învățare', () => {
  it('fără rest-pause, fără seturi „max” și fără setul interzis readus', () => {
    for (const day of PPL) {
      const d = dosed(day, 'invatare');
      for (const e of d.exercises) {
        assert.ok(e.sets.length > 0);
        assert.ok(!e.sets.some((s) => s.kind === 'restpause' || s.kind === 'max'), `${day.id} ${e.name}`);
      }
    }
  });
});
