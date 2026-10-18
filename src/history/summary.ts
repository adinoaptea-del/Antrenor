// Rezumatul istoricului pentru antrenor: tot anul dintr-o privire, nu ședințele brute.
// Volum pe lună și sport, cele mai lungi ședințe, cele mai bune ritmuri pe distanțe, cursele, pauzele lungi,
// consecvența. Doar din activitățile înregistrate (nimic declarat).

import type { Activity, Sport } from '../types.js';
import { addDays, diffDays, weekStart } from '../util/dates.js';

export interface HistorySummary {
  de_la: string | null;
  luni: { luna: string; ore: Partial<Record<Sport, number>>; km: Partial<Record<Sport, number>> }[];
  cele_mai_lungi: { sport: Sport; km: number | null; minute: number; data: string }[];
  /** Cel mai bun ritm mediu (min/km) pe alergările de cel puțin 10 / 21 km. */
  cele_mai_bune_ritmuri: { distanta_min_km: number; ritm_min_km: number; data: string; km: number }[];
  curse: { data: string; sport: Sport; km: number | null; minute: number; nume: string | null }[];
  pauze: { de_la: string; pana_la: string; zile: number }[];
  /** % din săptămâni cu cel puțin 3 ședințe, pe ultimele 52 de săptămâni (din cele cu date). */
  consecventa_pct: number | null;
}

const RACE = /race|cursa|cursă|concurs|maraton|marathon|semimaraton|half|triathlon|triatlon|ironman|70\.3|ultra|trail race|crosul|crosu/i;

export function historySummary(today: string, acts: (Activity & { name?: string | null })[], raceIds: string[] = []): HistorySummary {
  const all = acts.filter((a) => a.date <= today && a.date >= addDays(today, -730)).sort((a, b) => (a.date < b.date ? -1 : 1));
  if (!all.length) return { de_la: null, luni: [], cele_mai_lungi: [], cele_mai_bune_ritmuri: [], curse: [], pauze: [], consecventa_pct: null };
  const r1 = (x: number) => Math.round(x * 10) / 10;

  const byMonth = new Map<string, { ore: Partial<Record<Sport, number>>; km: Partial<Record<Sport, number>> }>();
  for (const a of all) {
    const k = a.date.slice(0, 7);
    const m = byMonth.get(k) ?? { ore: {}, km: {} };
    m.ore[a.sport] = r1((m.ore[a.sport] ?? 0) + a.minutes / 60);
    if (a.distanceKm) m.km[a.sport] = r1((m.km[a.sport] ?? 0) + a.distanceKm);
    byMonth.set(k, m);
  }
  const luni = [...byMonth.entries()].map(([luna, v]) => ({ luna, ...v }));

  const cele_mai_lungi = (['inot', 'bicicleta', 'alergare'] as Sport[])
    .map((s) => all.filter((a) => a.sport === s).sort((a, b) => (b.distanceKm ?? 0) - (a.distanceKm ?? 0) || b.minutes - a.minutes)[0])
    .filter((a): a is Activity => !!a)
    .map((a) => ({ sport: a.sport, km: a.distanceKm ?? null, minute: a.minutes, data: a.date }));

  const cele_mai_bune_ritmuri: HistorySummary['cele_mai_bune_ritmuri'] = [];
  for (const d of [10, 21]) {
    const best = all
      .filter((a) => a.sport === 'alergare' && (a.distanceKm ?? 0) >= d)
      .map((a) => ({ a, p: a.minutes / (a.distanceKm ?? 1) }))
      .sort((x, y) => x.p - y.p)[0];
    if (best) cele_mai_bune_ritmuri.push({ distanta_min_km: d, ritm_min_km: Math.round(best.p * 100) / 100, data: best.a.date, km: r1(best.a.distanceKm ?? 0) });
  }

  const ids = new Set(raceIds);
  const curse = all.filter((a) => ids.has(a.id) || RACE.test(a.name ?? '')).map((a) => ({ data: a.date, sport: a.sport, km: a.distanceKm ?? null, minute: a.minutes, nume: a.name ?? null }));

  const pauze: HistorySummary['pauze'] = [];
  for (let i = 1; i < all.length; i++) {
    const gap = diffDays(all[i - 1]!.date, all[i]!.date);
    if (gap >= 14) pauze.push({ de_la: all[i - 1]!.date, pana_la: all[i]!.date, zile: gap });
  }

  const weeks = new Map<string, number>();
  for (const a of all.filter((x) => x.date >= addDays(today, -364))) weeks.set(weekStart(a.date), (weeks.get(weekStart(a.date)) ?? 0) + 1);
  const first = all.find((a) => a.date >= addDays(today, -364))?.date;
  let total = 0;
  let good = 0;
  if (first) for (let w = weekStart(first); w <= weekStart(today); w = addDays(w, 7)) {
    total += 1;
    if ((weeks.get(w) ?? 0) >= 3) good += 1;
  }
  return { de_la: all[0]!.date, luni, cele_mai_lungi, cele_mai_bune_ritmuri, curse, pauze, consecventa_pct: total ? Math.round((good / total) * 100) : null };
}
