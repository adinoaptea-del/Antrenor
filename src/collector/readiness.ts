// Starea de azi, în ordinea importanței:
// 1. datele obiective de sănătate: inimă (HRV, puls de repaus), respirație, recuperarea/readiness-ul brățărilor, somnul,
//    fiecare comparat cu baseline-ul personal și transformat în 0–100, apoi mediate;
// 2. cum s-a simțit sportivul (Hooper), care poate doar să coboare verdictul.
// Totul determinist: aceleași cifre dau același verdict.

export type Verdict = 'verde' | 'galben' | 'rosu';

export interface ObjectiveInput {
  hrv: number | null;
  hrvBaseline: number | null;
  rhr: number | null;
  rhrBaseline: number | null;
  resp: number | null;
  respBaseline: number | null;
  /** Scorul de recuperare / readiness al brățărilor (0–100), deja mediat între brățări. */
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

function sleepScore(m: number): number {
  if (m >= 420) return 100;
  if (m >= 360) return 70 + ((m - 360) / 60) * 30;
  if (m >= 300) return 30 + ((m - 300) / 60) * 40;
  if (m >= 240) return ((m - 240) / 60) * 30;
  return 0;
}

/** Praguri: ≥ 70 verde, 50–69 galben, sub 50 roșu. */
export function verdictFromScore(s: number | null): Verdict | null {
  if (s == null) return null;
  return s >= 70 ? 'verde' : s >= 50 ? 'galben' : 'rosu';
}

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
  const parts = [hrv, rhr, resp, rec, sleep].filter((x): x is number => x != null);
  const scor = parts.length ? clamp(parts.reduce((a, b) => a + b, 0) / parts.length) : null;
  return {
    scor,
    verdict: verdictFromScore(scor),
    disponibile: parts.length,
    componente: {
      inima_hrv: { valoare: i.hrv, referinta: i.hrvBaseline, scor: hrv },
      inima_puls: { valoare: i.rhr, referinta: i.rhrBaseline, scor: rhr },
      respiratie: { valoare: i.resp, referinta: i.respBaseline, scor: resp },
      recuperare: { valoare: i.recovery, referinta: null, scor: rec },
      somn: { valoare: i.sleepMin, referinta: 420, scor: sleep },
    },
  };
}

const RANK: Record<Verdict, number> = { verde: 0, galben: 1, rosu: 2 };

/**
 * Verdictul zilei din cod: întâi datele obiective, apoi cum s-a simțit (Hooper) — care doar poate coborî.
 * Fără date obiective: cel mult galben (nu dăm verde pe senzație).
 */
export function dayVerdict(obj: ObjectiveReadiness, hooperSum: number | null): { verdict: Verdict; motiv: string } {
  let v: Verdict = obj.verdict ?? 'galben';
  let motiv = obj.verdict ? `date obiective ${obj.scor}/100 (${obj.disponibile} din 5 măsurate)` : 'fără date obiective de la brățări: cel mult galben';
  if (hooperSum != null) {
    const felt: Verdict = hooperSum >= 24 ? 'rosu' : hooperSum >= 20 ? 'galben' : 'verde';
    if (RANK[felt] > RANK[v]) {
      v = felt;
      motiv += `; cum te simți (Hooper ${hooperSum}) coboară la ${felt}`;
    }
  }
  return { verdict: v, motiv };
}
