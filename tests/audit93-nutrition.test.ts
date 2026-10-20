// Auditul v93 — nutriția: A77, A78, A80–A84, A86 (testele T52, T53, T55, T57, T58). Cifrele sunt calculate în cod
// (src/nutrition); testele verifică motorul, nu textele AI-ului.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PREFS, alternatives, budgetFit, nutritionDay, recipeFit, selectDays, sessionNetKcal, type DaySession, type NutritionInput } from '../src/nutrition/engine.js';
import { daySessions } from '../src/nutrition/from-me.js';
import { consumedOn, loggedPicks, recordChoice, recordConsumed, recordSuggested, stateOf, type MealLog } from '../src/nutrition/log.js';
import { FOODS } from '../src/nutrition/foods.js';
import { RECIPE, RECIPES } from '../src/nutrition/recipes.js';
import { addDays } from '../src/util/dates.js';

const DATE = '2026-10-19';
// Profilul din verificarea auditului: bărbat 40 de ani, 180 cm, 75 kg, obiectiv 70.3.
const ATH = { sex: 'm' as const, age: 40, heightCm: 180, weightKg: 75 };
const base = (o: Partial<NutritionInput> = {}): NutritionInput => ({ date: DATE, athleteId: 'u-a', goal: '70.3', athlete: ATH, sessions: [], prefs: DEFAULT_PREFS, ...o });
const BRICK: DaySession[] = [
  { sport: 'bicicleta', type: 'brick', minutes: 180, startMin: 480 },
  { sport: 'alergare', type: 'brick', minutes: 45, startMin: 663 },
];
const GYM: DaySession[] = [{ sport: 'forta', type: 'forta', minutes: 45, startMin: 1080 }];

test('A78: ținte de carbohidrați, proteine și grăsimi pe tipul zilei; sala de 45 min și brick-ul lung nu primesc aceeași distribuție', () => {
  const rest = nutritionDay(base());
  const gym = nutritionDay(base({ sessions: GYM }));
  const brick = nutritionDay(base({ sessions: BRICK }));
  const hard = nutritionDay(base({ sessions: [{ sport: 'alergare', type: 'calitate', minutes: 60, key: true }] }));
  for (const d of [rest, gym, brick, hard]) assert.ok(d.macros, d.dayType);
  // g/kg pe treapta zilei (AIS / IOC); ziua de pauză nu e în tabel → setare de produs, spusă ca atare.
  assert.deepEqual(gym.macros!.carbs.gPerKg, [3, 5]);
  assert.deepEqual(hard.macros!.carbs.gPerKg, [5, 7]);
  assert.deepEqual(brick.macros!.carbs.gPerKg, [6, 10]);
  assert.match(gym.macros!.carbs.source, /AIS|IOC/);
  assert.match(rest.macros!.carbs.source, /setare de produs/);
  assert.match(brick.macros!.fat.source, /setare de produs/);
  assert.ok(brick.macros!.carbs.g[0] > gym.macros!.carbs.g[1], 'brick-ul cere mai mulți carbohidrați decât maximul zilei de sală');
  // Grăsimile = restul energiei, cu un minim; ținta de energie se închide exact.
  for (const d of [rest, gym, brick, hard]) {
    const m = d.macros!;
    assert.ok(m.fat.g[0] >= m.fat.minG - 1e-6, `${d.dayType}: grăsimi sub minim`);
    assert.ok(m.fat.g[0] <= m.fat.g[1]);
    const mid = m.protein.g * 4 + ((m.carbs.g[0] + m.carbs.g[1]) / 2) * 4 + m.fat.target * 9;
    assert.ok(Math.abs(mid - d.energy!.target) < 1, `${d.dayType}: ${mid} vs ${d.energy!.target}`);
    assert.ok(m.explain.length > 40);
  }
  // Proporția de energie din carbohidrați în țintă diferă (nu doar caloriile), iar alimentarea din efort intră în carbohidrați.
  const share = (d: typeof gym) => (((d.macros!.carbs.g[0] + d.macros!.carbs.g[1]) / 2) * 4) / d.energy!.target;
  assert.ok(share(brick) > share(gym), `${share(brick)} vs ${share(gym)}`);
  assert.ok(brick.macros!.carbs.g[0] / 75 >= 6 && gym.macros!.carbs.g[1] / 75 <= 5);
  assert.equal(brick.macros!.carbs.fromFuel, brick.fuel.reduce((n, f) => n + f.plannedG, 0));
  // Mesele urmează ținta: în ziua cu brick, mai multă energie din alimentele bogate în carbohidrați decât în ziua de sală.
  assert.ok(brick.macros!.carbFoodShare > gym.macros!.carbFoodShare, `${brick.macros!.carbFoodShare} vs ${gym.macros!.carbFoodShare}`);
});

test('A77/T55: metoda și ipotezele sunt scrise; sport necunoscut nu primește MET de alergare; greutatea veche e semnalată', () => {
  const yoga = nutritionDay(base({ sessions: [{ sport: 'yoga' as never, type: 'activitate', minutes: 60 }] }));
  assert.equal(sessionNetKcal({ sport: 'yoga' as never, type: 'activitate', minutes: 60 }, 75), null);
  assert.equal(yoga.energy!.exercise, 0, 'yoga nu e alergare: nu se inventează 525 kcal');
  assert.deepEqual(yoga.energy!.unknown, ['yoga 60 min']);
  assert.ok(yoga.warnings.some((w) => /yoga/.test(w) && /nu e estimat/.test(w)), yoga.warnings.join(' | '));
  const run = nutritionDay(base({ sessions: [{ sport: 'alergare', type: 'z2', minutes: 60 }] }));
  const m = run.energy!.method.join(' ');
  for (const re of [/Mifflin/, /1,4/, /MET/, /Compendium/, /marjă de produs/, /75 kg/]) assert.match(m, re);
  // Greutatea: necunoscută rămâne necunoscută; veche → spus, cu data.
  const old = nutritionDay(base({ athlete: { ...ATH, weightDate: addDays(DATE, -60) } }));
  assert.ok(old.warnings.some((w) => /greutatea e din/.test(w) && /60 de zile/.test(w)), old.warnings.join(' | '));
  const fresh = nutritionDay(base({ athlete: { ...ATH, weightDate: addDays(DATE, -3) } }));
  assert.ok(!fresh.warnings.some((w) => /greutatea e din/.test(w)));
});

test('T57: ședința făcută (sau neplanificată) nu șterge energia deja consumată din necesarul zilei', () => {
  const plan = [{ id: 'w1', date: DATE, sport: 'alergare' as const, type: 'z2' as const, plannedMinutes: 60, key: false, status: 'planificat' as const }];
  // Înainte: planificată.
  const before = daySessions(plan, [], DATE, []);
  assert.equal(before.length, 1);
  assert.equal(before[0]!.done, false);
  // După: făcută 70 min (activitatea reală), chiar dacă statusul din plan rămâne „planificat”.
  const after = daySessions(plan, [{ date: DATE, sport: 'alergare', minutes: 70, startLocal: '07:10' }], DATE, []);
  assert.equal(after.length, 1);
  assert.equal(after[0]!.done, true);
  assert.equal(after[0]!.minutes, 70);
  assert.equal(after[0]!.startMin, 7 * 60 + 10);
  // Ședința anulată de sistem, dar făcută de sportiv: energia rămâne.
  const cancelled = daySessions([{ ...plan[0]!, status: 'anulat_sistem' as const }], [{ date: DATE, sport: 'alergare', minutes: 50 }], DATE, []);
  assert.equal(cancelled.length, 1);
  assert.equal(cancelled[0]!.minutes, 50);
  // Efort neplanificat: intră și el.
  const extra = daySessions([], [{ date: DATE, sport: 'bicicleta', minutes: 40 }], DATE, []);
  assert.equal(extra.length, 1);
  const eAfter = nutritionDay(base({ sessions: after }));
  assert.ok(Math.abs(eAfter.energy!.exercise - sessionNetKcal(after[0]!, 75)!) < 1e-6);
  assert.ok(eAfter.energy!.exercise > 0);
  // Brick-ul din plan (o singură ședință) se împarte ca în calendar: bicicletă + alergare, aceeași fereastră de efort.
  const brick = daySessions([{ id: 'b1', date: DATE, sport: 'bicicleta', type: 'brick', plannedMinutes: 228, key: true, status: 'planificat', structure: 'tură 180 min Z2 + tranziție 3 min + alergare 45 min imediat după' }], [], DATE, []);
  assert.deepEqual(brick.map((s) => [s.sport, s.minutes]), [['bicicleta', 180], ['alergare', 45]]);
  assert.equal(brick[0]!.window, brick[1]!.window);
});

test('A81/T52: 70.3 cu una sau două mese — numărul ales e respectat, refuzul gustărilor e respectat, o masă nu e implicit cina', () => {
  const one = (p: Partial<typeof DEFAULT_PREFS>) => nutritionDay(base({ sessions: BRICK, prefs: { ...DEFAULT_PREFS, ...p } }));
  // Refuz: exact o masă, nicio gustare ascunsă (nici „gustare cu proteine”), iar golul e explicat cu variante.
  const noSnack = one({ meals: 1, snacksOk: false });
  assert.equal(noSnack.meals.length, 1, noSnack.meals.map((m) => m.label).join(', '));
  assert.equal(noSnack.check.meals.extra, 0);
  assert.ok(noSnack.warnings.some((w) => /fără gustări/.test(w) && /variante/.test(w)), noSnack.warnings.join(' | '));
  const twoNo = one({ meals: 2, snacksOk: false });
  assert.equal(twoNo.meals.length, 2);
  for (const n of [3, 4] as const) assert.equal(one({ meals: n, snacksOk: false }).meals.length, n);
  // Cu gustări acceptate: cel mult 2 în plus pentru 1–2 mese, numite ca atare, nu „patru mese mascate”.
  const ok1 = one({ meals: 1 });
  assert.ok(ok1.meals.length <= 3, ok1.meals.map((m) => m.label).join(', '));
  assert.equal(ok1.check.meals.main, 1);
  assert.equal(ok1.check.meals.extra, ok1.meals.length - 1);
  for (const m of ok1.meals.slice(1)) assert.match(m.label, /Gustare/);
  // O singură masă: ora declarată decide slotul (prânz), nu cina implicită.
  const lunch = one({ meals: 1, mealTimes: [13 * 60] });
  assert.equal(lunch.meals[0]!.slot, 'pranz');
  const breakfast2 = one({ meals: 2, mealTimes: [8 * 60, 19 * 60] });
  assert.deepEqual(breakfast2.meals.slice(0, 2).map((m) => m.slot), ['mic_dejun', 'cina']);
  // Fără oră: cina rămâne o presupunere, spusă.
  const noTime = one({ meals: 1, snacksOk: false });
  assert.equal(noTime.meals[0]!.slot, 'cina');
  assert.ok(noTime.warnings.some((w) => /ora mesei/.test(w)));
});

test('A82: bugetul e constrângere în selecție; prețul necunoscut rămâne necunoscut; fără soluție, constrângerea e numită', () => {
  for (const budget of [20, 30, 150]) {
    const d = nutritionDay(base({ prefs: { ...DEFAULT_PREFS, budget } }));
    const b = d.check.budget;
    assert.equal(b.limit, budget);
    // Ce se știe sigur (partea cu preț) nu trece de buget, altfel starea e „peste” și constrângerea e numită.
    if (b.costKnown > budget) {
      assert.equal(b.status, 'peste');
      assert.ok(b.conflict);
    }
    if (!d.totals.costComplete) {
      assert.notEqual(b.status, 'ok', 'cost incomplet = nu pot spune că e în buget');
      assert.equal(d.totals.cost, null);
      assert.match(d.budgetNote!, /cost incomplet/);
    }
  }
  // Selecția: pe 28 de zile, nicio rețetă aleasă nu are partea de cost cunoscută peste partea slotului (altfel slotul e
  // marcat „budgetOver”), iar bugetul chiar schimbă alegerea în unele zile.
  const prof = { dayKcal: 2600, meals: 4, seed: 'u-b' };
  const slots = ['mic_dejun', 'pranz', 'cina', 'gustare'] as const;
  const tight = selectDays(DATE, addDays(DATE, 27), { ...DEFAULT_PREFS, budget: 20 }, () => null, prof);
  const free = selectDays(DATE, addDays(DATE, 27), { ...DEFAULT_PREFS, budget: null }, () => null, prof);
  let differ = 0;
  for (const [d, day] of tight) {
    assert.ok(day.budgetChecked, 'bugetul e verificat în selecție');
    assert.ok(!free.get(d)!.budgetChecked);
    for (const s of slots) {
      const f = budgetFit(day.picks[s]!, s, 20, [...slots], prof);
      assert.ok(f.ok || day.budgetOver.includes(s), `${d} ${s} ${day.picks[s]}: ${f.knownCost} > ${f.limit}`);
    }
    if (slots.some((s) => day.picks[s] !== free.get(d)!.picks[s])) differ++;
  }
  assert.ok(differ > 0, 'bugetul schimbă selecția');
  // Prețul necunoscut nu e tratat ca „ieftin”: o rețetă fără niciun preț are cost cunoscut 0, dar complete = false.
  const unpriced = RECIPES.find((r) => r.ingredients.every((i) => !FOODS[i.food]!.price))!;
  const uf = budgetFit(unpriced.id, 'pranz', 20, [...slots]);
  assert.equal(uf.complete, false);
  // Buget imposibil (o alegere a sportivului peste el): starea „peste”, constrângerea incompatibilă e scrisă.
  const forced = nutritionDay(base({ prefs: { ...DEFAULT_PREFS, budget: 1, choices: { [DATE]: { pranz: 'M08' } } } }));
  assert.equal(forced.check.budget.status, 'peste');
  assert.match(forced.check.budget.conflict!, /buget/);
  assert.match(forced.check.budget.conflict!, /cel puțin/);
});

test('A83/T53: după „Schimbă” toată ziua e revalidată (energie, proteine, alergeni, buget, mese) și diferența rămasă e arătată', () => {
  const input = base({ sessions: [{ sport: 'bicicleta', type: 'lung', minutes: 150, startMin: 540 }], prefs: { ...DEFAULT_PREFS, budget: 25 } });
  for (const slot of ['pranz', 'mic_dejun'] as const) {
    const alts = alternatives(input, slot, []);
    assert.ok(alts.length > 0, slot);
    for (const a of alts) {
      const after = nutritionDay({ ...input, prefs: { ...input.prefs, choices: { [DATE]: { [slot]: a.id } } } });
      assert.equal(after.meals.find((m) => m.slot === slot)!.recipe.id, a.id);
      // Previzualizarea = ziua după alegere (aceleași porții, același total, același gol).
      assert.equal(Math.round(a.day.kcal), Math.round(after.totals.dayKcal), a.id);
      assert.equal(a.day.gapKcal, after.check.energy!.gap);
      assert.equal(a.day.protein, Math.round(after.totals.protein));
      assert.equal(a.day.budget, after.check.budget.status);
      assert.deepEqual(after.check.allergens, []);
      assert.equal(after.check.meals.main, 4);
      assert.equal(after.check.energy!.gap, Math.round(after.energy!.target - after.totals.dayKcal));
    }
  }
  // O alegere cu alergen exclus nu intră și se spune de ce.
  const milk = nutritionDay(base({ prefs: { ...DEFAULT_PREFS, exclude: ['lapte'], choices: { [DATE]: { pranz: 'M05' } } } }));
  assert.notEqual(milk.meals.find((m) => m.slot === 'pranz')!.recipe.id, 'M05');
  assert.ok(milk.warnings.some((w) => /M05|Cușcuș cu năut/.test(w) && /alerg/.test(w)), milk.warnings.join(' | '));
  assert.deepEqual(milk.check.allergens, []);
});

test('A86: brick 180 + 45 = o fereastră de efort, alimentarea numărată o singură dată; avertismentul spune golul real', () => {
  const d = nutritionDay(base({ sessions: BRICK }));
  // Ținta din verificare: Mifflin 1.680 × 1,4 + bicicletă (9,5 − 1) × 75 × 3 + alergare (10,5 − 1) × 75 × 0,75 = 4.799 kcal.
  assert.equal(Math.round(d.energy!.target), 4799);
  assert.equal(d.fuel.length, 1, 'un singur FuelPlan pentru brick');
  assert.equal(d.fuel[0]!.minutes, 225);
  assert.equal(d.fuel[0]!.plannedG, 225);
  assert.equal(d.fuel[0]!.kcal, 900);
  assert.equal(d.totals.dayKcal, d.totals.kcal + 900, 'mese + efort, efortul o singură dată');
  const gap = Math.round(d.energy!.target - d.totals.dayKcal);
  assert.equal(d.check.energy!.gap, gap);
  if (d.totals.dayKcal < d.energy!.low) {
    const w = d.warnings.find((x) => /lipsesc ~/.test(x));
    assert.ok(w, d.warnings.join(' | '));
    assert.ok(w!.includes(`~${gap.toLocaleString('ro-RO')} kcal`), `${w} — golul real ${gap}`);
  }
  // Cu 2 mese și fără gustări ziua rămâne sigur sub țintă: avertismentul are exact golul din valorile finale.
  const few = nutritionDay(base({ sessions: BRICK, prefs: { ...DEFAULT_PREFS, meals: 2, snacksOk: false } }));
  const fewGap = Math.round(few.energy!.target - few.totals.dayKcal);
  assert.ok(few.totals.dayKcal < few.energy!.low);
  assert.equal(few.totals.dayKcal, few.totals.kcal + 900);
  assert.equal(few.check.energy!.gap, fewGap);
  const fw = few.warnings.find((x) => /lipsesc ~/.test(x))!;
  assert.ok(fw.includes(`lipsesc ~${fewGap.toLocaleString('ro-RO')} kcal`), `${fw} — golul real ${fewGap}`);
  assert.ok(fw.includes(`ziua iese la ~${Math.round(few.totals.dayKcal).toLocaleString('ro-RO')} kcal`));
  // Același brick ca o singură ședință de 225 min = aceeași alimentare (nu depinde de cum e scris).
  const single = nutritionDay(base({ sessions: [{ sport: 'bicicleta', type: 'lung', minutes: 225 }] }));
  assert.equal(single.fuel[0]!.plannedG, 225);
  // Două ședințe de 40 min la ore diferite: fără gel, dar nu „zi fără nevoi”: nota despre masa dintre ele.
  const two = nutritionDay(base({ sessions: [{ sport: 'alergare', type: 'z2', minutes: 40, startMin: 420 }, { sport: 'inot', type: 'z2', minutes: 40, startMin: 1080 }] }));
  assert.equal(two.fuel.length, 0);
  assert.ok(two.fuelNotes.some((n) => /două ședințe/.test(n)));
  // Două ședințe de 40 min una după alta (≤ 30 min pauză): o fereastră de 80 min → alimentare 30–60 g/oră.
  const back = nutritionDay(base({ sessions: [{ sport: 'alergare', type: 'z2', minutes: 40, startMin: 420 }, { sport: 'bicicleta', type: 'z2', minutes: 40, startMin: 470 }] }));
  assert.equal(back.fuel.length, 1);
  assert.deepEqual(back.fuel[0]!.carbsPerHour, [30, 60]);
});

test('A84/T58: propus / acceptat / înlocuit / consumat separat; preferințele noi nu rescriu istoricul meniurilor', () => {
  const days = [addDays(DATE, -3), addDays(DATE, -2), addDays(DATE, -1)];
  let log: MealLog = {};
  const omni = (date: string) => nutritionDay(base({ date, athleteId: 'u-log', goal: '10k', prefs: { ...DEFAULT_PREFS, log } }));
  for (const d of days) log = recordSuggested(log, d, omni(d).meals.map((m) => ({ slot: m.slot, recipeId: m.recipe.id })), d);
  const original = Object.fromEntries(days.map((d) => [d, loggedPicks(log, d)]));
  const sugPranz = log[days[1]!]!.find((e) => e.slot === 'pranz')!.suggested;
  const other = RECIPES.find((r) => r.kind === 'M' && r.id !== sugPranz)!.id;
  log = recordChoice(log, days[1]!, 'pranz', other);
  log = recordConsumed(log, days[1]!, 'pranz', true);
  log = recordChoice(log, days[2]!, 'cina', log[days[2]!]!.find((e) => e.slot === 'cina')!.suggested);
  log = recordConsumed(log, days[0]!, 'mic_dejun', false);
  assert.equal(stateOf(log[days[1]!]!.find((e) => e.slot === 'pranz')!), 'consumed');
  assert.equal(stateOf(log[days[2]!]!.find((e) => e.slot === 'cina')!), 'accepted');
  assert.equal(stateOf(log[days[2]!]!.find((e) => e.slot === 'pranz')!), 'suggested');
  assert.equal(log[days[1]!]!.find((e) => e.slot === 'pranz')!.suggested, sugPranz, 'propunerea rămâne scrisă separat de înlocuire');
  // Masa înlocuită nu apare ca mâncată; doar ce a declarat sportivul.
  assert.deepEqual(consumedOn(log, days[1]!), [{ slot: 'pranz', recipeId: other }]);
  assert.deepEqual(consumedOn(log, days[0]!), []);
  // Preferințe noi (vegan, fără gluten): istoria din jurnal rămâne aceeași, iar o zi trecută nu se mai rescrie.
  const vegan = { ...DEFAULT_PREFS, diet: 'vegan' as const, exclude: ['gluten' as const], log };
  const sel = selectDays(days[0]!, DATE, vegan, () => null, { seed: 'u-log' });
  for (const d of days) assert.deepEqual(sel.get(d)!.picks, loggedPicks(log, d), d);
  assert.equal(sel.get(days[1]!)!.picks.pranz, other);
  const rewrite = recordSuggested(log, days[0]!, [{ slot: 'pranz', recipeId: 'M01' }], DATE);
  assert.deepEqual(loggedPicks(rewrite, days[0]!), original[days[0]!]);
  // Azi: meniul nou respectă preferințele noi (alergiile nu se relaxează de istoric).
  const today = nutritionDay(base({ date: DATE, athleteId: 'u-log', goal: '10k', prefs: vegan }));
  assert.ok(today.meals.every((m) => m.items.every((it) => !FOODS[it.food]!.animal && !FOODS[it.food]!.allergens.includes('gluten'))));
});

test('A80: fier / vitamina D doar cu indicație (niciodată din sex); proteina praf doar pentru diferența practică', () => {
  // Aceeași potrivire a rețetelor pentru bărbat și femeie cu același profil: fără bonus de fier dedus din sex.
  for (const r of RECIPES.filter((x) => x.kind === 'M').slice(0, 40)) assert.equal(recipeFit(r, 'pranz', { sex: 'f', goal: '10k', dayKcal: 2200, meals: 4 }), recipeFit(r, 'pranz', { sex: 'm', goal: '10k', dayKcal: 2200, meals: 4 }), r.id);
  const w = nutritionDay(base({ goal: '10k', athlete: { sex: 'f', age: 30, heightCm: 165, weightKg: 58 } }));
  assert.ok(!w.supplements.some((s) => s.kind === 'fier' || s.kind === 'vitamina_d'), 'nimic dedus din sex');
  const ind = nutritionDay(base({ goal: '10k', athlete: { sex: 'f', age: 30, heightCm: 165, weightKg: 58 }, indications: { iron: true, vitaminD: true } }));
  for (const k of ['fier', 'vitamina_d']) {
    const s = ind.supplements.find((x) => x.kind === k);
    assert.ok(s, k);
    assert.match(s!.text, /medic/);
    assert.doesNotMatch(s!.text, /\d+\s*(mg|µg|UI)/, 'fără doze');
  }
  // Proteina praf: acceptată + diferență reală → exact diferența; fără diferență → nimic; refuzată → meniul rămâne din alimente.
  const big = { sex: 'm' as const, age: 35, heightCm: 190, weightKg: 110 };
  const gapDay = nutritionDay(base({ athlete: big, prefs: { ...DEFAULT_PREFS, meals: 1, snacksOk: false, proteinPowder: true } }));
  const gapP = gapDay.protein!.target - gapDay.totals.protein;
  const pp = gapDay.supplements.find((s) => s.kind === 'proteina');
  if (gapP > gapDay.protein!.target * 0.1) {
    assert.ok(pp, 'diferența reală e acoperită opțional');
    assert.equal(pp!.proteinG, Math.ceil(gapP / 5) * 5);
    assert.match(pp!.text, /grame de produs/);
  }
  assert.equal(gapDay.totals.protein, gapDay.meals.reduce((n, m) => n + m.protein, 0), 'suplimentul nu e adunat la mese');
  const noGap = nutritionDay(base({ prefs: { ...DEFAULT_PREFS, proteinPowder: true } }));
  if (noGap.totals.protein >= noGap.protein!.target * 0.9) assert.ok(!noGap.supplements.some((s) => s.kind === 'proteina'), 'nu peste țintă');
  const refused = nutritionDay(base({ athlete: big, prefs: { ...DEFAULT_PREFS, meals: 1, snacksOk: false, proteinPowder: false } }));
  assert.ok(!refused.supplements.some((s) => s.kind === 'proteina'));
  assert.equal(refused.meals.length, 1);
  void RECIPE;
});
