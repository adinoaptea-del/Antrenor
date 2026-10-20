import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { activePain, activeRestriction, pendingCardiac, urgentText, withIncidents } from '../src/calendar/safety.js';
import { decideDay } from '../src/calendar/day.js';
import type { PlannedWorkout } from '../src/types.js';

const today = '2026-10-20';
describe('auditul v93 · siguranță', () => {
  it('T01/A01: oboseală Hooper 6 + durere focală 6/10 → roșu (ca durerea singură), ambele motive păstrate, ordinea nu contează', () => {
    const pain = [{ date: '2026-10-19', durere: { scor: 6, loc: 'genunchi' } }];
    const alone = activeRestriction({ today, morning: null, evenings: pain });
    const both = activeRestriction({ today, morning: { date: today, semnale: {}, hooper: { dureri: 6, oboseala: 6 } }, evenings: pain });
    assert.equal(alone?.verdict, 'rosu');
    assert.equal(both?.verdict, 'rosu');
    assert.match(both!.reason, /^Durere 6\/10 la genunchi/);
    assert.equal(both!.others?.length, 2, 'durerile musculare și epuizarea rămân în motiv');
  });
  it('T02/A04: negația nu acoperă simptomul din propoziția următoare', () => {
    assert.equal(urgentText('Nu am febră, dar am durere în piept'), 'durere în piept');
    assert.equal(urgentText('Nu am durere în piept dar am palpitații'), 'palpitații');
    assert.equal(urgentText('fără durere în piept'), null);
    assert.equal(urgentText('n-am avut palpitații'), null);
  });
  it('T04/A02: durerea și simptomul cardiac nerezolvate nu expiră (zilele 15, 29, 90)', () => {
    for (const d of ['2026-10-05', '2026-09-21', '2026-07-22']) {
      assert.equal(activePain([{ date: d, durere: { scor: 5, loc: 'gleznă' } }], today)?.scor, 5, d);
      assert.equal(pendingCardiac([{ date: d, semnale: { simptom_cardiac: true } }], today), d, d);
    }
    // Se închide doar prin declarație.
    assert.equal(activePain([{ date: '2026-07-22', durere: { scor: 5, loc: 'gleznă' } }, { date: '2026-10-01', durere: { scor: 1, loc: null } }], today), null);
    assert.equal(pendingCardiac([{ date: '2026-07-22', semnale: { simptom_cardiac: true } }, { date: '2026-08-01', semnale: { cardiac_evaluat: true } }], today), null);
    // Incidentele vechi se adaugă la formularele recente fără dubluri.
    const rec = [{ date: '2026-10-19', durere: { scor: 2, loc: 'x' } }];
    assert.equal(withIncidents(rec, [...rec, { date: '2026-07-22', durere: { scor: 5, loc: 'gleznă' } }]).length, 2);
  });
  it('T05/A04: ziua bifată nu ridică o restricție roșie', () => {
    const w: PlannedWorkout = { id: 'a', date: today, sport: 'alergare', type: 'z2', plannedMinutes: 45, targetZones: [2], key: false, status: 'planificat' };
    const r = activeRestriction({ today, morning: null, evenings: [{ date: today, durere: { scor: 6, loc: 'genunchi' } }] });
    const d = decideDay({ state: null, readiness: null, restriction: r, todayPlan: [w], doneIds: ['a'] });
    assert.equal(d?.level, 'rosu');
    assert.match(d!.action, /Durere 6\/10/);
    const ok = decideDay({ state: null, readiness: null, restriction: null, todayPlan: [w], doneIds: ['a'] });
    assert.equal(ok?.level, 'verde');
  });
});

import { adapt } from '../src/calendar/adapt.js';
import { changeSport } from '../src/calendar/actions.js';
import { restrictionOf } from '../src/walking/plan.js';
import { strengthStructure } from '../src/strength/ppl.js';

describe('auditul v93 · aceeași protecție în toate sporturile', () => {
  const ctx = { today, freeBlocks: [], recentKeyScores: [], done: [] as string[] };
  it('T06/A06: după febră, fără o raportare „nu mai am febră”, ziua rămâne roșie', () => {
    const r = activeRestriction({ today, morning: null, evenings: [], mornings: [{ date: '2026-10-16', semnale: { febra: true } }] });
    assert.equal(r?.verdict, 'rosu');
    assert.match(r!.reason, /nu mai ai febră/);
    const ok = activeRestriction({ today, morning: { date: today, semnale: { febra: false } }, evenings: [], mornings: [{ date: '2026-10-16', semnale: { febra: true } }] });
    assert.equal(ok, null);
  });
  it('T07/A05: roșu din boală sau durere la picioare = fără mers prescris; roșu doar din recuperare = varianta scurtă', () => {
    assert.equal(restrictionOf('rosu', 'Boală raportată azi: pauză.'), 'stop');
    assert.equal(restrictionOf('rosu', 'Durere 6/10 la genunchi'), 'stop');
    assert.equal(restrictionOf('rosu', 'Somn 4 h, HRV mult sub medie'), 'short');
  });
  it('T08/A05: galben de recuperare → și forța primește varianta ușoară (scurtă, 2 serii — excepția A49 din 20.10.2026)', () => {
    const f: PlannedWorkout = { id: 'f', date: today, sport: 'forta', type: 'forta', plannedMinutes: 55, targetZones: [], key: false, status: 'planificat', structure: strengthStructure({ session: 'pushA', block: 'baza', week: 1, len: 4 } as never) };
    const out = adapt([f], { kind: 'readiness', date: today, verdict: 'galben', reason: 'HRV sub medie' }, ctx).plan[0]!;
    assert.equal(out.status, 'planificat');
    assert.equal(out.suggestion?.accepted, null);
    // Decizia proprietarului (20.10.2026, A49): sugestia de recuperare e o excepție de la 45 de minute / 3 serii.
    assert.ok(out.suggestion!.minutes >= 20 && out.suggestion!.minutes < 45);
  });
  it('T09/A07: durere la umăr → fără înot ca alternativă; înotul și sala primesc varianta ușoară, alergarea rămâne', () => {
    const run: PlannedWorkout = { id: 'r', date: today, sport: 'alergare', type: 'z2', plannedMinutes: 45, targetZones: [2], key: false, status: 'planificat' };
    const swim: PlannedWorkout = { ...run, id: 's', sport: 'inot', type: 'tehnica' };
    assert.throws(() => changeSport(run, 'inot', '2026-10-20T10:00:00Z', { loc: 'umăr', scor: 4 }), /încarcă zona/);
    assert.doesNotThrow(() => changeSport(run, 'bicicleta', '2026-10-20T10:00:00Z', { loc: 'umăr', scor: 4 }));
    assert.throws(() => changeSport(run, 'bicicleta', '2026-10-20T10:00:00Z', { loc: 'gleznă', scor: 6 }), /până la reevaluare/);
    const p = adapt([run, swim], { kind: 'durere', date: today, score: 4, loc: 'umăr' }, ctx).plan;
    assert.equal(p.find((x) => x.id === 'r')!.suggestion ?? null, null, 'alergarea nu e atinsă de durerea de umăr');
    assert.equal(p.find((x) => x.id === 's')!.suggestion?.accepted, null);
    const k = adapt([run], { kind: 'durere', date: today, score: 4, loc: 'genunchi' }, ctx).plan[0]!;
    assert.equal(k.suggestion?.sport, 'bicicleta');
  });
});
