// Revenirea după pauză: prima activitate (≥ 20 min) după cel puțin 10 zile fără nimic, la un sportiv care înainte
// făcea cel puțin 90 de minute pe săptămână. Atunci calendarul nu continuă faza ca și cum nimic nu s-ar fi întâmplat.
// Regula de produs (v1), nu o lege fiziologică: pragurile sunt alese prudent și se pot recalibra.

import { addDays, diffDays } from '../util/dates.js';

export const PAUSE_MIN_DAYS = 10;
export const PAUSE_MIN_BASE_WEEKLY = 90;

export function detectReturn(acts: { date: string; minutes: number }[], today: string): { zile: number; dela: string } | null {
  const real = acts.filter((a) => a.minutes >= 20 && a.date <= today).sort((a, b) => (a.date < b.date ? 1 : -1));
  const latest = real[0];
  if (!latest || diffDays(latest.date, today) > 1) return null; // revenirea se vede doar azi sau ieri
  const prev = real.find((a) => a.date < latest.date);
  if (!prev) return null;
  const gap = diffDays(prev.date, latest.date) - 1;
  if (gap < PAUSE_MIN_DAYS) return null;
  // Obiceiul de dinainte: 4 săptămâni care se termină la ultima activitate dinainte de pauză.
  const from = addDays(prev.date, -27);
  const before = real.filter((a) => a.date >= from && a.date <= prev.date).reduce((n, a) => n + a.minutes, 0) / 4;
  if (before < PAUSE_MIN_BASE_WEEKLY) return null;
  return { zile: gap, dela: prev.date };
}
