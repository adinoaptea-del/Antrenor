// Folosirea aplicației (Admin → Prieteni): ce acceptă serverul și rezumatul (ultima intrare, tendință, ce caută, nota).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanPing, feedbackDue, summarizeUsage, type UsageRow } from '../src/usage.js';

test('cleanPing: doar chei cunoscute, plafoane, data doar ±1 zi', () => {
  const p = cleanPing({ date: '2026-10-20', sessions: 99, seconds: 1e9, details: 2, screens: { mese: 3, hack: 5, 'det:reteta': 2, calendar: -4 } }, '2026-10-20');
  assert.deepEqual(p, { date: '2026-10-20', sessions: 20, seconds: 21600, details: 2, screens: { mese: 3, 'det:reteta': 2 } });
  assert.equal(cleanPing({ date: '2026-10-10', sessions: 1 }, '2026-10-20'), null);
  assert.equal(cleanPing({ date: 'azi', sessions: 1 }, '2026-10-20'), null);
  assert.equal(cleanPing({ date: '2026-10-20' }, '2026-10-20'), null);
  assert.ok(cleanPing({ date: '2026-10-21', sessions: 1 }, '2026-10-20'));
});

const row = (date: string, screens: Record<string, number>, sessions = 1, seconds = 300): UsageRow => ({ date, sessions, seconds, details: 0, screens, last_at: `${date}T18:00:00Z` });

test('summarizeUsage: ultima intrare, zile active, săptămâni, zone, căutări pe intrare', () => {
  const rows = [row('2026-10-20', { acasa: 2, mese: 2, 'det:reteta': 2, seara: 1 }, 2, 600), row('2026-10-18', { calendar: 4, 'det:sedinta': 1 }), row('2026-10-05', { progres: 1 })];
  const s = summarizeUsage(rows, [], '2026-10-20');
  assert.equal(s.lastSeen, '2026-10-20T18:00:00Z');
  assert.equal(s.activeDays7, 2);
  assert.equal(s.activeDays28, 3);
  assert.deepEqual(s.weeks.map((w) => w.activeDays), [0, 1, 0, 2]);
  assert.equal(s.weeks[3]!.minutes, 15);
  // Informații = mese 2 + rețete 2 + calendar 4 + ședință 1 (fără Acasă și jurnal).
  assert.equal(s.weeks[3]!.info, 9);
  assert.equal(s.areas[0]!.area, 'plan');
  assert.equal(s.infoPerSession, Math.round((10 / 4) * 10) / 10);
  assert.equal(s.rating, null);
});

test('summarizeUsage: tendința compară ultimele 14 zile cu cele 14 dinainte', () => {
  const days = (from: number, n: number) => Array.from({ length: n }, (_, i) => row(`2026-10-${String(from + i).padStart(2, '0')}`, { acasa: 1 }));
  assert.equal(summarizeUsage([...days(1, 2), ...days(10, 8)], [], '2026-10-20').trend, 'creste');
  assert.equal(summarizeUsage([...days(1, 6)], [], '2026-10-28').trend, 'scade');
  assert.equal(summarizeUsage([], [], '2026-10-20').trend, 'inactiv');
  assert.equal(summarizeUsage(days(18, 2), [], '2026-10-20', '2026-10-15').trend, 'nou');
});

test('summarizeUsage: nota = cea mai recentă, media, ultimul comentariu', () => {
  const s = summarizeUsage([], [{ date: '2026-10-01', score: 3, note: 'prea multe notificări' }, { date: '2026-10-15', score: 5, note: null }], '2026-10-20');
  assert.deepEqual(s.rating, { last: 5, lastDate: '2026-10-15', avg: 4, n: 2, note: 'prea multe notificări' });
});

test('feedbackDue: după 3 zile de folosire, apoi la 14 zile', () => {
  assert.equal(feedbackDue(null, null, '2026-10-20'), false);
  assert.equal(feedbackDue('2026-10-19', null, '2026-10-20'), false);
  assert.equal(feedbackDue('2026-10-17', null, '2026-10-20'), true);
  assert.equal(feedbackDue('2026-10-01', '2026-10-10', '2026-10-20'), false);
  assert.equal(feedbackDue('2026-10-01', '2026-10-06', '2026-10-20'), true);
});
