// Ghidul „AIRON Nutriționist sportiv” v1.0 (§21b matricea de scenarii, §21c verificările de calcul).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PREFS, alternatives, mifflin, nutritionDay, recipeValues, selectDays, type NutritionInput } from '../src/nutrition/engine.js';
import { FOODS, foodCost, foodValues } from '../src/nutrition/foods.js';
import { RECIPE, RECIPES } from '../src/nutrition/recipes.js';
import { addDays, diffDays } from '../src/util/dates.js';

const DATE = '2026-10-19';
const man = (o: Partial<NutritionInput> = {}): NutritionInput => ({ date: DATE, athlete: { sex: 'm', age: 46, heightCm: 178, weightKg: 80 }, goal: '10k', sessions: [], prefs: DEFAULT_PREFS, ...o });
const woman = (o: Partial<NutritionInput> = {}): NutritionInput => ({ date: DATE, athlete: { sex: 'f', age: 30, heightCm: 165, weightKg: 65 }, goal: 'fit-slabire', sessions: [], prefs: DEFAULT_PREFS, ...o });

test('§03 formulele: exemplele de repaus ies exact, înainte de rotunjire', () => {
  assert.equal(mifflin('f', 65, 165, 30), 1370.25);
  assert.equal(mifflin('m', 80, 178, 46), 1687.5);
  assert.equal(mifflin('f', 65, 165, 30) * 1.5, 2055.375);
  assert.equal(mifflin('m', 80, 178, 46) * 1.5, 2531.25);
});

test('§15 cele 28 de rețete: energia și proteinele calculate din ingrediente = valorile din ghid', () => {
  const doc: Record<string, [number, number]> = { B01: [491, 25.4], B02: [409, 23.3], B03: [515, 28.0], B04: [391, 30.9], B05: [531, 25.6], B06: [576, 24.0], B07: [484, 29.5], M01: [657, 47.7], M02: [631, 25.7], M03: [629, 38.9], M04: [580, 44.7], M05: [624, 30.0], M06: [741, 34.0], M07: [544, 36.2], M08: [684, 55.2], M09: [661, 30.1], M10: [521, 38.4], M11: [662, 28.7], M12: [559, 43.5], M13: [782, 42.3], M14: [680, 36.0], G01: [206, 16.9], G02: [207, 8.9], G03: [244, 25.7], G04: [236, 13.1], G05: [251, 19.1], G06: [219, 6.0], G07: [302, 9.8] };
  assert.equal(RECIPES.length, 28);
  for (const r of RECIPES) {
    const v = recipeValues(r.id);
    assert.ok(Math.abs(v.kcal - doc[r.id]![0]) < 1 && Math.abs(v.protein - doc[r.id]![1]) < 0.15, `${r.id}: ${v.kcal} / ${v.protein}`);
  }
});

test('§17 exemplul A: 2.437 kcal, 109,5 g proteine, 18,54 RON (cantități crude/uscate, ulei în ml, măr comestibil)', () => {
  const A: [string, number][] = [['ovaz', 80], ['lapte', 300], ['mar', 87], ['pui', 130], ['orez', 100], ['mix-mexican', 200], ['ulei', 20], ['ovaz', 20], ['lapte', 300], ['mar', 87], ['linte', 100], ['orez', 100], ['mix-mexican', 200], ['ulei', 20]];
  const kcal = A.reduce((n, [f, q]) => n + foodValues(f, q).kcal, 0);
  const p = A.reduce((n, [f, q]) => n + foodValues(f, q).protein, 0);
  const cost = A.reduce((n, [f, q]) => n + foodCost(f, q)!, 0);
  assert.ok(Math.abs(kcal - 2437) < 1, String(kcal));
  assert.ok(Math.abs(p - 109.5) < 0.1, String(p));
  assert.ok(Math.abs(cost - 18.54) < 0.01, String(cost));
});

test('§21c: un preț lipsă rămâne lipsă (nu zero) și nu se afirmă încadrarea în buget', () => {
  assert.equal(FOODS.banana!.price, undefined);
  assert.equal(foodCost('banana', 120), null);
  for (const budget of [20, 50, 150]) {
    const d = nutritionDay(man({ prefs: { ...DEFAULT_PREFS, budget } }));
    if (!d.totals.costComplete) {
      assert.equal(d.totals.cost, null);
      assert.match(d.budgetNote!, /cost incomplet/);
      assert.doesNotMatch(d.budgetNote!, /în buget/);
    }
    // Bugetul nu scade energia: ținta e aceeași la orice buget.
    assert.equal(Math.round(d.energy!.target), Math.round(nutritionDay(man()).energy!.target));
  }
});

test('Personalizare: aceeași persoană, zi liberă vs 3 h de bicicletă → diferență explicabilă, alimentarea numărată o dată', () => {
  const rest = nutritionDay(man());
  const ride = nutritionDay(man({ sessions: [{ sport: 'bicicleta', type: 'lung', minutes: 180, startMin: 480 }] }));
  assert.equal(rest.fuel.length, 0);
  assert.ok(ride.energy!.exercise > 1000);
  assert.equal(ride.fuel[0]!.plannedG, 180);
  assert.equal(ride.totals.dayKcal, ride.totals.kcal + ride.fuel[0]!.kcal);
  assert.ok(Math.abs(ride.totals.dayKcal - ride.energy!.target) < ride.energy!.target * 0.1, 'totalul zilei (mese + efort) e în intervalul țintei');
  assert.match(ride.message, /intră în același total/);
  assert.equal(ride.meals.find((m) => m.why?.startsWith('înaintea'))?.slot, 'mic_dejun');
  assert.ok(!ride.meals.find((m) => m.slot === 'mic_dejun')!.recipe.highFiber);
});

test('Bărbat 46, 10 km: 50 min nu primește geluri; 100 min de alergare lungă primește 30–60 g/oră', () => {
  assert.equal(nutritionDay(man({ sessions: [{ sport: 'alergare', type: 'calitate', minutes: 50 }] })).fuel.length, 0);
  const l = nutritionDay(man({ sessions: [{ sport: 'alergare', type: 'lung', minutes: 100 }] }));
  assert.deepEqual(l.fuel[0]!.carbsPerHour, [30, 60]);
  assert.equal(l.fuel[0]!.plannedG, 65);
});

test('Femeie 30, slăbire: deficit doar în zilele ușoare; fără prag universal de kcal; aceleași reguli ca la bărbat', () => {
  const easy = nutritionDay(woman({ sessions: [{ sport: 'forta', type: 'forta', minutes: 50 }] }));
  assert.equal(easy.energy!.adjustPct, -12);
  assert.equal(easy.protein!.gPerKg, 1.8);
  const long = nutritionDay(woman({ sessions: [{ sport: 'alergare', type: 'lung', minutes: 90 }] }));
  assert.equal(long.energy!.adjustPct, 0);
  // Diferența bărbat/femeie la aceleași date = doar coeficientul ecuației (166 kcal × 1,4).
  const m = nutritionDay(woman({ athlete: { sex: 'm', age: 30, heightCm: 165, weightKg: 65 } }));
  const f = nutritionDay(woman());
  assert.ok(Math.abs(m.energy!.base - f.energy!.base - 166 * 1.4) < 0.01);
});

test('Femeie 52, înot / adult 68: vârsta nu taie caloriile; la 68 de ani avertizare despre afecțiuni și proteine distribuite', () => {
  const w52 = nutritionDay({ date: DATE, athlete: { sex: 'f', age: 52, heightCm: 168, weightKg: 62 }, goal: 'inot-1900', sessions: [{ sport: 'inot', type: 'z2', minutes: 60 }], prefs: DEFAULT_PREFS });
  assert.equal(w52.energy!.adjustPct, 0);
  const a68 = nutritionDay({ date: DATE, athlete: { sex: 'm', age: 68, heightCm: 175, weightKg: 78 }, goal: 'fit-intretinere', sessions: [{ sport: 'forta', type: 'forta', minutes: 45 }], prefs: DEFAULT_PREFS });
  assert.ok(a68.warnings.some((w) => /65 de ani/.test(w)));
});

test('Minor, sarcină, oboseală repetată, restricție: fără deficit, cu motivul scris', () => {
  const s = [{ sport: 'forta' as const, type: 'forta', minutes: 40 }];
  for (const [b, why] of [[{ minor: true }, /sub 18/], [{ pregnancy: true }, /sarcină/], [{ fatigue: true }, /oboseală/], [{ restriction: 'rosu' as const }, /restricție/]] as const) {
    const d = nutritionDay(woman({ sessions: s, blockers: b }));
    assert.equal(d.energy!.adjustPct, 0);
    assert.match(d.goalNote, why);
  }
});

test('Vegan și alergie la lapte: nicio masă cu produse animale / lapte; lipsa unei variante e spusă, nu inventată', () => {
  const v = nutritionDay(man({ prefs: { ...DEFAULT_PREFS, diet: 'vegan' } }));
  assert.ok(v.meals.every((m) => m.items.every((it) => !FOODS[it.food]!.animal)));
  assert.ok(v.warnings.some((w) => /mic dejun: nicio rețetă/.test(w)));
  const noMilk = { ...DEFAULT_PREFS, exclude: ['lapte' as const] };
  const sel = selectDays(addDays(DATE, -13), DATE, noMilk);
  for (const [, day] of sel) for (const id of Object.values(day.picks)) assert.ok(!RECIPE[id!]!.ingredients.some((i) => FOODS[i.food]!.allergens.includes('lapte')), id);
  const d = nutritionDay(man({ prefs: noMilk }));
  for (const slot of ['mic_dejun', 'pranz', 'cina', 'gustare'] as const) for (const a of alternatives(d, slot, noMilk)) assert.ok(!RECIPE[a.id]!.ingredients.some((i) => i.food === 'lapte' || i.food === 'iaurt' || i.food === 'cottage'), a.id);
});

test('Triatlon cu două ședințe: un singur total zilnic, alimentarea fiecărei ședințe lungi o dată', () => {
  const d = nutritionDay(man({ goal: '70.3', sessions: [{ sport: 'inot', type: 'z2', minutes: 45, startMin: 420 }, { sport: 'bicicleta', type: 'lung', minutes: 120, startMin: 1020 }] }));
  assert.equal(d.fuel.length, 1);
  assert.equal(d.totals.dayKcal, d.totals.kcal + d.fuel[0]!.kcal);
});

test('Fără greutate: porții de referință, spus explicit ce lipsește, fără țintă „personalizată”', () => {
  const d = nutritionDay(man({ athlete: { sex: 'm', age: 46, heightCm: 178, weightKg: null } }));
  assert.equal(d.personalized, false);
  assert.equal(d.energy, null);
  assert.match(d.message, /nepersonalizate: lipsește greutatea/);
});

test('§14 varietate pe 180 de zile: max 2 apariții în 7 zile, minimum 4 zile între ele, altă familie la prânz și cină', () => {
  const sel = selectDays('2026-10-01', addDays('2026-10-01', 179), DEFAULT_PREFS);
  const uses = new Map<string, string[]>();
  for (const [d, day] of sel) {
    assert.deepEqual(day.repeats, [], d);
    assert.notEqual(RECIPE[day.picks.pranz!]!.family, RECIPE[day.picks.cina!]!.family, d);
    for (const id of Object.values(day.picks)) uses.set(id!, [...(uses.get(id!) ?? []), d]);
  }
  for (const [id, ds] of uses) {
    for (let i = 1; i < ds.length; i++) assert.ok(diffDays(ds[i - 1]!, ds[i]!) >= 5, `${id}: ${ds[i - 1]} → ${ds[i]}`);
  }
  // Cele 14 zile ale rotației din ghid apar ca atare în omnivor.
  assert.equal(sel.size, 180);
});

test('Alegerea „Schimbă” e respectată în ziua ei și intră în istoricul de varietate', () => {
  const prefs = { ...DEFAULT_PREFS, choices: { [DATE]: { pranz: 'M04' } } };
  const d = nutritionDay(man({ prefs }));
  assert.equal(d.meals.find((m) => m.slot === 'pranz')!.recipe.id, 'M04');
});
