// Specificația de nutriție (20.10.2026): testele numerice N01–N16 și scenariile S01–S26 implementabile în motor.
// Fixture-uri sintetice; nu sunt recomandări alimentare. Ce nu e implementat (cămară, coș, solver) nu e testat aici.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PREFS, alternatives, consumedTotals, itemTotals, mealTimesFor, nutritionDay, postEffortSlot, powderServing, preEffortSlot, ineligibleReason, roundQty, selectDays, type DaySession, type NutritionInput } from '../src/nutrition/engine.js';
import { FOODS, foodCost, foodValues, macroCoverage, packagesFor, type Food } from '../src/nutrition/foods.js';
import { consumedSnapshots, recordChoice, recordConsumed, recordSuggested, type MealLog } from '../src/nutrition/log.js';
import { RECIPE, type Recipe } from '../src/nutrition/recipes.js';
import { addDays, localDayStartUtc } from '../src/util/dates.js';

const DATE = '2026-10-19';
const man = (o: Partial<NutritionInput> = {}): NutritionInput => ({ date: DATE, athleteId: 'u-test', athlete: { sex: 'm', age: 46, heightCm: 178, weightKg: 80 }, goal: '10k', sessions: [], prefs: DEFAULT_PREFS, ...o });
const RUN18: DaySession[] = [{ sport: 'alergare', type: 'z2', minutes: 60, startMin: 18 * 60, startSource: 'activitate' }];

describe('N — calcule exacte', () => {
  it('N04: un ingredient uscat se calculează cu valorile lui uscate (orez 346 kcal/100 g → 80 g = 276,8 kcal)', () => {
    assert.equal(Math.round(foodValues('orez', 80).kcal * 10) / 10, 276.8);
  });
  it('N05: coșul rotunjește la pachete întregi: 650 g din pachete de 500 g la 8 RON = 2 pachete, 16 RON, 350 g rămân', () => {
    assert.deepEqual(packagesFor(650, { amount: 500, price: 8 }), { packages: 2, cost: 16, left: 350 });
    assert.equal(packagesFor(650, { amount: 0, price: 8 }), null);
  });
  it('N06: partea comestibilă se aplică o singură dată (măr: 160 g comestibil la 0,87 = 184 g cumpărate)', () => {
    const c = foodCost('mar', 160)!;
    assert.ok(Math.abs(c - (0.16 * 5.99) / 0.87) < 1e-9, String(c));
    // 200 g brut, 0,8 comestibil, 10 RON/kg → 160 g comestibil, 2 RON (formula, pe un aliment sintetic).
    const f: Food = { id: 'n06', name: 'N06', unit: 'g', kcal: 50, protein: 1, source: 'test', allergens: [], price: { ronPerUnit: 10, edible: 0.8, source: 'test', checkedAt: DATE } };
    (FOODS as Record<string, Food>)['n06'] = f;
    assert.ok(Math.abs(foodCost('n06', 160)! - 2) < 1e-9);
    delete (FOODS as Record<string, Food>)['n06'];
  });
  it('N03: pudra după etichetă: 80 g proteine și 400 kcal la 100 g, lipsesc 24 g → 30 g produs, 24 g proteine, 120 kcal', () => {
    assert.deepEqual(powderServing({ proteinPer100g: 80, kcalPer100g: 400 }, 24), { productG: 30, proteinG: 24, kcal: 120 });
    assert.equal(powderServing({ proteinPer100g: 0, kcalPer100g: 400 }, 24), null);
  });
  it('N09: un ingredient fără grăsimi în catalog → grăsimile mesei null (nu 0) și statusul „incomplet”; energia rămâne cunoscută', () => {
    const t = itemTotals([{ food: 'pui', qty: 130 }, { food: 'orez', qty: 100 }]);
    assert.ok(t.kcal > 400 && t.protein > 30);
    assert.equal(t.fat, null);
    assert.equal(t.carbs, null);
    assert.ok(t.macrosUnknown.length >= 1);
    const d = nutritionDay(man());
    assert.equal(d.check.macros.status, 'incomplet');
    assert.equal(d.totals.carbs, null);
    assert.match(d.macros!.explain, /nu pot fi numărate în grame: lipsesc valorile din catalog/);
    // Acoperirea catalogului se raportează, nu se presupune.
    const cov = macroCoverage();
    assert.equal(cov.total, 81);
    assert.ok(cov.carbs <= cov.total && cov.fat <= cov.total);
  });
  it('N07: aceeași declarație „am mâncat” trimisă de două ori = un singur consum', () => {
    let log: MealLog = recordSuggested({}, DATE, [{ slot: 'pranz', recipeId: 'M01' }], DATE);
    const snap = { recipeId: 'M01', items: [{ food: 'pui', qty: 130 }] };
    log = recordConsumed(log, DATE, 'pranz', true, '2026-10-19T12:00:00Z', snap);
    log = recordConsumed(log, DATE, 'pranz', true, '2026-10-19T12:00:01Z', snap);
    assert.equal(log[DATE]!.length, 1);
    assert.equal(consumedSnapshots(log, DATE).size, 1);
    assert.equal(consumedTotals(log, DATE)!.meals, 1);
  });
  it('N08: 2.200 kcal deja mâncate la o țintă mai mică → nicio porție negativă, fără post impus, istoricul rămâne 2.200', () => {
    const base = nutritionDay(man({ prefs: { ...DEFAULT_PREFS, meals: 3, snacksOk: false } }));
    const target = base.energy!.target;
    // Prânzul mâncat „mare”: carne și orez cât să treacă de ținta zilei.
    const big = { recipeId: base.meals.find((m) => m.slot === 'pranz')!.recipe.id, items: [{ food: 'pui', qty: 600 }, { food: 'orez', qty: 500 }, { food: 'ulei', qty: 40 }] };
    const eaten = itemTotals(big.items).kcal;
    assert.ok(eaten > target, `${eaten} > ${target}`);
    let log: MealLog = recordSuggested({}, DATE, base.meals.map((m) => ({ slot: m.slot, recipeId: m.recipe.id })), DATE);
    log = recordConsumed(log, DATE, 'pranz', true, '2026-10-19T13:00:00Z', big);
    const d = nutritionDay(man({ prefs: { ...DEFAULT_PREFS, meals: 3, snacksOk: false, log } }));
    assert.equal(d.check.consumed.kcal, Math.round(eaten));
    assert.equal(d.check.consumed.meals, 1);
    assert.ok(d.check.consumed.partial);
    for (const m of d.meals) for (const it of m.items) assert.ok(it.qty > 0, `${m.slot} ${it.food} ${it.qty}`);
    assert.ok(d.warnings.some((w) => /nu propun post sau compensare/.test(w)), d.warnings.join(' | '));
    // Masa mâncată rămâne exact cum a fost declarată.
    const lunch = d.meals.find((m) => m.slot === 'pranz')!;
    assert.equal(lunch.consumed, true);
    assert.deepEqual(lunch.items.map((i) => [i.food, i.qty]), big.items.map((i) => [i.food, i.qty]));
    assert.equal(alternatives(man({ prefs: { ...DEFAULT_PREFS, meals: 3, log } }), 'pranz').length, 0);
  });
  it('N02: ce s-a mâncat se scade din ținta meselor rămase (energia zilei rămâne în jurul țintei)', () => {
    const base = nutritionDay(man({ prefs: { ...DEFAULT_PREFS, meals: 3 } }));
    const breakfast = base.meals.find((m) => m.slot === 'mic_dejun')!;
    let log: MealLog = recordSuggested({}, DATE, base.meals.map((m) => ({ slot: m.slot, recipeId: m.recipe.id })), DATE);
    log = recordConsumed(log, DATE, 'mic_dejun', true, '2026-10-19T08:00:00Z', { recipeId: breakfast.recipe.id, items: breakfast.items.map((i) => ({ food: i.food, qty: i.qty })) });
    const d = nutritionDay(man({ prefs: { ...DEFAULT_PREFS, meals: 3, log } }));
    assert.equal(d.check.consumed.meals, 1);
    assert.ok(Math.abs(d.totals.dayKcal - d.energy!.target) <= d.energy!.target * 0.12, `${d.totals.dayKcal} vs ${d.energy!.target}`);
    assert.equal(d.meals.find((m) => m.slot === 'mic_dejun')!.kcal, breakfast.kcal);
  });
  it('N10: o rețetă folosită pe 1 iunie nu revine în următoarele 4 zile', () => {
    const log: MealLog = { '2026-06-01': [{ slot: 'pranz', suggested: 'M01', accepted: true, replacedBy: null, consumed: true, at: '2026-06-01T12:00:00Z' }] };
    const prefs = { ...DEFAULT_PREFS, meals: 3 as const, log };
    const sel = selectDays('2026-05-20', '2026-06-06', prefs, () => null, { seed: 'u-test', dayKcal: 2400, meals: 3, slots: ['mic_dejun', 'pranz', 'cina'] });
    for (const d of ['2026-06-02', '2026-06-03', '2026-06-04', '2026-06-05']) assert.notEqual(sel.get(d)!.picks.pranz, 'M01', d);
    assert.equal(sel.get('2026-06-01')!.picks.pranz, 'M01');
  });
  it('N14: alimentarea din efort (geluri) n-are preț: costul zilei nu apare complet', () => {
    const d = nutritionDay(man({ sessions: [{ sport: 'bicicleta', type: 'lung', minutes: 180, startMin: 480 }] }));
    assert.ok(d.fuel.length > 0);
    assert.equal(d.totals.costComplete, false);
    assert.equal(d.totals.cost, null);
  });
  it('N16: ora de vară: ziua locală din fus, nu din offset fix (29.03.2026 și 25.10.2026, Europe/Bucharest)', () => {
    assert.equal(localDayStartUtc('2026-03-29', 'Europe/Bucharest'), '2026-03-28T22:00:00.000Z');
    assert.equal(localDayStartUtc('2026-10-25', 'Europe/Bucharest'), '2026-10-24T21:00:00.000Z');
    assert.equal(localDayStartUtc('2026-10-26', 'Europe/Bucharest'), '2026-10-25T22:00:00.000Z');
  });
});

describe('porții culinare', () => {
  it('ouăle se scalează la ouă întregi (55 g), porția de referință rămâne cum a scris-o autorul', () => {
    assert.equal(roundQty('ou', 120, 120), 120);
    assert.equal(roundQty('ou', 168), 165);
    assert.equal(roundQty('ou', 70), 55);
    assert.equal(roundQty('ou', 20), 55);
    assert.equal(roundQty('ulei', 7.4), 7);
    assert.equal(roundQty('orez', 83), 85);
  });
});

describe('orele meselor și legătura cu antrenamentul (ch. 08)', () => {
  it('fără ora ședinței: nicio masă „înainte/după efort” inventată (S21)', () => {
    const noTime: DaySession[] = [{ sport: 'alergare', type: 'z2', minutes: 60 }];
    assert.equal(preEffortSlot(noTime, 4, null), null);
    assert.equal(postEffortSlot(noTime, 4, null), null);
    const d = nutritionDay(man({ sessions: noTime }));
    assert.ok(!d.meals.some((m) => /înaintea|după antrenament/.test(m.why ?? '')));
  });
  it('cu orele declarate (4 mese), antrenamentul de la 18:00 are gustarea de la 16:30 înainte și cina de la 19:30 după', () => {
    const times = [7 * 60 + 30, 13 * 60, 16 * 60 + 30, 19 * 60 + 30];
    assert.equal(preEffortSlot(RUN18, 4, times), 'gustare');
    assert.equal(postEffortSlot(RUN18, 4, times), 'cina');
    const d = nutritionDay(man({ sessions: RUN18, prefs: { ...DEFAULT_PREFS, meals: 4, mealTimes: times } }));
    assert.match(d.meals.find((m) => m.slot === 'gustare')!.why ?? '', /^înaintea/);
    assert.match(d.meals.find((m) => m.slot === 'cina')!.why ?? '', /^după antrenament/);
    assert.ok(!d.warnings.some((w) => /orele implicite/.test(w)));
  });
  it('fără ore declarate se folosesc orele implicite și se spune; o masă din timpul antrenamentului nu e „înainte” sau „după”', () => {
    const t = mealTimesFor(['mic_dejun', 'pranz', 'cina', 'gustare'], null);
    assert.equal(t.declared, false);
    assert.equal(t.at.mic_dejun, 7 * 60 + 30);
    // Alergare 7:00–8:00: micul dejun implicit (7:30) e în timpul ei → nici înainte, nici după (nu inventăm).
    const early: DaySession[] = [{ sport: 'alergare', type: 'z2', minutes: 60, startMin: 7 * 60, startSource: 'activitate' }];
    assert.equal(preEffortSlot(early, 4, null), null);
    assert.equal(postEffortSlot(early, 4, null), null);
    // Alergare 12:00–13:00: prânzul implicit (13:00) e masa de după; se spune că orele sunt implicite.
    const noon: DaySession[] = [{ sport: 'alergare', type: 'z2', minutes: 60, startMin: 12 * 60, startSource: 'activitate' }];
    assert.equal(preEffortSlot(noon, 4, null), null);
    assert.equal(postEffortSlot(noon, 4, null), 'pranz');
    const d = nutritionDay(man({ sessions: noon }));
    assert.ok(d.warnings.some((w) => /orele implicite ale meselor/.test(w)), d.warnings.join(' | '));
  });
});

describe('S — siguranță și restricții', () => {
  it('S05: alăptarea (distinctă de sarcină) oprește deficitul și ținta automată; sportul nu e blocat', () => {
    const d = nutritionDay(man({ goal: 'fit-slabire', athlete: { sex: 'f', age: 30, heightCm: 165, weightKg: 65 }, blockers: { lactation: true } }));
    assert.equal(d.energy, null);
    assert.ok(d.warnings.some((w) => /alăptare/.test(w)));
    assert.match(d.goalNote, /fără deficit azi: alăptare/);
  });
  it('S02/S03: „poate conține” exclude din planul verificat; produsul fără lactoză nu scapă de alergia la lapte', () => {
    (FOODS as Record<string, Food>)['sos-test'] = { id: 'sos-test', name: 'Sos de salată (test)', unit: 'g', kcal: 300, protein: 1, source: 'test', allergens: [], mayContain: ['mustar'] };
    (FOODS as Record<string, Food>)['iaurt-fl-test'] = { id: 'iaurt-fl-test', name: 'Iaurt fără lactoză (test)', unit: 'g', kcal: 60, protein: 4, source: 'test', allergens: ['lapte'], animal: 'lactat' };
    const r1: Recipe = { id: 'T1', name: 'Salată cu sos', kind: 'M', family: 'test', ingredients: [{ food: 'sos-test', qty: 30 }, { food: 'orez', qty: 100 }], steps: '', minutes: 10 };
    const r2: Recipe = { id: 'T2', name: 'Iaurt', kind: 'B', family: 'test', ingredients: [{ food: 'iaurt-fl-test', qty: 200 }], steps: '', minutes: 1 };
    assert.match(ineligibleReason(r1, { ...DEFAULT_PREFS, exclude: ['mustar'] })!, /poate conține urme de muștar/);
    assert.equal(ineligibleReason(r1, { ...DEFAULT_PREFS, exclude: ['lapte'] }), null);
    assert.match(ineligibleReason(r2, { ...DEFAULT_PREFS, exclude: ['lapte'] })!, /alergen exclus \(lapte\)/);
    delete (FOODS as Record<string, Food>)['sos-test'];
    delete (FOODS as Record<string, Food>)['iaurt-fl-test'];
  });
  it('S01: o alergie nouă invalidează alegerea de mai devreme (masa aleasă cu lapte iese, cu motiv) și mesele viitoare', () => {
    const milk = Object.values(RECIPE).find((r) => r.kind === 'M' && r.ingredients.some((i) => FOODS[i.food]!.allergens.includes('lapte')))!;
    const d = nutritionDay(man({ prefs: { ...DEFAULT_PREFS, meals: 3, exclude: ['lapte'], choices: { [DATE]: { pranz: milk.id } } } }));
    assert.ok(d.warnings.some((w) => w.includes(milk.id) && /alergen exclus/.test(w)), d.warnings.join(' | '));
    for (const m of d.meals) assert.ok(!m.allergens.includes('lapte'), m.recipe.id);
    assert.deepEqual(d.check.allergens, []);
  });
  it('S09: antrenamentul mutat după ce masa a fost mâncată: consumul rămâne, doar restul se recalculează', () => {
    const base = nutritionDay(man({ prefs: { ...DEFAULT_PREFS, meals: 3 } }));
    const b = base.meals.find((m) => m.slot === 'mic_dejun')!;
    let log: MealLog = recordSuggested({}, DATE, base.meals.map((m) => ({ slot: m.slot, recipeId: m.recipe.id })), DATE);
    log = recordConsumed(log, DATE, 'mic_dejun', true, '2026-10-19T08:00:00Z', { recipeId: b.recipe.id, items: b.items.map((i) => ({ food: i.food, qty: i.qty })) });
    const moved = nutritionDay(man({ sessions: [{ sport: 'bicicleta', type: 'lung', minutes: 180, startMin: 15 * 60 }], prefs: { ...DEFAULT_PREFS, meals: 3, log } }));
    const bm = moved.meals.find((m) => m.slot === 'mic_dejun')!;
    assert.equal(bm.kcal, b.kcal);
    assert.ok(moved.energy!.target > base.energy!.target);
    assert.ok(moved.meals.find((m) => m.slot === 'cina')!.kcal >= base.meals.find((m) => m.slot === 'cina')!.kcal);
  });
  it('S10: masa nedeclarată rămâne necunoscută, nu „zero consumat”', () => {
    assert.equal(consumedTotals(undefined, DATE), null);
    const log = recordChoice({}, DATE, 'pranz', 'M01', 'M02');
    assert.equal(consumedTotals(log, DATE), null);
    assert.equal(nutritionDay(man({ prefs: { ...DEFAULT_PREFS, log } })).check.consumed.meals, 0);
  });
  it('bugetul: rețetele cu toate prețurile cunoscute au prioritate când există buget (pe 14 zile, mai multe mese cu cost verificat)', () => {
    const count = (budget: number | null) => {
      let n = 0;
      for (let k = 0; k < 14; k++) n += nutritionDay(man({ date: addDays(DATE, k), prefs: { ...DEFAULT_PREFS, meals: 3, budget } })).meals.filter((m) => m.cost != null).length;
      return n;
    };
    const withB = count(60);
    const noB = count(null);
    assert.ok(withB > noB, `${withB} vs ${noB}`);
    assert.ok(withB >= 4);
  });
});
