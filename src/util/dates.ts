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

/** Momentul UTC (ISO) în care începe ziua locală `date` în fusul IANA `tz` (ex. 2026-10-17, Europe/Bucharest → 2026-10-16T21:00:00.000Z). */
export function localDayStartUtc(date: string, tz: string): string {
  return localTimeUtc(date, 0, tz);
}

/**
 * Momentul UTC (ISO) al orei locale `date` + `minutes` (de la miezul nopții) în fusul `tz`. Offsetul se ia la momentul
 * acela, nu la miezul nopții: 10:00 în ziua trecerii la ora de iarnă e la 08:00 UTC, nu 07:00.
 */
export function localTimeUtc(date: string, minutes: number, tz: string): string {
  const guess = toUtc(date).getTime() + minutes * 60_000;
  const offsetAt = (ms: number) => {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(ms));
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
    return Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second')) - ms;
  };
  // Două treceri: offsetul se ia la momentul găsit, nu la miezul nopții UTC (contează în zilele cu schimbarea orei).
  let t = guess - offsetAt(guess);
  t = guess - offsetAt(t);
  return new Date(t).toISOString();
}

/** Un fus orar IANA valid (ex. „Europe/Bucharest”), verificat cu Intl; altfel null. Telefonul îl trimite la fiecare citire. */
export function validTz(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length > 64 || !/^[A-Za-z_]+(\/[A-Za-z0-9_+-]+)+$/.test(raw)) return null;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: raw });
    return raw;
  } catch {
    return null;
  }
}
