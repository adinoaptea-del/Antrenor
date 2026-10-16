import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { compareLabs, type LabSnapshot } from '../src/collector/labs-compare.js';

const base = (data: string, o: Partial<LabSnapshot>): LabSnapshot => ({ data, feritina: null, vitamina_d: null, hemoglobina: null, ck: null, crp: null, alte: [], ...o });

describe('comparația analizelor', () => {
  it('primul buletin: fără comparație', () => {
    assert.equal(compareLabs(base('2026-10-01', { feritina: 40 }), null), null);
  });

  it('feritina urcă peste 30 = mai bine; CRP crește peste 5 = mai rău; mică variație = stabil', () => {
    const c = compareLabs(base('2026-10-01', { feritina: 45, crp: 9, vitamina_d: 31 }), base('2026-04-01', { feritina: 22, crp: 2, vitamina_d: 30 }))!;
    const by = Object.fromEntries(c.schimbari.map((x) => [x.nume, x.directie]));
    assert.equal(by['Feritină'], 'mai_bine');
    assert.equal(by['CRP'], 'mai_rau');
    assert.equal(by['Vitamina D'], 'stabil');
    assert.equal(c.data_anterioare, '2026-04-01');
  });

  it('celelalte valori se compară după nume și intervalul laboratorului', () => {
    const now = base('2026-10-01', { alte: [{ nume: 'TSH', valoare: 2.1, unitate: 'mUI/L', ref_min: 0.4, ref_max: 4 }] });
    const before = base('2026-04-01', { alte: [{ nume: 'TSH', valoare: 5.2, unitate: 'mUI/L', ref_min: 0.4, ref_max: 4 }] });
    const c = compareLabs(now, before)!;
    assert.equal(c.schimbari[0]?.directie, 'mai_bine');
  });
});
