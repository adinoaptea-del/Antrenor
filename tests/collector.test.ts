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
