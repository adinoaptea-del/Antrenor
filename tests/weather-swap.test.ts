// Inversarea după vreme (regula proprietarului, 20.10.2026): ziua frumoasă primește bicicleta/alergarea, ziua cu ploaie
// bazinul/sala; aceleași reguli ca „Mută”; sportivul poate lăsa totul cum era.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { undoWeatherSwap, weatherSwap, weatherVerdict } from '../src/calendar/weather-swap.js';
import type { WeatherDay } from '../src/collector/types.js';
import type { PlannedWorkout } from '../src/types.js';

const AT = '2026-10-20T18:00:00Z';
const TODAY = '2026-10-20'; // marți
const w = (id: string, date: string, sport: PlannedWorkout['sport'], type: PlannedWorkout['type'], min = 45, zones: PlannedWorkout['targetZones'] = [2]): PlannedWorkout => ({ id, date, sport, type, plannedMinutes: min, targetZones: zones, key: type === 'calitate' || type === 'lung', status: 'planificat' });
const SUN: WeatherDay = { tmax: 19, tmin: 8, resimtita_max: 19, ploaie_mm: 0, vant_kmh: 12, prob_ploaie: 10 };
const RAIN: WeatherDay = { tmax: 12, tmin: 7, resimtita_max: 11, ploaie_mm: 9, vant_kmh: 20, prob_ploaie: 90 };
const MEH: WeatherDay = { tmax: 14, tmin: 7, resimtita_max: 13, ploaie_mm: 1.5, vant_kmh: 20, prob_ploaie: 50 };

describe('verdictul vremii', () => {
  it('soare = bun, ploaie = rău, între = neutru, fără date = null', () => {
    assert.equal(weatherVerdict(SUN), 'bun');
    assert.equal(weatherVerdict(RAIN), 'rau');
    assert.equal(weatherVerdict(MEH), 'neutru');
    assert.equal(weatherVerdict({ ...SUN, vant_kmh: 45 }), 'rau');
    assert.equal(weatherVerdict({ ...SUN, ploaie_mm: null }), null);
  });
});

describe('inversarea', () => {
  const plan = () => [w('swim', '2026-10-21', 'inot', 'tehnica', 45, [1, 2]), w('bike', '2026-10-22', 'bicicleta', 'z2', 75), w('run', '2026-10-24', 'alergare', 'lung', 80)];
  it('mâine frumos + bazin, poimâine ploaie + bicicletă → se inversează și sportivul e anunțat', () => {
    const r = weatherSwap(plan(), { date: '2026-10-21', w: SUN }, { date: '2026-10-22', w: RAIN }, TODAY, AT)!;
    assert.ok(r);
    const bike = r.changed.find((x) => x.id === 'bike')!;
    const swim = r.changed.find((x) => x.id === 'swim')!;
    assert.equal(bike.date, '2026-10-21');
    assert.equal(swim.date, '2026-10-22');
    assert.equal(bike.original!.date, '2026-10-22');
    assert.match(r.text, /^Mâine e vreme frumoasă/);
    assert.match(r.text, /am inversat înotul din bazin cu bicicleta/);
    assert.match(r.text, /poimâine se anunță ploaie \(9 mm\)/);
  });
  it('și invers: mâine plouă (bicicletă), poimâine frumos (bazin)', () => {
    const p = [w('bike', '2026-10-21', 'bicicleta', 'z2', 60), w('swim', '2026-10-22', 'inot', 'tehnica', 45, [1, 2])];
    const r = weatherSwap(p, { date: '2026-10-21', w: RAIN }, { date: '2026-10-22', w: SUN }, TODAY, AT)!;
    assert.equal(r.changed.find((x) => x.id === 'bike')!.date, '2026-10-22');
    assert.equal(r.changed.find((x) => x.id === 'swim')!.date, '2026-10-21');
  });
  it('și peste o zi: azi plouă (alergare), poimâine frumos (sală) → se inversează dacă regulile permit', () => {
    const p = [w('run', '2026-10-20', 'alergare', 'z2', 50), w('gym', '2026-10-22', 'forta', 'forta', 50, [])];
    const r = weatherSwap(p, { date: '2026-10-20', w: RAIN }, { date: '2026-10-22', w: SUN }, TODAY, AT)!;
    assert.equal(r.changed.find((x) => x.id === 'run')!.date, '2026-10-22');
    assert.equal(r.changed.find((x) => x.id === 'gym')!.date, '2026-10-20');
    assert.match(r.text, /^Poimâine e vreme frumoasă/);
  });
  it('zile ploioase la rând: nu se schimbă nimic', () => {
    assert.equal(weatherSwap(plan(), { date: '2026-10-21', w: RAIN }, { date: '2026-10-22', w: RAIN }, TODAY, AT), null);
  });
  it('nimic de făcut: ambele zile bune, vreme neutră, fără prognoză', () => {
    assert.equal(weatherSwap(plan(), { date: '2026-10-21', w: SUN }, { date: '2026-10-22', w: SUN }, TODAY, AT), null);
    assert.equal(weatherSwap(plan(), { date: '2026-10-21', w: SUN }, { date: '2026-10-22', w: MEH }, TODAY, AT), null);
    assert.equal(weatherSwap(plan(), { date: '2026-10-21', w: null }, { date: '2026-10-22', w: RAIN }, TODAY, AT), null);
  });
  it('nu atinge ce a mutat sportivul, testele, întâlnirile fixe, înotul în ape libere, ședințele făcute', () => {
    const moved = plan().map((x) => (x.id === 'bike' ? { ...x, note: 'mutată de tine de luni pe joi' } : x));
    assert.equal(weatherSwap(moved, { date: '2026-10-21', w: SUN }, { date: '2026-10-22', w: RAIN }, TODAY, AT), null);
    const test = plan().map((x) => (x.id === 'swim' ? { ...x, structure: 'TEST CSS 400/200' } : x));
    assert.equal(weatherSwap(test, { date: '2026-10-21', w: SUN }, { date: '2026-10-22', w: RAIN }, TODAY, AT), null);
    assert.equal(weatherSwap(plan(), { date: '2026-10-21', w: SUN }, { date: '2026-10-22', w: RAIN }, TODAY, AT, { fixed: [{ zi: 3, sport: 'bicicleta', tip: 'usor' }] }), null);
    assert.equal(weatherSwap(plan(), { date: '2026-10-21', w: SUN }, { date: '2026-10-22', w: RAIN }, TODAY, AT, { swimOutdoors: true }), null);
    assert.equal(weatherSwap(plan(), { date: '2026-10-21', w: SUN }, { date: '2026-10-22', w: RAIN }, TODAY, AT, { done: ['bike'] }), null);
  });
  it('respectă regulile planului: programul liber și zi tare / zi ușoară', () => {
    // Miercuri ai doar 60 de minute libere: bicicleta de 75 nu încape.
    const blocks = [{ day: 2, startMin: 1080, endMin: 1140 }, { day: 3, startMin: 1080, endMin: 1260 }];
    assert.equal(weatherSwap(plan(), { date: '2026-10-21', w: SUN }, { date: '2026-10-22', w: RAIN }, TODAY, AT, { freeBlocks: blocks }), null);
    // Bicicleta grea lângă alergarea grea de marți: nu se mută lângă ea.
    const hard = [w('q', '2026-10-20', 'alergare', 'calitate', 50, [4]), w('swim', '2026-10-21', 'inot', 'tehnica', 45, [1, 2]), w('bike', '2026-10-22', 'bicicleta', 'calitate', 60, [3, 4])];
    assert.equal(weatherSwap(hard, { date: '2026-10-21', w: SUN }, { date: '2026-10-22', w: RAIN }, TODAY, AT), null);
  });
  it('„Lasă-le cum erau” pune ambele ședințe înapoi și nu le mai inversează automat', () => {
    const r = weatherSwap(plan(), { date: '2026-10-21', w: SUN }, { date: '2026-10-22', w: RAIN }, TODAY, AT)!;
    const after = plan().map((x) => r.changed.find((c) => c.id === x.id) ?? x);
    const back = undoWeatherSwap(after, 'bike', TODAY, AT);
    assert.equal(back.find((x) => x.id === 'bike')!.date, '2026-10-22');
    assert.equal(back.find((x) => x.id === 'swim')!.date, '2026-10-21');
    const again = after.map((x) => back.find((c) => c.id === x.id) ?? x);
    assert.equal(weatherSwap(again, { date: '2026-10-21', w: SUN }, { date: '2026-10-22', w: RAIN }, TODAY, AT), null);
  });
});
