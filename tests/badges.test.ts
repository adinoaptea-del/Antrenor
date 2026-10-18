// Insignele: din date măsurate, fără răsplată pentru volum cu orice preț.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeBadges } from '../src/badges/badges.js';
import type { Activity, PlannedWorkout, Sport } from '../src/types.js';
import { addDays } from '../src/util/dates.js';

const start = '2026-09-07'; // luni
const plan: PlannedWorkout[] = [];
const acts: Activity[] = [];
const sp: Sport[] = ['inot', 'bicicleta', 'alergare'];
for (let w = 0; w < 6; w++) {
  for (let d = 0; d < 6; d++) {
    const date = addDays(start, w * 7 + d);
    const sport = sp[d % 3]!;
    plan.push({ id: `${date}`, date, sport, type: 'z2', plannedMinutes: 45, targetZones: [2], key: false, status: 'planificat' });
    // Săptămâna 3: înotul sărit (2 ședințe din 6 lipsă).
    if (w === 2 && sport === 'inot') continue;
    acts.push({ id: `a${date}`, date, sport, minutes: 45, distanceKm: sport === 'inot' ? 1.2 : sport === 'bicicleta' ? 25 : 8, timeInZonesMin: { 2: 43, 3: 2 } });
  }
}
const base = { today: '2026-10-19', goal: '70.3', planStart: start, raceDate: '2027-09-26', plan, acts, redDays: ['2026-10-04'], morningDays: Array.from({ length: 8 }, (_, k) => addDays('2026-10-10', k)), raceActivityIds: [], zonesTested: false, efficiencyPct: [6] };

describe('insigne', () => {
  const r = computeBadges(base);
  const get = (id: string) => r.badges.find((b) => b.id === id)!;
  it('săptămâna perfectă: 5 din 6 (cea cu înotul sărit nu)', () => {
    assert.ok(get('saptamana-perfecta-1').earnedAt);
    assert.equal(get('saptamana-perfecta-2').progress.have, 5);
    assert.equal(get('saptamana-perfecta-2').earnedAt, '2026-10-18');
  });
  it('triatlonist complet: doar săptămânile cu toate trei sporturile la 80%', () => {
    assert.equal(get('triatlonist-2').progress.have, 4);
    assert.ok(get('triatlonist-2').earnedAt);
  });
  it('zi roșie respectată, dimineți, ușor pe bune, eficiență, repere', () => {
    assert.equal(get('zi-rosie-1').earnedAt, '2026-10-04');
    assert.ok(get('dimineti-1').earnedAt);
    assert.ok(get('usor-2').earnedAt, '30 ușoare făcute ușor');
    assert.ok(get('eficient').earnedAt);
    assert.ok(get('inot-dist-1').earnedAt);
    assert.equal(get('inot-dist-2').earnedAt, null);
    assert.equal(get('inot-dist-2').progress.have, 1200);
  });
  it('nivel pe orele din toate sporturile; provocarea lunii pe sportul rămas în urmă', () => {
    assert.equal(r.level.name, 'Pornit'); // A34: fără culorile semaforului
    assert.ok(r.challenge);
  });
  it('fără zile roșii respectate dacă te-ai antrenat în ele', () => {
    const r2 = computeBadges({ ...base, redDays: ['2026-09-08'] });
    assert.equal(r2.badges.find((b) => b.id === 'zi-rosie-1')!.earnedAt, null);
  });
});
