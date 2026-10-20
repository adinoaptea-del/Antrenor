// Motorul nutriționistului (ghidul „AIRON Nutriționist sportiv” v1.0): codul calculează ținta, porțiile, costul și
// totalurile; AI-ul doar explică (nu inventează cifre). Etichete: DOVADĂ (sursa citată), REGULĂ AIRON / setare de produs
// (alegere de produs, configurabilă), EXEMPLU. Energia e o estimare cu marjă, nu o măsurătoare.
//
//  - Repaus: Mifflin-St Jeor (DOVADĂ S01): 10·kg + 6,25·cm − 5·ani + 5 (ecuația masculină) / −161 (feminină).
//  - Metoda B (§03): baza fără sport = repaus × 1,4 (REGULĂ AIRON, nivelul „sedentar / ușor activ” din FAO/WHO/UNU 2004)
//    + energia NETĂ a ședințelor de azi = (MET − 1) × kg × ore, cu MET din Compendium of Physical Activities
//    (Ainsworth 2011). Caloriile ceasului NU se adaugă peste (fără dublă contabilizare). Un sport fără MET în tabel NU
//    primește MET-ul de alergare: energia lui rămâne neestimată și se spune (auditul v93, A77).
//  - Ședința făcută rămâne în necesarul zilei, cu durata reală (from-me.ts daySessions; T57).
//  - Obiectiv (§04, REGULĂ AIRON): slăbire = deficit 12% doar în zilele ușoare și fără semnale de risc; masă = +7%;
//    altfel menținere. Fără praguri universale de kcal.
//  - Proteine (DOVADĂ S04/S10): 1,6 g/kg/zi; 1,8 în deficit sau la masă; distribuite pe mese.
//  - Carbohidrați (auditul v93, A78; DOVADĂ AIS / IOC, Burke și colab. 2011 — aceleași repere AIS ca alimentarea din
//    efort): g/kg/zi după treapta zilei — ușor 3–5, moderat (~1 h) 5–7, anduranță 1–3 h 6–10, peste 4 h 8–12. Ziua fără
//    antrenament nu are treaptă separată în sursă: 3–5 e setare de produs. Încadrarea zilei în treaptă e REGULĂ AIRON.
//  - Grăsimi: restul energiei, cu un minim de 20% din energie (setare de produs, nu un standard din sursele citate).
//  - În efort (DOVADĂ S07, AIS): pe FEREASTRA de efort (brick, ședințe una după alta), nu pe ședință: sub 75 min nimic
//    obligatoriu; 75–150 min 30–60 g carbohidrați/oră (pornim de la 40); peste 150 min până la 60–90 g/oră, crescut doar
//    exersat. Energia lor intră o singură dată în totalul zilei (A86).
//  - Mesele: numărul și orele alese de sportiv; refuzul gustărilor e respectat (fără gustări ascunse, A81).
//  - Bugetul: constrângere în selecție (partea de cost cunoscută nu poate trece de partea slotului); prețul necunoscut
//    rămâne necunoscut; dacă nu există soluție, constrângerea incompatibilă e numită (A82).
//  - Varietate (§14, REGULĂ AIRON): aceeași rețetă cel mult de două ori în 7 zile și cu minimum 4 zile între apariții;
//    aceeași familie nu la prânz și la cină în aceeași zi. Zilele trecute vin din jurnal (log.ts), nu se rescriu (A84).

import { FOODS, foodCost, foodValues, ALLERGEN_LABEL, type Allergen } from './foods.js';
import { RECIPE, RECIPES, type Recipe, type Slot } from './recipes.js';
import { loggedPicks, type MealLog } from './log.js';
import { addDays, diffDays } from '../util/dates.js';

export const BASE_PAL = 1.4;
export const MET: Record<string, { usor: number; greu: number }> = {
  alergare: { usor: 8.0, greu: 10.5 },
  bicicleta: { usor: 6.8, greu: 9.5 },
  inot: { usor: 6.0, greu: 9.8 },
  forta: { usor: 5.0, greu: 5.0 },
  // Mers: Compendium 2011 (Ainsworth și colab.), 17190 mers 2,8–3,2 mph = 3,5 MET; 17220 mers alert 4,0 mph = 5,0 MET.
  mers: { usor: 3.5, greu: 5.0 },
};
/** Marja afișată în jurul țintei (±10%): setare de produs, nu un interval de încredere calculat. */
export const ENERGY_MARGIN = 0.1;
/** Greutatea mai veche de atât (zile) e semnalată (setare de produs). */
export const WEIGHT_STALE_DAYS = 28;
/** Două ședințe cu cel mult atâtea minute între ele sunt o singură fereastră de efort (setare de produs). */
export const FUEL_WINDOW_GAP_MIN = 30;
/** Minimul de grăsimi, % din energia zilei (setare de produs). */
export const FAT_MIN_PCT = 20;

export type Diet = 'omnivor' | 'vegetarian' | 'vegan';
export interface NutritionPrefs {
  diet: Diet;
  exclude: Allergen[];
  /** Alte alimente sau alergeni ai sportivului, în afara celor 14 (text liber; se exclud alimentele care îi conțin în nume). */
  other?: string[];
  /** Alergiile au fost confirmate de sportiv (altfel arătăm ingredientele și „alergii neconfirmate”). */
  allergiesConfirmed: boolean;
  /** RON/zi pentru ingredientele consumate (20–150), sau null. */
  budget: number | null;
  /** Mesele principale dorite (1–4); 4 = cu gustare. Alimentarea din efort e separată. */
  meals: 1 | 2 | 3 | 4;
  /** Orele aproximative ale meselor principale (minute de la miezul nopții), pentru 1–2 mese: decid slotul (A81). */
  mealTimes?: number[] | null;
  /** Câte mese mănâncă acum (obiceiul), separat de cele dorite. */
  currentMeals?: number | null;
  /** Acceptă gustări în jurul antrenamentului când mesele principale nu ajung (implicit da; false = niciuna). */
  snacksOk?: boolean;
  /** Acceptă proteină praf pentru diferența rămasă după mese (implicit nu; A80). */
  proteinPowder?: boolean;
  /** Indicație declarată de sportiv (recomandarea medicului) pentru fier / vitamina D; analizele se adaugă separat. */
  indications?: { iron?: boolean; vitaminD?: boolean };
  /** Mesele alese de sportiv cu „Schimbă”, pe zi. */
  choices?: Record<string, Partial<Record<Slot, string>>>;
  /** Jurnalul meselor: propus / acceptat / înlocuit / consumat (log.ts; A84). */
  log?: MealLog;
}
export const DEFAULT_PREFS: NutritionPrefs = { diet: 'omnivor', exclude: [], allergiesConfirmed: false, budget: null, meals: 4 };

export type KnownSport = 'inot' | 'bicicleta' | 'alergare' | 'forta' | 'mers';
export interface DaySession {
  /** Sportul; altul decât cele cunoscute (ex. yoga) nu primește MET inventat. */
  sport: KnownSport | (string & {});
  type: string;
  minutes: number;
  key?: boolean;
  /** Ora de start (minute de la miezul nopții), dacă se știe. */
  startMin?: number | null;
  /** De unde e ora: activitatea reală sau blocul liber din program (nu ora reală). */
  startSource?: 'activitate' | 'program' | null;
  /** Făcută (din activitatea reală): minutele sunt cele reale. */
  done?: boolean;
  /** Aceeași fereastră de efort (brick): o singură alimentare. */
  window?: string | null;
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
  /** Indicații reale (analize sub intervalul laboratorului sau recomandarea medicului) — niciodată deduse din sex (A80). */
  indications?: { iron?: boolean; vitaminD?: boolean };
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
  /** Partea de cost cunoscută (RON): o limită de jos, nu costul real când lipsesc prețuri. */
  costKnown: number;
  missingPrices: string[];
  allergens: Allergen[];
  /** Energia din alimentele bogate în carbohidrați (cereale, cartofi, fructe, miere) — reper, nu grame de carbohidrați. */
  carbFoodKcal: number;
  why: string | null;
  /** Repetare peste regula de varietate (bibliotecă restrânsă de preferințe). */
  repeat?: boolean;
}

export type DayLoad = 'repaus' | 'usor' | 'moderat' | 'mare' | 'foarte_mare';
export interface Macros {
  load: DayLoad;
  carbs: { gPerKg: [number, number]; g: [number, number]; source: string; fromFuel: number; capped: boolean };
  protein: { gPerKg: number; g: number; source: string };
  fat: { g: [number, number]; target: number; minG: number; minPct: number; source: string };
  /** Ponderea energiei meselor din alimentele bogate în carbohidrați (reper; grame de carbohidrați nu avem în tabel). */
  carbFoodShare: number;
  explain: string;
}

export type BudgetStatus = 'ok' | 'peste' | 'necunoscut';
export interface DayCheck {
  energy: { target: number; actual: number; gap: number; inRange: boolean } | null;
  protein: { target: number; actual: number; gap: number } | null;
  /** Rețete care încalcă dieta sau alergiile (trebuie să fie gol). */
  allergens: string[];
  budget: { limit: number | null; costKnown: number; complete: boolean; status: BudgetStatus | null; minKnown: number | null; conflict: string | null };
  meals: { promised: number; main: number; extra: number; slots: Slot[] };
}

export interface NutritionDay {
  date: string;
  personalized: boolean;
  missing: string[];
  energy: { ree: number; base: number; exercise: number; adjustPct: number; target: number; low: number; high: number; method: string[]; unknown: string[]; margin: number } | null;
  protein: { gPerKg: number; target: number } | null;
  macros: Macros | null;
  dayType: string;
  goalNote: string;
  /** Un plan de alimentare pe fereastră de efort (brick = o fereastră). */
  fuel: { sessionLabel: string; minutes: number; carbsPerHour: [number, number]; plannedG: number; kcal: number; note: string }[];
  /** Note de context fără gel (ex. două ședințe separate în aceeași zi). */
  fuelNotes: string[];
  meals: Meal[];
  /** kcal = mesele; dayKcal = mesele + alimentarea din efort (numărată o singură dată). */
  totals: { kcal: number; dayKcal: number; protein: number; cost: number | null; costKnown: number; costComplete: boolean };
  budgetNote: string | null;
  /** Validarea întregii zile, refăcută la fiecare calcul (inclusiv după „Schimbă”; A83). */
  check: DayCheck;
  /** Suplimente: doar proteina praf acceptată, pentru diferență; fier / vitamina D doar cu indicație, fără doze (A80). */
  supplements: { kind: 'proteina' | 'fier' | 'vitamina_d'; text: string; proteinG?: number }[];
  /** Meniu complet = câte mese s-au promis chiar există; altfel „Meniu incomplet: 3/4 mese”. */
  complete: boolean;
  mealsPromised: number;
  message: string;
  warnings: string[];
}

const SLOT_LABEL: Record<Slot, string> = { mic_dejun: 'Mic dejun', pranz: 'Prânz', cina: 'Cină', gustare: 'Gustare' };
const SPORT_WORD: Record<string, string> = { inot: 'înot', bicicleta: 'bicicletă', alergare: 'alergare', forta: 'sală', mers: 'mers' };
const r1 = (x: number) => Math.round(x * 10) / 10;
const n0 = (x: number) => Math.round(x).toLocaleString('ro-RO');
const sessionLabel = (s: DaySession) => `${SPORT_WORD[s.sport] ?? s.sport} ${s.minutes} min`;

/** Mifflin-St Jeor (repaus), kcal/zi. */
export function mifflin(sex: 'm' | 'f', kg: number, cm: number, age: number): number {
  return 10 * kg + 6.25 * cm - 5 * age + (sex === 'm' ? 5 : -161);
}

const hard = (s: DaySession) => !!s.key || s.type === 'calitate' || s.type === 'brick';

/** MET-ul folosit pentru ședință, sau null pentru un sport fără valoare în tabel. */
export function metFor(s: DaySession): number | null {
  const m = MET[s.sport];
  return m ? (hard(s) ? m.greu : m.usor) : null;
}

/** Energia netă a ședinței (peste repaus), kcal: (MET − 1) × kg × ore; null = sport necunoscut (nu inventăm un MET). */
export function sessionNetKcal(s: DaySession, kg: number): number | null {
  const met = metFor(s);
  return met == null ? null : (met - 1) * kg * (s.minutes / 60);
}

/** Alimentarea din timpul efortului (AIS) pentru o fereastră de efort de `minutes` minute. */
export function fuelForMinutes(minutes: number): { carbsPerHour: [number, number]; plannedG: number; note: string } | null {
  if (minutes < 75) return null;
  if (minutes <= 150) return { carbsPerHour: [30, 60], plannedG: Math.round((40 * minutes) / 60 / 5) * 5, note: 'pornești de la ~40 g/oră (ce tolerezi deja); crești doar exersat' };
  return { carbsPerHour: [60, 90], plannedG: Math.round((60 * minutes) / 60 / 5) * 5, note: 'până la 90 g/oră doar după ce ai exersat; pornești de la ~60 g/oră' };
}

/** Alimentarea pentru o singură ședință (forța nu primește gel). */
export function fuelFor(s: DaySession): ReturnType<typeof fuelForMinutes> {
  return s.sport === 'forta' || metFor(s) == null ? null : fuelForMinutes(s.minutes);
}

/** Minutele care contează pentru alimentare: anduranță cunoscută (nu forța, nu un sport fără MET). */
const fuelMinutes = (s: DaySession) => (s.sport === 'forta' || metFor(s) == null ? 0 : s.minutes);

/**
 * Ferestrele de efort ale zilei (A86): brick-ul (aceeași `window` sau tipul „brick”) e o fereastră; două ședințe cu ore
 * cunoscute și cel mult FUEL_WINDOW_GAP_MIN minute între ele sunt o fereastră; fără oră, fiecare ședință e separată.
 */
export function effortWindows(sessions: DaySession[]): DaySession[][] {
  const sorted = sessions.map((s, i) => ({ s, i })).sort((a, b) => (a.s.startMin ?? 1e9) - (b.s.startMin ?? 1e9) || a.i - b.i).map((x) => x.s);
  const groups: { key: string | null; list: DaySession[] }[] = [];
  for (const s of sorted) {
    const key = s.window ?? (s.type === 'brick' ? 'brick' : null);
    const same = key ? groups.find((g) => g.key === key) : undefined;
    if (same) {
      same.list.push(s);
      continue;
    }
    const last = groups.at(-1)?.list.at(-1);
    if (!key && last && last.startMin != null && s.startMin != null && s.startMin - (last.startMin + last.minutes) <= FUEL_WINDOW_GAP_MIN) {
      groups.at(-1)!.list.push(s);
      continue;
    }
    groups.push({ key, list: [s] });
  }
  return groups.map((g) => g.list);
}

/** Treapta zilei pentru carbohidrați (încadrarea e REGULĂ AIRON; intervalele g/kg sunt din AIS / IOC). */
export function dayLoad(sessions: DaySession[]): DayLoad {
  const active = sessions.filter((s) => s.minutes > 0);
  if (!active.length) return 'repaus';
  const endurance = active.reduce((n, s) => n + fuelMinutes(s), 0);
  const total = active.reduce((n, s) => n + s.minutes, 0);
  if (endurance >= 240) return 'foarte_mare';
  if (endurance >= 90 || active.some((s) => (s.type === 'lung' || s.type === 'brick') && fuelMinutes(s) > 0)) return 'mare';
  if (active.some(hard) || total >= 60) return 'moderat';
  return 'usor';
}

export const CARB_G_PER_KG: Record<DayLoad, { range: [number, number]; source: string }> = {
  repaus: { range: [3, 5], source: 'setare de produs: AIS / IOC nu dau o treaptă separată pentru ziua fără antrenament; folosim treapta „ușor” (3–5 g/kg)' },
  usor: { range: [3, 5], source: 'AIS / IOC (Burke și colab. 2011): efort ușor sau de tehnică, 3–5 g/kg/zi' },
  moderat: { range: [5, 7], source: 'AIS / IOC (Burke și colab. 2011): efort moderat, ~1 oră pe zi, 5–7 g/kg/zi' },
  mare: { range: [6, 10], source: 'AIS / IOC (Burke și colab. 2011): anduranță 1–3 ore pe zi, 6–10 g/kg/zi' },
  foarte_mare: { range: [8, 12], source: 'AIS / IOC (Burke și colab. 2011): efort de peste 4 ore pe zi, 8–12 g/kg/zi' },
};
const LOAD_WORD: Record<DayLoad, string> = { repaus: 'zi fără antrenament', usor: 'efort ușor', moderat: 'efort moderat', mare: 'anduranță lungă', foarte_mare: 'efort foarte lung' };

const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

/** De ce o rețetă nu e permisă sportivului (alergen, aliment exclus, dietă), sau null dacă e permisă. */
export function ineligibleReason(r: Recipe, p: NutritionPrefs): string | null {
  for (const i of r.ingredients) {
    const f = FOODS[i.food]!;
    const al = f.allergens.filter((a) => p.exclude.includes(a));
    if (al.length) return `conține un alergen exclus (${al.map((a) => ALLERGEN_LABEL[a]).join(', ')})`;
    const t = (p.other ?? []).find((x) => fold(x).length >= 3 && fold(`${f.name} ${i.food}`).includes(fold(x)));
    if (t) return `conține ce ai exclus („${t}”)`;
    if (p.diet === 'vegan' && f.animal) return 'nu e vegană';
    if (p.diet === 'vegetarian' && (f.animal === 'carne' || f.animal === 'peste')) return 'nu e vegetariană';
  }
  return null;
}
const eligible = (r: Recipe, p: NutritionPrefs) => ineligibleReason(r, p) == null;

const kindOf: Record<Slot, Recipe['kind']> = { mic_dejun: 'B', pranz: 'M', cina: 'M', gustare: 'G' };
const ROT_COL: Record<Slot, number> = { mic_dejun: 0, pranz: 1, cina: 2, gustare: 3 };
const EPOCH = '2026-01-05';
const dayIndex = (date: string) => ((diffDays(EPOCH, date) % 14) + 14) % 14;
/**
 * Începutul istoricului de varietate: ancorat pe blocuri fixe de 91 de zile (minus 28 de zile de rodaj), ca toate zilele
 * dintr-un bloc să pornească din aceeași simulare — meniul de ieri, cel de azi și „alternativele” sunt consecvente.
 * Zilele din jurnal nu se simulează: se citesc (A84).
 */
export const historyFrom = (date: string) => addDays(EPOCH, Math.floor(dayNum(date) / 91) * 91 - 28);
const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
const dayNum = (date: string) => Math.max(0, diffDays(EPOCH, date));
const KIND_POOL: Record<Recipe['kind'], string[]> = { B: [], M: [], G: [] };
for (const r of RECIPES) KIND_POOL[r.kind].push(r.id);

/**
 * Profilul de alegere a meselor (personalizarea selecției, nu doar a porțiilor). Fiecare criteriu e calculat din
 * ingredientele rețetei (energie și proteine din foods.ts), nu ghicit:
 *  - energia porției de referință față de energia unei mese pentru sportivul ăsta (sex, vârstă, greutate, obiectiv):
 *    rețetele care se potrivesc ies în porții normale, nu micșorate sau umflate;
 *  - obiectivul: slăbire / tonifiere / peste 50 de ani → proteine mai dense; masă musculară → porții mai consistente;
 *    rezistență (triatlon, alergare, bicicletă, înot) → mai multă energie din cereale, cartof, fructe;
 *  - surse de fier (linte, năut, fasole, spanac, ouă, pește) DOAR cu o indicație reală (analize sub intervalul
 *    laboratorului sau medicul) — niciodată deduse din sex (auditul v93, A80; regula 23);
 *  - în ziua cu efort lung (carbFocusDate), întâi rețetele cu mai multă energie din alimente bogate în carbohidrați (A78);
 *  - bugetul (A82): partea de cost cunoscută a porției nu poate trece de partea slotului din bugetul zilei;
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
  /** Sloturile meselor principale (din numărul și orele alese). */
  slots?: Slot[];
  /** Indicație reală pentru fier (nu din sex). */
  ironFocus?: boolean;
  /** Ziua cu efort lung: rețetele cu mai multă energie din carbohidrați au prioritate (doar în ziua asta). */
  carbFocusDate?: string | null;
}

const CARB_FOODS = new Set(['ovaz', 'orez', 'orez-brun', 'paste', 'cuscus', 'bulgur', 'quinoa', 'hrisca', 'malai', 'tortilla', 'cartof', 'cartof-dulce', 'paine', 'banana', 'mar', 'para', 'portocala', 'struguri', 'afine', 'kiwi', 'curmale', 'stafide', 'capsuni', 'fructe-padure', 'prune', 'piersici', 'miere']);
const IRON_FOODS = new Set(['linte', 'linte-rosie', 'naut', 'fasole', 'fasole-alba', 'spanac', 'ou', 'ton', 'somon', 'tofu', 'vita']);
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

/** Gustarea în plus: printre primele 5 potrivite (sortate), rotită pe zi și pe sportiv, ca să nu fie aceeași zilnic. */
function rotatePick(sorted: Recipe[], date: string, seed: string | null | undefined, salt: number): Recipe | undefined {
  const top = sorted.slice(0, 5);
  if (!top.length) return undefined;
  return top[(dayNum(date) + (seed ? hashSeed(seed) : 0) + salt) % top.length];
}

const MAIN = new Map<string, string | null>();
const mainOf = (id: string) => {
  if (!MAIN.has(id)) MAIN.set(id, mainProtein(RECIPE[id]!));
  return MAIN.get(id)!;
};

/** Ponderea energiei rețetei (porția de referință) din alimentele bogate în carbohidrați. */
const CARB_SHARE = new Map<string, number>();
export function carbFoodShareOf(id: string): number {
  if (!CARB_SHARE.has(id)) {
    let k = 0;
    let c = 0;
    for (const i of RECIPE[id]!.ingredients) {
      const v = foodValues(i.food, i.qty).kcal;
      k += v;
      if (CARB_FOODS.has(i.food)) c += v;
    }
    CARB_SHARE.set(id, c / Math.max(1, k));
  }
  return CARB_SHARE.get(id)!;
}

/** Cât de potrivită e rețeta pentru sportiv (mai mic = mai potrivit). */
export function recipeFit(r: Recipe, slot: Slot, p: PickProfile): number {
  let kcal = 0;
  let prot = 0;
  let iron = 0;
  for (const i of r.ingredients) {
    const v = foodValues(i.food, i.qty);
    kcal += v.kcal;
    prot += v.protein;
    if (IRON_FOODS.has(i.food)) iron += 1;
  }
  const protShare = (prot * 4) / Math.max(1, kcal);
  const carbShare = carbFoodShareOf(r.id);
  let score = 0;
  if (p.dayKcal) {
    const slots = p.slots ?? slotsFor(p.meals ?? 3);
    const share = SLOT_SHARE[slot] / slots.reduce((n, s) => n + SLOT_SHARE[s], 0);
    score += Math.abs(Math.log(kcal / (p.dayKcal * share)));
  }
  const g = p.goal ?? '';
  if (g === 'fit-slabire' || g === 'fit-tonifiere' || (p.age ?? 0) >= 50) score -= protShare * 1.2;
  if (g === 'fit-masa') score -= Math.min(1, kcal / 900) * 0.6 + protShare * 0.4;
  if (ENDURANCE.test(g)) score -= carbShare * 0.8;
  if (p.ironFocus) score -= Math.min(2, iron) * 0.12;
  return score;
}

/** Costul cunoscut al rețetei la o scală a porției (RON) și dacă toate prețurile există. */
function knownCost(id: string, scale: number): { known: number; complete: boolean } {
  let known = 0;
  let complete = true;
  for (const i of RECIPE[id]!.ingredients) {
    const c = foodCost(i.food, i.qty * scale);
    if (c == null) complete = false;
    else known += c;
  }
  return { known, complete };
}
const REF_KCAL = new Map<string, number>();
const refKcal = (id: string) => {
  if (!REF_KCAL.has(id)) REF_KCAL.set(id, RECIPE[id]!.ingredients.reduce((n, i) => n + foodValues(i.food, i.qty).kcal, 0));
  return REF_KCAL.get(id)!;
};

/** Partea slotului din bugetul zilei (RON), după ponderile meselor alese. */
export function slotBudget(budget: number, slots: Slot[], slot: Slot): number {
  return (budget * SLOT_SHARE[slot]) / slots.reduce((n, s) => n + SLOT_SHARE[s], 0);
}

/**
 * Verificarea bugetului pentru o rețetă la porția estimată pentru sportiv (A82): partea de cost CUNOSCUTĂ (o limită de
 * jos) față de partea slotului. Un preț lipsă nu devine zero și nici scump: rămâne necunoscut (complete = false).
 */
export function budgetFit(id: string, slot: Slot, budget: number, slots: Slot[], profile: PickProfile = {}): { knownCost: number; complete: boolean; limit: number; ok: boolean } {
  const share = SLOT_SHARE[slot] / slots.reduce((n, s) => n + SLOT_SHARE[s], 0);
  const scale = profile.dayKcal ? Math.min(1.6, Math.max(0.7, (profile.dayKcal * share) / refKcal(id))) : 1;
  const c = knownCost(id, scale);
  const limit = slotBudget(budget, slots, slot);
  return { knownCost: c.known, complete: c.complete, limit, ok: c.known <= limit };
}

export interface DaySelection {
  picks: Partial<Record<Slot, string>>;
  repeats: Slot[];
  empty: Slot[];
  /** Bugetul a fost aplicat în selecție. */
  budgetChecked: boolean;
  /** Sloturi pentru care nicio rețetă eligibilă nu încape în partea de buget (s-a ales cea mai ieftină cunoscută). */
  budgetOver: Slot[];
  /** Alegeri „Schimbă” care nu au intrat (alergen, dietă, tip), cu motivul. */
  ignored: { slot: Slot; id: string; reason: string }[];
  /** Ziua vine din jurnal (nu s-a regenerat). */
  fromLog: boolean;
}

/** Selecția zilelor de la `from` la `to`, cu ferestrele de varietate (istoric calculat sau din jurnal, nu ghicit). */
export function selectDays(from: string, to: string, prefs: NutritionPrefs, preSlot: (date: string) => Slot | null = () => null, profile: PickProfile = {}): Map<string, DaySelection> {
  const out = new Map<string, DaySelection>();
  const uses = new Map<string, string[]>();
  const slots = profile.slots ?? slotsFor(prefs.meals, prefs.mealTimes);
  // Rotația merge doar prin rețetele pe care sportivul le poate mânca (altfel cele de după un șir de excluse ar ieși mai des).
  const elig = Object.fromEntries((['mic_dejun', 'pranz', 'cina', 'gustare'] as Slot[]).map((sl) => [sl, KIND_POOL[kindOf[sl]].filter((id) => eligible(RECIPE[id]!, prefs))])) as Record<Slot, string[]>;
  // Personalizarea (fixă pe tot intervalul): cele mai potrivite ~60% pentru sportiv sunt grupa 0, restul grupa 1.
  const personal = !!(profile.dayKcal || profile.goal || profile.sex || profile.ironFocus);
  const tierOf = Object.fromEntries((Object.keys(elig) as Slot[]).map((sl) => {
    const ids = elig[sl];
    if (!personal) return [sl, new Map(ids.map((id) => [id, 0]))];
    const fit = new Map(ids.map((id) => [id, recipeFit(RECIPE[id]!, sl, profile)]));
    const cut = [...fit.values()].sort((a, b) => a - b)[Math.max(0, Math.ceil(ids.length * 0.6) - 1)] ?? Infinity;
    return [sl, new Map(ids.map((id) => [id, fit.get(id)! <= cut ? 0 : 1]))];
  })) as Record<Slot, Map<string, number>>;
  // Ziua cu efort lung: sub mediana slotului la energia din carbohidrați = o grupă mai jos.
  const carbMedian = Object.fromEntries((Object.keys(elig) as Slot[]).map((sl) => {
    const v = elig[sl].map(carbFoodShareOf).sort((a, b) => a - b);
    return [sl, v.length ? v[Math.floor(v.length / 2)]! : 0];
  })) as Record<Slot, number>;
  const budget = prefs.budget;
  for (let d = from; d <= to; d = addDays(d, 1)) {
    // Zilele trecute din jurnal: exact ce s-a propus / ales atunci, nu o regenerare cu preferințele de acum (A84).
    const logged = d < to ? loggedPicks(prefs.log, d) : null;
    if (logged) {
      const picks = Object.fromEntries(Object.entries(logged).filter(([, id]) => !!RECIPE[id!])) as Partial<Record<Slot, string>>;
      for (const id of Object.values(picks)) uses.set(id!, [...(uses.get(id!) ?? []), d]);
      out.set(d, { picks, repeats: [], empty: [], budgetChecked: false, budgetOver: [], ignored: [], fromLog: true });
      continue;
    }
    const picks: Partial<Record<Slot, string>> = {};
    const repeats: Slot[] = [];
    const empty: Slot[] = [];
    const budgetOver: Slot[] = [];
    const ignored: DaySelection['ignored'] = [];
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
      const main = mainOf(id);
      if (main && Object.values(picks).some((x) => mainOf(x!) === main)) return false;
      return true;
    };
    for (const slot of slots) {
      const chosen = prefs.choices?.[d]?.[slot];
      if (chosen && RECIPE[chosen]) {
        const why = ineligibleReason(RECIPE[chosen]!, prefs) ?? (RECIPE[chosen]!.kind !== kindOf[slot] ? 'nu e pentru această masă' : null);
        if (!why) {
          // Alegerea sportivului e respectată și peste buget; verificarea zilei o spune (check.budget).
          picks[slot] = chosen;
          continue;
        }
        if (d === to) ignored.push({ slot, id: chosen, reason: why });
      }
      // Ordinea: toată biblioteca tipului, rotită pe zi și pe sportiv (pas prim cu mărimea listei), ca toate rețetele
      // să apară, nu doar primele din ghid.
      const pool = elig[slot];
      // Pasul e prim cu numărul de rețete, ca rotația să treacă prin toate (nu doar printr-un ciclu scurt).
      let step = 7 + ROT_COL[slot] * 4;
      while (pool.length > 1 && gcd(step, pool.length) !== 1) step++;
      const start = pool.length ? (dayNum(d) * step + idx * 3) % pool.length : 0;
      let cands = pool.map((_, k) => pool[(start + k) % pool.length]!);
      // Bugetul, constrângere în selecție: rețetele a căror parte de cost cunoscută trece de partea slotului ies.
      if (budget != null && cands.length) {
        const fits = cands.map((id) => ({ id, f: budgetFit(id, slot, budget, slots, profile) }));
        const within = fits.filter((x) => x.f.ok).map((x) => x.id);
        if (within.length) cands = within;
        else {
          cands = fits.sort((a, b) => a.f.knownCost - b.f.knownCost).map((x) => x.id);
          budgetOver.push(slot);
        }
      }
      // Grupe în ordinea preferinței: înaintea efortului întâi rețetele familiare cu puține fibre; apoi cele mai potrivite
      // ~60% pentru sportiv (personalizarea), apoi restul. În grupă: cea folosită cel mai demult (rotația sparge egalitățile),
      // ca rețetele să se folosească uniform, nu aceleași câteva.
      const base = tierOf[slot];
      const pre = preSlot(d) === slot;
      const carb = profile.carbFocusDate === d;
      const tier = new Map<string, number>(cands.map((id) => [id, base.get(id)! + (pre && !RECIPE[id]!.preOk ? 2 : 0) + (carb && carbFoodShareOf(id) < carbMedian[slot] ? 1 : 0)]));
      const lastUse = (id: string) => uses.get(id)?.at(-1) ?? '';
      const keep = budget != null && budgetOver.includes(slot);
      cands = cands.map((id, k) => ({ id, k })).sort((x, y) => (keep ? x.k - y.k : tier.get(x.id)! - tier.get(y.id)! || (lastUse(x.id) < lastUse(y.id) ? -1 : lastUse(x.id) > lastUse(y.id) ? 1 : x.k - y.k))).map((x) => x.id);
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
    out.set(d, { picks, repeats, empty, budgetChecked: budget != null, budgetOver, ignored, fromLog: false });
  }
  return out;
}

/** Sursa de proteine a rețetei: cel puțin 30% din energie din proteine și nu o legumă (porția se scalează după proteine). */
export function isProteinFood(id: string): boolean {
  const f = FOODS[id]!;
  return f.kcal >= 60 && (f.protein * 4) / f.kcal >= 0.3;
}

function mealOf(slot: Slot, r: Recipe, factor: number, proteinFactor = factor, carbFactor = factor): Omit<Meal, 'why' | 'repeat'> {
  const items: MealItem[] = r.ingredients.map((i) => {
    const f = FOODS[i.food]!;
    const raw = i.qty * (isProteinFood(i.food) ? proteinFactor : CARB_FOODS.has(i.food) ? carbFactor : factor);
    const qty = f.id === 'ulei' ? Math.max(1, Math.round(raw)) : Math.max(5, Math.round(raw / 5) * 5);
    return { food: f.id, name: f.name, qty, unit: f.unit };
  });
  let kcal = 0;
  let protein = 0;
  let cost = 0;
  let carbFoodKcal = 0;
  const missingPrices: string[] = [];
  for (const it of items) {
    const v = foodValues(it.food, it.qty);
    kcal += v.kcal;
    protein += v.protein;
    if (CARB_FOODS.has(it.food)) carbFoodKcal += v.kcal;
    const c = foodCost(it.food, it.qty);
    if (c == null) missingPrices.push(FOODS[it.food]!.name.split(',')[0]!.toLowerCase());
    else cost += c;
  }
  const allergens = [...new Set(items.flatMap((it) => FOODS[it.food]!.allergens))];
  return { slot, label: SLOT_LABEL[slot], recipe: r, items, kcal, protein, cost: missingPrices.length ? null : cost, costKnown: cost, missingPrices, allergens, carbFoodKcal };
}

/** Valorile rețetei la porția de referință (pentru verificări și alternative). */
export function recipeValues(id: string): { kcal: number; protein: number } {
  const m = mealOf('pranz', RECIPE[id]!, 1);
  return { kcal: m.kcal, protein: m.protein };
}

/** Slotul unei mese după ora ei (setare de produs: înainte de 11:00 mic dejun, înainte de 16:00 prânz, apoi cină). */
export const slotAt = (min: number): Slot => (min < 11 * 60 ? 'mic_dejun' : min < 16 * 60 ? 'pranz' : 'cina');

/**
 * Mesele zilei după numărul dorit: 1 = cina; 2 = prânz + cină (mesele principale); 3 = + mic dejun; 4 = + gustare.
 * Pentru 1–2 mese, orele declarate decid slotul (ex. o masă la 13:00 = prânzul, nu cina; A81).
 */
export function slotsFor(n: number, times?: number[] | null): Slot[] {
  const def: Slot[] = n <= 1 ? ['cina'] : n === 2 ? ['pranz', 'cina'] : n === 3 ? ['mic_dejun', 'pranz', 'cina'] : ['mic_dejun', 'pranz', 'cina', 'gustare'];
  const want = n <= 1 ? 1 : n === 2 ? 2 : 0;
  const ts = (times ?? []).filter((t) => Number.isFinite(t) && t >= 0 && t < 24 * 60).slice(0, want).sort((a, b) => a - b);
  if (!want || ts.length !== want) return def;
  const out = ts.map(slotAt);
  return new Set(out).size === out.length ? out : def;
}

/** Slotul mesei dinaintea primei ședințe a zilei (dacă se știe ora): acolo nu punem fibre multe. */
export function preEffortSlot(sessions: DaySession[], meals: number, times?: number[] | null): Slot | null {
  const first = sessions.filter((s) => s.sport !== 'forta' || s.minutes >= 45).filter((s) => !s.done).map((s) => s.startMin).filter((x): x is number => x != null).sort((a, b) => a - b)[0];
  if (first == null) return null;
  const has = slotsFor(meals, times);
  if (first < 11 * 60 && has.includes('mic_dejun')) return 'mic_dejun';
  if (first < 17 * 60 && has.includes('pranz')) return 'pranz';
  return has.includes('gustare') ? 'gustare' : has.includes('pranz') && first >= 11 * 60 ? 'pranz' : null;
}

/** Țintele de macronutrienți pentru energia și greutatea date (A78). */
export function macroTargets(target: number, kg: number, proteinGPerKg: number, load: DayLoad, fuelG: number): Omit<Macros, 'carbFoodShare' | 'explain'> {
  const P = proteinGPerKg * kg;
  const minG = (target * FAT_MIN_PCT) / 100 / 9;
  const ref = CARB_G_PER_KG[load];
  const raw: [number, number] = [ref.range[0] * kg, ref.range[1] * kg];
  // Carbohidrații nu pot lua energia minimă a grăsimilor: dacă nu încap, se taie maximul (și se spune).
  const room = Math.max(0, (target - P * 4 - minG * 9) / 4);
  const hi = Math.min(raw[1], room);
  const lo = Math.min(raw[0], hi);
  const fatOf = (c: number) => Math.max(minG, (target - P * 4 - c * 4) / 9);
  return {
    load,
    carbs: { gPerKg: ref.range, g: [lo, hi], source: ref.source, fromFuel: fuelG, capped: hi < raw[1] },
    protein: { gPerKg: proteinGPerKg, g: P, source: 'ghidul AIRON (S04/S10): 1,6 g/kg; 1,8 în deficit sau la masă musculară' },
    fat: { g: [fatOf(hi), fatOf(lo)], target: fatOf((lo + hi) / 2), minG, minPct: FAT_MIN_PCT, source: `restul energiei, cu minimum ${FAT_MIN_PCT}% din energie (setare de produs, nu un standard din sursele citate)` },
  };
}

export function nutritionDay(input: NutritionInput): NutritionDay {
  const { athlete: a, prefs } = input;
  const missing: string[] = [];
  if (a.weightKg == null) missing.push('greutatea (Date de bază → Corp)');
  if (a.heightCm == null) missing.push('înălțimea (Profil)');
  if (a.age == null) missing.push('anul nașterii (Profil)');
  if (a.sex == null) missing.push('parametrul ecuației: bărbat / femeie (Profil)');
  const b0 = input.blockers ?? {};
  // Auditul v93, A56/A79: formulele sunt pentru adulți fără sarcină. În afara domeniului nu se calculează automat o
  // țintă de energie (nici deficit, nici surplus); mesele rămân orientative.
  const outOfDomain = b0.minor ? 'sub 18 ani' : b0.pregnancy ? 'sarcină sau primul an după naștere' : null;
  const personalized = missing.length === 0 && !outOfDomain;
  const sessions = input.sessions.filter((s) => s.minutes > 0);
  const warnings: string[] = [];
  if (outOfDomain) warnings.push(`ținta de energie nu se calculează automat (${outOfDomain}): formula e pentru adulți fără sarcină; mesele sunt orientative, cantitățile se stabilesc cu medicul sau un nutriționist`);
  if (a.weightKg != null && a.weightDate) {
    const age = diffDays(a.weightDate, input.date);
    if (age > WEIGHT_STALE_DAYS) warnings.push(`greutatea e din ${a.weightDate} (acum ${age} de zile): ținta se calculează cu ea; o cântărire nouă o actualizează`);
  }

  // Tipul zilei.
  const total = sessions.reduce((n, s) => n + s.minutes, 0);
  const long = sessions.some((s) => s.type === 'lung' || s.type === 'brick' || s.minutes >= 90);
  const isHard = sessions.some(hard);
  const list = sessions.map(sessionLabel).join(' + ');
  const dayType = !sessions.length ? 'zi fără antrenament' : long || total > 75 ? `zi lungă (${list})` : isHard ? `zi cu intensitate (${list})` : `zi ușoară (${list})`;
  const load = dayLoad(sessions);

  // Alimentarea din efort: un plan pe fereastra de efort (brick = o fereastră), o singură dată în total (A86).
  const windows = effortWindows(sessions);
  const fuel: NutritionDay['fuel'] = [];
  for (const w of windows) {
    const minutes = w.reduce((n, s) => n + fuelMinutes(s), 0);
    const f = fuelForMinutes(minutes);
    if (f) fuel.push({ sessionLabel: w.map(sessionLabel).join(' + '), minutes, carbsPerHour: f.carbsPerHour, plannedG: f.plannedG, kcal: f.plannedG * 4, note: f.note });
  }
  const fuelKcal = fuel.reduce((n, f) => n + f.kcal, 0);
  const fuelG = fuel.reduce((n, f) => n + f.plannedG, 0);
  const fuelNotes: string[] = [];
  if (windows.length >= 2 && windows.some((w) => w.some((s) => fuelMinutes(s) > 0))) {
    fuelNotes.push(`${windows.length === 2 ? 'două' : windows.length} ședințe separate azi: masa dintre ele (carbohidrați și proteine) contează mai mult decât un gel${windows.some((w) => w.some((s) => s.startMin == null)) ? '; fără ora ședințelor nu știu dacă sunt una după alta' : ''}`);
  }

  // Obiectivul.
  const b = input.blockers ?? {};
  // Zi ușoară = fără intensitate, fără ședință lungă și cel mult ~75 min în total (aceeași definiție ca în mesaj).
  const easyDay = !isHard && !long && total <= 75;
  let adjustPct = 0;
  let goalNote = 'menținere: mâncarea urmează antrenamentele';
  if (input.goal === 'fit-slabire') {
    const block = b.pregnancy ? 'sarcină / postpartum' : b.minor ? 'sub 18 ani' : b.restriction === 'stop' || b.restriction === 'rosu' ? 'restricție de sănătate activă' : b.restriction === 'galben' ? 'zi galbenă (oboseală, durere sau recuperare la jumătate)' : b.fatigue ? 'oboseală declarată de mai multe ori' : null;
    if (block) goalNote = `fără deficit azi: ${block}`;
    else if (!easyDay) goalNote = 'fără deficit azi: e zi de antrenament mai lung sau mai greu';
    else {
      adjustPct = -12;
      goalNote = 'deficit mic (~12%) doar în zilele ușoare';
    }
  } else if (input.goal === 'fit-masa') {
    adjustPct = b.restriction === 'stop' || b.restriction === 'rosu' || b.pregnancy || b.minor ? 0 : 7;
    goalNote = adjustPct ? 'surplus mic (~7%) pentru masă musculară; se ajustează după tendință' : 'fără surplus azi: restricție de sănătate';
  }

  // Energia: metoda și ipotezele scrise (A77). Un sport fără MET nu primește MET-ul de alergare.
  const unknown = sessions.filter((s) => metFor(s) == null).map(sessionLabel);
  if (unknown.length) warnings.push(`energia pentru ${unknown.join(', ')} nu e estimată (sportul nu are MET în tabel): ținta zilei o subestimează; nu folosesc MET-ul altui sport`);
  let energy: NutritionDay['energy'] = null;
  let proteinT: NutritionDay['protein'] = null;
  if (personalized) {
    const kg = a.weightKg!;
    const ree = mifflin(a.sex!, kg, a.heightCm!, a.age!);
    const base = ree * BASE_PAL;
    const parts = sessions.filter((s) => metFor(s) != null).map((s) => `${sessionLabel(s)}${s.done ? ' (făcută, durata reală)' : ''}: MET ${metFor(s)!.toLocaleString('ro-RO')} → ~${n0(sessionNetKcal(s, kg)!)} kcal`);
    const exercise = sessions.reduce((n, s) => n + (sessionNetKcal(s, kg) ?? 0), 0);
    const target = (base + exercise) * (1 + adjustPct / 100);
    const method = [
      `repaus: Mifflin-St Jeor cu ${r1(kg).toLocaleString('ro-RO')} kg${a.weightDate ? ` (cântărit ${a.weightDate})` : ''}, ${a.heightCm} cm, ${a.age} ani = ~${n0(ree)} kcal (estimare de populație, nu măsurătoare)`,
      `viața de zi cu zi fără sport: × 1,4 (setare AIRON, nivelul „sedentar / ușor activ” din FAO/WHO/UNU 2004) = ~${n0(base)} kcal`,
      parts.length ? `antrenamentele, peste repaus: (MET − 1) × kg × ore, MET din Compendium (Ainsworth 2011) — ${parts.join('; ')}` : 'antrenamente: niciunul cu energie estimată azi',
      ...(unknown.length ? [`neestimat: ${unknown.join(', ')} (fără MET în tabel)`] : []),
      ...(adjustPct ? [`obiectivul: ${adjustPct > 0 ? '+' : ''}${adjustPct}% (${goalNote}; setare AIRON)`] : []),
      `±${ENERGY_MARGIN * 100}% în jurul țintei e o marjă de produs, nu un interval de încredere calculat`,
      'caloriile ceasului nu se adună peste (fără dublă contabilizare)',
    ];
    energy = { ree, base, exercise, adjustPct, target, low: target * (1 - ENERGY_MARGIN), high: target * (1 + ENERGY_MARGIN), method, unknown, margin: ENERGY_MARGIN };
    const gPerKg = adjustPct < 0 || input.goal === 'fit-masa' ? 1.8 : 1.6;
    proteinT = { gPerKg, target: gPerKg * kg };
    if (a.age != null && a.age >= 65) warnings.push('peste 65 de ani: proteinele împărțite pe toate mesele; dacă ai o afecțiune sau tratament, planul se discută cu medicul');
  }

  // Mesele: selecția cu varietate (istoricul din jurnal sau calculat, ca ferestrele să fie reale), apoi porțiile.
  const wanted = slotsFor(prefs.meals, prefs.mealTimes);
  const pre = preEffortSlot(sessions, prefs.meals, prefs.mealTimes);
  // Profilul de alegere: aceeași energie de bază în fiecare zi (fără sport), ca istoricul de varietate să fie stabil; ziua
  // cu efort lung aduce în față rețetele cu mai mulți carbohidrați doar azi (A78).
  const pick: PickProfile = { seed: input.athleteId ?? null, goal: input.goal, sex: a.sex, age: a.age, dayKcal: energy ? energy.base * (1 + adjustPct / 100) : null, meals: prefs.meals, slots: wanted, ironFocus: !!input.indications?.iron, carbFocusDate: load === 'mare' || load === 'foarte_mare' ? input.date : null };
  const sel = selectDays(historyFrom(input.date), input.date, prefs, (d) => (d === input.date ? pre : null), pick).get(input.date)!;
  for (const x of sel.ignored) warnings.push(`alegerea „${RECIPE[x.id]!.name}” (${x.id}) pentru ${SLOT_LABEL[x.slot].toLowerCase()} nu intră: ${x.reason}`);
  if (prefs.meals === 1 && !(prefs.mealTimes ?? []).length) warnings.push('ora mesei nedeclarată: am pus-o seara (cină); spune la Preferințe la ce oră mănânci și o mut');
  let slots = Object.keys(sel.picks) as Slot[];
  const base0 = slots.reduce((n, s) => n + recipeValues(sel.picks[s]!).kcal, 0);
  const mealsTarget = energy ? Math.max(0, energy.target - fuelKcal) : null;
  let factor = mealsTarget && base0 ? mealsTarget / base0 : 1;
  const extra: Recipe[] = [];
  // Porții realiste: mai bine gustări în jurul antrenamentului decât farfurii de 1,7× (auditul M35, D: nu redistribui
  // mecanic toate caloriile în două porții uriașe). Gustările în plus (inclusiv cea cu proteine) au o limită comună și
  // intră doar dacă sportivul le acceptă: după refuz, niciuna (auditul v93, A81).
  const fewMeals = prefs.meals <= 2;
  const snacksAllowed = prefs.snacksOk !== false;
  const maxExtra = !snacksAllowed ? 0 : fewMeals ? 2 : 1;
  const extraOk = (r: Recipe) => prefs.budget == null || budgetFit(r.id, 'gustare', prefs.budget, [...wanted, 'gustare'], pick).ok;
  // În ziua cu efort lung gustările din jurul antrenamentului sunt cele cu mai mulți carbohidrați; altfel cele cu proteine.
  const extraKey = (id: string) => (pick.carbFocusDate ? carbFoodShareOf(id) : recipeValues(id).protein);
  while (factor > 1.5 && extra.length < maxExtra) {
    const g = rotatePick(RECIPES.filter((r) => r.kind === 'G' && eligible(r, prefs) && extraOk(r) && !Object.values(sel.picks).includes(r.id) && !extra.includes(r)).sort((x, y) => extraKey(y.id) - extraKey(x.id)), input.date, input.athleteId, extra.length);
    if (!g) break;
    extra.push(g);
    factor = mealsTarget! / (base0 + extra.reduce((n, r) => n + recipeValues(r.id).kcal, 0));
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
  // Ziua cu efort lung (A78): energia în plus vine din alimentele bogate în carbohidrați (cereale, cartof, fructe), nu din
  // ulei, nuci sau brânză: restul ingredientelor rămâne la porția de referință cât se poate, carbohidrații iau diferența
  // (plafon 1,8 × porția de referință: setare de produs). Totalul de energie nu scade față de varianta cu un singur factor.
  let cF = eF;
  let oF = eF;
  if (pick.carbFocusDate && proteinT && mealsTarget && eF > 1) {
    let Kc = 0;
    let Kr = 0;
    let Kp = 0;
    for (const r of [...slots.map((s) => RECIPE[sel.picks[s]!]!), ...extra])
      for (const i of r.ingredients) {
        const v = foodValues(i.food, i.qty).kcal;
        if (isProteinFood(i.food)) Kp += v;
        else if (CARB_FOODS.has(i.food)) Kc += v;
        else Kr += v;
      }
    if (Kc > 0) {
      cF = Math.min(1.8, Math.max(eF, (mealsTarget - pF * Kp - Kr) / Kc));
      oF = Kr > 0 ? Math.min(eF, Math.max(1, (mealsTarget - pF * Kp - cF * Kc) / Kr)) : eF;
    }
  }

  const meals: Meal[] = [];
  const timeNote = sessions.some((s) => s.startSource === 'program') && !sessions.some((s) => s.startSource === 'activitate') ? ' (ora din programul declarat, nu ora reală a ședinței)' : '';
  for (const s of slots) {
    const m = mealOf(s, RECIPE[sel.picks[s]!]!, oF, pF, cF);
    const why = s === pre ? `înaintea ${sessions.length ? 'antrenamentului' : 'efortului'}: masă cu puține fibre, familiară${timeNote}` : s === 'gustare' && sessions.length ? 'gustarea ține energia între mese' : null;
    meals.push({ ...m, why, ...(sel.repeats.includes(s) ? { repeat: true } : {}) });
  }
  for (const g of extra) meals.push({ ...mealOf('gustare', g, oF, pF, cF), label: fewMeals ? 'Gustare în jurul antrenamentului' : 'Gustare în plus', why: `în plus față de ${prefs.meals === 1 ? 'masa aleasă' : `cele ${prefs.meals} mese alese`}, pentru că ai acceptat gustări: înainte sau după antrenament, ca porțiile să rămână realiste` });

  // Proteinele: dacă rămân sub țintă, o gustare bogată în proteine — doar dacă sportivul acceptă gustări și mai e loc în
  // limita gustărilor (fără a ascunde diferența).
  let protein = meals.reduce((n, m) => n + m.protein, 0);
  if (proteinT && protein < proteinT.target * 0.9) {
    if (snacksAllowed && extra.length < maxExtra) {
      const g = rotatePick(RECIPES.filter((r) => r.kind === 'G' && eligible(r, prefs) && extraOk(r) && !meals.some((m) => m.recipe.id === r.id) && recipeValues(r.id).protein >= 15).sort((x, y) => recipeValues(y.id).protein - recipeValues(x.id).protein), input.date, input.athleteId, 7);
      if (g) {
        meals.push({ ...mealOf('gustare', g, 1), label: 'Gustare cu proteine', why: `în plus, pentru că ai acceptat gustări: proteinele zilei ar fi rămas la ${Math.round(protein)} g din ${Math.round(proteinT.target)} g` });
        protein = meals.reduce((n, m) => n + m.protein, 0);
      }
    }
    if (protein < proteinT.target * 0.9) warnings.push(`proteinele ies ~${Math.round(protein)} g, sub ținta de ${Math.round(proteinT.target)} g: din preferințele de acum nu se poate mai mult${snacksAllowed ? '' : ' (fără gustări)'}`);
  }
  slots = meals.map((m) => m.slot);

  const kcal = meals.reduce((n, m) => n + m.kcal, 0);
  const dayKcal = kcal + fuelKcal;
  // Golul de energie: din valorile finale (mese după porții + efort), nu dintr-o estimare dinainte de porții (A86).
  if (energy && dayKcal < energy.low) {
    const gap = energy.target - dayKcal;
    const options = snacksAllowed ? 'încă o masă sau o gustare în plus în jurul antrenamentului' : 'o gustare în jurul antrenamentului (dacă vrei), încă o masă sau mai mulți carbohidrați în efort, dacă îi tolerezi';
    warnings.push(`cu ${prefs.meals} ${prefs.meals === 1 ? 'masă' : 'mese'}${snacksAllowed ? '' : ' și fără gustări'}, ținta nu încape în porții realiste: lipsesc ~${n0(gap)} kcal. Nu tai din necesar: ziua iese la ~${n0(dayKcal)} kcal (mese ~${n0(kcal)} + efort ~${n0(fuelKcal)}) față de ținta de ~${n0(energy.target)} kcal (limita de jos ~${n0(energy.low)}); variante: ${options}`);
  }

  const costKnown = meals.reduce((n, m) => n + m.costKnown, 0);
  const costComplete = meals.every((m) => m.cost != null);
  const missingP = [...new Set(meals.flatMap((m) => m.missingPrices))];

  // Bugetul (A82): starea și, la depășire, constrângerea incompatibilă numită.
  let budgetStatus: BudgetStatus | null = null;
  let minKnown: number | null = null;
  let conflict: string | null = null;
  let budgetNote: string | null = null;
  if (prefs.budget != null) {
    const lim = prefs.budget;
    budgetStatus = costKnown > lim + 1e-9 ? 'peste' : costComplete ? 'ok' : 'necunoscut';
    if (budgetStatus === 'peste') {
      // Cel mai ieftin meniu cunoscut cu aceleași porții: pe fiecare masă, cea mai ieftină rețetă eligibilă de același tip.
      minKnown = meals.reduce((n, m) => {
        const costs = RECIPES.filter((r) => r.kind === m.recipe.kind && eligible(r, prefs)).map((r) => (m.label === 'Gustare cu proteine' ? mealOf(m.slot, r, 1) : mealOf(m.slot, r, oF, pF, cF)).costKnown);
        return n + (costs.length ? Math.min(...costs) : m.costKnown);
      }, 0);
      const chosen = Object.values(prefs.choices?.[input.date] ?? {}).filter(Boolean);
      conflict =
        minKnown > lim + 1e-9
          ? `bugetul de ${lim} RON e incompatibil cu ținta de azi${energy ? ` (~${n0(energy.target)} kcal, ~${n0(proteinT!.target)} g proteine)` : ''} și cu preferințele (dietă, alergii): chiar și cele mai ieftine rețete eligibile costă cel puțin ~${minKnown.toFixed(2)} RON (doar prețurile cunoscute). Energia nu o tai ca să încapă`
          : `meniul de azi costă cel puțin ~${costKnown.toFixed(2)} RON, peste bugetul de ${lim} RON${chosen.length ? ' (din alegerea ta la „Schimbă”)' : ''}; cu rețete mai ieftine se poate de la cel puțin ~${minKnown.toFixed(2)} RON — vezi „Schimbă”`;
    }
    const inc = costComplete ? '' : `cost incomplet: lipsesc prețurile pentru ${missingP.join(', ')}; `;
    budgetNote =
      budgetStatus === 'peste'
        ? `${inc}${conflict}`
        : budgetStatus === 'ok'
          ? `în buget: ~${costKnown.toFixed(2)} RON din ${lim} RON (ingredientele consumate, prețuri din 19.10.2026)`
          : `${inc}partea cunoscută ~${costKnown.toFixed(2)} RON; nu pot spune că te încadrezi în ${lim} RON`;
  }
  if (!prefs.allergiesConfirmed) warnings.push('alergii neconfirmate: verifică ingredientele fiecărei mese');
  if (sel.repeats.length) warnings.push('cu preferințele de acum biblioteca e mică: unele mese se repetă mai des decât regula de varietate');

  // Suplimente (A80): food-first. Proteina praf doar dacă sportivul o acceptă și doar pentru diferența rămasă după mese;
  // fier / vitamina D doar cu o indicație reală, fără doze (le stabilește medicul).
  const supplements: NutritionDay['supplements'] = [];
  if (proteinT && prefs.proteinPowder === true && proteinT.target - protein > proteinT.target * 0.1) {
    const g = Math.ceil((proteinT.target - protein) / 5) * 5;
    supplements.push({ kind: 'proteina', proteinG: g, text: `opțional: ~${g} g de proteine din pudră, doar pentru diferența rămasă după mese (sunt grame de proteine, nu grame de produs: citește eticheta); nu se adaugă peste țintă` });
  }
  if (input.indications?.iron) supplements.push({ kind: 'fier', text: 'ai o indicație pentru fier (analize sau medic): la mese au prioritate alimentele bogate în fier; un supliment și doza lui le stabilește medicul' });
  if (input.indications?.vitaminD) supplements.push({ kind: 'vitamina_d', text: 'ai o indicație pentru vitamina D (analize sau medic): suplimentul și doza le stabilește medicul; din mâncare se acoperă greu' });

  // Macronutrienții zilei (A78): ținte cu interval și explicație; grame de carbohidrați pe mese nu avem în tabel.
  const carbFoodKcal = meals.reduce((n, m) => n + m.carbFoodKcal, 0);
  let macros: Macros | null = null;
  if (energy && proteinT) {
    const t = macroTargets(energy.target, a.weightKg!, proteinT.gPerKg, load, fuelG);
    const c = t.carbs;
    macros = {
      ...t,
      carbFoodShare: kcal ? carbFoodKcal / kcal : 0,
      explain: `azi e ${LOAD_WORD[load]}: carbohidrați ${c.gPerKg[0]}–${c.gPerKg[1]} g/kg (~${n0(c.g[0])}–${n0(c.g[1])} g${fuelG ? `, din care ~${fuelG} g în efort` : ''}; ${c.source})${c.capped ? ', limitați de energia zilei' : ''}; proteine ~${n0(t.protein.g)} g (${t.protein.gPerKg.toLocaleString('ro-RO')} g/kg); grăsimi ~${n0(t.fat.g[0])}–${n0(t.fat.g[1])} g (${t.fat.source}). Carbohidrații din mese nu sunt încă numărați în grame (tabelul are doar energie și proteine): mesele urmează ținta prin alegerea rețetelor și porții`,
    };
  }

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

  const check: DayCheck = {
    energy: energy ? { target: Math.round(energy.target), actual: Math.round(dayKcal), gap: Math.round(energy.target - dayKcal), inRange: dayKcal >= energy.low && dayKcal <= energy.high } : null,
    protein: proteinT ? { target: Math.round(proteinT.target), actual: Math.round(protein), gap: Math.round(proteinT.target - protein) } : null,
    allergens: meals.filter((m) => !eligible(m.recipe, prefs)).map((m) => `${m.recipe.id}: ${ineligibleReason(m.recipe, prefs)}`),
    budget: { limit: prefs.budget, costKnown, complete: costComplete, status: budgetStatus, minKnown, conflict },
    meals: { promised, main: baseMeals, extra: meals.length - baseMeals, slots },
  };

  return {
    date: input.date,
    personalized,
    missing,
    energy,
    protein: proteinT,
    macros,
    dayType,
    goalNote,
    fuel,
    fuelNotes,
    meals,
    totals: { kcal, dayKcal, protein, cost: costComplete ? costKnown : null, costKnown, costComplete },
    budgetNote,
    check,
    supplements,
    complete,
    mealsPromised: promised,
    message,
    warnings,
  };
}

export interface AltPreview {
  id: string;
  name: string;
  /** Masa schimbată, cu porțiile de după alegere. */
  kcal: number;
  protein: number;
  cost: number | null;
  /** Ziua întreagă după alegere (aceeași validare ca după „Schimbă”; A83). */
  day: { kcal: number; protein: number; gapKcal: number | null; gapProtein: number | null; budget: BudgetStatus | null; cost: number | null; costKnown: number; meals: number };
}

/**
 * Alternative pentru o masă: același tip, eligibile, fără repetare recentă. Fiecare e previzualizată prin aceeași
 * funcție ca ziua de după alegere (nutritionDay cu alegerea aplicată): valorile din listă = valorile de după „Schimbă”.
 * Ordinea: întâi cele care țin ziua în țintă și în buget, apoi costul cunoscut (prețul necunoscut nu e „ieftin”).
 */
export function alternatives(input: NutritionInput, slot: Slot, recent: string[] = [], max = 3): AltPreview[] {
  const day = nutritionDay(input);
  const cur = day.meals.find((m) => m.slot === slot && m.label === SLOT_LABEL[slot]) ?? day.meals.find((m) => m.slot === slot);
  if (!cur) return [];
  const others = day.meals.filter((m) => m !== cur).map((m) => m.recipe);
  const refCur = recipeValues(cur.recipe.id).kcal;
  const cands = RECIPES.filter((r) => r.kind === cur.recipe.kind && r.id !== cur.recipe.id && eligible(r, input.prefs) && !recent.includes(r.id) && !others.some((o) => o.id === r.id || (r.kind === 'M' && o.kind === 'M' && o.family === r.family)))
    .sort((x, y) => Math.abs(recipeValues(x.id).kcal - refCur) - Math.abs(recipeValues(y.id).kcal - refCur) || (x.id < y.id ? -1 : 1))
    .slice(0, 8);
  const out: AltPreview[] = [];
  for (const r of cands) {
    const choices = { ...(input.prefs.choices ?? {}), [input.date]: { ...(input.prefs.choices?.[input.date] ?? {}), [slot]: r.id } };
    const d = nutritionDay({ ...input, prefs: { ...input.prefs, choices } });
    const m = d.meals.find((x) => x.slot === slot && x.recipe.id === r.id);
    if (!m || d.check.allergens.length) continue;
    out.push({ id: r.id, name: r.name, kcal: m.kcal, protein: m.protein, cost: m.cost, day: { kcal: d.totals.dayKcal, protein: Math.round(d.totals.protein), gapKcal: d.check.energy?.gap ?? null, gapProtein: d.check.protein?.gap ?? null, budget: d.check.budget.status, cost: d.totals.cost, costKnown: d.totals.costKnown, meals: d.meals.length } });
  }
  const bRank = (s: BudgetStatus | null) => (s === 'peste' ? 1 : 0);
  return out
    .sort((x, y) => bRank(x.day.budget) - bRank(y.day.budget) || Math.abs(x.day.gapKcal ?? 0) - Math.abs(y.day.gapKcal ?? 0) || (x.cost == null ? 1 : 0) - (y.cost == null ? 1 : 0) || (x.cost ?? 0) - (y.cost ?? 0))
    .slice(0, max);
}

export const NUTRITION_DISCLAIMER = 'AIRON oferă sugestii de alimentație pentru antrenament. Nu este instrument medical. Valorile energetice și costurile sunt estimări.';
export { r1 };
