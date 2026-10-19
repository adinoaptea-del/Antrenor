// Starea de azi, în ordinea importanței:
// 1. datele obiective de sănătate: inimă (HRV, puls de repaus), respirație și somn — fiecare dintr-o singură sursă
//    (aleasă în mergeWellness, cu sursa păstrată), comparat cu baseline-ul personal și transformat în 0–100, apoi mediate.
//    Scorul de recuperare al brățării e construit chiar din HRV, puls și somn: NU intră în medie lângă ele (ar număra
//    aceleași dovezi de două ori). Se folosește doar când lipsesc și HRV, și pulsul de repaus, etichetat ca scor
//    proprietar (auditul v2, V2-02);
// 2. cum s-a simțit sportivul (Hooper), care poate doar să coboare verdictul.
// Totul determinist: aceleași cifre dau același verdict.

export type Verdict = 'verde' | 'galben' | 'portocaliu' | 'rosu';

export interface ObjectiveInput {
  hrv: number | null;
  hrvBaseline: number | null;
  rhr: number | null;
  rhrBaseline: number | null;
  resp: number | null;
  respBaseline: number | null;
  /** Scorul de recuperare / readiness al brățării principale (0–100), scara producătorului; nu e mediat între brățări. */
  recovery: number | null;
  sleepMin: number | null;
}

export interface Component {
  valoare: number | null;
  referinta: number | null;
  scor: number | null;
}

export interface ObjectiveReadiness {
  /** Media componentelor disponibile, 0–100. null = nicio componentă. */
  scor: number | null;
  verdict: Verdict | null;
  componente: { inima_hrv: Component; inima_puls: Component; respiratie: Component; recuperare: Component; somn: Component };
  disponibile: number;
}

const clamp = (x: number) => Math.max(0, Math.min(100, Math.round(x)));

export function sleepScore(m: number): number {
  if (m >= 420) return 100;
  if (m >= 360) return 70 + ((m - 360) / 60) * 30;
  if (m >= 300) return 30 + ((m - 300) / 60) * 40;
  if (m >= 240) return ((m - 240) / 60) * 30;
  return 0;
}

/** Praguri (recuperare, somn și media lor): peste 70 verde, 50–70 galben, 30–50 portocaliu, sub 30 roșu. */
export function levelFromScore(s: number | null): Verdict | null {
  if (s == null) return null;
  return s >= 70 ? 'verde' : s >= 50 ? 'galben' : s >= 30 ? 'portocaliu' : 'rosu';
}
export const verdictFromScore = levelFromScore;

export function objectiveReadiness(i: ObjectiveInput): ObjectiveReadiness {
  // HRV: la baseline sau peste = 100; −10% = 70; −20% = 40; −33% sau mai jos = 0.
  const hrv = i.hrv != null && i.hrvBaseline ? clamp(100 - (1 - i.hrv / i.hrvBaseline) * 300) : null;
  // Puls de repaus: la baseline sau sub = 100; +5 bpm = 50; +10 bpm = 0.
  const rhr = i.rhr != null && i.rhrBaseline != null ? clamp(100 - Math.max(0, i.rhr - i.rhrBaseline) * 10) : null;
  // Respirație: până la +0,5 respirații/min = 100; +1 = 80; +2 = 40; +3 = 0 (crește înainte de boală).
  const resp = i.resp != null && i.respBaseline != null ? clamp(100 - Math.max(0, i.resp - i.respBaseline - 0.5) * 40) : null;
  const rec = i.recovery != null ? clamp(i.recovery) : null;
  // Somn (aliniat cu regulile Fiziologului: sub 6 h galben, sub 5 h roșu): 7 h sau peste = 100; 6 h = 70; 5 h = 30; 4 h = 0.
  const sleep = i.sleepMin != null ? clamp(sleepScore(i.sleepMin)) : null;
  // Scorul proprietar doar ca înlocuitor al inimii (HRV și puls lipsă), nu ca dovadă în plus.
  const recUsed = hrv == null && rhr == null ? rec : null;
  const parts = [hrv, rhr, resp, recUsed, sleep].filter((x): x is number => x != null);
  const scor = parts.length ? clamp(parts.reduce((a, b) => a + b, 0) / parts.length) : null;
  return {
    scor,
    verdict: verdictFromScore(scor),
    disponibile: parts.length,
    componente: {
      inima_hrv: { valoare: i.hrv, referinta: i.hrvBaseline, scor: hrv },
      inima_puls: { valoare: i.rhr, referinta: i.rhrBaseline, scor: rhr },
      respiratie: { valoare: i.resp, referinta: i.respBaseline, scor: resp },
      recuperare: { valoare: i.recovery, referinta: null, scor: recUsed },
      somn: { valoare: i.sleepMin, referinta: 420, scor: sleep },
    },
  };
}

const RANK: Record<Verdict, number> = { verde: 0, galben: 1, portocaliu: 2, rosu: 3 };

/** Răspunsul sportivului când brățările n-au date: „ești odihnit și apt de antrenament azi?”. */
export type Apt = 'da' | 'partial' | 'nu';

export interface DayContext {
  /** Răspunsul la „ești apt?” (doar când lipsesc datele brățărilor). */
  apt?: Apt | null;
  /** Ieri a fost un efort peste plan: azi contează și durerile musculare (brățara nu vede oboseala musculară). */
  efortIeri?: boolean;
  /** Hooper „dureri” (1–7), răspunsul de azi. */
  dureri?: number | null;
}

/**
 * Verdictul zilei din cod: întâi datele obiective (brățările), apoi cum te simți (Hooper), care doar poate coborî.
 * Fără date de la brățări (dată jos, descărcată, stricată): nu ghicim și nu dăm automat galben — sportivul spune dacă
 * e apt (el știe cât a dormit). Fără răspuns: `intrebare` = true, verdictul rămâne de decis.
 * După un efort peste plan, durerile musculare mari (≥ 5 din 7) coboară ziua la galben: HRV-ul nu vede oboseala musculară.
 */
export function dayVerdict(obj: ObjectiveReadiness, hooperSum: number | null, ctx: DayContext = {}): { verdict: Verdict; motiv: string; intrebare?: boolean } {
  let v: Verdict;
  let motiv: string;
  let intrebare = false;
  if (obj.verdict) {
    v = obj.verdict;
    motiv = `date obiective ${obj.scor}/100 (${obj.disponibile} din 5 măsurate)`;
  } else if (ctx.apt) {
    v = ctx.apt === 'da' ? 'verde' : ctx.apt === 'partial' ? 'galben' : 'rosu';
    motiv = `fără date de la brățări; ai spus că ${ctx.apt === 'da' ? 'ești odihnit și apt' : ctx.apt === 'partial' ? 'ești doar parțial odihnit' : 'nu ești apt azi'}`;
  } else {
    v = 'galben';
    motiv = 'fără date de la brățări azi: întrebăm sportivul dacă e apt';
    intrebare = true;
  }
  if (hooperSum != null) {
    const felt: Verdict = hooperSum >= 24 ? 'rosu' : hooperSum >= 22 ? 'portocaliu' : hooperSum >= 20 ? 'galben' : 'verde';
    if (RANK[felt] > RANK[v]) {
      v = felt;
      motiv += `; cum te simți (Hooper ${hooperSum}) coboară la ${felt}`;
    }
  }
  if (ctx.efortIeri && (ctx.dureri ?? 0) >= 5 && RANK[v] < RANK.galben) {
    v = 'galben';
    motiv += `; dureri musculare ${ctx.dureri}/7 după efortul de ieri`;
  }
  return intrebare ? { verdict: v, motiv, intrebare } : { verdict: v, motiv };
}

/**
 * Suma Hooper (somn, oboseală, stres, dureri; 1–7 fiecare, 4–28 total) și din răspunsuri parțiale:
 * media celor răspunse × 4, ca pragurile să rămână aceleași. Fără niciun răspuns: null.
 */
export function hooperSum(h: { somn: number | null; oboseala: number | null; stres: number | null; dureri: number | null } | null | undefined): { suma: number | null; raspunse: number } {
  const xs = h ? [h.somn, h.oboseala, h.stres, h.dureri].filter((x): x is number => typeof x === 'number') : [];
  // Totalul (și culoarea din chestionar) doar cu cel puțin 3 din 4 răspunsuri; cu 1–2 răspunsuri nu inventăm
  // celelalte: răspunsurile ajung la fiziolog una câte una, dar nu fac un total.
  if (xs.length < 3) return { suma: null, raspunse: xs.length };
  return { suma: Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 4), raspunse: xs.length };
}
