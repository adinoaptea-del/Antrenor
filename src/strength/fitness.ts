// Programul AIRON de fitness pentru femei (documentul „AIRON_Antrenor_Fitness_Femei_6_Luni”, 18.10.2026).
//
// 26 de săptămâni de referință: acomodare (S1–4) · construire (S5–8) · progres (S9–12) · consolidare (S13–16) ·
// tranziție (S17–20) · menținere (S21–26). La „întreținere” se poate începe direct cu menținerea, după acomodare.
// Frecvența: 2, 3 sau 4 zile. Începătoarea pornește cu două zile (picioare / partea de sus); trecerea la trei e posibilă din S5, la patru
// din S9 — DAR doar după prezență reală (3 săptămâni la rând cu ≥ 80% din ședințe, `unlockedDays`), nu pentru că a
// trecut timpul. Prima săptămână cu o zi în plus are 3 serii la toate exercițiile, dar ședința în plus ADAUGĂ serii pe
// săptămână (auditul v93, A52); planul o spune cu cifre în notele săptămânii, nu o prezintă ca „distribuire”.
// Ședințele (exercițiile, seriile, pauzele) sunt în src/strength/ppl.ts; aici sunt etapele, calendarul săptămânilor,
// mișcarea zilnică și regulile pentru agent.

import type { FitnessGoal } from '../calendar/phases.js';
import type { Phase } from '../types.js';
import { FITNESS_ROTATION, FITNESS_ROTATION_WIDE, type Block, type FitnessSessionId } from './ppl.js';

export type FitnessDays = 2 | 3 | 4;

export interface FitnessProfile {
  goal: FitnessGoal;
  /** Zilele de sală pe care le vrea, pe termen lung. */
  days: FitnessDays;
  /** Minutele pe care le are pentru o ședință (cu încălzirea și pauzele). */
  minutes: number;
  /** Începătoare sau revenire după o pauză: acomodare completă cu două zile. */
  beginner: boolean;
  /** Mișcarea de acum: de aici pornește mersul/cardio-ul. */
  activity?: 'sedentara' | 'plimbari' | 'activa' | null;
  /** Sarcină sau primul an după naștere: fără ramura standard de slăbire. */
  postpartum?: boolean;
  /**
   * Câte zile pe săptămână a demonstrat că poate ține (prezență reală), calculat de `unlockedDays`. Frecvența nu crește
   * doar pentru că trec săptămânile: planul nu trece peste acest număr până la următoarea reevaluare săptămânală.
   */
  unlocked?: FitnessDays;
  /** Motivul deciziei de frecvență (pentru explicație). */
  unlockWhy?: string;
  /** Unde se antrenează: acasă = doar gantere, bandă, corp, scaun (exercițiile se aleg după echipament). */
  place?: 'sala' | 'acasa';
}

export interface FitnessWeek {
  /** Săptămâna din program, de la 1. */
  week: number;
  block: Block;
  /** Săptămâna în etapă, de la 1, și lungimea etapei. */
  blockWeek: number;
  blockLen: number;
  /** Faza din plan peste care se așază etapa (același tip de date ca la sporturile de anduranță). */
  phase: Phase;
  days: FitnessDays;
  /** Prima săptămână cu mai multe zile decât înainte. */
  transition: boolean;
  /** Revizuire: mai puține serii, rezervă mai mare — doar când datele arată oboseală (nu automat). */
  recovery: boolean;
  /** Punct de evaluare (săpt. 4, 8, 12, 16, 20, 24): compari cu aceleași ședințe; nu e descărcare obligatorie. */
  evaluation: boolean;
  /** Varianta de patru zile: „ampla” (A–D) pentru sportiva eligibilă, altfel „standard” (L1/U1/L2/U2). */
  variant: 'standard' | 'ampla';
  rotation: FitnessSessionId[];
}

const STAGES: { block: Block; len: number; phase: Phase }[] = [
  { block: 'acomodare', len: 4, phase: 'evaluare' },
  { block: 'construire', len: 4, phase: 'baza1' },
  { block: 'progres', len: 4, phase: 'baza2' },
  { block: 'consolidare', len: 4, phase: 'build' },
  { block: 'tranzitie', len: 4, phase: 'peak' },
  { block: 'mentinere', len: 6, phase: 'taper' },
];

/** Etapele pe săptămâni. La „întreținere”: acomodarea (4 săptămâni la începătoare, 2 altfel), apoi menținere. */
export function fitnessWeeks(p: FitnessProfile, total = 26): FitnessWeek[] {
  const seq: { block: Block; len: number; phase: Phase }[] =
    p.goal === 'fit-intretinere' || p.postpartum
      ? [
          { block: 'acomodare', len: p.beginner ? 4 : 2, phase: 'evaluare' },
          { block: 'mentinere', len: Math.max(0, total - (p.beginner ? 4 : 2)), phase: 'taper' },
        ]
      : STAGES;
  const out: FitnessWeek[] = [];
  let prevDays: FitnessDays | null = null;
  for (const s of seq) {
    for (let w = 1; w <= s.len && out.length < total; w++) {
      const week = out.length + 1;
      const days = daysAt(p, week);
      out.push({
        week,
        block: s.block,
        blockWeek: w,
        blockLen: s.len,
        phase: s.phase,
        days,
        transition: prevDays != null && days > prevDays,
        recovery: false,
        evaluation: week % 4 === 0 && week <= 24,
        variant: days === 4 && wideEligible(p) ? 'ampla' : 'standard',
        rotation: days === 4 && wideEligible(p) ? FITNESS_ROTATION_WIDE : FITNESS_ROTATION[days],
      });
      prevDays = days;
    }
  }
  return out;
}

/**
 * Zilele de sală în săptămâna dată. Începătoarea: două zile în S1–4, trei din S5 (dacă a ales 3 sau 4), patru din S9.
 * Cu bază stabilă: până la trei zile de la început, patru din S5. Niciodată mai multe decât a ales.
 */
export function daysAt(p: Pick<FitnessProfile, 'days' | 'beginner' | 'postpartum' | 'unlocked' | 'activity'>, week: number): FitnessDays {
  if (p.postpartum) return 2;
  const cap = p.beginner ? (week <= 4 ? 2 : week <= 8 ? 3 : 4) : week <= 4 ? (p.activity === 'activa' ? 4 : 3) : 4;
  return Math.min(p.days, cap, p.unlocked ?? startDays(p)) as FitnessDays;
}

/**
 * Frecvența de început: două zile la începătoare, cel mult trei altfel; patru de la început doar cu antrenament
 * regulat deja (mișcarea de acum „activă”) și bază stabilă — istoricul executat, nu vârsta sau sexul.
 */
export function startDays(p: Pick<FitnessProfile, 'days' | 'beginner'> & { activity?: FitnessProfile['activity'] }): FitnessDays {
  if (p.beginner) return Math.min(p.days, 2) as FitnessDays;
  return Math.min(p.days, p.activity === 'activa' ? 4 : 3) as FitnessDays;
}

/**
 * Varianta amplă A–D (săptămâni de 55–70 min): doar pentru sportiva cu bază (nu începătoare), fără sarcină/postpartum,
 * cu cel puțin 55 de minute pe ședință. Altfel cele patru zile rămân L1/U1/L2/U2 (mai scurte). Nu e o variantă
 * „superioară universal”, ci o doză mai mare pentru cine o poate susține.
 */
export function wideEligible(p: Pick<FitnessProfile, 'beginner' | 'postpartum' | 'minutes'>): boolean {
  return !p.beginner && !p.postpartum && p.minutes >= 55;
}

export interface AttendanceWeek {
  planned: number;
  done: number;
  /** Durere / simptom raportat în săptămână. */
  pain?: boolean;
  /** Câte ședințe au feedback (jurnal de forță sau formular de seară). Lipsă = necunoscut, nu „fără probleme”. */
  feedback?: number;
}

export interface UnlockResult {
  days: FitnessDays;
  /** De ce nu urcă (sau de ce urcă), pentru explicație și audit. */
  why: string;
}

/**
 * Câte zile a „deblocat” sportiva (auditul v2, V2-07; regulă de produs AIRON, nu prag fiziologic validat). O zi în plus
 * doar dacă TOATE sunt adevărate:
 *  - o vrea (zilele alese în chestionar) și are timp (zile libere în program pentru încă o ședință);
 *  - 3 săptămâni la rând la frecvența de acum, cu prezența cumulată ≥ 80% din ședințele planificate în cele 3 săptămâni
 *    (ponderat: la 2 ședințe/săpt. înseamnă 5 din 6, nu „2 din 2 în fiecare săptămână”);
 *  - feedback în fiecare din cele 3 săptămâni (lipsa feedbackului nu e toleranță);
 *  - fără durere raportată și fără restricție activă.
 * Prima săptămână cu o zi în plus are 3 serii pe exercițiu; totalul săptămânii crește și se spune cu cifre (A52).
 */
export function unlockDecision(p: Pick<FitnessProfile, 'days' | 'beginner' | 'activity'>, weeks: AttendanceWeek[], opts: { freeDays?: number; restricted?: boolean } = {}): UnlockResult {
  let level: number = startDays(p);
  let why = `frecvența de început (${level} zile)`;
  let run: AttendanceWeek[] = [];
  for (const w of weeks) {
    if (w.planned === 0) continue;
    if (w.planned < level) {
      // Săptămână cu mai puține ședințe planificate (deplasare, revizuire): nu dovedește frecvența de acum.
      continue;
    }
    run.push(w);
    if (run.length > 3) run = run.slice(-3);
    const bad = w.pain || (w.feedback ?? 0) === 0 || w.done === 0;
    if (bad) {
      why = w.pain ? 'durere raportată: frecvența nu crește' : (w.feedback ?? 0) === 0 ? 'fără feedback într-o săptămână: lipsa datelor nu e toleranță' : 'o săptămână fără ședințe făcute';
      run = [];
      continue;
    }
    if (run.length === 3) {
      const planned = run.reduce((n, x) => n + x.planned, 0);
      const done = run.reduce((n, x) => n + x.done, 0);
      if (done / planned < 0.8) {
        why = `prezență ${done}/${planned} în ultimele 3 săptămâni (sub 80%)`;
        continue;
      }
      if (level >= p.days) {
        why = `ai ales ${p.days} zile: nu crește peste ce vrei`;
        continue;
      }
      if (opts.freeDays != null && opts.freeDays <= level) {
        why = `prezență bună (${done}/${planned}), dar programul tău are doar ${opts.freeDays} zile libere`;
        continue;
      }
      if (opts.restricted) {
        why = 'restricție activă: frecvența nu crește acum';
        continue;
      }
      level += 1;
      why = `prezență ${done}/${planned} în 3 săptămâni, cu feedback și fără durere: ${level} zile (prima săptămână cu 3 serii pe exercițiu; totalul pe săptămână crește cu ședința în plus)`;
      run = [];
    }
  }
  return { days: Math.min(p.days, level) as FitnessDays, why };
}

/** Compatibilitate: doar numărul de zile. Fără `feedback` în date, se consideră că există (apel vechi). */
export function unlockedDays(p: Pick<FitnessProfile, 'days' | 'beginner' | 'activity'>, weeks: AttendanceWeek[], opts: { freeDays?: number; restricted?: boolean } = {}): FitnessDays {
  return unlockDecision(p, weeks.map((w) => ({ ...w, feedback: w.feedback ?? w.done })), opts).days;
}

/** Ce face săptămâna, din calendarul de referință (S1–S26). Pași de decizie, nu obligații de progres. */
export const FITNESS_WEEK_ACTION: Record<number, string> = {
  1: 'Două ședințe: o zi de picioare și una pentru partea de sus; 3 serii pe exercițiu cu greutăți ușoare. Notezi greutățile (și setările aparatelor, la sală).',
  2: 'Continui rotația (alt accent la picioare, altă zi de sus). Rămân 3 serii; crești greutatea doar dacă prima săptămână a mers bine.',
  3: 'Crești repetările în intervalul prescris la unul sau două exerciții. Nu crești toate greutățile.',
  4: 'Revizuiești tehnica, timpul și simptomele. Păstrezi doza sau o reduci dacă recuperarea e slabă.',
  5: 'Continui două zile sau treci la trei (picioare, sus, picioare), cu 3 serii la început, nu cu tot volumul dintr-odată.',
  6: 'Cum crești: întâi repetări, apoi greutatea imediat următoare.',
  7: 'Menții. Mersul/cardio-ul crește numai dacă nu te simți mai obosită la sală.',
  8: 'Verifici performanța, energia și tendințele, fără test maximal. Cel mult 1–2 înlocuiri, dacă există motiv.',
  9: 'Consolidezi schema aleasă. Patru zile doar dacă le-ai ținut pe cele trei; prima săptămână cu 3 serii pe exercițiu (totalul pe săptămână crește cu ședința în plus).',
  10: 'Crești sarcina la un exercițiu dacă toate seriile au atins capătul de sus fără să mergi până la limită.',
  11: 'Păstrezi exercițiile de referință; opțional o serie în plus la un exercițiu prioritar care merge bine.',
  12: 'Revizuire. Dacă se adună oboseala: greutăți mai mici și oprit mai departe de limită (seriile rămân 3).',
  13: 'Începe consolidarea, de la cât duci acum, fără salt automat față de săptămâna 11.',
  14: 'Verifici seriile la fesieri/picioare și efectul mersului. Adaugi doar dacă progresul stagnează și recuperarea permite.',
  15: 'Progresezi repetări sau greutate; nu și cardio, și toate seriile deodată.',
  16: 'Revizuiești obiectivul cu nutriționistul. Nu reduci mâncarea pentru o săptămână cu cântarul stabil.',
  17: 'Dacă e potrivit, începe menținerea alimentară. Aceeași schemă de forță, ca să poți interpreta răspunsul.',
  18: 'Urmărești energia, foamea și recuperarea; apa și glicogenul în plus nu sunt grăsime recâștigată.',
  19: 'Exersezi o săptămână aglomerată cu varianta de două zile, dacă e util.',
  20: 'Stabilești volumul de menținere și preferințele pe termen lung. Fără test de epuizare.',
  21: 'Alegi 2, 3 sau 4 zile sustenabile; păstrezi mișcările principale, oprindu-te când mai aveai 2–3 repetări.',
  22: 'Dacă reduci volumul, elimini întâi un exercițiu de la coadă, nu serii sub 3 și nu ședințele principale.',
  23: 'Verifici dacă performanța se menține la doza redusă.',
  24: 'Te uiți cum te simți, măsurătorile opționale și cât de mulțumită ești de plan.',
  25: 'Pregătești următorul bloc: continui menținerea sau alegi un obiectiv nou de forță/masă musculară.',
  26: 'Bilanț față de început: ședințe făcute, tehnică, greutăți, funcție, bunăstare. Nu doar kilogramele.',
};

/**
 * Structura unică a săptămânilor de fitness (auditul v2, V2-13), cu datele calendarului: aceeași pentru plan, calendar,
 * explicație și audit. 26 de săptămâni (sau câte încap până la data finală, exclusă), fără descărcări automate.
 */
export function fitnessPlanWeeks(planStart: string, raceDate: string, p: FitnessProfile): (FitnessWeek & { weekStart: string })[] {
  const first = mondayOf(planStart);
  const total = Math.max(1, Math.min(26, Math.floor((Date.parse(`${raceDate}T12:00:00Z`) - Date.parse(`${first}T12:00:00Z`)) / (7 * 86_400_000)) || 26));
  return fitnessWeeks(p, total).map((w) => ({ ...w, weekStart: plusDays(first, (w.week - 1) * 7) }));
}

function mondayOf(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}
function plusDays(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Ce face săptămâna în varianta amplă A–D (programul din 19.10.2026). */
const WIDE_ACTION: [number, string][] = [
  [2, 'Învățare: două serii de lucru pe exercițiu, oprindu-te când mai aveai 3–4 repetări. Notezi greutățile (și setările aparatelor, la sală).'],
  [4, 'Consolidare: rămân două serii; progresezi în control și repetări.'],
  [8, 'Construire: doza A–D (trei serii la exercițiile principale) doar dacă te simți bine și ai timp.'],
  [12, 'Progres: aceleași exerciții principale, repetări sau încărcări mai bune.'],
  [16, 'Varietate controlată: câte un exercițiu schimbat cu unul asemănător, cu greutatea căutată din nou; principalele rămân.'],
  [20, 'Consolidare: progres numai susținut de execuții și recuperare.'],
  [24, 'Stabilizare: păstrezi performanța, nu trebuie să crești.'],
  [26, 'Tranziție: testezi o doză mai mică (o serie mai puțin la exercițiile cu trei serii) pentru menținere.'],
];

/** Acțiunea săptămânii, după varianta programului (A–D are tabelul lui; altfel calendarul de referință S1–S26). */
export function fitnessWeekAction(week: number, variant: 'standard' | 'ampla' = 'standard'): string {
  if (variant === 'ampla') return WIDE_ACTION.find(([upTo]) => week <= upTo)?.[1] ?? '';
  return FITNESS_WEEK_ACTION[week] ?? '';
}

/** Mersul și cardio-ul săptămânii (OMS: 150–300 min moderat, construit treptat, nu din prima săptămână). */
export function fitnessCardio(week: number, activity: FitnessProfile['activity']): string {
  const start = activity === 'activa' ? 2 : activity === 'plimbari' ? 1 : 0;
  const level = Math.min(2, start + (week > 12 ? 2 : week > 4 ? 1 : 0));
  if (level === 0) return 'Două plimbări de 10–15 min, în zile separate (sau bucăți mai scurte). Nu trebuie să alergi.';
  if (level === 1) return '2–3 ședințe de 20–30 min de mers alert, bicicletă sau eliptică, plus mișcarea de zi cu zi. Crești un singur lucru odată.';
  return 'Spre 150 min pe săptămână moderat (ex. 5 plimbări alerte × 20 min + 2 ture de bicicletă × 25 min). Moderat = respiri mai repede, dar poți vorbi în propoziții.';
}

/** Răspunsurile de fitness din chestionar. */
export interface FitnessIntake {
  experienta?: 'incepatoare' | 'stabila' | null;
  zile?: 2 | 3 | 4 | null;
  minute?: number | null;
  acces?: 'sala' | 'acasa' | null;
  miscare?: 'sedentara' | 'plimbari' | 'activa' | null;
  sarcina?: 'nu' | 'da' | 'nu_spun' | null;
}

/** Profilul de fitness din chestionar; valorile lipsă iau varianta prudentă (începătoare, 2 zile, 60 min, minimum 45). */
export function fitnessProfile(goal: string, f: FitnessIntake | undefined): FitnessProfile {
  return {
    goal: goal as FitnessProfile['goal'],
    days: f?.zile ?? 2,
    // Cel puțin 45 de minute pe ședință (regula proprietarului); fără răspuns, 60 (cât încape o ședință întreagă).
    minutes: Math.max(45, f?.minute ?? 60),
    beginner: f?.experienta !== 'stabila',
    activity: f?.miscare ?? null,
    postpartum: f?.sarcina === 'da',
    place: f?.acces === 'acasa' ? 'acasa' : 'sala',
  };
}

export const FITNESS_RULES: { t: string; d: string }[] = [
  { t: 'Structura', d: 'Cu o singură zi pe săptămână: tot corpul. Cu două sau mai multe, picioarele și partea de sus nu sunt în aceeași ședință. Femei: trei zile de picioare cu accente diferite (cvadriceps; fesieri și femurali; abductori) și două pentru partea de sus (spate și biceps; piept, umeri și triceps). Bărbați: două zile = picioare / partea de sus; trei sau mai multe = Push, Pull, Picioare pe rând.' },
  { t: 'Durata', d: 'Fiecare ședință are cel puțin 45 de minute: 10 min de încălzire, exercițiile, apoi cardio la final (scări, mers rapid sau eliptică). Excepții: după febră, la recuperare slabă sau durere și când spui că ai mai puțin timp — atunci varianta scurtă, cu cel puțin 2 serii pe exercițiu.' },
  { t: 'Serii', d: '3 sau 4 serii la fiecare exercițiu, mereu. În zilele mai ușoare scade greutatea, nu numărul de serii. Cel mult 10 serii pe același mușchi într-o ședință.' },
  { t: 'Cât de greu', d: 'Te oprești din serie când mai aveai încă 2–3 repetări bune (la început 3–4). Nu mergi până nu mai poți.' },
  { t: 'Piramida', d: 'La 20 / 15 / 12 / 8 crești greutatea de la o serie la alta, pentru că scad repetările — doar dacă seria de dinainte a ieșit curat și mai aveai cel puțin o repetare; altfel păstrezi greutatea. Pauza 1–2 minute, nu mai mult.' },
  { t: 'Superserie', d: 'Exercițiile cu aceeași literă le faci unul după altul, fără pauză; pauza vine după ultimul din grup.' },
  { t: 'Cum crești', d: 'Notezi greutatea și repetările. Când faci numărul maxim de repetări la toate seriile, de două ori la rând, cu cel puțin o repetare în rezervă, pui greutatea imediat următoare. O serie ratată nu crește greutatea. „Am făcut cum scrie” confirmă ședința, dar pentru creștere scrii măcar o dată valorile reale.' },
  { t: 'Ședință ratată', d: 'Continui rotația de unde ai rămas. Nu dublezi și nu înghesui două zile de picioare.' },
  { t: 'Tonifiere', d: 'Înseamnă mușchi construit sau păstrat, plus compoziția corporală când o dorești. Nu există slăbire localizată pe abdomen, coapse sau brațe.' },
  { t: 'Durere', d: 'Durere nouă în articulație sau care crește: oprești exercițiul și spui în formularul de seară. Durere în piept, leșin sau lipsă de aer: oprești efortul și ceri ajutor medical.' },
];
