import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { clearanceRow } from '../server/_lib/plan.js';

// Auditul R01: lipsa unui răspuns nu devine aviz; o restricție declarată rămâne; necunoscutul nu blochează.
describe('aviz cardiologic în trei stări', () => {
  it('fără răspuns: necunoscut, intensitatea permisă, fără dată de aviz', () => {
    const r = clearanceRow('u', '2026-10-19', { sanatate: {} });
    assert.equal(r.cardiology, false);
    assert.equal(r.cleared_at, null);
    assert.equal(r.intensity_allowed, 'toate');
  });
  it('„da” declarat de sportiv: aviz declarat, cu data', () => {
    const r = clearanceRow('u', '2026-10-19', { sanatate: { avizCardiolog: 'da' } });
    assert.equal(r.cardiology, true);
    assert.equal(r.cleared_at, '2026-10-19');
  });
  it('medicul a limitat efortul: Z2, chiar dacă a bifat și aviz', () => {
    const r = clearanceRow('u', '2026-10-19', { sanatate: { avizCardiolog: 'da', limitareMedic: true } });
    assert.equal(r.cardiology, false);
    assert.equal(r.intensity_allowed, 'Z2');
  });
  it('chestionarul nou nu mai precompletează „da”', () => {
    const src = readFileSync(new URL('../apps/web/src/forms/types.ts', import.meta.url), 'utf8');
    assert.match(src, /avizCardiolog: null/);
    assert.doesNotMatch(src, /avizCardiolog: 'da',/);
  });
  it('migrarea nu mai marchează pe toți ca avizați și rulează corecția o singură dată', () => {
    const sql = readFileSync(new URL('../supabase/migrations/0002_upgrade.sql', import.meta.url), 'utf8');
    assert.doesNotMatch(sql, /set cardiology = true/);
    assert.match(sql, /if v < 6 then/);
  });
});
