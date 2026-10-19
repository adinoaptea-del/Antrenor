// Compoziția și prețurile folosite de nutriționist (ghidul „AIRON Nutriționist sportiv” v1.0, 19.10.2026, Anexa A și §13).
// Valorile sunt la 100 g, cu excepția laptelui și a uleiului (la 100 ml). D01 = CoFID 2021 (cod fișă), D02 = producător,
// Pxx = pagina comerciantului; U = USDA FoodData Central (SR Legacy / Foundation), cu codul FDC sau NDB. Alimentele generice nu sunt identice cu fiecare marcă: valorile sunt estimări de
// compoziție, nu analiza porției din farfurie. Doar energia și proteinele sunt în tabel; carbohidrații și
// micronutrienții NU sunt calculați (null nu devine zero).
//
// Prețurile: verificate online la 19.10.2026 (Auchan), nu un bon și nu o ofertă pentru adresa sportivului. Un aliment fără
// preț rămâne fără preț: costul zilei devine „incomplet”, nu zero.

export type Unit = 'g' | 'ml';

export interface Food {
  id: string;
  name: string;
  unit: Unit;
  /** kcal la 100 g / 100 ml. */
  kcal: number;
  /** Proteine (g) la 100 g / 100 ml. */
  protein: number;
  source: string;
  /** Alergeni / categorii: lapte, ou, gluten, pește, crustacee, nuci, arahide, soia, susan. */
  allergens: Allergen[];
  /** Produs animal (pentru vegan: inclusiv mierea) și carne/pește (pentru vegetarian). */
  animal?: 'carne' | 'peste' | 'lactat' | 'ou' | 'miere';
  /** Prețul pe kg / L al produsului cumpărat și partea comestibilă (0–1), cu sursa și data. */
  price?: { ronPerUnit: number; edible?: number; source: string; checkedAt: string };
}

export type Allergen = 'lapte' | 'ou' | 'gluten' | 'peste' | 'crustacee' | 'nuci' | 'arahide' | 'soia' | 'susan';

const CHECKED = '2026-10-19';

export const FOODS: Record<string, Food> = Object.fromEntries(
  (
    [
      { id: 'ovaz', name: 'Fulgi de ovăz, uscați', unit: 'g', kcal: 381, protein: 10.9, source: 'D01 / 11-788', allergens: ['gluten'], price: { ronPerUnit: 13.18, source: 'P01 Auchan, ovăz Pirifan 500 g', checkedAt: CHECKED } },
      { id: 'mar', name: 'Măr, parte comestibilă cu coajă', unit: 'g', kcal: 51, protein: 0.6, source: 'D01 / 14-319', allergens: [], price: { ronPerUnit: 5.99, edible: 0.87, source: 'P09 Auchan, mere Golden vrac', checkedAt: CHECKED } },
      { id: 'banana', name: 'Banană, fără coajă', unit: 'g', kcal: 81, protein: 1.2, source: 'D01 / 14-318', allergens: [] },
      { id: 'paine', name: 'Pâine integrală', unit: 'g', kcal: 217, protein: 9.4, source: 'D01 / 11-981', allergens: ['gluten'] },
      { id: 'pui', name: 'Carne albă de pui, crudă, fără piele', unit: 'g', kcal: 106, protein: 24, source: 'D01 / 18-290', allergens: [], animal: 'carne', price: { ronPerUnit: 33.09, source: 'P07 Auchan, piept de pui fără piele (listare)', checkedAt: CHECKED } },
      { id: 'ou', name: 'Ou întreg, crud, fără coajă', unit: 'g', kcal: 131, protein: 12.6, source: 'D01 / 12-937', allergens: ['ou'], animal: 'ou' },
      { id: 'somon', name: 'Somon de crescătorie, crud, fără oase', unit: 'g', kcal: 217, protein: 20.4, source: 'D01 / 16-356', allergens: ['peste'], animal: 'peste' },
      { id: 'tofu', name: 'Tofu simplu, preparat la abur', unit: 'g', kcal: 73, protein: 8.1, source: 'D01 / 13-570', allergens: ['soia'] },
      { id: 'rosii', name: 'Roșii crude', unit: 'g', kcal: 14, protein: 0.5, source: 'D01 / 13-517', allergens: [] },
      { id: 'rosii-conserva', name: 'Roșii la conservă, tot conținutul', unit: 'g', kcal: 19, protein: 1.1, source: 'D01 / 13-530', allergens: [] },
      { id: 'nuca', name: 'Miez de nucă', unit: 'g', kcal: 688, protein: 14.7, source: 'D01 / 14-879', allergens: ['nuci'] },
      { id: 'morcov', name: 'Morcov crud, parte comestibilă', unit: 'g', kcal: 34, protein: 0.5, source: 'D01 / 13-496', allergens: [] },
      { id: 'naut', name: 'Năut conservat, încălzit și scurs', unit: 'g', kcal: 129, protein: 8.4, source: 'D01 / 13-670', allergens: [] },
      { id: 'paste', name: 'Paste integrale, uscate', unit: 'g', kcal: 329, protein: 12.6, source: 'D01 / 11-718', allergens: ['gluten'] },
      { id: 'cartof', name: 'Cartof crud, curățat', unit: 'g', kcal: 82, protein: 1.9, source: 'D01 / 13-489', allergens: [] },
      { id: 'spanac', name: 'Baby spanac crud', unit: 'g', kcal: 16, protein: 2.6, source: 'D01 / 13-521', allergens: [] },
      { id: 'capsuni', name: 'Căpșuni crude', unit: 'g', kcal: 30, protein: 0.6, source: 'D01 / 14-324', allergens: [] },
      { id: 'ton', name: 'Ton în saramură, scurs', unit: 'g', kcal: 109, protein: 24.9, source: 'D01 / 16-416', allergens: ['peste'], animal: 'peste' },
      { id: 'cottage', name: 'Brânză cottage cu grăsime redusă', unit: 'g', kcal: 68, protein: 10.6, source: 'D01 / 12-550', allergens: ['lapte'], animal: 'lactat' },
      { id: 'fasole', name: 'Fasole roșie conservată, încălzită și scursă', unit: 'g', kcal: 100, protein: 8.6, source: 'D01 / 13-660', allergens: [] },
      { id: 'cuscus', name: 'Cușcuș, uscat', unit: 'g', kcal: 364, protein: 12, source: 'D01 / 11-901', allergens: ['gluten'] },
      { id: 'arahide', name: 'Unt de arahide fin', unit: 'g', kcal: 607, protein: 22.8, source: 'D01 / 14-892', allergens: ['arahide'] },
      { id: 'lapte', name: 'Lapte UHT 1,5%', unit: 'ml', kcal: 44, protein: 3, source: 'P02 / 82335', allergens: ['lapte'], animal: 'lactat', price: { ronPerUnit: 4.75, source: 'P02 Auchan, lapte UHT 1,5% 1 L', checkedAt: CHECKED } },
      { id: 'orez', name: 'Orez alb, uscat', unit: 'g', kcal: 346, protein: 7, source: 'P03 / 106065', allergens: [], price: { ronPerUnit: 6.79, source: 'P03 Auchan, orez Deroni 1 kg', checkedAt: CHECKED } },
      { id: 'linte', name: 'Linte verde, uscată', unit: 'g', kcal: 336, protein: 23.5, source: 'P04 / linte-verde-auchan', allergens: [], price: { ronPerUnit: 12.38, source: 'P04 Auchan, linte verde 500 g', checkedAt: CHECKED } },
      { id: 'mix-mexican', name: 'Mix mexican de legume, congelat', unit: 'g', kcal: 52.12, protein: 2.72, source: 'P05 / 150460', allergens: [], price: { ronPerUnit: 10.2, source: 'P05 Auchan, mix mexican 450 g', checkedAt: CHECKED } },
      { id: 'ulei', name: 'Ulei de măsline', unit: 'ml', kcal: 823, protein: 0, source: 'P06 / 952486', allergens: [], price: { ronPerUnit: 54.99, source: 'P06 Auchan, ulei de măsline 1 L', checkedAt: CHECKED } },
      { id: 'iaurt', name: 'Iaurt grecesc 2%', unit: 'g', kcal: 65, protein: 8, source: 'D02 / Olympus 2% (producător)', allergens: ['lapte'], animal: 'lactat', price: { ronPerUnit: 23.1, source: 'P08 Auchan, Olympus 2% 900 g la 20,79 RON (preț de referință, fără promoție)', checkedAt: CHECKED } },
      // ——— Adăugate de AIRON (19.10.2026, biblioteca de 200 de rețete): USDA FoodData Central, cu codul fiecărui aliment ———
      { id: 'curcan', name: 'Piept de curcan, crud, fără piele', unit: 'g', kcal: 114, protein: 23.3, source: 'U / USDA FDC 174515 SR Legacy, „Turkey, retail parts, breast, meat only, raw” (preluat prin getfoodfacts.com, 19.10.2026)', allergens: [], animal: 'carne' },
      { id: 'vita', name: 'Carne tocată de vită 95% slabă, crudă', unit: 'g', kcal: 137, protein: 21.4, source: 'U / USDA FDC 171790 SR Legacy, „Beef, ground, 95% lean meat / 5% fat, raw” (preluat prin getfoodfacts.com, 19.10.2026)', allergens: [], animal: 'carne' },
      { id: 'porc', name: 'Mușchi de porc, crud, doar carne slabă', unit: 'g', kcal: 109, protein: 20.9, source: 'U / USDA FDC 168249 SR Legacy, „Pork, fresh, loin, tenderloin, separable lean only, raw” (preluat prin getfoodfacts.com, 19.10.2026)', allergens: [], animal: 'carne' },
      { id: 'cod', name: 'Cod, crud', unit: 'g', kcal: 82, protein: 17.8, source: 'U / USDA FDC 171955 SR Legacy, „Fish, cod, Atlantic, raw” (preluat prin getfoodfacts.com, 19.10.2026)', allergens: ['peste'], animal: 'peste' },
      { id: 'macrou', name: 'Macrou, crud', unit: 'g', kcal: 205, protein: 18.6, source: 'U / USDA FDC 175119 SR Legacy, „Fish, mackerel, Atlantic, raw” (preluat prin getfoodfacts.com, 19.10.2026)', allergens: ['peste'], animal: 'peste' },
      { id: 'sardine', name: 'Sardine în ulei, scurse, cu os', unit: 'g', kcal: 208, protein: 24.6, source: 'U / USDA FDC 175139 SR Legacy, „Fish, sardine, Atlantic, canned in oil, drained solids with bone” (preluat prin getfoodfacts.com, 19.10.2026)', allergens: ['peste'], animal: 'peste' },
      { id: 'pastrav', name: 'Păstrăv curcubeu de crescătorie, crud', unit: 'g', kcal: 141, protein: 19.94, source: 'U / USDA SR Legacy NDB 15240, „Fish, trout, rainbow, farmed, raw” (preluat prin nutritionvalue.org și recipal.com, 19.10.2026)', allergens: ['peste'], animal: 'peste' },
      { id: 'creveti', name: 'Creveți cruzi, curățați', unit: 'g', kcal: 85, protein: 20.1, source: 'U / USDA FDC 175179 SR Legacy, „Crustaceans, shrimp, raw” (preluat prin getfoodfacts.com, 19.10.2026)', allergens: ['crustacee'], animal: 'peste' },
      { id: 'telemea', name: 'Telemea / brânză feta', unit: 'g', kcal: 265, protein: 14.2, source: 'U / USDA FDC 173420 SR Legacy, „Cheese, feta” (preluat prin getfoodfacts.com, 19.10.2026)', allergens: ['lapte'], animal: 'lactat' },
      { id: 'mozzarella', name: 'Mozzarella semidegresată', unit: 'g', kcal: 254, protein: 24.3, source: 'U / USDA FDC 170847 SR Legacy, „Cheese, mozzarella, part skim milk” (preluat prin getfoodfacts.com, 19.10.2026)', allergens: ['lapte'], animal: 'lactat' },
      { id: 'parmezan', name: 'Parmezan', unit: 'g', kcal: 392, protein: 35.8, source: 'U / USDA FDC 170848 SR Legacy, „Cheese, parmesan, hard” (preluat prin getfoodfacts.com, 19.10.2026)', allergens: ['lapte'], animal: 'lactat' },
      { id: 'chefir', name: 'Chefir cu grăsime redusă', unit: 'ml', kcal: 43, protein: 3.79, source: 'U / USDA FDC 170904 SR Legacy, „Kefir, lowfat, plain, LIFEWAY” (preluat prin getfoodfacts.com, 19.10.2026)', allergens: ['lapte'], animal: 'lactat' },
      { id: 'ricotta', name: 'Ricotta semidegresată', unit: 'g', kcal: 138, protein: 11.4, source: 'U / USDA FDC 171248 SR Legacy, „Cheese, ricotta, part skim milk” (preluat prin getfoodfacts.com, 19.10.2026)', allergens: ['lapte'], animal: 'lactat' },
      { id: 'tempeh', name: 'Tempeh', unit: 'g', kcal: 192, protein: 20.3, source: 'U / USDA FDC 174272 SR Legacy, „Tempeh” (preluat prin getfoodfacts.com, 19.10.2026)', allergens: ['soia'] },
      { id: 'edamame', name: 'Edamame congelat', unit: 'g', kcal: 109, protein: 11.2, source: 'U / USDA FDC 168410 SR Legacy, „Edamame, frozen, unprepared” (preluat prin getfoodfacts.com, 19.10.2026)', allergens: ['soia'] },
      { id: 'mazare', name: 'Mazăre verde congelată', unit: 'g', kcal: 77, protein: 5.22, source: 'U / USDA FDC 170016 SR Legacy, „Peas, green, frozen, unprepared” (preluat prin getfoodfacts.com, 19.10.2026)', allergens: [] },
      { id: 'fasole-alba', name: 'Fasole albă conservată (cu lichid)', unit: 'g', kcal: 113, protein: 7.53, source: 'U / USDA FDC 173747 SR Legacy, „Beans, navy, mature seeds, canned” (preluat prin getfoodfacts.com, 19.10.2026)', allergens: [] },
      { id: 'linte-rosie', name: 'Linte roșie, uscată', unit: 'g', kcal: 358, protein: 23.9, source: 'U / USDA FDC 174284 SR Legacy, „Lentils, pink or red, raw” (preluat prin getfoodfacts.com, 19.10.2026)', allergens: [] },
      { id: 'quinoa', name: 'Quinoa, uscată', unit: 'g', kcal: 368, protein: 14.1, source: 'U / USDA FDC 168874 SR Legacy, „Quinoa, uncooked” (preluat prin getfoodfacts.com, 19.10.2026)', allergens: [] },
      { id: 'bulgur', name: 'Bulgur, uscat', unit: 'g', kcal: 342, protein: 12.3, source: 'U / USDA FDC 170688 SR Legacy, „Bulgur, dry” (preluat prin getfoodfacts.com, 19.10.2026)', allergens: ['gluten'] },
      { id: 'hrisca', name: 'Hrișcă, uscată', unit: 'g', kcal: 346, protein: 11.7, source: 'U / USDA FDC 170685 SR Legacy, „Buckwheat groats, roasted, dry” (preluat prin getfoodfacts.com, 19.10.2026)', allergens: [] },
      { id: 'malai', name: 'Mălai', unit: 'g', kcal: 370, protein: 7.11, source: 'U / USDA FDC 168867 SR Legacy, „Cornmeal, degermed, enriched, yellow” (preluat prin getfoodfacts.com, 19.10.2026)', allergens: [] },
      { id: 'cartof-dulce', name: 'Cartof dulce, crud', unit: 'g', kcal: 86, protein: 1.57, source: 'U / USDA FDC 168482 SR Legacy, „Sweet potato, raw, unprepared” (preluat prin getfoodfacts.com, 19.10.2026)', allergens: [] },
      { id: 'orez-brun', name: 'Orez brun, uscat', unit: 'g', kcal: 367, protein: 7.54, source: 'U / USDA FDC 169703 SR Legacy, „Rice, brown, long-grain, raw” (preluat prin getfoodfacts.com, 19.10.2026)', allergens: [] },
      { id: 'tortilla', name: 'Tortilla din făină de grâu', unit: 'g', kcal: 312, protein: 8.29, source: 'U / USDA SR Legacy, „Tortillas, ready-to-bake or -fry, flour” (preluat prin recipal.com, 19.10.2026; codul nu apare pe pagină)', allergens: ['gluten'] },
      { id: 'hummus', name: 'Hummus', unit: 'g', kcal: 237, protein: 7.78, source: 'U / USDA FDC 174289 SR Legacy, „Hummus, commercial” (preluat prin getfoodfacts.com, 19.10.2026)', allergens: ['susan'] },
      { id: 'broccoli', name: 'Broccoli crud', unit: 'g', kcal: 34, protein: 2.82, source: 'U / USDA FDC 170379 SR Legacy, „Broccoli, raw” (preluat prin getfoodfacts.com, 19.10.2026)', allergens: [] },
      { id: 'dovlecel', name: 'Dovlecel cu coajă, crud', unit: 'g', kcal: 17, protein: 1.21, source: 'U / USDA SR Legacy NDB 11477, „Squash, summer, zucchini, includes skin, raw” (preluat prin recipal.com, 19.10.2026)', allergens: [] },
      { id: 'ardei', name: 'Ardei gras roșu, crud', unit: 'g', kcal: 26, protein: 0.99, source: 'U / USDA SR Legacy NDB 11821, „Peppers, bell, sweet, red, raw” (preluat prin recipal.com, 19.10.2026)', allergens: [] },
      { id: 'varza', name: 'Varză albă, crudă', unit: 'g', kcal: 25, protein: 1.28, source: 'U / USDA FDC 169975 SR Legacy, „Cabbage, raw” (preluat prin getfoodfacts.com, 19.10.2026)', allergens: [] },
      { id: 'ciuperci', name: 'Ciuperci albe, crude', unit: 'g', kcal: 22, protein: 3.09, source: 'U / USDA SR Legacy NDB 11260, „Mushrooms, white, raw” (preluat prin recipal.com, 19.10.2026)', allergens: [] },
      { id: 'vinete', name: 'Vinete, crude', unit: 'g', kcal: 25, protein: 0.98, source: 'U / USDA FDC 169228 SR Legacy, „Eggplant, raw” (preluat prin getfoodfacts.com, 19.10.2026)', allergens: [] },
      { id: 'conopida', name: 'Conopidă, crudă', unit: 'g', kcal: 25, protein: 1.92, source: 'U / USDA FDC 169986 SR Legacy, „Cauliflower, raw” (preluat prin getfoodfacts.com, 19.10.2026)', allergens: [] },
      { id: 'ceapa', name: 'Ceapă, crudă', unit: 'g', kcal: 40, protein: 1.1, source: 'U / USDA FDC 170000 SR Legacy, „Onions, raw” (preluat prin getfoodfacts.com, 19.10.2026)', allergens: [] },
      { id: 'fasole-verde', name: 'Fasole verde, crudă', unit: 'g', kcal: 31, protein: 1.83, source: 'U / USDA FDC 169961 SR Legacy, „Beans, snap, green, raw” (preluat prin getfoodfacts.com, 19.10.2026)', allergens: [] },
      { id: 'castravete', name: 'Castravete cu coajă', unit: 'g', kcal: 15, protein: 0.65, source: 'U / USDA FDC 168409 SR Legacy, „Cucumber, with peel, raw” (preluat prin getfoodfacts.com, 19.10.2026)', allergens: [] },
      { id: 'para', name: 'Pară, crudă', unit: 'g', kcal: 57, protein: 0.36, source: 'U / USDA FDC 169118 SR Legacy, „Pears, raw” (preluat prin getfoodfacts.com, 19.10.2026)', allergens: [] },
      { id: 'portocala', name: 'Portocală, fără coajă', unit: 'g', kcal: 47, protein: 0.94, source: 'U / USDA FDC 169097 SR Legacy, „Oranges, raw, all commercial varieties” (preluat prin getfoodfacts.com, 19.10.2026)', allergens: [] },
      { id: 'struguri', name: 'Struguri', unit: 'g', kcal: 69, protein: 0.72, source: 'U / USDA FDC 174683 SR Legacy, „Grapes, red or green, raw” (preluat prin getfoodfacts.com, 19.10.2026)', allergens: [] },
      { id: 'afine', name: 'Afine', unit: 'g', kcal: 57, protein: 0.74, source: 'U / USDA FDC 171711 SR Legacy, „Blueberries, raw” (preluat prin getfoodfacts.com, 19.10.2026)', allergens: [] },
      { id: 'kiwi', name: 'Kiwi verde, fără coajă', unit: 'g', kcal: 58, protein: 1.06, source: 'U / USDA FDC 327046 Foundation, „Kiwifruit, green, raw” (preluat prin getfoodfacts.com, 19.10.2026)', allergens: [] },
      { id: 'curmale', name: 'Curmale Medjool, fără sâmbure', unit: 'g', kcal: 277, protein: 1.81, source: 'U / USDA FDC 168191 SR Legacy, „Dates, medjool” (preluat prin getfoodfacts.com, 19.10.2026)', allergens: [] },
      { id: 'stafide', name: 'Stafide', unit: 'g', kcal: 299, protein: 3.3, source: 'U / USDA FDC 168165 SR Legacy, „Raisins, dark, seedless” (preluat prin getfoodfacts.com, 19.10.2026)', allergens: [] },
      { id: 'migdale', name: 'Migdale', unit: 'g', kcal: 579, protein: 21.1, source: 'U / USDA FDC 170567 SR Legacy, „Nuts, almonds” (preluat prin getfoodfacts.com, 19.10.2026)', allergens: ['nuci'] },
      { id: 'seminte-dovleac', name: 'Semințe de dovleac decorticate', unit: 'g', kcal: 559, protein: 30.2, source: 'U / USDA FDC 170556 SR Legacy, „Seeds, pumpkin and squash seed kernels, dried” (preluat prin getfoodfacts.com, 19.10.2026)', allergens: [] },
      { id: 'chia', name: 'Semințe de chia', unit: 'g', kcal: 486, protein: 16.5, source: 'U / USDA FDC 170554 SR Legacy, „Seeds, chia seeds, dried” (preluat prin getfoodfacts.com, 19.10.2026)', allergens: [] },
      { id: 'avocado', name: 'Avocado, parte comestibilă', unit: 'g', kcal: 160, protein: 2.0, source: 'U / USDA FDC 171705 SR Legacy, „Avocados, raw, all commercial varieties” (preluat prin getfoodfacts.com, 19.10.2026)', allergens: [] },
      { id: 'miere', name: 'Miere', unit: 'g', kcal: 304, protein: 0.3, source: 'U / USDA FDC 169640 SR Legacy, „Honey” (preluat prin getfoodfacts.com, 19.10.2026)', allergens: [], animal: 'miere' },
      { id: 'seminte-floarea', name: 'Semințe de floarea-soarelui decorticate', unit: 'g', kcal: 584, protein: 20.8, source: 'U / USDA FDC 170562 SR Legacy, „Seeds, sunflower seed kernels, dried” (preluat prin getfoodfacts.com, 19.10.2026)', allergens: [] },
      { id: 'fructe-padure', name: 'Zmeură / fructe de pădure', unit: 'g', kcal: 52, protein: 1.2, source: 'U / USDA FDC 167755 SR Legacy, „Raspberries, raw” (preluat prin getfoodfacts.com, 19.10.2026)', allergens: [] },
      { id: 'prune', name: 'Prune, crude', unit: 'g', kcal: 46, protein: 0.7, source: 'U / USDA FDC 169949 SR Legacy, „Plums, raw” (preluat prin getfoodfacts.com, 19.10.2026)', allergens: [] },
      { id: 'piersici', name: 'Piersici, crude', unit: 'g', kcal: 39, protein: 0.91, source: 'U / USDA FDC 169928 SR Legacy, „Peaches, yellow, raw” (preluat prin getfoodfacts.com, 19.10.2026)', allergens: [] },
      { id: 'tahini', name: 'Tahini', unit: 'g', kcal: 595, protein: 17.0, source: 'U / USDA FDC 170189 SR Legacy, „Seeds, sesame butter, tahini, from roasted and toasted kernels” (preluat prin getfoodfacts.com, 19.10.2026)', allergens: ['susan'] },
    ] as Food[]
  ).map((f) => [f.id, f]),
);

/** Energie și proteine pentru o cantitate (g sau ml) dintr-un aliment. */
export function foodValues(id: string, qty: number): { kcal: number; protein: number } {
  const f = FOODS[id];
  if (!f) throw new Error(`aliment necunoscut: ${id}`);
  return { kcal: (f.kcal * qty) / 100, protein: (f.protein * qty) / 100 };
}

/** Costul cantității consumate (RON), din prețul pe kg/L corectat cu partea comestibilă; null dacă lipsește prețul. */
export function foodCost(id: string, qty: number): number | null {
  const p = FOODS[id]?.price;
  if (!p) return null;
  return ((qty / 1000) * p.ronPerUnit) / (p.edible ?? 1);
}
