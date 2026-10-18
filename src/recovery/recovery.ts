// Recuperarea: somnul, plus ce faci între antrenamente (saună, baie rece, meditație, respirație, yoga, stretching,
// masaj, plimbare). Vine de pe brățări (WHOOP, Strava, Apple Health) sau o adaugă sportivul, cu minutele.
//
// Cum răspunde corpul TĂU: dimineața de după fiecare tip de recuperare, HRV-ul și pulsul de repaus față de media ta
// din cele 7 zile dinainte, comparate cu diminețile fără nicio recuperare. Doar cu cel puțin 4 dimineți de fiecare fel
// și scris ca asociere, nu cauză: în zilele cu saună poate ai și dormit mai bine.

import type { OtherActivity } from '../collector/other.js';
import { addDays } from '../util/dates.js';

export const MANUAL_TYPES = ['saună', 'baie rece', 'meditație', 'respirație', 'yoga', 'stretching', 'masaj', 'plimbare'] as const;
export type ManualType = (typeof MANUAL_TYPES)[number];

export interface DayWell {
  date: string;
  hrv: number | null;
  rhr: number | null;
  sleepMin: number | null;
}

export interface RecoverySession {
  id: string;
  date: string;
  name: string;
  minutes: number;
  source: string;
  avgHr: number | null;
  /** Dimineața de după: HRV și puls față de media ta din cele 7 zile dinainte. null = fără date. */
  nextHrvPct: number | null;
  nextRhrDelta: number | null;
}

export interface RecoveryEffect {
  name: string;
  /** Câte dimineți de după. */
  n: number;
  /** HRV-ul dimineții de după, față de media de 7 zile, în medie (%); comparat cu diminețile fără recuperare. */
  hrvPct: number;
  hrvPctNone: number;
  rhrDelta: number;
  rhrDeltaNone: number;
  nNone: number;
}

export interface RecoverySummary {
  sessions: RecoverySession[];
  minutes7: number;
  effects: RecoveryEffect[];
}

function mean(xs: number[]): number | null {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

/** Dimineața de după `date`: HRV și puls față de media celor 7 zile dinainte de `date`. */
function nextMorning(date: string, byDate: Map<string, DayWell>): { hrvPct: number | null; rhrDelta: number | null } {
  const next = byDate.get(addDays(date, 1));
  const prev = Array.from({ length: 7 }, (_, k) => byDate.get(addDays(date, -k))).filter((x): x is DayWell => !!x);
  const hrvBase = mean(prev.map((p) => p.hrv).filter((x): x is number => x != null));
  const rhrBase = mean(prev.map((p) => p.rhr).filter((x): x is number => x != null));
  return {
    hrvPct: next?.hrv != null && hrvBase ? Math.round(((next.hrv - hrvBase) / hrvBase) * 1000) / 10 : null,
    rhrDelta: next?.rhr != null && rhrBase != null ? Math.round((next.rhr - rhrBase) * 10) / 10 : null,
  };
}

export function recoverySummary(today: string, others: OtherActivity[], wellness: DayWell[]): RecoverySummary {
  const rec = others.filter((o) => o.kind === 'recuperare');
  const byDate = new Map(wellness.map((w) => [w.date, w]));
  const sessions: RecoverySession[] = rec
    .filter((o) => o.date >= addDays(today, -14))
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .map((o) => {
      const nm = nextMorning(o.date, byDate);
      return { id: o.id, date: o.date, name: o.name, minutes: o.minutes, source: o.source, avgHr: o.avgHr, nextHrvPct: nm.hrvPct, nextRhrDelta: nm.rhrDelta };
    });
  const minutes7 = rec.filter((o) => o.date > addDays(today, -7)).reduce((n, o) => n + o.minutes, 0);

  // Asocierile personale, pe ultimele 90 de zile.
  const from = addDays(today, -90);
  const recDays = new Set(rec.filter((o) => o.date >= from).map((o) => o.date));
  const noneDays: string[] = [];
  for (let d = from; d < today; d = addDays(d, 1)) if (!recDays.has(d)) noneDays.push(d);
  const noneVals = noneDays.map((d) => nextMorning(d, byDate)).filter((x) => x.hrvPct != null);
  const effects: RecoveryEffect[] = [];
  const names = [...new Set(rec.map((o) => o.name))];
  for (const name of names) {
    const days = [...new Set(rec.filter((o) => o.name === name && o.date >= from).map((o) => o.date))];
    const vals = days.map((d) => nextMorning(d, byDate)).filter((x) => x.hrvPct != null);
    if (vals.length < 4 || noneVals.length < 4) continue;
    const r = (x: number | null) => Math.round((x ?? 0) * 10) / 10;
    effects.push({
      name,
      n: vals.length,
      hrvPct: r(mean(vals.map((v) => v.hrvPct!))),
      hrvPctNone: r(mean(noneVals.map((v) => v.hrvPct!))),
      rhrDelta: r(mean(vals.map((v) => v.rhrDelta).filter((x): x is number => x != null))),
      rhrDeltaNone: r(mean(noneVals.map((v) => v.rhrDelta).filter((x): x is number => x != null))),
      nNone: noneVals.length,
    });
  }
  return { sessions, minutes7, effects };
}
