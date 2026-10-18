// Ritm și timp la alergare: conversii exacte (fără estimări).

/** „5:30” → 330 s/km. null dacă formatul nu e m:ss. */
export function parsePace(s: string | null | undefined): number | null {
  const m = /^\s*(\d{1,2}):([0-5]\d)\s*$/.exec(s ?? '');
  if (!m) return null;
  const v = Number(m[1]) * 60 + Number(m[2]);
  return v > 0 ? v : null;
}

/** Ritm plauzibil pentru un timp de cursă: 2:00–20:00 pe km. */
const PACE_MIN = 120;
const PACE_MAX = 1200;

/**
 * „1:55:00” → secunde. Cu două părți („57:00”, „1:45”) sensul depinde de distanță:
 * pe 5–10 km e minute:secunde (57:00 = 57 de minute), pe semimaraton și maraton e ore:minute (1:45 = 1 h 45).
 * Când se dă distanța, alegem varianta cu ritm plauzibil (2:00–20:00/km); fără distanță, ore:minute (comportamentul vechi).
 */
export function parseDuration(s: string | null | undefined, distanceKm?: number): number | null {
  const t = (s ?? '').trim();
  let m = /^(\d{1,2}):([0-5]\d):([0-5]\d)$/.exec(t);
  if (m) return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
  m = /^(\d{1,2}):([0-5]\d)$/.exec(t);
  if (!m) return null;
  const hm = Number(m[1]) * 3600 + Number(m[2]) * 60;
  const ms = Number(m[1]) * 60 + Number(m[2]);
  if (!distanceKm || distanceKm <= 0) return hm;
  const ok = (sec: number) => sec / distanceKm >= PACE_MIN && sec / distanceKm <= PACE_MAX;
  if (ok(ms) && !ok(hm)) return ms;
  if (ok(hm) && !ok(ms)) return hm;
  // Ambele sau niciuna plauzibile: pe distanțe scurte citim minute:secunde, pe cele lungi ore:minute.
  return distanceKm <= 10 ? ms : hm;
}

export function fmtPaceSec(sec: number): string {
  const r = Math.round(sec);
  return `${Math.floor(r / 60)}:${String(r % 60).padStart(2, '0')}`;
}

/** „57:00” sub o oră, „1:55:00” peste. */
export function fmtDuration(sec: number): string {
  const r = Math.round(sec);
  const h = Math.floor(r / 3600);
  const mm = String(Math.floor((r % 3600) / 60)).padStart(2, '0');
  const ss = String(r % 60).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${Number(mm)}:${ss}`;
}

export interface RunResult {
  mod: 'ritm' | 'timp';
  /** „5:30” (min/km) sau „57:00” / „1:55:00” (timp final). */
  valoare: string;
}

/** Ritmul (s/km) dintr-un răspuns dat ca ritm sau ca timp final pe distanța cursei. */
export function paceFromResult(r: RunResult | null | undefined, distanceKm: number): number | null {
  if (!r) return null;
  if (r.mod === 'ritm') return parsePace(r.valoare);
  const t = parseDuration(r.valoare, distanceKm);
  return t ? t / distanceKm : null;
}
