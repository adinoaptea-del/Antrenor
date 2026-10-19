// Compoziția și prețurile folosite de nutriționist (ghidul „AIRON Nutriționist sportiv” v1.0, 19.10.2026, Anexa A și §13).
// Valorile sunt la 100 g, cu excepția laptelui și a uleiului (la 100 ml). D01 = CoFID 2021 (cod fișă), D02 = producător,
// Pxx = pagina comerciantului. Alimentele generice nu sunt identice cu fiecare marcă: valorile sunt estimări de
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
  /** Alergeni / categorii: lapte, ou, gluten, peste, nuci, arahide, soia. */
  allergens: Allergen[];
  /** Produs animal (pentru vegan) și carne/pește (pentru vegetarian). */
  animal?: 'carne' | 'peste' | 'lactat' | 'ou';
  /** Prețul pe kg / L al produsului cumpărat și partea comestibilă (0–1), cu sursa și data. */
  price?: { ronPerUnit: number; edible?: number; source: string; checkedAt: string };
}

export type Allergen = 'lapte' | 'ou' | 'gluten' | 'peste' | 'nuci' | 'arahide' | 'soia';

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
