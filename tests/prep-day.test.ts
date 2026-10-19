// „Ziua X din Y” la deschiderea aplicației: nu rămâne pe ziua 1.
import { it } from 'node:test';
import assert from 'node:assert/strict';
import { prepDay, prepStartOf } from '../src/calendar/prep-day.js';

it('numără de la primul plan pentru obiectiv, nu de la planul refăcut care începe lunea viitoare', () => {
  // Plan creat vineri 16.10, refăcut azi: planul activ începe luni 26.10. Azi, luni 19.10 = ziua 4.
  const start = prepStartOf(['2026-10-16', '2026-10-19', '2026-10-26'], '2026-10-19');
  assert.equal(start, '2026-10-16');
  assert.deepEqual(prepDay(start, '2026-10-19', '2027-09-12'), { day: 4, total: 331 });
  assert.equal(prepDay(start, '2026-10-20', '2027-09-12')!.day, 5);
});

it('fără plan vechi: începutul în viitor nu dă zile negative, doar ziua 1', () => {
  assert.equal(prepStartOf(['2026-10-26'], '2026-10-19'), '2026-10-19');
  assert.equal(prepDay('2026-10-19', '2026-10-19', '2027-09-12')!.day, 1);
  assert.equal(prepDay(null, '2026-10-19', '2027-09-12'), null);
});
