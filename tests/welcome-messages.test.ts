// Întâmpinarea după ziua sportivului (cererea proprietarului, 23.10.2026).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REST_MESSAGES, TRAINING_MESSAGES, pickWelcome, welcomeKind } from '../src/welcome-messages.js';

const w = (type: string, status = 'planificat') => ({ type, status });

test('zi fără ședință, doar „odihnă”, anulată, roșie sau stop = mesaj de relaxare; ședință activă = motivație', () => {
  assert.equal(welcomeKind({ sessions: [] }), 'odihna');
  assert.equal(welcomeKind({ sessions: [w('odihna')] }), 'odihna');
  assert.equal(welcomeKind({ sessions: [w('z2', 'anulat_sistem')] }), 'odihna');
  assert.equal(welcomeKind({ sessions: [w('calitate')] }), 'antrenament');
  assert.equal(welcomeKind({ sessions: [w('z2', 'mutat')] }), 'antrenament');
  assert.equal(welcomeKind({ sessions: [w('calitate')], day: { level: 'rosu' } }), 'odihna', 'zi roșie: pauză, nu „hai la antrenament”');
  assert.equal(welcomeKind({ sessions: [w('calitate')], day: { level: 'stop' } }), 'odihna');
  assert.equal(welcomeKind({ sessions: [w('calitate')], day: { level: 'galben' } }), 'antrenament');
});

test('mesajele de odihnă nu îndeamnă la efort; cele de antrenament nu vorbesc de pauză; nu se repetă de două ori la rând', () => {
  for (const m of REST_MESSAGES) assert.ok(!/vino și azi|pornește|kilometru|ședință bună azi/i.test(m), m);
  for (const m of TRAINING_MESSAGES) assert.ok(!/^Odihna|zi de odihnă|pauză/i.test(m), m);
  assert.ok(REST_MESSAGES.length >= 15 && TRAINING_MESSAGES.length >= 40);
  const a = pickWelcome('odihna', null, () => 0);
  const b = pickWelcome('odihna', a.index, () => 0);
  assert.notEqual(a.index, b.index);
  assert.ok(REST_MESSAGES.includes(a.text) && TRAINING_MESSAGES.includes(pickWelcome('antrenament', null).text));
});
