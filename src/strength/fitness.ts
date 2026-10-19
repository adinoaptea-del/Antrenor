// Programul AIRON de fitness pentru femei (documentul „AIRON_Antrenor_Fitness_Femei_6_Luni”, 18.10.2026).
//
// 26 de săptămâni de referință: acomodare (S1–4) · construire (S5–8) · progres (S9–12) · consolidare (S13–16) ·
// tranziție (S17–20) · menținere (S21–26). La „întreținere” se poate începe direct cu menținerea, după acomodare.
// Frecvența: 2, 3 sau 4 zile. Începătoarea pornește cu două zile (F1/F2); trecerea la trei e posibilă din S5, la patru
// din S9 — DAR doar după prezență reală (3 săptămâni la rând cu ≥ 80% din ședințe, `unlockedDays`), nu pentru că a
// trecut timpul. Prima săptămână cu o zi în plus distribuie volumul (accesoriile la o serie), nu îl adaugă.
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

/**
 * Câte zile a „deblocat” sportiva, din prezența reală (decizie de produs AIRON, nu prag fiziologic validat):
 * pornești de la frecvența de început; urci cu o zi doar după 3 săptămâni la rând la frecvența de acum cu cel puțin
 * 80% din ședințe făcute, fără durere raportată. Calendarul singur nu dovedește adaptarea.
 * `weeks`: săptămânile încheiate, cele mai vechi primele: câte ședințe de forță erau planificate și câte s-au făcut.
 */
export function unlockedDays(p: Pick<FitnessProfile, 'days' | 'beginner' | 'activity'>, weeks: { planned: number; done: number; pain?: boolean }[]): FitnessDays {
  let level: number = startDays(p);
  let streak = 0;
  for (const w of weeks) {
    if (w.planned === 0) continue;
    const ok = w.done / w.planned >= 0.8 && !w.pain;
    streak = ok && w.planned >= level ? streak + 1 : ok ? streak : 0;
    if (streak >= 3 && level < p.days) {
      level += 1;
      streak = 0;
    }
  }
  return Math.min(p.days, level) as FitnessDays;
}

/** Ce face săptămâna, din calendarul de referință (S1–S26). Pași de decizie, nu obligații de progres. */
export const FITNESS_WEEK_ACTION: Record<number, string> = {
  1: 'Alegi două ședințe F1/F2; câte o serie pe exercițiu poate fi suficientă. Notezi setările aparatelor.',
  2: 'Repeți F1/F2. Două serii la exercițiile principale doar dacă prima săptămână a fost tolerată.',
  3: 'Crești repetările în intervalul prescris la unul sau două exerciții. Nu crești toate greutățile.',
  4: 'Revizuiești tehnica, timpul și simptomele. Păstrezi doza sau o reduci dacă recuperarea e slabă.',
  5: 'Continui două zile sau treci la trei, cu seriile reduse la început, nu cu tot volumul dintr-odată.',
  6: 'Progresia dublă: întâi repetări, apoi cel mai mic pas de greutate disponibil.',
  7: 'Menții. Mersul/cardio-ul crește numai dacă nu scade toleranța la sală.',
  8: 'Verifici performanța, energia și tendințele, fără test maximal. Cel mult 1–2 înlocuiri, dacă există motiv.',
  9: 'Consolidezi schema aleasă. Patru zile doar prin distribuirea volumului existent.',
  10: 'Crești sarcina la un exercițiu dacă toate seriile au atins capătul de sus cu rezerva cerută.',
  11: 'Păstrezi exercițiile de referință; opțional o serie în plus la un exercițiu prioritar bine tolerat.',
  12: 'Revizuire. Dacă se adună oboseala: mai puține serii și mai multă rezervă.',
  13: 'Începe consolidarea, din doza tolerată, fără salt automat față de săptămâna 11.',
  14: 'Verifici seriile la fesieri/picioare și efectul mersului. Adaugi doar dacă progresul stagnează și recuperarea permite.',
  15: 'Progresezi repetări sau greutate; nu și cardio, și toate seriile deodată.',
  16: 'Revizuiești obiectivul cu nutriționistul. Nu reduci mâncarea pentru o săptămână cu cântarul stabil.',
  17: 'Dacă e potrivit, începe menținerea alimentară. Aceeași schemă de forță, ca să poți interpreta răspunsul.',
  18: 'Urmărești energia, foamea și recuperarea; apa și glicogenul în plus nu sunt grăsime recâștigată.',
  19: 'Exersezi o săptămână aglomerată cu varianta de două zile, dacă e util.',
  20: 'Stabilești volumul de menținere și preferințele pe termen lung. Fără test de epuizare.',
  21: 'Alegi 2, 3 sau 4 zile sustenabile; păstrezi mișcările principale, cu 2–3 repetări în rezervă.',
  22: 'Dacă reduci volumul, elimini întâi accesoriile, nu ședințele principale.',
  23: 'Verifici dacă performanța se menține la doza redusă.',
  24: 'Revizuiești toleranța, măsurătorile opționale și cât de mulțumită ești de plan.',
  25: 'Pregătești următorul bloc: continui menținerea sau alegi un obiectiv nou de forță/masă musculară.',
  26: 'Bilanț față de început: ședințe făcute, tehnică, greutăți, funcție, bunăstare. Nu doar kilogramele.',
};

/** Ce face săptămâna în varianta amplă A–D (programul din 19.10.2026). */
const WIDE_ACTION: [number, string][] = [
  [2, 'Învățare: două serii de lucru pe exercițiu, cu 3–4 repetări în rezervă. Notezi setările aparatelor.'],
  [4, 'Consolidare: rămân două serii; progresezi în control și repetări.'],
  [8, 'Construire: doza A–D (trei serii la exercițiile principale) doar dacă toleranța și timpul permit.'],
  [12, 'Progres: aceleași exerciții principale, repetări sau încărcări mai bune.'],
  [16, 'Varietate controlată: un element echivalent pe ședință, recalibrat; principalele rămân.'],
  [20, 'Consolidare: progres numai susținut de execuții și recuperare.'],
  [24, 'Stabilizare: păstrezi performanța, fără escaladare obligatorie.'],
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

/** Profilul de fitness din chestionar; valorile lipsă iau varianta prudentă (începătoare, 2 zile, 45 min). */
export function fitnessProfile(goal: string, f: FitnessIntake | undefined): FitnessProfile {
  return {
    goal: goal as FitnessProfile['goal'],
    days: f?.zile ?? 2,
    minutes: f?.minute ?? 45,
    beginner: f?.experienta !== 'stabila',
    activity: f?.miscare ?? null,
    postpartum: f?.sarcina === 'da',
  };
}

export const FITNESS_RULES: { t: string; d: string }[] = [
  { t: 'Efort', d: 'Cu repetări în rezervă (RIR): 3–4 la început, apoi 2–3. La RIR 3 te oprești când crezi că mai poți face cam trei repetări corecte. Fără epuizare.' },
  { t: 'Progresie dublă', d: 'La 2 × 8–12: alegi greutatea cu care faci cel puțin 8 repetări corecte. Adaugi repetări; când ambele serii ajung la 12, cu tehnica și rezerva păstrate, de două ori la rând, încerci cel mai mic pas de greutate și revii spre 8–10.' },
  { t: 'Încălzire', d: '5–8 min de mișcare ușoară și 1–3 serii progresive la primele exerciții. Nu sunt serii de lucru și nu e nevoie de 20 de minute de „activare”.' },
  { t: 'Pauze', d: '90–120 s la exercițiile principale, 60–90 s la accesorii, 45–60 s la trunchi.' },
  { t: 'Ședință ratată', d: 'Continui rotația de unde ai rămas. Nu dublezi și nu înghesui două zile de picioare.' },
  { t: 'Tonifiere', d: 'Înseamnă mușchi construit sau păstrat, plus compoziția corporală când o dorești. Nu există slăbire localizată pe abdomen, coapse sau brațe.' },
  { t: 'Durere', d: 'Durere nouă în articulație sau care crește: oprești exercițiul și spui în formularul de seară. Durere în piept, leșin sau lipsă de aer: oprești efortul și ceri ajutor medical.' },
];
