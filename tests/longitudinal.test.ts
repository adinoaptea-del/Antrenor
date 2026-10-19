import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runLongitudinal } from '../src/sim/longitudinal.js';
import { input } from '../scripts/audit-profiles.js';
import type { Goal } from '../src/calendar/phases.js';

// T08, T10, T11: 8 săptămâni cu ratări, oboseală, febră, picioare grele neplanificate, alergare în plus, durere, pauză
// de 10 zile și revenire; fiecare eveniment livrat de două ori. Invariantele sunt în src/sim/longitudinal.ts.
for (const goal of ['70.3', '10k', 'maraton', 'bike-100', 'inot-1900', 'fit-tonifiere'] as Goal[]) {
  test(`simulare longitudinală ${goal}: adaptare fără dublări, fără trecut rescris, ședințe coerente`, () => {
    for (const age of [30, 60]) {
      const r = runLongitudinal(input({ goal, sex: 'f', age, level: 'intermediar', intens: 'toate' }));
      assert.deepEqual(r.violations, []);
      assert.ok(r.counts.missed > 0 && r.counts.done > 0);
      assert.ok(r.counts.duplicatesIgnored > 0, 'evenimentele dublate trebuie ignorate');
      assert.ok(r.planMinutes < r.plan0Minutes, 'după febră, oboseală și pauză, volumul scade; nu se recuperează ce s-a ratat');
    }
  });
}
