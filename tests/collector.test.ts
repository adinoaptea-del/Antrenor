import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { acwr, buildPacket, dedupeActivities, mergeWellness } from '../src/collector/packet.js';
import type { CollectorInput, SourceActivity, SourceDaily } from '../src/collector/types.js';
import type { PlannedWorkout } from '../src/types.js';
import { activities, wellness } from './fixtures/cuza_2026-10-16.js';

const plan: PlannedWorkout[] = [
  { id: 'v', date: '2026-10-16', sport: 'alergare', type: 'z2', plannedMinutes: 40, targetZones: [1, 2], key: false, status: 'planificat', structure: 'continuu, conversațional' },
  { id: 's', date: '2026-10-17', sport: 'bicicleta', type: 'z2', plannedMinutes: 60, targetZones: [2], key: false, status: 'planificat' },
];

const base: CollectorInput = {
  today: '2026-10-16',
  event: 'dimineata',
  athlete: { obiectiv: 'Ironman 70.3 România, 2027-09-12', raceDate: '2027-09-12', phase: 'evaluare', weekLabel: 'săptămâna de evaluare' },
  wellness,
  activities,
  plan,
  zones: null,
  morning: null,
  evenings: [],
  labs: null,
  load: { ctl: 27.2, atl: 29.2, tsb: -6.3, source: 'athletedata' },
  aviz: { cardiolog: 'nu', intensitate_permisa: 'Z2' },
};

describe('colector · pachet', () => {
  it('ia valorile de azi și mediile pe 7 zile din Whoop, fără să inventeze baseline-ul sub 14 zile', () => {
    const p = buildPacket(base);
    assert.equal(p.hrv.azi, 27.9);
    assert.equal(p.hrv.media7, 24.1); // media celor 7 zile dinaintea zilei de azi
    assert.equal(p.hrv.baseline60, null, 'doar 8 zile de istoric: fără baseline');
    assert.equal(p.puls_repaus.azi, 67);
    assert.equal(p.somn.durata, '6:26');
    assert.equal(p.somn.ora_culcare, '01:08');
    assert.equal(p.somn.media7_durata, '7:00');
    assert.equal(p.readiness.scor_producator, 80);
    assert.equal(p.meta.zile_pana_la_cursa, 331);
    assert.equal(p.meta.zi_saptamana, 'vineri');
  });

  it('formularele lipsă dau null, nu 0: hooper, semnale, chestionarul de seară', () => {
    const p = buildPacket(base);
    assert.equal(p.readiness.hooper.suma, null);
    assert.equal(p.semnale.simptom_cardiac, null);
    assert.equal(p.antrenament_ultim?.rpe, null);
  });

  it('formularul de dimineață și cel de seară intră în pachet', () => {
    const p = buildPacket({
      ...base,
      morning: { date: '2026-10-16', hooper: { somn: 3, oboseala: 4, stres: 5, dureri: 2 }, semnale: { boala: false, febra: false, deplasare: false, simptom_cardiac: false } },
      evenings: [{ date: '2026-10-15', activityId: '24731779624', rpe: 6, fata_de_asteptari: 'la_fel', durere: { scor: 0, loc: null }, ce_a_incurcat: 'nimic', fueling_conform: 'da', comentariu: null }],
    });
    assert.equal(p.readiness.hooper.suma, 14);
    assert.equal(p.semnale.febra, false);
    assert.equal(p.antrenament_ultim?.rpe, 6);
    assert.equal(p.antrenament_ultim?.sport, 'forta');
  });

  it('orele pe sport în 7 zile ies din activitățile dedupe-uite (Garmin + Strava = o singură cursă)', () => {
    const p = buildPacket(base);
    assert.equal(p.incarcare.ore_7z.alergare, 2.9);
    assert.equal(p.incarcare.ore_7z.inot, 2.8);
    assert.equal(p.incarcare.ore_7z.forta, 1.9);
    assert.equal(p.incarcare.ore_7z.bicicleta, 0);
    assert.equal(p.incarcare.sedinte_7z, 8);
    assert.equal(dedupeActivities(activities).length, 8);
  });

  it('ACWR e null sub 4 săptămâni de istoric și pe sport când sportul n-are volum', () => {
    const p = buildPacket(base);
    assert.equal(p.incarcare.acwr, null);
    assert.equal(p.incarcare.acwr_sport.bicicleta, null);
    // Cu 5 săptămâni de istoric sintetic: 3 alergări pe săptămână a 40 min, apoi o săptămână dublă.
    const acts: SourceActivity[] = [];
    for (let w = 0; w < 5; w++) for (const d of [0, 2, 4]) acts.push({ id: `${w}${d}`, externalId: `${w}${d}`, source: 'garmin', date: addDays('2026-09-07', w * 7 + d), sport: 'alergare', minutes: w === 4 ? 80 : 40 });
    assert.equal(acwr(acts, '2026-10-12', 'alergare'), 1.6);
  });

  it('cursa din afara planului e marcată in_plan = false și păstrează răspunsul sportivului', () => {
    const p = buildPacket({
      ...base,
      today: '2026-10-12',
      plan: [],
      evenings: [{ date: '2026-10-11', activityId: '24681877392', rpe: 9, fata_de_asteptari: 'mai_greu', durere: { scor: 2, loc: 'gambă' }, ce_a_incurcat: 'nimic', fueling_conform: 'partial', comentariu: 'semimaraton', tip_neplanificat: 'cursa' }],
    });
    assert.equal(p.antrenament_ultim?.distanta, 21.4);
    assert.equal(p.antrenament_ultim?.in_plan, false);
    assert.equal(p.antrenament_ultim?.tip_neplanificat, 'cursa');
    assert.equal(p.antrenament_ultim?.fc_max, 187);
  });

  it('arbitrajul: somnul e media surselor, HRV-ul vine de la Whoop când există', () => {
    const rows: SourceDaily[] = [
      { date: '2026-10-16', source: 'garmin', hrv: 40, rhr: 52, sleepMin: 400 },
      { date: '2026-10-16', source: 'whoop', hrv: 28, rhr: 67, sleepMin: 386 },
    ];
    const m = mergeWellness(rows)[0]!;
    assert.equal(m.sleepMin, 393);
    assert.equal(m.hrv, 28);
    assert.equal(m.sources.somn, 'whoop+garmin');
  });

  it('media între brățări: după 7 zile comune Garmin e adus la scala Whoop și intră în medie', () => {
    const rows: SourceDaily[] = [];
    for (let i = 1; i <= 8; i++) {
      const d = addDays('2026-10-08', i);
      rows.push({ date: d, source: 'whoop', hrv: 30 + i, rhr: 60, sleepMin: 420 });
      rows.push({ date: d, source: 'garmin', hrv: 40 + i, rhr: 56, sleepMin: 430 });
    }
    // Ultima zi: Garmin arată mai prost decât de obicei.
    rows.push({ date: '2026-10-17', source: 'whoop', hrv: 40, rhr: 60, sleepMin: 400 });
    rows.push({ date: '2026-10-17', source: 'garmin', hrv: 44, rhr: 58, sleepMin: 400 });
    const m = mergeWellness(rows)[0]!;
    assert.equal(m.date, '2026-10-17');
    // Offset Garmin ≈ -9,3 (9 zile comune); 44 - 9,3 = 34,7; media cu Whoop 40 = 37,3.
    assert.equal(m.hrv, 37.3);
    // Puls: Garmin 58 + 4 = 62; media cu 60 = 61.
    assert.equal(m.rhr, 61);
    assert.equal(m.sources.hrv, 'whoop+garmin');
    assert.equal(m.perDevice.garmin?.hrv, 44);
  });

  it('o zi fără Whoop nu sare: Garmin singur e adus la scala Whoop', () => {
    const rows: SourceDaily[] = [];
    for (let i = 1; i <= 8; i++) {
      const d = addDays('2026-10-08', i);
      rows.push({ date: d, source: 'whoop', hrv: 30, rhr: 60 });
      rows.push({ date: d, source: 'garmin', hrv: 40, rhr: 60 });
    }
    rows.push({ date: '2026-10-17', source: 'garmin', hrv: 41, rhr: 60 });
    assert.equal(mergeWellness(rows)[0]!.hrv, 31);
  });

  it('dezacordul mare între brățări e semnalat, nu ascuns în medie', () => {
    const rows: SourceDaily[] = [
      { date: '2026-10-16', source: 'whoop', hrv: 30, rhr: 55, sleepMin: 300 },
      { date: '2026-10-16', source: 'oura', hrv: 50, rhr: 63, sleepMin: 420 },
    ];
    const m = mergeWellness(rows)[0]!;
    assert.equal(m.disagreements.length, 3);
  });

  it('aceeași zi trimisă de două ori de aceeași brățară nu se dublează', () => {
    const rows: SourceDaily[] = [
      { date: '2026-10-16', source: 'whoop', hrv: 30, sleepMin: 400 },
      { date: '2026-10-16', source: 'whoop', hrv: 32, sleepMin: 400 },
      { date: '2026-10-16', source: 'garmin', sleepMin: 420 },
    ];
    const m = mergeWellness(rows)[0]!;
    assert.equal(m.hrv, 32);
    assert.equal(m.sleepMin, 410);
  });
});

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

it('aderenta_14z: sărite doar când există activități de la brățară', () => {
  const base = (acts: unknown[]) => ({
    today: '2026-10-16', event: 'dimineata' as const,
    athlete: { obiectiv: '70.3', raceDate: '2027-09-12', phase: 'baza' as never },
    wellness: [], activities: acts as never, zones: null, morning: null, evenings: [], aviz: { cardiolog: 'nu', intensitate_permisa: 'Z2' as never },
    plan: [
      { id: 'a', date: '2026-10-13', sport: 'alergare', type: 'z2', plannedMinutes: 45, targetZones: [2], key: false, status: 'planificat' },
      { id: 'b', date: '2026-10-14', sport: 'inot', type: 'tehnica', plannedMinutes: 30, targetZones: [2], key: true, status: 'planificat' },
    ] as never,
  });
  assert.equal(buildPacket(base([])).aderenta_14z, null);
  const run = { source: 'strava', externalId: 'x', date: '2026-10-13', sport: 'alergare', durationMin: 46 };
  const p = buildPacket(base([run]));
  assert.equal(p.aderenta_14z?.planificate, 2);
  assert.equal(p.aderenta_14z?.facute, 1);
  assert.deepEqual(p.aderenta_14z?.sarite, [{ data: '2026-10-14', sport: 'inot', cheie: true }]);
});

describe('progresStatus', () => {
  const inp = (h: { greenStreak: number; lastIncrease: string | null } | null) => ({ today: '2026-11-08', history: h }) as unknown as CollectorInput;
  const sport = { inot: 1.0, bicicleta: 1.1, alergare: 1.0, forta: null };
  it('eligibil doar cu toate condițiile', async () => {
    const { progresStatus } = await import('../src/collector/packet.js');
    assert.equal(progresStatus(inp({ greenStreak: 8, lastIncrease: null }), 1.1, sport, { planificate: 10, facute: 9 }).eligibil, true);
    assert.equal(progresStatus(inp({ greenStreak: 6, lastIncrease: null }), 1.1, sport, { planificate: 10, facute: 9 }).eligibil, false);
    assert.equal(progresStatus(inp({ greenStreak: 8, lastIncrease: null }), 1.1, { ...sport, alergare: 1.35 }, { planificate: 10, facute: 9 }).eligibil, false);
    assert.equal(progresStatus(inp({ greenStreak: 8, lastIncrease: '2026-11-01' }), 1.1, sport, { planificate: 10, facute: 9 }).eligibil, false);
    assert.equal(progresStatus(inp({ greenStreak: 8, lastIncrease: null }), 1.1, sport, { planificate: 10, facute: 7 }).eligibil, false);
    assert.equal(progresStatus(inp(null), 1.1, sport, { planificate: 10, facute: 9 }).eligibil, false);
  });
});

describe('analize: valabile 12 luni', () => {
  it('expiră după 365 de zile', async () => {
    const { labsExpired } = await import('../src/util/dates.js');
    assert.equal(labsExpired('2025-10-16', '2026-10-16'), false);
    assert.equal(labsExpired('2025-10-15', '2026-10-16'), true);
  });
});

import { pickRecording, sameSession } from '../src/collector/packet.js';
describe('aceeași ședință pe două brățări', () => {
  const run = (o: Partial<SourceActivity>): SourceActivity => ({ id: 'x', externalId: 'x', source: 'strava', date: '2026-10-11', sport: 'alergare', minutes: 127, startLocal: '10:45', ...o }) as SourceActivity;
  it('ceasul uitat pornit după oprire: aceeași distanță, puls mic pe minutele în plus → cea scurtă', () => {
    const s = run({ id: 's', minutes: 127, distanceKm: 21.4, avgHr: 165 });
    const l = run({ id: 'l', source: 'apple', minutes: 141, distanceKm: 21.4, avgHr: 156 });
    assert.ok(sameSession(s, l));
    assert.equal(pickRecording(s, l).id, 's');
  });
  it('brățara oprită prea devreme: cea lungă are distanță în plus → cea lungă', () => {
    const s = run({ id: 's', source: 'whoop', minutes: 22, distanceKm: null, avgHr: 150, startLocal: '10:50' });
    const l = run({ id: 'l', minutes: 127, distanceKm: 21.4, avgHr: 165 });
    assert.ok(sameSession(s, l));
    assert.equal(pickRecording(s, l).id, 'l');
  });
  it('fără distanță: puls susținut pe minutele în plus → cea lungă', () => {
    const s = run({ id: 's', minutes: 40, avgHr: 150 });
    const l = run({ id: 'l', minutes: 60, avgHr: 152 });
    assert.equal(pickRecording(s, l).id, 'l');
  });
  it('fără distanță, câteva minute în plus: diferența de senzor nu fabrică efort → cea scurtă', () => {
    const s = run({ id: 's', minutes: 60, avgHr: 150 });
    const l = run({ id: 'l', source: 'apple', minutes: 63, avgHr: 155 });
    assert.equal(pickRecording(s, l).id, 's');
  });
  it('aceeași sursă sau fără ore și fără distanțe: rămân două ședințe', () => {
    assert.equal(sameSession(run({ id: 'a', startLocal: null }), run({ id: 'b', source: 'apple', startLocal: null })), false);
    assert.equal(sameSession(run({ id: 'a' }), run({ id: 'b' })), false);
  });
  it('GPS diferit cu 0,4 km pe 21 km și minute de mers după → tot cea scurtă', () => {
    const s = run({ id: 's', minutes: 127, distanceKm: 21.1 });
    const l = run({ id: 'l', source: 'apple', minutes: 135, distanceKm: 21.5 });
    assert.equal(pickRecording(s, l).id, 's');
  });
  it('două alergări diferite în aceeași zi (dimineața și seara) nu se unesc', () => {
    assert.equal(sameSession(run({ startLocal: '07:00', minutes: 40 }), run({ startLocal: '19:00', minutes: 40 })), false);
  });
});
