import { GOAL_NAME, sportReadiness } from '../bar/sport-readiness.js';
import { goalKind, goalSports } from '../calendar/phases.js';
import { hooperSum } from './readiness.js';
import { activeRestriction } from '../calendar/safety.js';
import { aerobicEfficiency, type EffTrend } from './efficiency.js';
import { mergeDetails } from './details.js';
// Construiește pachetul de date al agenților din datele normalizate. Deterministic, fără model.
// Regula de aur se aplică și aici: un câmp pe care nu-l putem calcula e null, nu estimat.

import { isActiveWorkout, type Activity, type PlannedWorkout, type Sport } from '../types.js';
import { scoreWorkout, zoneDirection } from '../scoring/score.js';
import { matchActivities } from '../scoring/match.js';
import { balanceCheck, type Balance } from '../calendar/balance.js';
import { raceReady, type RaceReady } from '../bar/race-ready.js';
import { extraOn, overYesterday, type DayCoverage } from '../calendar/load.js';
import { dayVerdict, objectiveReadiness, type ObjectiveReadiness, type Verdict } from './readiness.js';
import { addDays, diffDays, weekday } from '../util/dates.js';
import { BLOCK_LABEL, prescribe } from '../strength/ppl.js';
import { strengthSpecFor } from '../strength/plan-specs.js';
import { fitnessCardio, fitnessProfile, fitnessWeekAction, fitnessWeeks } from '../strength/fitness.js';
import type { CollectorInput, EveningForm, SourceActivity, SourceDaily, SportHours } from './types.js';

const SPORTS: Sport[] = ['inot', 'bicicleta', 'alergare', 'forta'];
const DAY_NAMES = ['luni', 'marti', 'miercuri', 'joi', 'vineri', 'sambata', 'duminica'];

/** Cum a ieșit o ședință față de cea propusă: durată, zonă, direcție, compensare, eficiență (0–100). */
export interface Execution {
  tip_planificat: string;
  durata_planificata: number;
  zone_tinta: number[];
  structura: string | null;
  durata_pct: number | null;
  in_zona_pct: number | null;
  directie: 'mai_tare' | 'mai_usor' | 'conform' | null;
  compensat: string | null;
  eficienta: number | null;
  culoare: string;
  motive: string[];
}

export interface Packet {
  meta: {
    data: string;
    zi_saptamana: string;
    eveniment: CollectorInput['event'];
    /** Momentul zilei la ora sportivului: dimineata (<11), zi (11–17), seara (17–22), noapte (≥22 sau <5). */
    moment_zi: 'dimineata' | 'zi' | 'seara' | 'noapte' | null;
    ora_locala: string | null;
    faza: string;
    obiectiv: string;
    /** Un singur sport (alergare / înot / bicicletă) sau triatlon; sporturile din plan. La un singur sport nu există ceilalți antrenori. */
    tip_obiectiv: 'tri' | 'run' | 'swim' | 'bike' | 'fitness' | null;
    /** Codul obiectivului (ex. „10k”, „inot-1900”), pentru biblioteca de antrenamente. */
    obiectiv_cod: string | null;
    sporturi: string[];
    /** La alergare cu timp-țintă. */
    tinta: CollectorInput['athlete']['tinta'] | null;
    /** Alergare: ramura planului („finalizare” sau „timp”). */
    ramura_alergare?: 'finalizare' | 'timp' | null;
    zile_pana_la_cursa: number;
    /** Duminica ultimei săptămâni din lună: mesajul săptămânal include bilanțul lunii. */
    bilant_lunar: boolean;
    surse: Record<string, string | null>;
    /**
     * Surse conectate pe care nu le vezi (Strava, din motive de licență). Dacă lista nu e goală, activitățile tale sunt
     * incomplete: NU dai totaluri de ore, km sau ședințe și nu tragi concluzii despre ce lipsește.
     */
    surse_nevazute: string[];
    /** Sexul și vârsta (din profil). null = necompletate. */
    sportiv: { sex: 'barbat' | 'femeie' | null; varsta: number | null; inaltime_cm: number | null };
    /** Când sunt 2+ brățări: valorile fiecăreia azi și dezacordurile mari. null = o singură sursă. */
    dispozitive: { azi: MergedDaily['perDevice']; dezacord: string[] } | null;
  };
  somn: { durata: string | null; durata_min: number | null; ora_culcare: string | null; scor: number | null; media7_durata: string | null; media7_durata_min: number | null };
  hrv: { azi: number | null; media7: number | null; baseline60: number | null; sd60: number | null; zile_sub_prag: number };
  puls_repaus: { azi: number | null; media7: number | null; baseline60: number | null };
  readiness: {
    /** Datele obiective (inimă, respirație, recuperare, somn) față de baseline-ul personal, 0–100 fiecare, mediate. */
    obiectiv: ObjectiveReadiness;
    /** Verdictul calculat de cod: datele obiective, apoi cum s-a simțit (Hooper doar coboară). */
    verdict_cod: { verdict: Verdict; motiv: string; /** fără date de la brățări și fără răspuns de la sportiv */ intrebare?: boolean };
    scor_producator: number | null;
    /** Cum s-a simțit (1–7, mai mare = mai rău). suma: și din răspunsuri parțiale (media × 4); raspunse: câte din 4. */
    hooper: { somn: number | null; oboseala: number | null; stres: number | null; dureri: number | null; suma: number | null; raspunse: number; istoric_14z: { data: string; suma: number | null; raspunse: number; boala: boolean | null }[]; media_14z: number | null };
  };
  incarcare: {
    acwr: number | null;
    acwr_sport: Record<Sport, number | null>;
    ctl: number | null;
    atl: number | null;
    tsb: number | null;
    ore_7z: SportHours;
    ore_28z_medie_saptamanala: SportHours;
    sedinte_7z: number;
  };
  antrenament_ultim: {
    sport: Sport;
    data: string;
    durata: number;
    distanta: number | null;
    fc_medie: number | null;
    fc_max: number | null;
    timp_zone: Record<string, number> | null;
    putere_medie: number | null;
    pace_mediu: number | null;
    cadenta: number | null;
    rpe: number | null;
    fata_de_asteptari: EveningForm['fata_de_asteptari'];
    durere: { scor: number | null; loc: string | null };
    ce_a_incurcat: EveningForm['ce_a_incurcat'];
    fueling_conform: EveningForm['fueling_conform'];
    comentariu: string | null;
    in_plan: boolean;
    tip_neplanificat: EveningForm['tip_neplanificat'];
    /** Execuția față de ședința propusă (calculată de cod din datele brățării). null = în afara planului. */
    fata_de_plan: Execution | null;
  } | null;
  /** Celelalte ședințe din ziua ultimei ședințe și din ziua dinainte: pulsul se judecă în contextul oboselii acumulate. */
  sedinte_48h: { sport: Sport; data: string; ora: string | null; durata: number; fc_medie: number | null; z4_z5_min: number | null; fata_de_plan: Execution | null }[];
  plan_azi: { sport: Sport; tip: string; durata_planificata: number; zone_tinta: number[]; structura: string | null; cheie: boolean } | null;
  /** Prima ședință de mâine: nutriționistul răspunde seara doar dacă urmează ceva în sub 24 h. */
  plan_maine: { sport: Sport; tip: string; durata_planificata: number; cheie: boolean } | null;
  /** Toate ședințele zilei (plan_azi / plan_maine sunt doar cea principală). */
  plan_azi_toate: { id: string; sport: Sport; tip: string; durata_planificata: number; cheie: boolean; structura?: string }[];
  plan_maine_toate: { id: string; sport: Sport; tip: string; durata_planificata: number; cheie: boolean; structura?: string }[];
  /** Ieșirea lungă de alergare din următoarele 7 zile față de cea mai lungă alergare reală din ultimele 30 de zile: peste +10% cere revizuire (asociere observațională, nu prag sigur). */
  alergare_lunga?: { data: string; planificat_min: number; cea_mai_lunga_30_zile_min: number | null; salt_pct: number | null; revizuire: boolean } | null;
  /** Forța: prescripția motorului pentru următoarea ședință și cât s-a făcut din ce era planificat (21 de zile). */
  /** Doar la fitness: săptămâna din programul de 26, etapa, ce face săptămâna, mișcarea recomandată și contextul declarat. */
  fitness?: {
    saptamana_program: number;
    etapa: string;
    actiunea_saptamanii: string;
    /** Varianta de patru zile: „ampla” (A–D) sau „standard”. */
    varianta: "standard" | "ampla" | null;
    miscare_recomandata: string;
    zile_alese: number | null;
    minute_sedinta: number | null;
    nivel: 'incepatoare' | 'stabila' | null;
    acces: 'sala' | 'acasa' | null;
    miscare_actuala: 'sedentara' | 'plimbari' | 'activa' | null;
    /** true doar dacă a spus „da” la sarcină / primul an după naștere: fără ramura standard de slăbire. */
    sarcina_postpartum: boolean;
  } | null;
  forta?: { urmatoarea: { data: string; sedinta: string; bloc: string; durata_min: number; exercitii: string[]; note: string[] } | null; expuneri_21_zile: { planificate: number; facute: number } } | null;
  plan_saptamana: { interval: string; zile: Record<string, string> };
  /** Ultimele 14 zile (fără azi): ședințe planificate vs făcute (activitate pe același sport, ±1 zi). null fără activități de la brățări în 28 de zile: nu putem ști dacă s-a sărit sau doar nu s-a sincronizat. */
  vreme: CollectorInput['weather'] | null;
  /** Creșterea controlată (+10% volum săptămâna viitoare): eligibil doar cu 7 zile verzi la rând, încărcare sub 1,3 (total și pe fiecare sport), aderență >= 80% și fără creștere în ultimele 13 zile. */
  progres: { zile_verzi_la_rand: number | null; ultima_crestere: string | null; eligibil: boolean; motiv: string };
  totaluri_de_la_start: CollectorInput['totals'] | null;
  /** Recuperarea (saună, baie rece, yoga, stretching, masaj) și mișcarea în plus din ultimele 7 zile, de pe brățări. */
  /**
   * Cât din fiecare probă a cursei a DEMONSTRAT sportivul în ultimele 6 săptămâni (cod, nu estimare).
   * Înotul = cea mai lungă porțiune fără oprire. Ședințele pornesc de aici, nu de la nivelul presupus.
   */
  pregatire_proba: { proba: string; procent: number | null; demonstrat: string[] }[];
  alte_activitati: { recuperare_7z_min: number; activ_extra_7z_min: number; lista: { data: string; ora: string | null; tip: 'recuperare' | 'activ'; nume: string; minute: number; fc_medie: number | null }[] };
  aderenta_14z: { planificate: number; facute: number; sarite: { data: string; sport: Sport; cheie: boolean }[] } | null;
  /** Pus de runner după ce Fiziologul a răspuns; antrenorii și nutriționistul îl citesc. */
  verdict_fiziolog: 'verde' | 'galben' | 'rosu' | 'stop' | null;
  zone: CollectorInput['zones'];
  corp: { greutate_azi: number | null; greutate_media7: number | null; /** Indicele de masă corporală din media greutății pe 7 zile și înălțime (calculat). */ imc: number | null; cantariri_7z: number; grasime_pct: number | null; data_masurare: string | null };
  nutritie_ieri: { kcal: number | null; carbohidrati_g: number | null; proteine_g: number | null; apa_l: number | null } | null;
  /** Ținta și mesele de azi, calculate în cod. Nutriționistul alege și explică doar din ele; nu inventează cifre. */
  nutritie_azi: {
    personalizat: boolean;
    lipseste: string[];
    tinta_kcal: [number, number] | null;
    proteine_g: number | null;
    tip_zi: string;
    obiectiv: string;
    mese: { masa: string; reteta_id: string; nume: string; kcal: number; proteine_g: number; de_ce: string | null }[];
    efort: { sedinta: string; carbohidrati_g: number; interval_g_ora: [number, number] }[];
    cost: string;
    avertizari: string[];
  } | null;
  semnale: { boala: boolean | null; febra: boolean | null; deplasare: boolean | null; simptom_cardiac: boolean | null };
  /** Restricția activă din cod (febră, simptom cardiac, boală, durere în ultimele 2 zile); null = niciuna. */
  restrictie_activa: { verdict: 'stop' | 'rosu' | 'galben'; motiv: string } | null;
  /** Eficiența aerobă la același puls (ședințe ușoare, plate): ultimele 3 săptămâni față de cele 6 dinainte. */
  eficienta_aeroba: EffTrend[];
  /**
   * Echivalarea zilei de azi (TRIMP Edwards: minute în zone × ponderea zonei; fără puls, din RPE), doar când azi a apărut
   * ceva în plus față de plan. stare = partial: head coach-ul alege UNA dintre `optiuni` (câmpul „optiune” = id-ul).
   */
  acoperire_azi: DayCoverage | null;
  /** Ieri: efort peste plan? Dimineața, la decizie contează atunci și durerile musculare (hooper.dureri). */
  efort_ieri: { peste_plan: boolean; trimp_facut: number; trimp_planificat: number };
  /**
   * Decizia zilei luată de aplicație din TOATE datele obiective (brățări, ceas, plan, formulare). E decizia: o spui cu
   * cuvintele ei, nu o schimbi. null = aplicația n-a putut decide (fără date).
   */
  decizia_aplicatiei?: { nivel: 'verde' | 'galben' | 'rosu' | 'stop'; titlu: string; ce_faci: string; motiv: string | null } | null;
  /**
   * Istoricul, pe până la 24 de luni: volum pe lună și sport, cele mai lungi ședințe, cele mai bune ritmuri, cursele,
   * pauzele de peste 2 săptămâni, consecvența. Forma de acum o dau ultimele 6 săptămâni; istoricul spune ce a mai
   * demonstrat corpul și cât de repede poate reveni.
   */
  istoric: import('../history/summary.js').HistorySummary | null;
  /**
   * Cum răspunde corpul LUI la recuperare: dimineața de după fiecare tip (saună, baie rece, meditație…), HRV și puls față
   * de media lui pe 7 zile, comparat cu diminețile fără recuperare. Asociere, nu cauză; doar cu ≥ 4 dimineți.
   */
  raspuns_recuperare: import('../recovery/recovery.js').RecoveryEffect[];
  /**
   * Pe drum (execuția planului pe 4 săptămâni) și Gata de cursă (cea mai slabă verigă: probele și cumulul), cu
   * ședințele-reper și timpul estimat (marjă ±10%, ipotezele scrise). Calculate de cod.
   */
  gata_de_cursa: RaceReady | null;
  /** Echilibrul pe ultimele 3 săptămâni: sporturi rămase în urmă, intensitate sărită. Din date, nu din impresie. */
  echilibru: Balance;
  analize: CollectorInput['labs'] | null;
  aviz: CollectorInput['aviz'];
}

// ---------- arbitraj între surse ----------

/** O zi, cu valorile din toate sursele combinate: somn, HRV și puls = media brățărilor (aduse la aceeași scală); scorurile producătorilor = cea mai bună sursă. */
export interface MergedDaily {
  date: string;
  hrv: number | null;
  rhr: number | null;
  sleepMin: number | null;
  bedtime: string | null;
  sleepScore: number | null;
  recoveryScore: number | null;
  /** Respirații pe minut în somn, media brățărilor. */
  respiratoryRate: number | null;
  weightKg: number | null;
  bodyFatPct: number | null;
  sources: Record<string, string | null>;
  /** Valorile brute ale fiecărei brățări, doar în zilele cu 2+ surse. */
  perDevice: Record<string, { hrv: number | null; puls_repaus: number | null; somn_min: number | null; recuperare: number | null }>;
  /** Dezacorduri mari între brățări în ziua respectivă. */
  disagreements: string[];
}

// Apple dă HRV ca SDNN (alt calcul decât rMSSD-ul Whoop/Oura/Garmin): ultima opțiune pentru HRV.
const PRIORITY: Record<string, number> = { whoop: 0, oura: 1, garmin: 2, athletedata: 3, android: 3.5, apple: 4, manual: 5, strava: 9 };

function mean(xs: number[]): number | null {
  if (xs.length === 0) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}
function sd(xs: number[]): number | null {
  const m = mean(xs);
  if (m == null || xs.length < 2) return null;
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length);
}
function round(x: number | null, d = 1): number | null {
  if (x == null) return null;
  const f = 10 ** d;
  return Math.round(x * f) / f;
}

/** Offsetul HRV Garmin → Whoop pe zilele în care există amândouă (medie a diferențelor). */
export function garminHrvOffset(rows: SourceDaily[]): number | null {
  return sourceOffsets(rows, 'hrv').get('garmin') ?? null;
}

type Metric = 'hrv' | 'rhr';
// Pentru HRV, Apple dă SDNN (alt calcul): nu intră în medie decât dacă e singura sursă.
const HRV_EXCLUDED = new Set(['apple', 'manual', 'strava']);
const RHR_EXCLUDED = new Set(['manual', 'strava']);
const HRV_EXCLUDED_FOR = (k: 'hrv' | 'rhr') => (k === 'hrv' ? HRV_EXCLUDED : RHR_EXCLUDED);
const MIN_OVERLAP = 7;

/** Sursa de referință = cea mai bună sursă care are date pe metrica respectivă. */
function referenceSource(rows: SourceDaily[], metric: Metric): string | null {
  const excluded = metric === 'hrv' ? HRV_EXCLUDED : RHR_EXCLUDED;
  const srcs = [...new Set(rows.filter((r) => r[metric] != null && !excluded.has(r.source)).map((r) => r.source))];
  srcs.sort((a, b) => (PRIORITY[a] ?? 5) - (PRIORITY[b] ?? 5));
  return srcs[0] ?? null;
}

/**
 * Fiecare brățară măsoară puțin altfel (ex. Garmin dă HRV sistematic mai mare decât Whoop).
 * Offsetul unei surse = media diferențelor față de referință pe zilele comune (minim 7 zile).
 */
export function sourceOffsets(rows: SourceDaily[], metric: Metric): Map<string, number> {
  const ref = referenceSource(rows, metric);
  const out = new Map<string, number>();
  if (!ref) return out;
  out.set(ref, 0);
  const refByDate = new Map(rows.filter((r) => r.source === ref && r[metric] != null).map((r) => [r.date, r[metric]!]));
  const diffs = new Map<string, number[]>();
  for (const r of rows) {
    if (r.source === ref || r[metric] == null) continue;
    const rv = refByDate.get(r.date);
    if (rv == null) continue;
    diffs.set(r.source, [...(diffs.get(r.source) ?? []), rv - r[metric]!]);
  }
  for (const [src, d] of diffs) if (d.length >= MIN_OVERLAP) out.set(src, mean(d)!);
  return out;
}

/**
 * Media între brățări pentru o metrică, pe o zi. Valorile sunt aduse la scala referinței (offset) înainte de medie,
 * ca să nu sară cifra în zilele în care o brățară lipsește. O sursă fără offset calibrat intră doar dacă referința lipsește.
 */
function averaged(list: SourceDaily[], metric: Metric, offsets: Map<string, number>): { v: number | null; src: string | null } {
  const excluded = metric === 'hrv' ? HRV_EXCLUDED : RHR_EXCLUDED;
  const withVal = list.filter((r) => r[metric] != null);
  const usable = withVal.filter((r) => !excluded.has(r.source));
  if (usable.length === 0) {
    // Doar Apple / manual: ultima variantă, nemediată.
    const r = [...withVal].sort((a, b) => (PRIORITY[a.source] ?? 5) - (PRIORITY[b.source] ?? 5))[0];
    return r ? { v: r[metric]!, src: r.source } : { v: null, src: null };
  }
  const calibrated = usable.filter((r) => offsets.has(r.source));
  const chosen = calibrated.length > 0 ? calibrated : [usable.sort((a, b) => (PRIORITY[a.source] ?? 5) - (PRIORITY[b.source] ?? 5))[0]!];
  const vals = chosen.map((r) => r[metric]! + (offsets.get(r.source) ?? 0));
  return { v: mean(vals), src: chosen.map((r) => r.source).join('+') };
}

/** Dezacord mare între brățări în aceeași zi (valori brute): îl vede fiziologul, nu îl ascunde media. */
function disagreements(list: SourceDaily[], offsets: { hrv: Map<string, number>; rhr: Map<string, number> }): string[] {
  const out: string[] = [];
  const spread = (xs: number[]) => (xs.length < 2 ? 0 : Math.max(...xs) - Math.min(...xs));
  const fmt = (k: 'hrv' | 'rhr' | 'sleepMin') => list.filter((r) => r[k] != null).map((r) => `${r.source} ${Math.round(r[k]!)}`).join(', ');
  const hrv = list.filter((r) => r.hrv != null && !HRV_EXCLUDED.has(r.source)).map((r) => r.hrv! + (offsets.hrv.get(r.source) ?? 0));
  const m = mean(hrv);
  if (m != null && hrv.length >= 2 && spread(hrv) / m > 0.2) out.push(`HRV diferă cu peste 20% între brățări (${fmt('hrv')})`);
  const rhr = list.filter((r) => r.rhr != null && !RHR_EXCLUDED.has(r.source)).map((r) => r.rhr! + (offsets.rhr.get(r.source) ?? 0));
  if (spread(rhr) > 5) out.push(`pulsul de repaus diferă cu peste 5 bpm (${fmt('rhr')})`);
  const sl = list.filter((r) => r.sleepMin != null).map((r) => r.sleepMin!);
  if (spread(sl) > 60) out.push(`somnul diferă cu peste o oră (${fmt('sleepMin')} min)`);
  return out;
}

export function mergeWellness(rows: SourceDaily[]): MergedDaily[] {
  // O singură valoare pe sursă și zi (dacă un furnizor a trimis aceeași zi de două ori, ultima câștigă).
  const unique = new Map<string, SourceDaily>();
  for (const r of rows) unique.set(`${r.date}|${r.source}`, { ...unique.get(`${r.date}|${r.source}`), ...Object.fromEntries(Object.entries(r).filter(([, v]) => v != null)) } as SourceDaily);
  const clean = [...unique.values()];
  // Auditul R05: HRV și pulsul de repaus nu se mediază între brățări (metode și scale diferite). Sursa principală pe
  // fiecare metrică e cea cu cele mai multe zile în fereastră, ca baseline-ul să rămână pe aceeași metodă; o zi fără
  // ea rămâne fără valoare (lipsă ≠ rău). Celelalte brățări rămân vizibile în perDevice / dezacord.
  const primary = (k: 'hrv' | 'rhr' | 'sleepMin' | 'respiratoryRate') => {
    const n = new Map<string, number>();
    for (const r of clean) if (r[k] != null && !((k === 'hrv' || k === 'rhr') && HRV_EXCLUDED_FOR(k).has(r.source))) n.set(r.source, (n.get(r.source) ?? 0) + 1);
    return [...n.entries()].sort((a, b) => b[1] - a[1] || (PRIORITY[a[0]] ?? 5) - (PRIORITY[b[0]] ?? 5))[0]?.[0] ?? null;
  };
  // Auditul v2 (V2-02): și somnul, și respirația vin dintr-o singură sursă pe zi (nu media între brățări); un device în
  // plus care repetă aceeași informație nu schimbă valoarea și nu-i dublează influența.
  const prim = { hrv: primary('hrv'), rhr: primary('rhr'), sleepMin: primary('sleepMin'), respiratoryRate: primary('respiratoryRate') };
  // Decalajele între brățări rămân doar pentru semnalarea dezacordului, nu pentru valoare.
  const offsets = { hrv: sourceOffsets(clean, 'hrv'), rhr: sourceOffsets(clean, 'rhr') };
  const byDate = new Map<string, SourceDaily[]>();
  for (const r of clean) byDate.set(r.date, [...(byDate.get(r.date) ?? []), r]);
  const out: MergedDaily[] = [];
  for (const [date, list] of byDate) {
    const sorted = [...list].sort((a, b) => (PRIORITY[a.source] ?? 5) - (PRIORITY[b.source] ?? 5));
    const pick = <K extends keyof SourceDaily>(k: K) => {
      for (const r of sorted) {
        const v = r[k] as number | null | undefined;
        if (v != null) return { v, src: r.source };
      }
      return { v: null, src: null };
    };
    const fromPrimary = (k: 'hrv' | 'rhr' | 'sleepMin' | 'respiratoryRate', fallback = false) => {
      const r = (prim[k] ? sorted.find((x) => x.source === prim[k] && x[k] != null) : undefined) ?? (fallback ? sorted.find((x) => x[k] != null) : undefined);
      return { v: r ? (r[k] as number) : null, src: r ? r.source : null };
    };
    const hrv = fromPrimary('hrv');
    const rhr = fromPrimary('rhr');
    // Somnul: o zi fără sursa principală ia următoarea sursă (somnul lipsă nu înseamnă somn zero), etichetată.
    const sleep = fromPrimary('sleepMin', true);
    const bedtime = sorted.find((r) => r.bedtime)?.bedtime ?? null;
    // Scorurile de somn/recuperare sunt scale proprii fiecărui producător: nu se mediază, se ia cea mai bună sursă.
    const sleepScore = pick('sleepScore');
    // Recuperarea / readiness-ul brățărilor sunt scoruri proprii (Whoop recovery ≠ Oura readiness): nu se mediază; se ia
    // sursa cu prioritate, etichetată.
    const recovery = pick('recoveryScore');
    const resp = fromPrimary('respiratoryRate');
    const weight = pick('weightKg');
    const fat = pick('bodyFatPct');
    const perDevice: MergedDaily['perDevice'] = {};
    if (sorted.length > 1)
      for (const r of sorted) perDevice[r.source] = { hrv: r.hrv ?? null, puls_repaus: r.rhr ?? null, somn_min: r.sleepMin ?? null, recuperare: r.recoveryScore ?? null };
    out.push({
      date,
      hrv: round(hrv.v, 1),
      rhr: rhr.v == null ? null : Math.round(rhr.v),
      sleepMin: sleep.v == null ? null : Math.round(sleep.v),
      bedtime,
      sleepScore: sleepScore.v,
      recoveryScore: recovery.v,
      respiratoryRate: round(resp.v, 1),
      weightKg: weight.v,
      bodyFatPct: fat.v,
      sources: { hrv: hrv.src, puls_repaus: rhr.src, somn: sleep.src, recuperare: recovery.src, respiratie: resp.src },
      perDevice,
      disagreements: sorted.length > 1 ? disagreements(sorted, offsets) : [],
    });
  }
  // Cea mai nouă zi prima.
  return out.sort((a, b) => diffDays(a.date, b.date));
}

const hmMin = (s: string | null | undefined) => (s && /^\d{2}:\d{2}/.test(s) ? Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5)) : null);

/**
 * Aceeași ședință venită de pe două brățări: aceeași zi, același sport, surse DIFERITE și, cu ore de start, ore care
 * se suprapun (cel puțin 60% din cea scurtă). Fără ore de start: doar dacă și durata (±3 min) și distanța (±0,3 km,
 * ambele măsurate) coincid. Cazurile neclare rămân două ședințe (nu ștergem una reală).
 */
export function sameSession(a: SourceActivity, b: SourceActivity): boolean {
  if (a.date !== b.date || a.sport !== b.sport) return false;
  if (a.source && b.source && a.source === b.source) return false;
  const sa = hmMin(a.startLocal);
  const sb = hmMin(b.startLocal);
  if (sa != null && sb != null) {
    // Intervalul ședinței = de la start la stop (cu pauze), nu timpul în mișcare: altfel un înot de 50 de minute cu
    // 5 minute de lungimi înotate nu s-ar suprapune cu aceeași ședință văzută de altă brățară.
    const da = a.details?.elapsedMin ?? a.minutes;
    const db = b.details?.elapsedMin ?? b.minutes;
    const overlap = Math.min(sa + da, sb + db) - Math.max(sa, sb);
    return overlap >= 0.6 * Math.max(1, Math.min(da, db));
  }
  return Math.abs(a.minutes - b.minutes) <= 3 && a.distanceKm != null && b.distanceKm != null && Math.abs(a.distanceKm - b.distanceKm) < 0.3;
}

/** Viteza minimă (km/h) a minutelor în plus ca să fie efort, nu mers pe jos sau ceas uitat pornit. */
const EXTRA_EFFORT_KMH: Record<string, number> = { alergare: 6.7, bicicleta: 12, inot: 1 };

/**
 * Care din două înregistrări ale aceleiași ședințe e cea corectă.
 * Regula: cea mai scurtă (o brățară uitată pornită după oprire lungește ședința fără efort real),
 * CU EXCEPȚIA cazului în care minutele în plus ale celei lungi au distanță reală în plus: cel puțin 0,5 km (și peste
 * 3% din distanța celei scurte, ca diferența de GPS dintre ceasuri să nu conteze), la o viteză de efort
 * (alergare peste 6,7 km/h, adică sub 9 min/km; bicicletă peste 12 km/h). Atunci cea scurtă e o brățară oprită prea
 * devreme. Fără distanțe, pulsul bucății în plus contează doar dacă bucata e mare (vezi mai jos).
 */
export function pickRecording(a: SourceActivity, b: SourceActivity): SourceActivity {
  const fields = (x: SourceActivity) => Object.values(x).filter((v) => v != null).length;
  const [S, L] = a.minutes <= b.minutes ? [a, b] : [b, a];
  const extraMin = L.minutes - S.minutes;
  if (extraMin < 2) return fields(a) >= fields(b) ? a : b;
  const sKm = S.distanceKm ?? null;
  const lKm = L.distanceKm ?? null;
  if (lKm != null && lKm > 0 && (sKm == null || sKm === 0)) return L; // cea scurtă n-a măsurat distanța deloc
  if (sKm != null && lKm != null) {
    const extraKm = lKm - sKm;
    const kmh = (extraKm / extraMin) * 60;
    const minKm = S.sport === 'inot' ? 0.1 : Math.max(0.5, sKm * 0.03);
    if (extraKm >= minKm && kmh >= (EXTRA_EFFORT_KMH[S.sport] ?? Infinity)) return L;
    return S;
  }
  // Fără distanță pe ambele: pulsul bucății în plus se poate deduce doar când ea e mare (≥ 10 min și ≥ 25% din cea
  // scurtă). Sub atât, o diferență de câțiva bpm între senzoare s-ar amplifica într-un „efort” fictiv.
  if (S.avgHr != null && L.avgHr != null && extraMin >= 10 && extraMin >= 0.25 * S.minutes) {
    const extraHr = (L.avgHr * L.minutes - S.avgHr * S.minutes) / extraMin;
    if (extraHr >= 0.85 * S.avgHr) return L;
  }
  return S;
}

/** Păstrează o singură înregistrare pe ședință (vezi pickRecording) și completează detaliile din cealaltă. */
export function dedupeActivities(acts: SourceActivity[]): SourceActivity[] {
  const kept: SourceActivity[] = [];
  const sorted = [...acts].sort((a, b) => diffDays(b.date, a.date));
  for (const a of sorted) {
    const dup = kept.find((k) => sameSession(k, a));
    if (!dup) {
      kept.push(a);
      continue;
    }
    const chosen = pickRecording(dup, a);
    const other = chosen === dup ? a : dup;
    kept[kept.indexOf(dup)] = { ...chosen, details: mergeDetails(chosen.details, other.details), mergedSources: [...new Set([...(dup.mergedSources ?? [dup.source]), a.source])] };
  }
  return kept;
}

// ---------- calcule ----------

function minutesToHm(min: number | null): string | null {
  if (min == null) return null;
  const t = Math.round(min);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

function hoursBySport(acts: SourceActivity[], from: string, to: string): SportHours {
  const h: SportHours = { inot: 0, bicicleta: 0, alergare: 0, forta: 0 };
  for (const a of acts) {
    if (diffDays(from, a.date) < 0 || diffDays(a.date, to) < 0) continue;
    h[a.sport] += a.minutes / 60;
  }
  for (const s of SPORTS) h[s] = Math.round(h[s] * 10) / 10;
  return h;
}

/** ACWR pe minute: ultimele 7 zile împărțite la media săptămânală a ultimelor 28 de zile. null sub 4 săptămâni de istoric. */
export function acwr(acts: SourceActivity[], today: string, sport?: Sport): number | null {
  const sel = sport ? acts.filter((a) => a.sport === sport) : acts;
  const firstDate = sel.reduce<string | null>((m, a) => (m == null || diffDays(a.date, m) > 0 ? a.date : m), null);
  if (firstDate == null || diffDays(firstDate, today) < 28) return null;
  const sum = (from: string, to: string) => sel.filter((a) => diffDays(from, a.date) >= 0 && diffDays(a.date, to) >= 0).reduce((acc, a) => acc + a.minutes, 0);
  const yesterday = addDays(today, -1);
  const acute = sum(addDays(today, -7), yesterday);
  const chronic = sum(addDays(today, -28), yesterday) / 4;
  if (chronic < 30) return null; // sub 30 min pe săptămână în medie raportul nu înseamnă nimic
  return Math.round((acute / chronic) * 100) / 100;
}

function planLabel(w: PlannedWorkout): string {
  const sport = { inot: 'înot', bicicleta: 'bicicletă', alergare: 'alergare', forta: 'forță' }[w.sport];
  const tip = w.type === 'forta' ? '' : ` ${w.type === 'z2' ? 'Z2' : w.type}`;
  return `${sport}${tip} ${w.plannedMinutes}${w.key ? ' (cheie)' : ''}`;
}

const brief = (w: PlannedWorkout) => ({ id: w.id, sport: w.sport, tip: w.type === 'z2' ? 'Z2' : w.type, durata_planificata: w.plannedMinutes, cheie: w.key, ...(w.structure ? { structura: w.structure } : {}) });

/** Saltul ieșirii lungi: planificat față de maximul real din ultimele 30 de zile (fără istoric: necunoscut, nu procent din zero). */
function longRunJump(input: CollectorInput, acts: SourceActivity[]): Packet['alergare_lunga'] {
  const { today } = input;
  const next = input.plan.filter((w) => w.sport === 'alergare' && w.type === 'lung' && isActiveWorkout(w) && w.date >= today && w.date <= addDays(today, 7)).sort((a, b) => (a.date < b.date ? -1 : 1))[0];
  if (!next) return null;
  const recent = acts.filter((a) => a.sport === 'alergare' && a.date >= addDays(today, -30) && a.date < today).map((a) => a.minutes);
  const max = recent.length ? Math.max(...recent) : null;
  const jump = max ? Math.round(((next.plannedMinutes - max) / max) * 100) : null;
  return { data: next.date, planificat_min: next.plannedMinutes, cea_mai_lunga_30_zile_min: max, salt_pct: jump, revizuire: max == null || (jump ?? 0) > 10 };
}

/** Ședința de forță următoare (azi sau mai târziu), cu prescripția motorului și expunerile din ultimele 21 de zile. */
function strengthBrief(input: CollectorInput, acts: SourceActivity[]): Packet['forta'] {
  const { today } = input;
  const next = input.plan.filter((w) => w.type === 'forta' && isActiveWorkout(w) && w.date >= today).sort((a, b) => (a.date < b.date ? -1 : 1))[0];
  // Planurile dinaintea programului AIRON („Push 1 · …”): prescripția se recalculează cu aceeași regulă ca generatorul.
  const first = input.plan.reduce<string | null>((m, w) => (m == null || w.date < m ? w.date : m), null);
  const spec = next ? strengthSpecFor(input.plan, next, first ? addDays(first, -weekday(first)) : null, input.athlete.raceDate ?? null) : null;
  const since = addDays(today, -21);
  const planned = input.plan.filter((w) => w.type === 'forta' && w.date >= since && w.date < today && w.status !== 'sters').length;
  const done = acts.filter((a) => a.sport === 'forta' && a.date >= since && a.date < today).length;
  if (!next || !spec) return planned ? { urmatoarea: null, expuneri_21_zile: { planificate: planned, facute: done } } : null;
  const rx = prescribe(spec, next.plannedMinutes);
  return {
    urmatoarea: {
      data: next.date,
      sedinta: rx.session.name,
      bloc: `${BLOCK_LABEL[spec.block]}, săpt. ${spec.week} din ${spec.len}`,
      durata_min: next.plannedMinutes,
      exercitii: rx.items.map((r) => `${r.ex.name}: ${r.sets} × ${r.reps}, ${r.rir} RIR, pauză ${r.rest} s${r.completion ? ' (completare)' : ''}`),
      note: rx.notes,
    },
    expuneri_21_zile: { planificate: planned, facute: done },
  };
}

/** Fitness: unde e sportiva în programul de 26 de săptămâni (din prima zi a planului) și ce cere săptămâna. */
function fitnessBrief(input: CollectorInput): Packet['fitness'] {
  if (goalKind(input.athlete.goal ?? null) !== 'fitness') return null;
  const f = input.athlete.fitness ?? {};
  const first = input.plan.reduce<string | null>((m, w) => (m == null || w.date < m ? w.date : m), null);
  const start = first ? addDays(first, -weekday(first)) : addDays(input.today, -weekday(input.today));
  const week = Math.max(1, Math.min(26, Math.floor(diffDays(start, input.today) / 7) + 1));
  const fw = fitnessWeeks(fitnessProfile(input.athlete.goal ?? 'fit-tonifiere', f))[week - 1];
  return {
    saptamana_program: week,
    etapa: fw ? `${BLOCK_LABEL[fw.block]}, săpt. ${fw.blockWeek} din ${fw.blockLen}` : '',
    actiunea_saptamanii: fitnessWeekAction(week, fw?.variant),
    varianta: fw?.variant ?? null,
    miscare_recomandata: fitnessCardio(week, f.miscare ?? null),
    zile_alese: f.zile ?? null,
    minute_sedinta: f.minute ?? null,
    nivel: f.experienta ?? null,
    acces: f.acces ?? null,
    miscare_actuala: f.miscare ?? null,
    sarcina_postpartum: f.sarcina === 'da',
  };
}

export function buildPacket(input: CollectorInput): Packet {
  const { today } = input;
  const merged = mergeWellness(input.wellness);
  const todayRow = merged.find((r) => r.date === today) ?? null;
  const last = (n: number, from = 1) => merged.filter((r) => diffDays(r.date, today) >= from && diffDays(r.date, today) <= from + n - 1);
  const prev7 = last(7);
  const prev60 = last(60);

  const hrv7 = prev7.map((r) => r.hrv).filter((x): x is number => x != null);
  const hrv60 = prev60.map((r) => r.hrv).filter((x): x is number => x != null);
  const rhr7 = prev7.map((r) => r.rhr).filter((x): x is number => x != null);
  const rhr60 = prev60.map((r) => r.rhr).filter((x): x is number => x != null);
  const sleep7 = prev7.map((r) => r.sleepMin).filter((x): x is number => x != null);
  const resp60 = prev60.map((r) => r.respiratoryRate).filter((x): x is number => x != null);
  const baseline60 = hrv60.length >= 14 ? round(mean(hrv60), 1) : null;
  const sd60 = hrv60.length >= 14 ? round(sd(hrv60), 2) : null;

  // Zile consecutive (azi inclusiv) cu HRV sub baseline − sd.
  let zileSubPrag = 0;
  if (baseline60 != null && sd60 != null) {
    const prag = baseline60 - sd60;
    for (const r of [todayRow, ...prev7].filter((x): x is MergedDaily => x != null)) {
      if (r.hrv != null && r.hrv < prag) zileSubPrag += 1;
      else break;
    }
  }

  const acts = dedupeActivities(input.activities).filter((a) => diffDays(a.date, today) >= 0);
  const yesterday = addDays(today, -1);
  const rpeOf = (a: { id: string; externalId: string }) => input.evenings.find((e) => e.activityId === a.id || e.activityId === a.externalId)?.rpe ?? null;
  const notOther = (a: { id: string; externalId: string }) => input.evenings.find((e) => e.activityId === a.id || e.activityId === a.externalId)?.tip_neplanificat !== 'altceva';
  const withRpe = acts.filter(notOther).map((a) => ({ ...a, rpe: rpeOf(a) }));
  const balance = balanceCheck(today, input.plan, acts, input.athlete.goal ? GOAL_NAME[input.athlete.goal] : input.athlete.obiectiv);
  const ieri = overYesterday(today, input.plan, withRpe);
  const aziCover = extraOn(today, input.plan, withRpe, balance.in_urma);
  const ore7 = hoursBySport(acts, addDays(today, -7), yesterday);
  const ore28 = hoursBySport(acts, addDays(today, -28), yesterday);
  for (const s of SPORTS) ore28[s] = Math.round((ore28[s] / 4) * 10) / 10;
  const sedinte7 = acts.filter((a) => diffDays(addDays(today, -7), a.date) >= 0 && diffDays(a.date, yesterday) >= 0).length;

  // Dimineața, ultima ședință e cea de dinainte de azi; după antrenament, cea de azi.
  const lastAct =
    [...acts]
      .filter((a) => (input.event === 'dimineata' ? diffDays(a.date, today) >= 1 : true))
      .sort((a, b) => diffDays(a.date, b.date) || (b.startLocal ?? '').localeCompare(a.startLocal ?? ''))[0] ?? null;
  const evening = lastAct ? (input.evenings.find((e) => e.activityId === lastAct.externalId) ?? input.evenings.find((e) => e.date === lastAct.date) ?? null) : null;
  const inPlan = lastAct ? input.plan.some((w) => w.sport === lastAct.sport && Math.abs(diffDays(w.date, lastAct.date)) <= 1 && w.status !== 'sters') : false;

  // Ședința propusă de care se leagă o activitate (același sport, ±1 zi, cea mai apropiată).
  const plannedFor = (a: SourceActivity): PlannedWorkout | null =>
    input.plan
      .filter((w) => w.sport === a.sport && Math.abs(diffDays(w.date, a.date)) <= 1 && w.status !== 'sters' && w.status !== 'anulat_sistem')
      .sort((x, y) => Math.abs(diffDays(x.date, a.date)) - Math.abs(diffDays(y.date, a.date)))[0] ?? null;
  const execution = (a: SourceActivity, ev: EveningForm | null): Execution | null => {
    const w = plannedFor(a);
    if (!w) return null;
    const sameDay = acts
      .filter((o) => o !== a && o.date === a.date)
      .map((o) => {
        const ow = plannedFor(o);
        return { sport: o.sport, directie: ow ? zoneDirection(ow, o as unknown as Activity) : null };
      });
    const r = scoreWorkout({ planned: w, activity: a as unknown as Activity, questionnaire: ev ? { rpe: ev.rpe, painScore: ev.durere.scor } : null, today, sameDay });
    return {
      tip_planificat: w.type,
      durata_planificata: w.plannedMinutes,
      zone_tinta: w.targetZones,
      structura: w.structure ?? null,
      durata_pct: r.metrics.durationPct,
      in_zona_pct: r.metrics.zonePct,
      directie: r.metrics.directie ?? null,
      compensat: r.metrics.compensat ?? null,
      eficienta: r.metrics.eficienta ?? null,
      culoare: r.color,
      motive: r.reasons,
    };
  };

  const rhrBase = rhr60.length >= 14 ? round(mean(rhr60), 1) : null;
  const objective = objectiveReadiness({
    hrv: todayRow?.hrv ?? null,
    hrvBaseline: baseline60,
    rhr: todayRow?.rhr ?? null,
    rhrBaseline: rhrBase,
    resp: todayRow?.respiratoryRate ?? null,
    respBaseline: resp60.length >= 14 ? round(mean(resp60), 1) : null,
    recovery: todayRow?.recoveryScore ?? null,
    sleepMin: todayRow?.sleepMin ?? null,
  });
  const h = input.morning?.hooper;
  const hooper = hooperSum(h);

  const todayList = input.plan.filter((w) => w.date === today && isActiveWorkout(w)).sort((a, b) => Number(b.key) - Number(a.key));
  const planToday = todayList[0] ?? null;
  const tomorrow = addDays(today, 1);
  const tomorrowList = input.plan.filter((w) => w.date === tomorrow && isActiveWorkout(w)).sort((a, b) => Number(b.key) - Number(a.key));
  const planTomorrow = tomorrowList[0] ?? null;
  const monday = addDays(today, -weekday(today));
  const zile: Record<string, string> = {};
  for (let i = 0; i < 7; i++) {
    const d = addDays(monday, i);
    const ws = input.plan.filter((w) => w.date === d && w.status !== 'sters');
    zile[DAY_NAMES[i]!] = ws.length ? ws.map((w) => `${planLabel(w)}${w.status === 'planificat' ? '' : w.status === 'mutat' ? ' [mutat aici]' : ` [${w.status}]`}`).join(' + ') : 'odihnă';
  }

  const gataDeCursa = input.athlete.goal
    ? raceReady({ goal: input.athlete.goal, today, acts, plan: input.plan, targetSec: input.athlete.targetSec ?? null, raceDate: input.athlete.raceDate, fueledDates: input.evenings.filter((e) => e.fueling_conform === 'da').map((e) => acts.find((a) => (a.id === e.activityId || a.externalId === e.activityId) && a.minutes >= 120)?.date).filter((x): x is string => !!x) })
    : null;
  const tinta = gataDeCursa?.target
    ? { timp_tinta_s: gataDeCursa.target.targetSec, ritm_tinta_s_km: Math.round(gataDeCursa.target.verdict.paceSecKm), verdict: gataDeCursa.target.verdict.verdict, motive: gataDeCursa.target.verdict.reasons, timp_estimat_s: gataDeCursa.target.predictedSec, cel_mai_bun_efort: gataDeCursa.target.best ? `${gataDeCursa.target.best.label}, ${gataDeCursa.target.best.date}` : null }
    : (input.athlete.tinta ?? null);
  const acwrTotal = acwr(acts, today);
  const acwrBySport: Record<Sport, number | null> = { inot: acwr(acts, today, 'inot'), bicicleta: acwr(acts, today, 'bicicleta'), alergare: acwr(acts, today, 'alergare'), forta: acwr(acts, today, 'forta') };
  const recentActs = acts.filter((a) => diffDays(a.date, today) >= 0 && diffDays(a.date, today) <= 28);
  const pastPlanned = input.plan.filter((w) => isActiveWorkout(w) && diffDays(w.date, today) >= 1 && diffDays(w.date, today) <= 14);
  // Aceeași asociere ca la scor: o activitate acoperă o singură ședință, întâi cea din ziua ei.
  const matchedIds = new Set(matchActivities(pastPlanned, acts, today).matches.filter((m) => m.activity).map((m) => m.planned.id));
  const doneW = pastPlanned.filter((w) => matchedIds.has(w.id));
  const aderenta = recentActs.length
    ? { planificate: pastPlanned.length, facute: doneW.length, sarite: pastPlanned.filter((w) => !doneW.includes(w)).map((w) => ({ data: w.date, sport: w.sport, cheie: w.key })) }
    : null;

  const weights = merged.filter((r) => r.weightKg != null && diffDays(r.date, today) >= 0 && diffDays(r.date, today) <= 6);
  const lastWeight = merged.find((r) => r.weightKg != null) ?? null;
  const nutYesterday = input.nutrition?.find((n) => n.date === yesterday) ?? null;

  return {
    meta: {
      data: today,
      zi_saptamana: DAY_NAMES[weekday(today)]!,
      eveniment: input.event,
      moment_zi: momentOfDay(input.nowLocal ?? null),
      ora_locala: input.nowLocal ?? null,
      sportiv: { sex: input.athlete.sex === 'm' ? 'barbat' : input.athlete.sex === 'f' ? 'femeie' : null, varsta: input.athlete.varsta ?? null, inaltime_cm: input.athlete.inaltimeCm ?? null },
      faza: input.athlete.phase,
      obiectiv: input.athlete.obiectiv,
      tip_obiectiv: goalKind(input.athlete.goal ?? null),
      obiectiv_cod: input.athlete.goal ?? null,
      sporturi: goalSports(input.athlete.goal ?? null),
      tinta,
      ramura_alergare: input.athlete.ramura ?? null,
      zile_pana_la_cursa: diffDays(today, input.athlete.raceDate),
      bilant_lunar: input.event === 'saptamanal' && addDays(today, 7).slice(0, 7) !== today.slice(0, 7),
      surse_nevazute: input.hiddenSources ?? [],
      surse: { ...(todayRow?.sources ?? { hrv: null, puls_repaus: null, somn: null, recuperare: null }), activitati: [...new Set(acts.map((a) => a.source))].join('+') || null, incarcare: input.load?.source ?? null },
      dispozitive: todayRow && Object.keys(todayRow.perDevice).length > 1 ? { azi: todayRow.perDevice, dezacord: todayRow.disagreements } : null,
    },
    somn: {
      durata: minutesToHm(todayRow?.sleepMin ?? null),
      durata_min: todayRow?.sleepMin ?? null,
      ora_culcare: todayRow?.bedtime ?? null,
      scor: todayRow?.sleepScore ?? null,
      media7_durata: minutesToHm(sleep7.length ? Math.round(mean(sleep7)!) : null),
      media7_durata_min: sleep7.length ? Math.round(mean(sleep7)!) : null,
    },
    hrv: { azi: todayRow?.hrv ?? null, media7: round(mean(hrv7), 1), baseline60, sd60, zile_sub_prag: zileSubPrag },
    puls_repaus: { azi: todayRow?.rhr ?? null, media7: round(mean(rhr7), 0), baseline60: rhr60.length >= 14 ? round(mean(rhr60), 1) : null },
    readiness: {
      obiectiv: objective,
      verdict_cod: dayVerdict(objective, hooper.suma, { apt: input.morning?.apt ?? null, efortIeri: ieri.over, dureri: input.morning?.hooper.dureri ?? null }),
      scor_producator: todayRow?.recoveryScore ?? null,
      hooper: {
        somn: input.morning?.hooper.somn ?? null,
        oboseala: input.morning?.hooper.oboseala ?? null,
        stres: input.morning?.hooper.stres ?? null,
        dureri: input.morning?.hooper.dureri ?? null,
        suma: hooper.suma,
        raspunse: hooper.raspunse,
        istoric_14z: (input.morningHistory ?? [])
          .filter((m) => m.date < today && diffDays(m.date, today) <= 14)
          .map((m) => ({ data: m.date, suma: hooperSum(m.hooper).suma, raspunse: hooperSum(m.hooper).raspunse, boala: m.semnale?.boala ?? null }))
          .filter((x) => x.suma != null)
          .sort((a, b) => (a.data < b.data ? -1 : 1)),
        media_14z: (() => {
          const xs = (input.morningHistory ?? []).filter((m) => m.date < today && diffDays(m.date, today) <= 14).map((m) => hooperSum(m.hooper).suma).filter((x): x is number => x != null);
          return xs.length >= 3 ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null;
        })(),
      },
    },
    incarcare: {
      acwr: acwrTotal,
      acwr_sport: acwrBySport,
      ctl: input.load?.ctl ?? null,
      atl: input.load?.atl ?? null,
      tsb: input.load?.tsb ?? null,
      ore_7z: ore7,
      ore_28z_medie_saptamanala: ore28,
      sedinte_7z: sedinte7,
    },
    antrenament_ultim: lastAct
      ? {
          sport: lastAct.sport,
          data: lastAct.date,
          durata: lastAct.minutes,
          distanta: lastAct.distanceKm ?? null,
          fc_medie: lastAct.avgHr ?? null,
          fc_max: lastAct.maxHr ?? null,
          timp_zone: lastAct.timeInZonesMin ? Object.fromEntries(Object.entries(lastAct.timeInZonesMin).map(([z, m]) => [`Z${z}`, m as number])) : null,
          putere_medie: lastAct.avgWatts ?? null,
          pace_mediu: lastAct.avgPaceMinKm ?? null,
          cadenta: lastAct.avgCadence ?? null,
          rpe: evening?.rpe ?? null,
          fata_de_asteptari: evening?.fata_de_asteptari ?? null,
          durere: { scor: evening?.durere.scor ?? null, loc: evening?.durere.loc ?? null },
          ce_a_incurcat: evening?.ce_a_incurcat ?? null,
          fueling_conform: evening?.fueling_conform ?? null,
          comentariu: evening?.comentariu ?? null,
          in_plan: inPlan,
          tip_neplanificat: inPlan ? null : (evening?.tip_neplanificat ?? null),
          fata_de_plan: execution(lastAct, evening),
        }
      : null,
    sedinte_48h: lastAct
      ? acts
          .filter((a) => a !== lastAct && diffDays(a.date, lastAct.date) >= 0 && diffDays(a.date, lastAct.date) <= 1)
          .sort((a, b) => diffDays(a.date, b.date) || (b.startLocal ?? '').localeCompare(a.startLocal ?? ''))
          .map((a) => ({
            sport: a.sport,
            data: a.date,
            ora: a.startLocal ?? null,
            durata: a.minutes,
            fc_medie: a.avgHr ?? null,
            z4_z5_min: a.timeInZonesMin ? (a.timeInZonesMin[4] ?? 0) + (a.timeInZonesMin[5] ?? 0) : null,
            fata_de_plan: execution(a, input.evenings.find((e) => e.activityId === a.externalId) ?? null),
          }))
      : [],
    plan_azi: planToday
      ? { sport: planToday.sport, tip: planToday.type === 'z2' ? 'Z2' : planToday.type, durata_planificata: planToday.plannedMinutes, zone_tinta: planToday.targetZones, structura: planToday.structure ?? null, cheie: planToday.key }
      : null,
    plan_azi_toate: todayList.map(brief),
    forta: strengthBrief(input, acts),
    fitness: fitnessBrief(input),
    alergare_lunga: longRunJump(input, acts),
    plan_maine_toate: tomorrowList.map(brief),
    plan_maine: planTomorrow ? { sport: planTomorrow.sport, tip: planTomorrow.type === 'z2' ? 'Z2' : planTomorrow.type, durata_planificata: planTomorrow.plannedMinutes, cheie: planTomorrow.key } : null,
    plan_saptamana: { interval: `${monday} – ${addDays(monday, 6)}${input.athlete.weekLabel ? `, ${input.athlete.weekLabel}` : ''}`, zile },
    vreme: input.weather ?? null,
    progres: progresStatus(input, acwrTotal, acwrBySport, aderenta),
    pregatire_proba: input.athlete.goal ? sportReadiness(input.athlete.goal, dedupeActivities(input.activities), today, { swimContinuousM: input.athlete.declaredSwimM ?? null }).map((r) => ({ proba: r.leg, procent: r.value, demonstrat: r.parts.map((p) => `${p.label}: ${p.have} din ${p.target}`) })) : [],
    alte_activitati: (() => {
      const recent = (input.others ?? []).filter((o) => diffDays(o.date, today) >= 0 && diffDays(o.date, today) <= 7);
      return {
        recuperare_7z_min: recent.filter((o) => o.kind === 'recuperare').reduce((n, o) => n + o.minutes, 0),
        activ_extra_7z_min: recent.filter((o) => o.kind === 'activ').reduce((n, o) => n + o.minutes, 0),
        lista: recent
          .sort((a, b) => diffDays(a.date, b.date) || (b.startLocal ?? '').localeCompare(a.startLocal ?? ''))
          .map((o) => ({ data: o.date, ora: o.startLocal, tip: o.kind, nume: o.name, minute: o.minutes, fc_medie: o.avgHr })),
      };
    })(),
    totaluri_de_la_start: input.totals ?? null,
    aderenta_14z: aderenta,
    verdict_fiziolog: null,
    zone: input.zones,
    corp: {
      greutate_azi: todayRow?.weightKg ?? null,
      greutate_media7: weights.length ? round(mean(weights.map((r) => r.weightKg!)), 1) : null,
      imc: (() => {
        const h = input.athlete.inaltimeCm;
        const w = weights.length ? mean(weights.map((r) => r.weightKg!)) : (lastWeight?.weightKg ?? null);
        return h && w ? round(w / (h / 100) ** 2, 1) : null;
      })(),
      cantariri_7z: weights.length,
      grasime_pct: lastWeight?.bodyFatPct ?? null,
      data_masurare: lastWeight?.date ?? null,
    },
    nutritie_azi: input.mealsToday
      ? {
          personalizat: input.mealsToday.personalized,
          lipseste: input.mealsToday.missing,
          tinta_kcal: input.mealsToday.energy ? [Math.round(input.mealsToday.energy.low), Math.round(input.mealsToday.energy.high)] : null,
          proteine_g: input.mealsToday.protein ? Math.round(input.mealsToday.protein.target) : null,
          tip_zi: input.mealsToday.dayType,
          obiectiv: input.mealsToday.goalNote,
          mese: input.mealsToday.meals.map((m) => ({ masa: m.label, reteta_id: m.recipe.id, nume: m.recipe.name, kcal: Math.round(m.kcal), proteine_g: Math.round(m.protein), de_ce: m.why })),
          efort: input.mealsToday.fuel.map((f) => ({ sedinta: f.sessionLabel, carbohidrati_g: f.plannedG, interval_g_ora: f.carbsPerHour })),
          cost: input.mealsToday.totals.costComplete ? `~${input.mealsToday.totals.costKnown.toFixed(2)} RON` : 'incomplet (lipsesc prețuri)',
          avertizari: input.mealsToday.warnings,
        }
      : null,
    nutritie_ieri: nutYesterday ? { kcal: nutYesterday.kcal, carbohidrati_g: nutYesterday.carbohidrati_g, proteine_g: nutYesterday.proteine_g, apa_l: nutYesterday.apa_l } : null,
    eficienta_aeroba: aerobicEfficiency(acts, today),
    acoperire_azi: aziCover.extra ? aziCover.coverage : null,
    efort_ieri: { peste_plan: ieri.over, trimp_facut: ieri.facut, trimp_planificat: ieri.planificat },
    echilibru: balance,
    gata_de_cursa: gataDeCursa,
    raspuns_recuperare: input.recoveryEffects ?? [],
    istoric: input.trainingHistory ?? null,
    restrictie_activa: (() => {
      const r = activeRestriction({ today, morning: input.morning ?? null, evenings: input.evenings, mornings: (input.morningHistory ?? []) as never, todayActivities: acts.filter((a) => a.date === today).map((a) => ({ sport: a.sport, minutes: a.minutes, rpe: input.evenings.find((e) => e.activityId === a.externalId || e.activityId === a.id)?.rpe ?? null })) });
      return r ? { verdict: r.verdict, motiv: r.reason } : null;
    })(),
    semnale: {
      boala: input.morning?.semnale.boala ?? null,
      febra: input.morning?.semnale.febra ?? null,
      deplasare: input.morning?.semnale.deplasare ?? null,
      simptom_cardiac: input.morning?.semnale.simptom_cardiac ?? null,
    },
    analize: input.labs ?? null,
    aviz: input.aviz,
  };
}

/** Regula de creștere, deterministă: modelul nu decide singur să crească volumul. */
export function progresStatus(
  input: CollectorInput,
  acwrTotal: number | null,
  bySport: Record<Sport, number | null>,
  aderenta: { planificate: number; facute: number } | null,
): Packet['progres'] {
  const h = input.history ?? null;
  const base = { zile_verzi_la_rand: h ? h.greenStreak : null, ultima_crestere: h?.lastIncrease ?? null };
  const no = (motiv: string) => ({ ...base, eligibil: false, motiv });
  if (!h) return no('fără istoric de readiness');
  if (h.greenStreak < 7) return no(`${h.greenStreak} zile verzi la rând (trebuie 7)`);
  if (acwrTotal == null) return no('încărcare necunoscută (sub 4 săptămâni de istoric)');
  if (acwrTotal >= 1.3) return no('încărcare totală peste 1,3');
  const hot = (Object.entries(bySport) as [Sport, number | null][]).filter(([, v]) => v != null && v >= 1.3).map(([k]) => k);
  if (hot.length) return no(`încărcare peste 1,3 la ${hot.join(', ')}`);
  if (!aderenta || aderenta.planificate === 0 || aderenta.facute / aderenta.planificate < 0.8) return no('aderență sub 80% în 14 zile');
  if (h.lastIncrease && diffDays(h.lastIncrease, input.today) < 13) return no(`creștere deja pe ${h.lastIncrease}`);
  return { ...base, eligibil: true, motiv: '7 zile verzi, încărcare sub 1,3, aderență bună' };
}

export function momentOfDay(hm: string | null): 'dimineata' | 'zi' | 'seara' | 'noapte' | null {
  if (!hm || !/^\d{2}:\d{2}/.test(hm)) return null;
  const h = Number(hm.slice(0, 2));
  return h >= 22 || h < 5 ? 'noapte' : h < 11 ? 'dimineata' : h < 17 ? 'zi' : 'seara';
}
