// Utilitare de dată pe string-uri ISO (YYYY-MM-DD), fără fusuri orare: toate calculele sunt pe zile întregi.

const DAY_MS = 86_400_000;

export function toUtc(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) throw new Error(`Dată invalidă: ${iso}`);
  return new Date(Date.UTC(y, m - 1, d));
}

export function fromUtc(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(iso: string, n: number): string {
  return fromUtc(new Date(toUtc(iso).getTime() + n * DAY_MS));
}

/** b − a în zile (pozitiv dacă b e după a). */
export function diffDays(a: string, b: string): number {
  return Math.round((toUtc(b).getTime() - toUtc(a).getTime()) / DAY_MS);
}

/** 0 = luni … 6 = duminică. */
export function weekday(iso: string): 0 | 1 | 2 | 3 | 4 | 5 | 6 {
  const js = toUtc(iso).getUTCDay(); // 0 = duminică
  return ((js + 6) % 7) as 0 | 1 | 2 | 3 | 4 | 5 | 6;
}

/** Luni din săptămâna datei. */
export function weekStart(iso: string): string {
  return addDays(iso, -weekday(iso));
}

export function isBetween(iso: string, from: string, to: string): boolean {
  return diffDays(from, iso) >= 0 && diffDays(iso, to) >= 0;
}

/** Analizele de sânge sunt valabile 12 luni de la recoltare; după aceea nu se mai folosesc. */
export const LABS_VALID_DAYS = 365;
export function labsExpired(drawn: string, today: string): boolean {
  return diffDays(drawn, today) > LABS_VALID_DAYS;
}
