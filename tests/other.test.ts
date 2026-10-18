import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { classifyOther } from '../src/collector/other.js';

describe('recuperarea și mișcarea în plus', () => {
  it('saună, baie rece, yoga, plimbare = recuperare; drumeție, tenis = mișcare în plus', () => {
    assert.deepEqual(classifyOther('sauna'), { kind: 'recuperare', name: 'saună' });
    assert.deepEqual(classifyOther('Ice Bath'), { kind: 'recuperare', name: 'baie rece' });
    assert.equal(classifyOther('Yoga')?.kind, 'recuperare');
    assert.equal(classifyOther('Walk')?.kind, 'recuperare');
    assert.equal(classifyOther('steam-room')?.name, 'saună umedă');
    assert.equal(classifyOther('Hiking')?.kind, 'activ');
    assert.equal(classifyOther('tennis')?.name, 'sport cu racheta');
    assert.equal(classifyOther('activity'), null);
  });
});

import { recoverySummary } from '../src/recovery/recovery.js';
import { addDays } from '../src/util/dates.js';
describe('cum răspunde corpul la recuperare', () => {
  it('asociere doar cu ≥ 4 dimineți; HRV-ul de după față de media de 7 zile', () => {
    const today = '2026-10-18';
    const wellness = Array.from({ length: 60 }, (_, k) => {
      const date = addDays(today, -60 + k);
      const afterSauna = k % 5 === 1; // dimineața de după saună
      return { date, hrv: afterSauna ? 33 : 28, rhr: afterSauna ? 54 : 56, sleepMin: 450 };
    });
    const others = wellness.filter((_, k) => k % 5 === 0).map((w, i) => ({ id: `s${i}`, source: 'whoop', externalId: `s${i}`, date: w.date, startLocal: null, kind: 'recuperare' as const, name: 'saună', minutes: 15, avgHr: null, maxHr: null }));
    const r = recoverySummary(today, others, wellness);
    const e = r.effects.find((x) => x.name === 'saună')!;
    assert.ok(e.n >= 4);
    assert.ok(e.hrvPct > e.hrvPctNone);
    assert.ok(e.rhrDelta < e.rhrDeltaNone);
    assert.equal(recoverySummary(today, others.slice(0, 2), wellness).effects.length, 0, 'prea puține dimineți');
  });
});
