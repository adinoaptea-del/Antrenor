// Motorul nutriționistului (ghidul „AIRON Nutriționist sportiv” v1.0): codul calculează ținta, porțiile, costul și
// totalurile; AI-ul doar explică (nu inventează cifre). Etichete: DOVADĂ (sursa citată), REGULĂ AIRON (alegere de
// produs, configurabilă), EXEMPLU. Energia e o estimare cu interval, nu o măsurătoare.
//
//  - Repaus: Mifflin-St Jeor (DOVADĂ S01): 10·kg + 6,25·cm − 5·ani + 5 (ecuația masculină) / −161 (feminină).
//  - Metoda B (§03): baza fără sport = repaus × 1,4 (REGULĂ AIRON, nivelul „sedentar / ușor activ” din FAO/WHO/UNU 2004)
//    + energia NETĂ a ședințelor de azi = (MET − 1) × kg × ore, cu MET din Compendium of Physical Activities
//    (Ainsworth 2011). Caloriile ceasului NU se adaugă peste (fără dublă contabilizare).
//  - Obiectiv (§04, REGULĂ AIRON): slăbire = deficit 12% doar în zilele ușoare și fără semnale de risc; masă = +7%;
//    altfel menținere. Fără praguri universale de kcal.
//  - Proteine (DOVADĂ S04/S10): 1,6 g/kg/zi; 1,8 în deficit sau la masă; distribuite pe mese.
//  - În efort (DOVADĂ S07): sub 75 min nimic obligatoriu; 75–150 min 30–60 g carbohidrați/oră (pornim de la 40);
//    peste 150 min până la 60 g/oră, crescut doar exersat. Energia lor intră o singură dată în totalul zilei.
//  - Varietate (§14, REGULĂ AIRON): aceeași rețetă cel mult de două ori în 7 zile și cu minimum 4 zile între apariții;
//    aceeași familie nu la prânz și la cină în aceeași zi.

import { FOODS, foodCost, foodValues, type Allergen } from './foods.js';
import { RECIPE, RECIPES, ROTATION_14, type Recipe, type Slot } from './recipes.js';
import { addDays, diffDays } from '../util/dates.js';

export const BASE_PAL = 1.4;
export const MET: Record<string, { usor: number; greu: number }> = {
  alergare: { usor: 8.0, greu: 10.5 },
  bicicleta: { usor: 6.8, greu: 9.5 },
  inot: { usor: 6.0, greu: 9.8 },
  forta: { usor: 5.0, greu: 5.0 },
};

export type Diet = 'omnivor' | 'vegetarian' | 'vegan';
export interface NutritionPrefs {
  diet: Diet;
  exclude: Allergen[];
  /** Alergiile au fost confirmate de sportiv (altfel arătăm ingredientele și „alergii neconfirmate”). */
  allergiesConfirmed: boolean;
  /** RON/zi pentru ingredientele consumate (20–150), sau null. */
  budget: number | null;
  /** Mesele principale dorite (1–4); 4 = cu gustare. Alimentarea din efort e separată. */
  meals: 1 | 2 | 3 | 4;
  /** Câte mese mănâncă acum (obiceiul), separat de cele dorite. */
  currentMeals?: number | null;
  /** Acceptă gustări în jurul antrenamentului când mesele principale nu ajung (implicit da). */
  snacksOk?: boolean;
  /** Mesele alese de sportiv cu „Schimbă”, pe zi. */
  choices?: Record<string, Partial<Record<Slot, string>>>;
}
export const DEFAULT_PREFS: NutritionPrefs = { diet: 'omnivor', exclude: [], allergiesConfirmed: false, budget: null, meals: 4 };

export interface DaySession {
  sport: 'inot' | 'bicicleta' | 'alergare' | 'forta';
  type: string;
  minutes: number;
  key?: boolean;
  /** Ora de start (minute de la miezul nopții), dacă se știe. */
  startMin?: number | null;
}

export interface NutritionInput {
  date: string;
  athlete: { sex: 'm' | 'f' | null; age: number | null; heightCm: number | null; weightKg: number | null; weightDate?: string | null };
  goal: string | null;
  sessions: DaySession[];
  prefs: NutritionPrefs;
  /** Identitatea sportivului: doi sportivi cu același profil nu primesc aceeași rotație de mese. */
  athleteId?: string | null;
  /** Ce oprește deficitul: restricție de sănătate, oboseală declarată repetat, sarcină/postpartum, minor. */
  blockers?: { restriction?: 'stop' | 'rosu' | 'galben' | null; fatigue?: boolean; pregnancy?: boolean; minor?: boolean };
}

export interface MealItem {
  food: string;
  name: string;
  qty: number;
  unit: 'g' | 'ml';
}
export interface Meal {
  slot: Slot;
  label: string;
  recipe: Recipe;
  items: MealItem[];
  kcal: number;
  protein: number;
  /** RON, sau null dacă lipsește un preț. */
  cost: number | null;
  missingPrices: string[];
  allergens: Allergen[];
  why: string | null;
  /** Repetare peste regula de varietate (bibliotecă restrânsă de preferințe). */
  repeat?: boolean;
}

export interface NutritionDay {
  date: string;
  personalized: boolean;
  missing: string[];
  energy: { ree: number; base: number; exercise: number; adjustPct: number; target: number; low: number; high: number } | null;
  protein: { gPerKg: number; target: number } | null;
  dayType: string;
  goalNote: string;
  fuel: { sessionLabel: string; minutes: number; carbsPerHour: [number, number]; plannedG: number; kcal: number; note: string }[];
  meals: Meal[];
  /** kcal = mesele; dayKcal = mesele + alimentarea din efort (numărată o singură dată). */
  totals: { kcal: number; dayKcal: number; protein: number; cost: number | null; costKnown: number; costComplete: boolean };
  budgetNote: string | null;
  /** Meniu complet = câte mese s-au promis (3 sau 4) chiar există; altfel „Meniu incomplet: 3/4 mese”. */
  complete: boolean;
  mealsPromised: number;
  message: string;
  warnings: string[];
}

const SLOT_LABEL: Record<Slot, string> = { mic_dejun: 'Mic dejun', pranz: 'Prânz', cina: 'Cină', gustare: 'Gustare' };
const SPORT_WORD: Record<DaySession['sport'], string> = { inot: 'înot', bicicleta: 'bicicletă', alergare: 'alergare', forta: 'sală' };
const r1 = (x: number) => Math.round(x * 10) / 10;

/** Mifflin-St Jeor (repaus), kcal/zi. */
export function mifflin(sex: 'm' | 'f', kg: number, cm: number, age: number): number {
  return 10 * kg + 6.25 * cm - 5 * age + (sex === 'm' ? 5 : -161);
}

const hard = (s: DaySession) => s.key || s.type === 'calitate' || s.type === 'brick';

/** Energia netă a ședinței (peste repaus), kcal: (MET − 1) × kg × ore. */
export function sessionNetKcal(s: DaySession, kg: number): number {
  const met = MET[s.sport] ?? MET.alergare!;
  return (( hard(s) ? met.greu : met.usor) - 1) * kg * (s.minutes / 60);
}

/** Alimentarea din timpul efortului (AIS): interval pe oră și cantitatea propusă pentru început. */
export function fuelFor(s: DaySession): { carbsPerHour: [number, number]; plannedG: number; note: string } | null {
  if (s.sport === 'forta' || s.minutes < 75) return null;
  if (s.minutes <= 150) return { carbsPerHour: [30, 60], plannedG: Math.round((40 * s.minutes) / 60 / 5) * 5, note: 'pornești de la ~40 g/oră (ce tolerezi deja); crești doar exersat' };
  return { carbsPerHour: [60, 90], plannedG: Math.round((60 * s.minutes) / 60 / 5) * 5, note: 'până la 90 g/oră doar după ce ai exersat; pornești de la ~60 g/oră' };
}

function eligible(r: Recipe, p: NutritionPrefs): boolean {
  for (const i of r.ingredients) {
    const f = FOODS[i.food]!;
    if (f.allergens.some((a) => p.exclude.includes(a))) return false;
    if (p.diet === 'vegan' && f.animal) return false;
    if (p.diet === 'vegetarian' && (f.animal === 'carne' || f.animal === 'peste')) return false;
  }
  return true;
}

const kindOf: Record<Slot, Recipe['kind']> = { mic_dejun: 'B', pranz: 'M', cina: 'M', gustare: 'G' };
const ROT_COL: Record<Slot, number> = { mic_dejun: 0, pranz: 1, cina: 2, gustare: 3 };
const EPOCH = '2026-01-05';
const dayIndex = (date: string) => ((diffDays(EPOCH, date) % 14) + 14) % 14;

/**
 * Profilul de alegere a meselor (personalizarea selecției, nu doar a porțiilor). Fiecare criteriu e calculat din
 * ingredientele rețetei (energie și proteine din foods.ts), nu ghicit:
 *  - energia porției de referință față de energia unei mese pentru sportivul ăsta (sex, vârstă, greutate, obiectiv):
 *    rețetele care se potrivesc ies în porții normale, nu micșorate sau umflate;
 *  - obiectivul: slăbire / tonifiere / peste 50 de ani → proteine mai dense; masă musculară → porții mai consistente;
 *    rezistență (triatlon, alergare, bicicletă, înot) → mai multă energie din cereale, cartof, fructe;
 *  - femei: surse de fier (linte, năut, fasole, spanac, ouă, pește) — riscul de deficit de fier e mai mare la
 *    sportivele de anduranță (practică de nutriție sportivă, nu o normă AIRON);
 *  - rotația pornește din alt punct pentru fiecare sportiv (din identitatea lui), ca doi oameni să nu mănânce la fel.
 * Regulile de varietate și preferințele rămân aceleași.
 */
export interface PickProfile {
  seed?: string | null;
  goal?: string | null;
  sex?: 'm' | 'f' | null;
  age?: number | null;
  /** Energia unei zile fără sport pentru sportiv (kcal), cu ajustarea obiectivului; null = nepersonalizat. */
  dayKcal?: number | null;
  meals?: number;
}

const CARB_FOODS = new Set(['ovaz', 'orez', 'paste', 'cuscus', 'cartof', 'paine', 'banana', 'mar', 'capsuni']);
const IRON_FOODS = new Set(['linte', 'naut', 'fasole', 'spanac', 'ou', 'ton', 'somon', 'tofu']);
const SLOT_SHARE: Record<Slot, number> = { mic_dejun: 0.27, pranz: 0.33, cina: 0.3, gustare: 0.1 };
const ENDURANCE = /^(70\.3|olimpic|sprint|5k|10k|semimaraton|maraton|inot-|bike-|full)/;

function hashSeed(x: string): number {
  let h = 2166136261;
  for (let i = 0; i < x.length; i++) h = Math.imul(h ^ x.charCodeAt(i), 16777619);
  return Math.abs(h);
}

/** Sursa principală de proteine a rețetei (ingredientul care dă cele mai multe proteine), dacă e o sursă de proteine. */
export function mainProtein(r: Recipe): string | null {
  let best: string | null = null;
  let max = 0;
  for (const i of r.ingredients) {
    const p = foodValues(i.food, i.qty).protein;
    if (p > max) {
      max = p;
      best = i.food;
    }
  }
  return best && isProteinFood(best) ? best : null;
}

/** Cât de potrivită e rețeta pentru sportiv (mai mic = mai potrivit). */
export function recipeFit(r: Recipe, slot: Slot, p: PickProfile): number {
  let kcal = 0;
  let prot = 0;
  let carbK = 0;
  let iron = 0;
  for (const i of r.ingredients) {
    const v = foodValues(i.food, i.qty);
    kcal += v.kcal;
    prot += v.protein;
    if (CARB_FOODS.has(i.food)) carbK += v.kcal;
    if (IRON_FOODS.has(i.food)) iron += 1;
  }
  const protShare = (prot * 4) / Math.max(1, kcal);
  const carbShare = carbK / Math.max(1, kcal);
  let score = 0;
  if (p.dayKcal) {
    const slots = slotsFor(p.meals ?? 3);
    const share = SLOT_SHARE[slot] / slots.reduce((n, s) => n + SLOT_SHARE[s], 0);
    score += Math.abs(Math.log(kcal / (p.dayKcal * share)));
  }
  const g = p.goal ?? '';
  if (g === 'fit-slabire' || g === 'fit-tonifiere' || (p.age ?? 0) >= 50) score -= protShare * 1.2;
  if (g === 'fit-masa') score -= Math.min(1, kcal / 900) * 0.6 + protShare * 0.4;
  if (ENDURANCE.test(g)) score -= carbShare * 0.8;
  if (p.sex === 'f') score -= Math.min(2, iron) * 0.12;
  return score;
}

/** Selecția zilelor de la `from` la `to`, cu ferestrele de varietate (istoric calculat, nu ghicit). */
export function selectDays(from: string, to: string, prefs: NutritionPrefs, preSlot: (date: string) => Slot | null = () => null, profile: PickProfile = {}): Map<string, { picks: Partial<Record<Slot, string>>; repeats: Slot[]; empty: Slot[] }> {
  const out = new Map<string, { picks: Partial<Record<Slot, string>>; repeats: Slot[]; empty: Slot[] }>();
  const uses = new Map<string, string[]>();
  const slots = slotsFor(prefs.meals);
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const picks: Partial<Record<Slot, string>> = {};
    const repeats: Slot[] = [];
    const empty: Slot[] = [];
    const idx = (dayIndex(d) + (profile.seed ? hashSeed(profile.seed) % 14 : 0)) % 14;
    const ok = (id: string, slot: Slot) => {
      const dates = uses.get(id) ?? [];
      const last = dates.at(-1);
      if (last && diffDays(last, d) <= 4) return false;
      if (dates.filter((x) => diffDays(x, d) < 7).length >= 2) return false;
      if (Object.values(picks).includes(id)) return false;
      if (slot === 'cina' && picks.pranz && RECIPE[picks.pranz]!.family === RECIPE[id]!.family) return false;
      if (slot === 'pranz' && picks.cina && RECIPE[picks.cina]!.family === RECIPE[id]!.family) return false;
      if (preSlot(d) === slot && RECIPE[id]!.highFiber) return false;
      // Aceeași sursă principală de proteine (ton, ou, pui...) o singură dată pe zi.
      const main = mainProtein(RECIPE[id]!);
      if (main && Object.values(picks).some((x) => mainProtein(RECIPE[x!]!) === main)) return false;
      return true;
    };
    for (const slot of slots) {
      const chosen = prefs.choices?.[d]?.[slot];
      if (chosen && RECIPE[chosen] && eligible(RECIPE[chosen]!, prefs) && RECIPE[chosen]!.kind === kindOf[slot]) {
        picks[slot] = chosen;
        continue;
      }
      // Ordinea preferată: rotația din ghid, apoi celelalte rețete eligibile din același tip, în ordinea rotației.
      const order: string[] = [];
      for (let k = 0; k < 14; k++) {
        const id = ROTATION_14[(idx + k) % 14]![ROT_COL[slot]]!;
        if (!order.includes(id)) order.push(id);
      }
      for (const r of RECIPES) if (r.kind === kindOf[slot] && !order.includes(r.id)) order.push(r.id);
      let cands = order.filter((id) => eligible(RECIPE[id]!, prefs));
      // Personalizarea: întâi cele mai potrivite ~60% pentru sportiv (în ordinea rotației lui), apoi restul.
      if (profile.dayKcal || profile.goal || profile.sex) {
        const fit = new Map(cands.map((id) => [id, recipeFit(RECIPE[id]!, slot, profile)]));
        const cut = [...fit.values()].sort((a, b) => a - b)[Math.max(0, Math.ceil(cands.length * 0.6) - 1)] ?? Infinity;
        cands = [...cands.filter((id) => fit.get(id)! <= cut), ...cands.filter((id) => fit.get(id)! > cut)];
      }
      // Înaintea efortului: întâi rețetele familiare cu puține fibre (marcate în ghid), apoi restul fără fibre multe.
      if (preSlot(d) === slot) cands = [...cands.filter((id) => RECIPE[id]!.preOk), ...cands.filter((id) => !RECIPE[id]!.preOk)];
      let pick = cands.find((id) => ok(id, slot));
      if (!pick && cands.length) {
        // Biblioteca e prea mică pentru preferințe: cea folosită cel mai demult, marcată ca repetare.
        pick = [...cands].filter((id) => !Object.values(picks).includes(id)).sort((a, b) => ((uses.get(a) ?? ['0']).at(-1)! < (uses.get(b) ?? ['0']).at(-1)! ? -1 : 1))[0] ?? cands[0];
        repeats.push(slot);
      }
      if (pick) picks[slot] = pick;
      else empty.push(slot);
    }
    for (const id of Object.values(picks)) uses.set(id!, [...(uses.get(id!) ?? []), d]);
    out.set(d, { picks, repeats, empty });
  }
  return out;
}

/** Sursa de proteine a rețetei: cel puțin 30% din energie din proteine și nu o legumă (porția se scalează după proteine). */
export function isProteinFood(id: string): boolean {
  const f = FOODS[id]!;
  return f.kcal >= 60 && (f.protein * 4) / f.kcal >= 0.3;
}

function mealOf(slot: Slot, r: Recipe, factor: number, proteinFactor = factor): Omit<Meal, 'why' | 'repeat'> {
  const items: MealItem[] = r.ingredients.map((i) => {
    const f = FOODS[i.food]!;
    const raw = i.qty * (isProteinFood(i.food) ? proteinFactor : factor);
    const qty = f.id === 'ulei' ? Math.max(1, Math.round(raw)) : Math.max(5, Math.round(raw / 5) * 5);
    return { food: f.id, name: f.name, qty, unit: f.unit };
  });
  let kcal = 0;
  let protein = 0;
  let cost = 0;
  const missingPrices: string[] = [];
  for (const it of items) {
    const v = foodValues(it.food, it.qty);
    kcal += v.kcal;
    protein += v.protein;
    const c = foodCost(it.food, it.qty);
    if (c == null) missingPrices.push(FOODS[it.food]!.name.split(',')[0]!.toLowerCase());
    else cost += c;
  }
  const allergens = [...new Set(items.flatMap((it) => FOODS[it.food]!.allergens))];
  return { slot, label: SLOT_LABEL[slot], recipe: r, items, kcal, protein, cost: missingPrices.length ? null : cost, missingPrices, allergens };
}

/** Valorile rețetei la porția de referință (pentru verificări și alternative). */
export function recipeValues(id: string): { kcal: number; protein: number } {
  const m = mealOf('pranz', RECIPE[id]!, 1);
  return { kcal: m.kcal, protein: m.protein };
}

/** Slotul mesei dinaintea primei ședințe a zilei (dacă se știe ora): acolo nu punem fibre multe. */
/** Mesele zilei după numărul dorit: 1 = cina; 2 = prânz + cină (mesele principale); 3 = + mic dejun; 4 = + gustare. */
export function slotsFor(n: number): Slot[] {
  return n <= 1 ? ['cina'] : n === 2 ? ['pranz', 'cina'] : n === 3 ? ['mic_dejun', 'pranz', 'cina'] : ['mic_dejun', 'pranz', 'cina', 'gustare'];
}

export function preEffortSlot(sessions: DaySession[], meals: number): Slot | null {
  const first = sessions.filter((s) => s.sport !== 'forta' || s.minutes >= 45).map((s) => s.startMin).filter((x): x is number => x != null).sort((a, b) => a - b)[0];
  if (first == null) return null;
  const has = slotsFor(meals);
  if (first < 11 * 60 && has.includes('mic_dejun')) return 'mic_dejun';
  if (first < 17 * 60 && has.includes('pranz')) return 'pranz';
  return has.includes('gustare') ? 'gustare' : has.includes('pranz') && first >= 11 * 60 ? 'pranz' : null;
}

export function nutritionDay(input: NutritionInput): NutritionDay {
  const { athlete: a, prefs } = input;
  const missing: string[] = [];
  if (a.weightKg == null) missing.push('greutatea (Date de bază → Corp)');
  if (a.heightCm == null) missing.push('înălțimea (Profil)');
  if (a.age == null) missing.push('anul nașterii (Profil)');
  if (a.sex == null) missing.push('parametrul ecuației: bărbat / femeie (Profil)');
  const personalized = missing.length === 0;
  const sessions = input.sessions.filter((s) => s.minutes > 0);
  const warnings: string[] = [];

  // Tipul zilei.
  const total = sessions.reduce((n, s) => n + s.minutes, 0);
  const long = sessions.some((s) => s.type === 'lung' || s.type === 'brick' || s.minutes >= 90);
  const isHard = sessions.some(hard);
  const dayType = !sessions.length ? 'zi fără antrenament' : long || total > 75 ? `zi lungă (${sessions.map((s) => `${SPORT_WORD[s.sport]} ${s.minutes} min`).join(' + ')})` : isHard ? `zi cu intensitate (${sessions.map((s) => `${SPORT_WORD[s.sport]} ${s.minutes} min`).join(' + ')})` : `zi ușoară (${sessions.map((s) => `${SPORT_WORD[s.sport]} ${s.minutes} min`).join(' + ')})`;

  // Alimentarea din efort (o singură dată în total).
  const fuel = sessions
    .map((s) => ({ s, f: fuelFor(s) }))
    .filter((x): x is { s: DaySession; f: NonNullable<ReturnType<typeof fuelFor>> } => !!x.f)
    .map(({ s, f }) => ({ sessionLabel: `${SPORT_WORD[s.sport]} ${s.minutes} min`, minutes: s.minutes, carbsPerHour: f.carbsPerHour, plannedG: f.plannedG, kcal: f.plannedG * 4, note: f.note }));
  const fuelKcal = fuel.reduce((n, f) => n + f.kcal, 0);

  // Obiectivul.
  const b = input.blockers ?? {};
  // Zi ușoară = fără intensitate, fără ședință lungă și cel mult ~75 min în total (aceeași definiție ca în mesaj).
  const easyDay = !isHard && !long && total <= 75;
  let adjustPct = 0;
  let goalNote = 'menținere: mâncarea urmează antrenamentele';
  if (input.goal === 'fit-slabire') {
    const block = b.pregnancy ? 'sarcină / postpartum' : b.minor ? 'sub 18 ani' : b.restriction === 'stop' || b.restriction === 'rosu' ? 'restricție de sănătate activă' : b.fatigue ? 'oboseală declarată de mai multe ori' : null;
    if (block) goalNote = `fără deficit azi: ${block}`;
    else if (!easyDay) goalNote = 'fără deficit azi: e zi de antrenament mai lung sau mai greu';
    else {
      adjustPct = -12;
      goalNote = 'deficit mic (~12%) doar în zilele ușoare';
    }
  } else if (input.goal === 'fit-masa') {
    adjustPct = b.restriction === 'stop' ? 0 : 7;
    goalNote = adjustPct ? 'surplus mic (~7%) pentru masă musculară; se ajustează după tendință' : 'fără surplus azi: restricție de sănătate';
  }

  let energy: NutritionDay['energy'] = null;
  let proteinT: NutritionDay['protein'] = null;
  if (personalized) {
    const ree = mifflin(a.sex!, a.weightKg!, a.heightCm!, a.age!);
    const base = ree * BASE_PAL;
    const exercise = sessions.reduce((n, s) => n + sessionNetKcal(s, a.weightKg!), 0);
    const target = (base + exercise) * (1 + adjustPct / 100);
    energy = { ree, base, exercise, adjustPct, target, low: target * 0.9, high: target * 1.1 };
    const gPerKg = adjustPct < 0 || input.goal === 'fit-masa' ? 1.8 : 1.6;
    proteinT = { gPerKg, target: gPerKg * a.weightKg! };
    if (a.age != null && a.age >= 65) warnings.push('peste 65 de ani: proteinele împărțite pe toate mesele; dacă ai o afecțiune sau tratament, planul se discută cu medicul');
  }

  // Mesele: selecția cu varietate (ultimele 27 de zile calculate, ca ferestrele să fie reale), apoi porțiile.
  const pre = preEffortSlot(sessions, prefs.meals);
  // Profilul de alegere: aceeași energie de bază în fiecare zi (fără sport), ca istoricul de varietate să fie stabil.
  const pick: PickProfile = { seed: input.athleteId ?? null, goal: input.goal, sex: a.sex, age: a.age, dayKcal: energy ? energy.base * (1 + adjustPct / 100) : null, meals: prefs.meals };
  const sel = selectDays(addDays(input.date, -27), input.date, prefs, (d) => (d === input.date ? pre : null), pick).get(input.date)!;
  let slots = Object.keys(sel.picks) as Slot[];
  const base0 = slots.reduce((n, s) => n + recipeValues(sel.picks[s]!).kcal, 0);
  const mealsTarget = energy ? Math.max(0, energy.target - fuelKcal) : null;
  let factor = mealsTarget ? mealsTarget / base0 : 1;
  const extra: Recipe[] = [];
  // Porții realiste: mai bine gustări în jurul antrenamentului decât farfurii de 1,7× (auditul M35, D: nu redistribui
  // mecanic toate caloriile în două porții uriașe). Cu 1–2 mese, gustările intră doar dacă sportivul le acceptă.
  const fewMeals = prefs.meals <= 2;
  const maxExtra = fewMeals ? (prefs.snacksOk === false ? 0 : 2) : 1;
  while (factor > 1.5 && extra.length < maxExtra) {
    const g = RECIPES.filter((r) => r.kind === 'G' && eligible(r, prefs) && !Object.values(sel.picks).includes(r.id) && !extra.includes(r)).sort((x, y) => recipeValues(y.id).protein - recipeValues(x.id).protein)[0];
    if (!g) break;
    extra.push(g);
    factor = mealsTarget! / (base0 + extra.reduce((n, r) => n + recipeValues(r.id).kcal, 0));
  }
  if (factor > 1.6 && mealsTarget) {
    const short = Math.round(mealsTarget - (base0 + extra.reduce((n, r) => n + recipeValues(r.id).kcal, 0)) * 1.6);
    warnings.push(`cu ${prefs.meals} ${prefs.meals === 1 ? 'masă' : 'mese'}${fewMeals && prefs.snacksOk === false ? ' și fără gustări' : ''}, ținta nu încape în porții realiste: lipsesc ~${short} kcal. Nu tai din necesar: o gustare în jurul antrenamentului sau încă o masă ar acoperi diferența`);
  }
  if (factor < 0.7) {
    warnings.push('ținta calculată e sub porțiile minime realiste din bibliotecă; nu tai mai mult — mai bine discutăm ținta');
    factor = 0.7;
  }
  factor = Math.min(factor, 1.6);
  if (!slots.length) warnings.push('preferințele și alergiile excluse nu lasă nicio rețetă din bibliotecă; e nevoie de rețete noi');
  for (const e of sel.empty) warnings.push(`${SLOT_LABEL[e].toLowerCase()}: nicio rețetă din bibliotecă nu se potrivește cu preferințele (${prefs.diet}${prefs.exclude.length ? `, fără ${prefs.exclude.join(', ')}` : ''}); nu inventez una`);

  // Porțiile pe ingrediente, nu cu un singur factor: sursele de proteine se dozează după ținta de proteine a
  // sportivului, restul (cereale, cartof, fructe, legume, grăsimi) după energia rămasă. Așa gramajele diferă de la om
  // la om și în proporții (ex. mai mult iaurt și mai puțin ovăz pentru cine are nevoie de proteine, nu de energie).
  let pF = factor;
  let eF = factor;
  if (proteinT && mealsTarget) {
    const all = [...slots.map((s) => RECIPE[sel.picks[s]!]!), ...extra];
    let Kp = 0, Ko = 0, Pp = 0, Po = 0;
    for (const r of all)
      for (const i of r.ingredients) {
        const v = foodValues(i.food, i.qty);
        if (isProteinFood(i.food)) {
          Kp += v.kcal;
          Pp += v.protein;
        } else {
          Ko += v.kcal;
          Po += v.protein;
        }
      }
    // Ținta de proteine pe mese, apoi energia: pF·Pp + eF·Po = P, pF·Kp + eF·Ko = K.
    const P = proteinT.target * 0.95;
    const det = Pp * Ko - Po * Kp;
    if (Pp > 0 && Ko > 0 && Math.abs(det) > 1e-6) {
      const p = (P * Ko - Po * mealsTarget) / det;
      const e = (Pp * mealsTarget - Kp * P) / det;
      pF = Math.min(1.8, Math.max(0.8, p));
      eF = Math.min(1.6, Math.max(0.6, (mealsTarget - pF * Kp) / Ko));
      if (!(Number.isFinite(e) && Number.isFinite(p))) pF = eF = factor;
    }
  }

  const meals: Meal[] = [];
  for (const s of slots) {
    const m = mealOf(s, RECIPE[sel.picks[s]!]!, eF, pF);
    const why = s === pre ? `înaintea ${sessions.length ? 'antrenamentului' : 'efortului'}: masă cu puține fibre, familiară` : s === 'gustare' && sessions.length ? 'gustarea ține energia între mese' : null;
    meals.push({ ...m, why, ...(sel.repeats.includes(s) ? { repeat: true } : {}) });
  }
  for (const g of extra) meals.push({ ...mealOf('gustare', g, eF, pF), label: fewMeals ? 'Gustare în jurul antrenamentului' : 'Gustare în plus', why: fewMeals ? `pe lângă cele ${prefs.meals} ${prefs.meals === 1 ? 'masă principală' : 'mese principale'}: înainte sau după antrenament, ca porțiile să rămână realiste` : 'azi ai nevoie de mai multă energie: o gustare în plus în loc de porții uriașe' });

  // Proteinele: dacă rămân sub țintă, o gustare bogată în proteine (fără a ascunde diferența).
  let protein = meals.reduce((n, m) => n + m.protein, 0);
  if (proteinT && protein < proteinT.target * 0.9) {
    const g = RECIPES.filter((r) => r.kind === 'G' && eligible(r, prefs) && !meals.some((m) => m.recipe.id === r.id)).sort((x, y) => recipeValues(y.id).protein - recipeValues(x.id).protein)[0];
    if (g && recipeValues(g.id).protein >= 15) {
      meals.push({ ...mealOf('gustare', g, 1), label: 'Gustare cu proteine', why: `proteinele zilei ar fi rămas la ${Math.round(protein)} g din ${Math.round(proteinT.target)} g` });
      protein = meals.reduce((n, m) => n + m.protein, 0);
    }
    if (protein < proteinT.target * 0.9) warnings.push(`proteinele ies ~${Math.round(protein)} g, sub ținta de ${Math.round(proteinT.target)} g: din preferințele de acum nu se poate mai mult`);
  }
  slots = meals.map((m) => m.slot);

  const kcal = meals.reduce((n, m) => n + m.kcal, 0);
  const costKnown = meals.reduce((n, m) => n + (m.cost ?? m.items.reduce((k, it) => k + (foodCost(it.food, it.qty) ?? 0), 0)), 0);
  const costComplete = meals.every((m) => m.cost != null);
  const missingP = [...new Set(meals.flatMap((m) => m.missingPrices))];
  let budgetNote: string | null = null;
  if (prefs.budget != null) {
    if (!costComplete) budgetNote = `cost incomplet: lipsesc prețurile pentru ${missingP.join(', ')}; nu pot spune că te încadrezi în ${prefs.budget} RON`;
    else if (costKnown > prefs.budget) budgetNote = `costul estimat (${costKnown.toFixed(2)} RON) trece de bugetul de ${prefs.budget} RON; alege la „Schimbă” variantele mai ieftine — energia nu o tai ca să încapă`;
    else budgetNote = `în buget: ~${costKnown.toFixed(2)} RON din ${prefs.budget} RON (ingredientele consumate, prețuri din 19.10.2026)`;
  }
  if (!prefs.allergiesConfirmed) warnings.push('alergii neconfirmate: verifică ingredientele fiecărei mese');
  if (sel.repeats.length) warnings.push('cu preferințele de acum biblioteca e mică: unele mese se repetă mai des decât regula de varietate');

  const promised = prefs.meals;
  const baseMeals = meals.filter((m) => m.label === SLOT_LABEL[m.slot]).length;
  const complete = sel.empty.length === 0;
  const message = !complete
    ? `Meniu incomplet: ${baseMeals}/${promised} mese — pentru preferințele tale biblioteca nu are încă ${sel.empty.map((e) => SLOT_LABEL[e].toLowerCase()).join(', ')}. Totalul de mai jos nu acoperă ținta zilei.`
    : !personalized
    ? `Porții de referință, nepersonalizate: lipsește ${missing.join(', ')}.`
    : fuel.length
      ? `Azi e ${dayType}: am pus mai multă energie decât într-o zi de pauză, iar ${fuel.map((f) => `în ${f.sessionLabel} ~${f.plannedG} g carbohidrați`).join(', ')} intră în același total.`
      : pre
        ? `Azi e ${dayType}: masa dinaintea antrenamentului e ușor de digerat; ${goalNote}.`
        : `Azi e ${dayType}: ${goalNote}.`;

  return {
    date: input.date,
    personalized,
    missing,
    energy,
    protein: proteinT,
    dayType,
    goalNote,
    fuel,
    meals,
    totals: { kcal, dayKcal: kcal + fuelKcal, protein, cost: costComplete ? costKnown : null, costKnown, costComplete },
    budgetNote,
    complete,
    mealsPromised: promised,
    message,
    warnings,
  };
}

/** Alternative pentru o masă: același tip, eligibile, fără repetare recentă, energie apropiată; cele mai ieftine întâi. */
export function alternatives(day: NutritionDay, slot: Slot, prefs: NutritionPrefs, recent: string[] = []): { id: string; name: string; kcal: number; protein: number; cost: number | null }[] {
  const cur = day.meals.find((m) => m.slot === slot);
  if (!cur) return [];
  const factor = cur.kcal / recipeValues(cur.recipe.id).kcal;
  const other = day.meals.filter((m) => m.slot !== slot).map((m) => m.recipe);
  return RECIPES.filter((r) => r.kind === cur.recipe.kind && r.id !== cur.recipe.id && eligible(r, prefs) && !recent.includes(r.id) && !other.some((o) => o.id === r.id || (r.kind === 'M' && o.kind === 'M' && o.family === r.family)))
    .map((r) => {
      const m = mealOf(slot, r, factor);
      return { id: r.id, name: r.name, kcal: m.kcal, protein: m.protein, cost: m.cost };
    })
    .filter((x) => Math.abs(x.kcal - cur.kcal) <= cur.kcal * 0.25)
    .sort((x, y) => (x.cost ?? 999) - (y.cost ?? 999) || Math.abs(x.kcal - cur.kcal) - Math.abs(y.kcal - cur.kcal))
    .slice(0, 3);
}

export const NUTRITION_DISCLAIMER = 'AIRON oferă sugestii de alimentație pentru antrenament. Nu este instrument medical. Valorile energetice și costurile sunt estimări.';
export { r1 };
