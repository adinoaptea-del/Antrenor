// Decizia zilei: una singură, aceeași pe toate ecranele.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { decideDay, messageMatches } from '../src/calendar/day.js';
import type { PlannedWorkout } from '../src/types.js';

const w = (status: PlannedWorkout['status'], note?: string): PlannedWorkout => ({ id: 'x', date: '2026-10-18', sport: 'alergare', type: 'z2', plannedMinutes: 40, targetZones: [2], key: false, status, note });

describe('decizia zilei', () => {
  it('starea galbenă + plan anulat de efort mare = zi roșie (nu „fă ceva ușor” lângă „stai”)', () => {
    const d = decideDay({ state: { verdict: 'galben', motiv: null }, readiness: null, restriction: null, todayPlan: [w('anulat_sistem', 'efort mare azi (alergare 229 min): restul zilei odihnă')] })!;
    assert.equal(d.level, 'rosu');
    assert.equal(d.action, 'Azi pauză: fără antrenament.');
    assert.match(d.reason!, /^Efort mare azi/);
  });
  it('plecat nu înroșește ziua', () => {
    const d = decideDay({ state: { verdict: 'verde' }, readiness: null, restriction: null, todayPlan: [w('anulat_sistem', 'plecat (nimic): alergare anulat')] })!;
    assert.equal(d.level, 'verde');
  });
  it('portocaliu se citește galben, cu aceeași acțiune', () => {
    const d = decideDay({ state: { verdict: 'portocaliu', motiv: 'date obiective 48/100 (3 din 5 măsurate)' }, readiness: null, restriction: null, todayPlan: [w('planificat')] })!;
    assert.equal(d.level, 'galben');
    assert.equal(d.action, 'Azi mai ușor: faci varianta ușoară a ședinței.');
    assert.equal(d.reason, 'Recuperarea măsurată de brățări: 48/100 (din 3 indicatori din 5)'); // A09: acoperirea rămâne în text
  });
  it('stopul bate tot; restricția e podea', () => {
    assert.equal(decideDay({ state: { verdict: 'verde' }, readiness: { verdict: 'stop', reason: 'febră' }, restriction: null, todayPlan: [] })!.level, 'stop');
    assert.equal(decideDay({ state: { verdict: 'verde' }, readiness: null, restriction: { verdict: 'galben', reason: 'durere 3/10 la genunchi' }, todayPlan: [w('planificat')] })!.level, 'galben');
  });
  it('mesajul scris pe altă decizie nu se arată', () => {
    const day = decideDay({ state: { verdict: 'galben' }, readiness: null, restriction: null, todayPlan: [] });
    assert.equal(messageMatches('rosu', day), false);
    assert.equal(messageMatches('galben', day), true);
  });
  it('fără nicio dată: fără decizie (nu inventăm)', () => {
    assert.equal(decideDay({ state: null, readiness: null, restriction: null, todayPlan: [w('planificat')] }), null);
  });
});

describe('zi de odihnă', () => {
  it('fără ședință în plan nu se spune „fă varianta ușoară”, chiar dacă recuperarea e galbenă', () => {
    const d = decideDay({ state: { verdict: 'galben', motiv: 'fără date obiective de la brățări: cel mult galben' }, readiness: null, restriction: null, todayPlan: [] })!;
    assert.equal(d.title, 'Zi de odihnă');
    assert.equal(d.action, 'Azi odihnă, cum e în plan.');
    assert.equal(d.rest, true);
    assert.equal(messageMatches('galben', d), true);
  });
  it('dar febra rămâne stop și într-o zi de odihnă', () => {
    const d = decideDay({ state: null, readiness: null, restriction: { verdict: 'stop', reason: 'febră' }, todayPlan: [] })!;
    assert.equal(d.level, 'stop');
  });
});
