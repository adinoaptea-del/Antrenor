import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { adapt } from '../src/calendar/adapt.js';
import type { Color, FreeBlock, PlannedWorkout } from '../src/types.js';

const blocks: FreeBlock[] = [
  { day: 0, startMin: 6 * 60, endMin: 9 * 60 },
  { day: 1, startMin: 6 * 60, endMin: 9 * 60 },
  { day: 2, startMin: 12 * 60, endMin: 15 * 60 },
  { day: 3, startMin: 12 * 60, endMin: 15 * 60 },
  { day: 5, startMin: 8 * 60, endMin: 13 * 60 },
  { day: 6, startMin: 8 * 60, endMin: 12 * 60 },
];

// Săptămâna 2026-11-02 (luni) … 2026-11-08 (duminică) și următoarea.
const plan = (): PlannedWorkout[] => [
  { id: 'l1', date: '2026-11-02', sport: 'inot', type: 'tehnica', plannedMinutes: 40, targetZones: [1, 2], key: false, status: 'planificat' },
  { id: 'q1', date: '2026-11-04', sport: 'alergare', type: 'calitate', plannedMinutes: 50, targetZones: [4], key: true, status: 'planificat', intervals: { count: 5, minutes: 4, zone: 5 } },
  { id: 'r1', date: '2026-11-05', sport: 'alergare', type: 'z2', plannedMinutes: 45, targetZones: [2], key: false, status: 'planificat' },
  { id: 'b1', date: '2026-11-07', sport: 'bicicleta', type: 'lung', plannedMinutes: 120, targetZones: [2], key: true, status: 'planificat', step: 3 },
  { id: 'lr1', date: '2026-11-08', sport: 'alergare', type: 'lung', plannedMinutes: 70, targetZones: [2], key: true, status: 'planificat', step: 2 },
  { id: 'b2', date: '2026-11-14', sport: 'bicicleta', type: 'lung', plannedMinutes: 135, targetZones: [2], key: true, status: 'planificat', step: 4 },
  { id: 'r2', date: '2026-11-11', sport: 'alergare', type: 'z2', plannedMinutes: 50, targetZones: [2], key: false, status: 'planificat' },
  { id: 'lr2', date: '2026-11-15', sport: 'alergare', type: 'lung', plannedMinutes: 80, targetZones: [2], key: true, status: 'planificat', step: 3 },
];

const ctx = { today: '2026-11-07', freeBlocks: blocks, recentKeyScores: [] as { date: string; color: Color }[] };

describe('adapt', () => {
  it('roșu pe un antrenament-cheie: următorul de același tip repetă treapta, nu o sare', () => {
    const r = adapt(plan(), { kind: 'scor', workoutId: 'b1', color: 'rosu' }, { ...ctx, recentKeyScores: [{ date: '2026-11-07', color: 'rosu' }] });
    const b2 = r.plan.find((w) => w.id === 'b2')!;
    assert.equal(b2.plannedMinutes, 120);
    assert.equal(b2.step, 3);
    assert.ok(r.changes.some((c) => c.includes('repetă')));
  });

  it('a treia nereușită coboară treapta cu 10%', () => {
    const r = adapt(
      plan(),
      { kind: 'scor', workoutId: 'b1', color: 'portocaliu' },
      { ...ctx, recentKeyScores: [{ date: '2026-11-07', color: 'portocaliu' }], recentRepeats: { 'bicicleta:lung': 2 } },
    );
    assert.equal(r.plan.find((w) => w.id === 'b2')!.plannedMinutes, 110);
  });

  it('două chei slabe în 14 zile: săptămâna următoare −20% pe ședințele ușoare', () => {
    const r = adapt(
      plan(),
      { kind: 'scor', workoutId: 'b1', color: 'rosu' },
      {
        ...ctx,
        recentKeyScores: [
          { date: '2026-11-04', color: 'portocaliu' },
          { date: '2026-11-07', color: 'rosu' },
        ],
      },
    );
    assert.equal(r.plan.find((w) => w.id === 'r2')!.plannedMinutes, 40);
    assert.ok(r.changes.some((c) => c.includes('−20%')));
  });

  it('readiness roșu: ziua devine gri, cheia se mută cu o zi dacă are bloc și nu e altă cheie în 48 h', () => {
    const r = adapt(plan(), { kind: 'readiness', date: '2026-11-04', verdict: 'rosu', reason: 'HRV sub baseline 2 zile' }, { ...ctx, today: '2026-11-04' });
    assert.equal(r.plan.find((w) => w.id === 'q1')!.status, 'anulat_sistem');
    const moved = r.plan.find((w) => w.id === 'q1-mutat');
    assert.equal(moved?.date, '2026-11-05');
    assert.equal(moved?.status, 'mutat');
  });

  it('readiness roșu pe tura lungă de sâmbătă: nu se mută peste alergarea lungă de duminică', () => {
    const r = adapt(plan(), { kind: 'readiness', date: '2026-11-07', verdict: 'rosu' }, ctx);
    assert.equal(r.plan.find((w) => w.id === 'b1')!.status, 'anulat_sistem');
    assert.equal(r.plan.find((w) => w.id === 'b1-mutat'), undefined);
    assert.ok(r.changes.some((c) => c.includes('pierdut')));
  });

  it('galben: planul rămâne; ședința primește o sugestie Z1–Z2 cu −25%, sportivul alege', () => {
    const before = plan().find((w) => w.id === 'q1')!;
    const r = adapt(plan(), { kind: 'readiness', date: '2026-11-04', verdict: 'galben' }, { ...ctx, today: '2026-11-04' });
    const q1 = r.plan.find((w) => w.id === 'q1')!;
    assert.deepEqual(q1.targetZones, before.targetZones);
    assert.equal(q1.plannedMinutes, before.plannedMinutes);
    assert.deepEqual(q1.suggestion?.zones, [1, 2]);
    assert.equal(q1.suggestion?.minutes, 40);
    assert.equal(q1.suggestion?.accepted, null);
  });

  it('durere ≥ 3: alergările din următoarele 5 zile devin bicicletă Z2 la aceeași durată', () => {
    const r = adapt(plan(), { kind: 'durere', date: '2026-11-03', score: 4, loc: 'tibie' }, { ...ctx, today: '2026-11-03' });
    const q1 = r.plan.find((w) => w.id === 'q1')!;
    assert.equal(q1.sport, 'bicicleta');
    assert.equal(q1.plannedMinutes, 50);
    assert.equal(q1.key, false);
    assert.equal(r.plan.find((w) => w.id === 'lr2')!.sport, 'alergare');
  });

  it('febră: 48 h odihnă, apoi o săptămână la −50% fără chei', () => {
    const r = adapt(plan(), { kind: 'febra', date: '2026-11-03' }, { ...ctx, today: '2026-11-03' });
    assert.equal(r.plan.find((w) => w.id === 'q1')!.status, 'anulat_sistem');
    const b1 = r.plan.find((w) => w.id === 'b1')!;
    assert.equal(b1.plannedMinutes, 60);
    assert.equal(b1.key, false);
    assert.equal(r.plan.find((w) => w.id === 'b2')!.plannedMinutes, 135);
  });

  it('activitate neplanificată mare: zilele următoare NU se schimbă din prima (decid datele de dimineață)', () => {
    const r = adapt(plan(), { kind: 'neplanificat', activity: { id: 'x', date: '2026-11-04', sport: 'bicicleta', minutes: 120 } }, { ...ctx, today: '2026-11-04' });
    assert.deepEqual(r.plan.find((w) => w.id === 'r1')!.targetZones, [2]);
    const r2 = adapt(plan(), { kind: 'neplanificat', activity: { id: 'x', date: '2026-11-06', sport: 'bicicleta', minutes: 120 } }, { ...ctx, today: '2026-11-06' });
    assert.deepEqual(r2.plan.find((w) => w.id === 'b1')!.targetZones, [2]);
  });
});

describe('adapt · activitate în afara planului', () => {
  const race = { id: 'hm', date: '2026-11-07', sport: 'alergare' as const, minutes: 127, distanceKm: 21.4, avgHr: 165, maxHr: 187 };

  it('semimaraton benevol sâmbătă: anulează ziua, duminica rămâne (o decide dimineața), oprește progresia săptămânii următoare', () => {
    const r = adapt(plan(), { kind: 'neplanificat', activity: race, rpe: 9, tip: 'cursa' }, ctx);
    const b1 = r.plan.find((w) => w.id === 'b1')!; // tura lungă din ziua cursei
    const lr1 = r.plan.find((w) => w.id === 'lr1')!; // alergarea lungă de duminică
    const lr2 = r.plan.find((w) => w.id === 'lr2')!; // alergarea lungă de săptămâna viitoare
    const b2 = r.plan.find((w) => w.id === 'b2')!;
    assert.equal(b1.status, 'anulat_sistem');
    assert.equal(lr1.status, 'planificat');
    assert.equal(lr2.plannedMinutes, 70, 'nu progresează peste cheia săptămânii cursei');
    assert.equal(b2.plannedMinutes, 120, 'nici bicicleta nu progresează');
    assert.ok(r.changes.some((c) => c.includes('progresie oprită')));
  });

  it('o activitate mică (30 min ușor) nu schimbă nimic în afară de înlocuirea volumului aceluiași sport', () => {
    const r = adapt(plan(), { kind: 'neplanificat', activity: { id: 'w', date: '2026-11-03', sport: 'alergare', minutes: 30 }, rpe: 3, tip: 'antrenament' }, ctx);
    const r1 = r.plan.find((w) => w.id === 'r1')!; // alergare Z2 joi, 45 min: mai mare decât cele 30 min → rămâne
    const q1 = r.plan.find((w) => w.id === 'q1')!;
    assert.equal(r1.status, 'planificat');
    assert.equal(q1.plannedMinutes, 50);
    assert.equal(r.changes.length, 0);
  });

  it('antrenament liber greu (RPE 8, 60 min) marți: miercuri devine Z1, dar cheia nu e atinsă', () => {
    const r = adapt(plan(), { kind: 'neplanificat', activity: { id: 'w', date: '2026-11-03', sport: 'bicicleta', minutes: 60 }, rpe: 8, tip: 'antrenament' }, ctx);
    const q1 = r.plan.find((w) => w.id === 'q1')!; // calitate miercuri, cheie → neatinsă fără cursă
    assert.equal(q1.type, 'calitate');
    assert.deepEqual(q1.targetZones, [4]);
    const r1 = r.plan.find((w) => w.id === 'r1')!; // joi: în afara ferestrei de o zi
    assert.deepEqual(r1.targetZones, [2]);
  });

  it('cursă de 10 km (55 min) sâmbătă: duminica nu se schimbă din prima, săptămâna următoare nu e atinsă', () => {
    const r = adapt(plan(), { kind: 'neplanificat', activity: { id: 'c10', date: '2026-11-07', sport: 'alergare', minutes: 55, distanceKm: 10 }, rpe: 8, tip: 'cursa' }, ctx);
    const lr1 = r.plan.find((w) => w.id === 'lr1')!;
    assert.equal(lr1.status, 'planificat');
    assert.equal(lr1.plannedMinutes, 70);
    const lr2 = r.plan.find((w) => w.id === 'lr2')!;
    assert.equal(lr2.plannedMinutes, 80, 'cursa sub 60 min nu oprește progresia');
  });
});

describe('progres: creștere controlată', () => {
  // Săptămâna viitoare egală cu cea curentă (325 min): generatorul n-a pus creștere, deci progresul poate adăuga.
  const flat = (): PlannedWorkout[] => [...plan(), { id: 'f2', date: '2026-11-10', sport: 'forta', type: 'forta', plannedMinutes: 60, targetZones: [], key: false, status: 'planificat' }];
  it('nu adaugă peste o săptămână deja crescută sau de descărcare', () => {
    assert.equal(adapt(plan(), { kind: 'progres', date: '2026-11-08' }, ctx).changes.length, 0);
  });
  it('pune +10% din săptămâna viitoare pe ședințele ușoare, max 15 min pe ședință, fără cheie', () => {
    const r = adapt(flat(), { kind: 'progres', date: '2026-11-08' }, ctx);
    const r2 = r.plan.find((w) => w.id === 'r2')!;
    assert.equal(r2.plannedMinutes, 65);
    assert.equal(r.plan.find((w) => w.id === 'b2')!.plannedMinutes, 135);
    assert.equal(r.plan.find((w) => w.id === 'lr2')!.plannedMinutes, 80);
    assert.ok(r.changes.some((c) => c.startsWith('progres:')));
  });
  it('nu crește un sport restricționat', () => {
    const r = adapt(flat(), { kind: 'progres', date: '2026-11-08', restricted: ['alergare'] }, ctx);
    assert.equal(r.changes.length, 0);
  });
});

describe('adapt · trecutul nu se rescrie', () => {
  it('febră raportată azi cu dată de ieri: ședința de ieri rămâne cum a fost prescrisă', () => {
    const r = adapt(plan(), { kind: 'febra', date: '2026-11-04' }, { ...ctx, today: '2026-11-05' });
    assert.equal(r.plan.find((w) => w.id === 'q1')!.status, 'planificat');
    assert.equal(r.plan.find((w) => w.id === 'r1')!.status, 'anulat_sistem');
  });
});
