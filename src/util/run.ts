// Ritm și timp la alergare: conversii exacte (fără estimări).

/** „5:30” → 330 s/km. null dacă formatul nu e m:ss. */
export function parsePace(s: string | null | undefined): number | null {
  const m = /^\s*(\d{1,2}):([0-5]\d)\s*$/.exec(s ?? '');
  if (!m) return null;
  const v = Number(m[1]) * 60 + Number(m[2]);
  return v > 0 ? v : null;
}

/** „1:55:00” sau „1:55” (ore:minute) → secunde. null dacă formatul nu se potrivește. */
export function parseDuration(s: string | null | undefined): number | null {
  const t = (s ?? '').trim();
  let m = /^(\d{1,2}):([0-5]\d):([0-5]\d)$/.exec(t);
  if (m) return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
  m = /^(\d{1,2}):([0-5]\d)$/.exec(t);
  if (m) return Number(m[1]) * 3600 + Number(m[2]) * 60;
  return null;
}

export function fmtPaceSec(sec: number): string {
  const r = Math.round(sec);
  return `${Math.floor(r / 60)}:${String(r % 60).padStart(2, '0')}`;
}

export function fmtDuration(sec: number): string {
  const r = Math.round(sec);
  return `${Math.floor(r / 3600)}:${String(Math.floor((r % 3600) / 60)).padStart(2, '0')}:${String(r % 60).padStart(2, '0')}`;
}

export interface RunResult {
  mod: 'ritm' | 'timp';
  /** „5:30” (min/km) sau „1:55:00” (timp final). */
  valoare: string;
}

/** Ritmul (s/km) dintr-un răspuns dat ca ritm sau ca timp final pe distanța cursei. */
export function paceFromResult(r: RunResult | null | undefined, distanceKm: number): number | null {
  if (!r) return null;
  if (r.mod === 'ritm') return parsePace(r.valoare);
  const t = parseDuration(r.valoare);
  return t ? t / distanceKm : null;
}
