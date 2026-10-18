// Ținta la alergare (5 km, 10 km, semimaraton, maraton): cât de realistă e față de ce poate sportivul acum și de cât
// timp are până la cursă. Reguli explicite, nu „intuiție”:
//
//  1. Podeaua absolută: sub timpii de elită (aprox. recordurile mondiale + 10–15%) nicio țintă nu e realistă
//     pentru un amator: 5 km sub 14:30, 10 km sub 30:00, semimaraton sub 1:06, maraton sub 2:20.
//     „Foarte ambițios” între elită și un amator foarte bun: 5 km sub 17:00, 10 km sub 36:00, semi sub 1:20, maraton sub 2:50.
//  2. Cu un rezultat recent (pe orice distanță): se aduce la distanța cursei cu formula lui Riegel
//     (T2 = T1 × (D2/D1)^1.06) și se calculează cât % trebuie să se îmbunătățească. Un amator deja antrenat
//     câștigă, orientativ, ~1–1,5% pe lună; cu cât e mai departe de nivelul „amator foarte bun”, cu atât marja e mai
//     mare (începătorii progresează mai repede), până la dublu. Deci: realist ≤ 1,5% × factor × luni (plafon 20%),
//     ambițios ≤ 2,5% × factor × luni (plafon 30%), peste = nerealist.
//  3. Fără niciun rezultat: doar podeaua absolută; verdictul rămâne „necunoscut” (nu ghicim).
//
// Formula lui Riegel (exponent 1,06) e o aproximare bună între 1,5 km și maraton pentru alergători antrenați; pentru
// amatori subestimează timpul când distanța crește mult, de aceea exponentul urcă la 1,08 de la triplul distanței și
// la 1,10 de la de șase ori (5 km → maraton).

import { RUN_DISTANCE_KM, isRunGoal, type RunGoal } from '../calendar/phases.js';
import { paceFromResult, parseDuration, type RunResult } from '../util/run.js';

export type Realism = 'realist' | 'ambitios' | 'nerealist' | 'necunoscut';

export interface RunTargetInput {
  goal: RunGoal;
  /** Timpul-țintă pe distanța cursei, secunde. */
  targetSec: number;
  /** Cel mai bun rezultat recent: distanța (km) și timpul (s). null = niciun rezultat. */
  current?: { km: number; sec: number; date?: string | null; label?: string } | null;
  /** Săptămâni până la cursă. */
  weeks: number;
}

export interface RunTargetVerdict {
  verdict: Realism;
  /** Ritmul-țintă, s/km. */
  paceSecKm: number;
  /** Timpul echivalent de acum pe distanța cursei (Riegel), s; null fără rezultat. */
  equivalentNowSec: number | null;
  /** Cât trebuie să scadă timpul, în % (pozitiv = îmbunătățire necesară). */
  improvementPct: number | null;
  /** Cât se poate câștiga realist în timpul rămas, în %. */
  feasiblePct: number | null;
  /** De ce, în cuvintele sportivului. */
  reasons: string[];
}

/** Sub acești timpi (s) ținta e nerealistă pentru un amator; între ei și „ambițios” e foarte ambițioasă. */
const ELITE_SEC: Record<RunGoal, number> = { '5k': 14 * 60 + 30, '10k': 30 * 60, semimaraton: 66 * 60, maraton: 140 * 60 };
const STRONG_AMATEUR_SEC: Record<RunGoal, number> = { '5k': 17 * 60, '10k': 36 * 60, semimaraton: 80 * 60, maraton: 170 * 60 };
const GAIN_PER_MONTH = { realist: 1.5, ambitios: 2.5 };
const GAIN_CAP = { realist: 20, ambitios: 30 };

/**
 * Factorul de nivel: 1 pentru un amator foarte bun (timp ≤ 1,2 × pragul „amator foarte bun”), crește liniar cu
 * distanța față de prag, până la 2. Ex. 5 km în 27:30 (prag 17:00, raport 1,62) → 1,63: ~2,4%/lună realist.
 */
export function gainFactor(goal: RunGoal, equivalentNowSec: number): number {
  const ratio = equivalentNowSec / STRONG_AMATEUR_SEC[goal];
  return Math.round(Math.min(2, Math.max(1, 1 + (ratio - 1.2) * 1.5)) * 100) / 100;
}

/** Riegel: timpul pe D2 din timpul pe D1. Exponent 1,06; 1,08 de la triplul distanței; 1,10 de la de șase ori. */
export function riegel(sec: number, fromKm: number, toKm: number): number {
  if (fromKm <= 0 || toKm <= 0 || sec <= 0) return NaN;
  const ratio = toKm / fromKm;
  const k = ratio >= 6 ? 1.1 : ratio >= 3 ? 1.08 : 1.06;
  return sec * Math.pow(ratio, k);
}

export function fmtTime(sec: number): string {
  const r = Math.round(sec);
  const h = Math.floor(r / 3600);
  const m = Math.floor((r % 3600) / 60);
  const s = r % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}
const fmtPace = (secKm: number) => `${Math.floor(secKm / 60)}:${String(Math.round(secKm % 60)).padStart(2, '0')}/km`;

export function runTarget(i: RunTargetInput): RunTargetVerdict {
  const dist = RUN_DISTANCE_KM[i.goal];
  const paceSecKm = i.targetSec / dist;
  const reasons: string[] = [];
  const months = Math.max(0, i.weeks) / 4.33;

  if (i.targetSec < ELITE_SEC[i.goal]) {
    reasons.push(`${fmtTime(i.targetSec)} pe ${dist.toLocaleString('ro-RO', { maximumFractionDigits: 1 })} km (${fmtPace(paceSecKm)}) e sub nivelul de elită; nicio pregătire de amator nu ajunge acolo.`);
    return { verdict: 'nerealist', paceSecKm, equivalentNowSec: null, improvementPct: null, feasiblePct: null, reasons };
  }

  let equivalentNowSec: number | null = null;
  if (i.current && i.current.km > 0 && i.current.sec > 0) {
    equivalentNowSec = Math.round(riegel(i.current.sec, i.current.km, dist));
    const label = i.current.label ?? `${i.current.km.toLocaleString('ro-RO', { maximumFractionDigits: 1 })} km în ${fmtTime(i.current.sec)}`;
    if (Math.abs(i.current.km - dist) > 0.2) reasons.push(`Din ${label}, echivalentul de acum pe distanța cursei e ~${fmtTime(equivalentNowSec)} (formula lui Riegel).`);
    else reasons.push(`Acum: ${label}.`);
  }

  if (equivalentNowSec == null) {
    if (i.targetSec < STRONG_AMATEUR_SEC[i.goal]) reasons.push(`${fmtTime(i.targetSec)} e un timp de amator foarte bun (${fmtPace(paceSecKm)}); fără un rezultat recent nu putem spune dacă e la îndemână.`);
    else reasons.push('Fără un rezultat recent pe o distanță cunoscută nu putem judeca ținta; primul test din plan o calibrează.');
    return { verdict: 'necunoscut', paceSecKm, equivalentNowSec: null, improvementPct: null, feasiblePct: null, reasons };
  }

  const improvementPct = Math.round(((equivalentNowSec - i.targetSec) / equivalentNowSec) * 1000) / 10;
  const factor = gainFactor(i.goal, equivalentNowSec);
  const perMonth = Math.round(GAIN_PER_MONTH.realist * factor * 10) / 10;
  const feasibleRealist = Math.min(GAIN_CAP.realist, GAIN_PER_MONTH.realist * factor * months);
  const feasibleAmbitios = Math.min(GAIN_CAP.ambitios, GAIN_PER_MONTH.ambitios * factor * months);
  const feasiblePct = Math.round(feasibleRealist * 10) / 10;

  if (improvementPct <= 0) {
    reasons.push(`Ținta e la nivelul tău de acum sau mai lentă: realistă; planul poate ținti mai sus.`);
    return { verdict: 'realist', paceSecKm, equivalentNowSec, improvementPct, feasiblePct, reasons };
  }
  reasons.push(`Ținta cere o îmbunătățire de ${improvementPct.toLocaleString('ro-RO')}% în ${Math.round(i.weeks)} săptămâni; un amator la nivelul tău câștigă orientativ ${perMonth.toLocaleString('ro-RO')}% pe lună${factor > 1 ? ' (la început se progresează mai repede decât la un alergător deja antrenat)' : ''}, adică ~${feasiblePct.toLocaleString('ro-RO')}% în timpul rămas.`);
  let verdict: Realism;
  if (improvementPct <= feasibleRealist) verdict = 'realist';
  else if (improvementPct <= feasibleAmbitios) {
    verdict = 'ambitios';
    reasons.push('Se poate, dar fără săptămâni pierdute și cu toate ședințele-cheie făcute.');
  } else {
    verdict = 'nerealist';
    const needWeeks = Math.ceil((improvementPct / (GAIN_PER_MONTH.realist * factor)) * 4.33);
    reasons.push(improvementPct > GAIN_CAP.ambitios ? 'E o altă categorie de alergător, nu o pregătire de câteva luni.' : `Ar fi nevoie de ~${needWeeks} săptămâni de pregătire continuă pentru o țintă realistă; cu data de acum, o țintă realistă e ~${fmtTime(equivalentNowSec * (1 - feasibleRealist / 100))}.`);
  }
  if (verdict !== 'nerealist' && i.targetSec < STRONG_AMATEUR_SEC[i.goal]) reasons.push('E un timp de amator foarte bun: cere consecvență pe toată perioada.');
  return { verdict, paceSecKm, equivalentNowSec, improvementPct, feasiblePct, reasons };
}

/** Timpul estimat pe distanța cursei din cel mai bun efort recent (Riegel), cu marjă: −4% / +8% (începătorii pierd mai mult pe distanță). */
export function predictFromEffort(effort: { km: number; sec: number }, goal: RunGoal): { sec: number; low: number; high: number } | null {
  const dist = RUN_DISTANCE_KM[goal];
  const sec = riegel(effort.sec, effort.km, dist);
  if (!Number.isFinite(sec)) return null;
  return { sec: Math.round(sec), low: Math.round(sec * 0.96), high: Math.round(sec * 1.08) };
}

/** Timpul-țintă (s) din răspunsul din chestionar (timp final sau ritm pe km), pe distanța obiectivului. */
export function targetSecFromIntake(goal: string | null | undefined, tinta: RunResult | null | undefined): number | null {
  if (!isRunGoal(goal) || !tinta) return null;
  const pace = paceFromResult(tinta, RUN_DISTANCE_KM[goal]);
  return pace ? Math.round(pace * RUN_DISTANCE_KM[goal]) : null;
}

/** Ce știe chestionarul despre nivelul de acum la alergare (forma e cea din formular, citită îngăduitor). */
export interface RunIntakeLike {
  obiectiv?: string | null;
  alergare?: { poateDistanta?: boolean | null; rezultatActual?: RunResult | null } | null;
  evaluare?: { alergare5k?: string | null; alergare10k?: string | null } | null;
}

/**
 * Nivelul de acum din chestionar: rezultatul pe distanța cursei, dacă a alergat-o; altfel un timp recent pe 10 sau 5 km.
 * null = n-avem niciun rezultat (verdictul rămâne „necunoscut”, primul test din plan calibrează).
 */
export function currentFromIntake(intake: RunIntakeLike): { km: number; sec: number; label: string } | null {
  if (!isRunGoal(intake.obiectiv)) return null;
  const dist = RUN_DISTANCE_KM[intake.obiectiv];
  const nowPace = intake.alergare?.poateDistanta ? paceFromResult(intake.alergare.rezultatActual, dist) : null;
  if (nowPace) {
    const sec = Math.round(nowPace * dist);
    return { km: dist, sec, label: `${dist.toLocaleString('ro-RO', { maximumFractionDigits: 1 })} km în ${fmtTime(sec)}` };
  }
  const t10 = parseDuration(intake.evaluare?.alergare10k ?? null, 10);
  if (t10) return { km: 10, sec: t10, label: `10 km în ${fmtTime(t10)}` };
  const t5 = parseDuration(intake.evaluare?.alergare5k ?? null, 5);
  if (t5) return { km: 5, sec: t5, label: `5 km în ${fmtTime(t5)}` };
  return null;
}

export interface PlanTarget {
  /** Ținta declarată (s), null fără țintă. */
  targetSec: number | null;
  /** Timpul pe care se construiește planul (s): ținta, sau timpul realist de acum când ținta e nerealistă; null fără reper. */
  planSec: number | null;
  /** Ritmul (s/km) pentru ședințele la ritm de cursă; null = fără bucăți la ritm de cursă (calitate generală, testul calibrează). */
  paceSecKm: number | null;
  /** true când planul NU e pe ținta declarată. */
  adjusted: boolean;
  verdict: RunTargetVerdict | null;
}

/**
 * Pe ce se construiește planul. Chestionarul promite: „la o țintă nerealistă, planul se face pe timpul estimat, nu pe
 * ținta asta” — aici se ține promisiunea. Nerealist cu un rezultat cunoscut → timpul realist de acum (Riegel − câștigul
 * realist în timpul rămas). Nerealist fără niciun rezultat (sub podeaua de elită) → fără ritm de cursă în plan.
 */
export function planTarget(goal: RunGoal, tinta: RunResult | null | undefined, current: { km: number; sec: number; label?: string } | null, weeks: number): PlanTarget {
  const targetSec = targetSecFromIntake(goal, tinta);
  if (!targetSec) return { targetSec: null, planSec: null, paceSecKm: null, adjusted: false, verdict: null };
  const dist = RUN_DISTANCE_KM[goal];
  const verdict = runTarget({ goal, targetSec, current, weeks });
  if (verdict.verdict === 'realist') return { targetSec, planSec: targetSec, paceSecKm: targetSec / dist, adjusted: false, verdict };
  if (verdict.verdict === 'ambitios') {
    // Ritmul de antrenament e ancorat în ce poate sportivul acum (plus câștigul realist), nu în timpul dorit; testele
    // din plan îl recalibrează. Ținta rămâne ținta.
    const realistic = verdict.equivalentNowSec && verdict.feasiblePct != null ? Math.round(verdict.equivalentNowSec * (1 - verdict.feasiblePct / 100)) : targetSec;
    const planSec = Math.max(targetSec, realistic);
    return { targetSec, planSec, paceSecKm: planSec / dist, adjusted: false, verdict };
  }
  // Fără niciun rezultat: nu apar ritmuri fictive; ședințele merg pe efort (RPE) până la primul test.
  if (verdict.verdict === 'necunoscut') return { targetSec, planSec: null, paceSecKm: null, adjusted: false, verdict };
  if (verdict.equivalentNowSec && verdict.feasiblePct != null) {
    const planSec = Math.round(verdict.equivalentNowSec * (1 - verdict.feasiblePct / 100));
    return { targetSec, planSec, paceSecKm: planSec / dist, adjusted: true, verdict };
  }
  return { targetSec, planSec: null, paceSecKm: null, adjusted: true, verdict };
}

/**
 * Distanța însăși, înaintea timpului: un debutant fără bază nu primește maraton în câteva luni doar pentru că s-a înscris.
 * Reguli AIRON (orientative, nu dintr-un studiu): ce a alergat recent față de distanță și câte săptămâni are.
 */
export function distanceFeasibility(goal: RunGoal, longestRunKm: number | null, weeks: number): { ok: boolean; message: string | null; suggest: RunGoal | null } {
  const long = longestRunKm ?? 0;
  if (goal === 'maraton' && (long < 10 || (long < 16 && weeks < 26) || weeks < 16)) {
    return { ok: false, message: `Cu ${long ? `${long} km cea mai lungă alergare recentă` : 'fără alergări lungi recente'} și ${Math.round(weeks)} săptămâni, maratonul e riscant: baza nu se poate recupera înghesuind. Ia în calcul întâi un semimaraton sau o dată mai târzie.`, suggest: 'semimaraton' };
  }
  if (goal === 'semimaraton' && (long < 5 || (long < 8 && weeks < 12))) {
    return { ok: false, message: `Cu ${long ? `${long} km` : 'nicio alergare lungă'} recent și ${Math.round(weeks)} săptămâni, semimaratonul cere o bază pe care n-o ai încă. Un 10 km întâi sau o dată mai târzie e mai sigur.`, suggest: '10k' };
  }
  if (goal === '10k' && long < 3 && weeks < 8) {
    return { ok: false, message: 'Până la 10 km e drum lung pentru câteva săptămâni pornind aproape de la zero; 5 km întâi e mai realist.', suggest: '5k' };
  }
  return { ok: true, message: null, suggest: null };
}

/** Debutant sau revenire: aproape fără alergare recentă (sub 3 km cea mai lungă) — mers-alergare la început, fără ședințe rapide în bază. */
export function isBeginnerRunner(longestRunKm: number | null | undefined): boolean {
  return longestRunKm != null && longestRunKm < 3;
}
