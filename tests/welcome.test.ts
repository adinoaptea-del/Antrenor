// Când apare întâmpinarea (regula proprietarului, 21.10.2026): prima deschidere din zi, aplicația închisă și
// redeschisă — nu revenirea din alt app, nu reîncărcarea, nu pagina refăcută de sistem după fundal.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isNewDay, localDay, welcomeOnLaunch, welcomeOnResume, type LaunchFacts } from '../src/welcome.js';

const base: LaunchFacts = { today: '2026-10-21', lastWelcomeDay: '2026-10-21', sameSession: false, discarded: false, navType: 'navigate' };

test('prima deschidere din zi: întâmpinarea apare oricum ar ajunge pagina pe ecran', () => {
  for (const f of [
    { ...base, lastWelcomeDay: '2026-10-20' },
    { ...base, lastWelcomeDay: null },
    { ...base, lastWelcomeDay: '2026-10-20', sameSession: true, discarded: true, navType: 'reload' },
  ])
    assert.equal(welcomeOnLaunch(f), 'zi_noua');
  assert.equal(welcomeOnResume('2026-10-22', '2026-10-21'), 'zi_noua');
  assert.ok(isNewDay('2026-10-22', '2026-10-21') && !isNewDay('2026-10-21', '2026-10-21'));
});

test('aplicația închisă și redeschisă în aceeași zi: sesiune nouă, pagină nearuncată, navigare normală → apare', () => {
  assert.equal(welcomeOnLaunch(base), 'deschidere');
  assert.equal(welcomeOnLaunch({ ...base, navType: null }), 'deschidere');
});

test('ieșirea din aplicație și revenirea (aceeași zi) NU arată întâmpinarea: pagină refăcută de sistem, reîncărcare, revenire din fundal', () => {
  // Sistemul a oprit pagina în fundal și o reface: sesiunea e aceeași sau pagina e marcată „aruncată”.
  assert.equal(welcomeOnLaunch({ ...base, sameSession: true }), null);
  assert.equal(welcomeOnLaunch({ ...base, discarded: true }), null);
  assert.equal(welcomeOnLaunch({ ...base, sameSession: true, discarded: true, navType: 'reload' }), null);
  // Reîncărcarea (ex. cea automată după o actualizare).
  assert.equal(welcomeOnLaunch({ ...base, navType: 'reload' }), null);
  // Revenirea din fundal fără repornirea paginii, aceeași zi.
  assert.equal(welcomeOnResume('2026-10-21', '2026-10-21'), null);
});

test('ziua locală: AAAA-LL-ZZ pe ora telefonului, cu zerouri', () => {
  assert.equal(localDay(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
  assert.equal(localDay(new Date(2026, 9, 21, 0, 0, 1)), '2026-10-21');
});
