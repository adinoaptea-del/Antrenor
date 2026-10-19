// „Ziua X din Y”: ziua pregătirii pentru obiectivul de acum, numărată de la prima zi cu plan (crearea primului plan
// pentru obiectiv sau începutul lui, cea mai veche), nu de la începutul planului activ. Refacerea planului nu resetează
// numărătoarea; un plan care începe lunea viitoare nu ține ziua pe 1.

import { diffDays } from '../util/dates.js';

/** Cea mai veche dată cunoscută, dar nu în viitor (o pregătire nu începe după azi). */
export function prepStartOf(dates: (string | null | undefined)[], today: string): string | null {
  const xs = dates.filter((d): d is string => !!d && /^\d{4}-\d{2}-\d{2}/.test(d)).map((d) => d.slice(0, 10)).sort();
  if (!xs.length) return null;
  return xs[0]! > today ? today : xs[0]!;
}

/** Ziua (de la 1) și totalul până la cursă / finalul programului. */
export function prepDay(start: string | null, today: string, end: string | null): { day: number; total: number } | null {
  if (!start || !end) return null;
  const total = diffDays(start, end);
  if (total <= 0) return null;
  return { day: Math.min(total, Math.max(1, diffDays(start, today) + 1)), total };
}
