// Ce a demonstrat sportivul pe fiecare sport (corecția proprietarului, 20.10.2026): „30 min de Z2 e doza unui
// sedentar”. Ședințele ușoare nu coboară sub durata obișnuită a sportivului din ultimele 6 săptămâni; ieșirea lungă
// pornește de la ce a alergat deja. Minimul absolut pe sport (MIN_SESSION_MIN) rămâne doar pentru cine n-are istoric.

import type { PlannedWorkout, Sport } from '../types.js';
import { diffDays } from '../util/dates.js';

export interface Demonstrated {
  /** Durata obișnuită a unei ședințe ușoare (mediana, rotunjită la 5 min), pe sport. */
  easy: Partial<Record<Sport, number>>;
  /** Cea mai lungă ședință din fereastră (min), pe sport. */
  longest: Partial<Record<Sport, number>>;
  /** Câte ședințe au intrat în calcul, pe sport (dovada). */
  n: Partial<Record<Sport, number>>;
}

/** Ce intră în „ședința obișnuită” (min–max minute) și plafonul podelei, pe sport. */
const RANGE: Partial<Record<Sport, { lo: number; hi: number; cap: number }>> = {
  alergare: { lo: 20, hi: 90, cap: 60 },
  bicicleta: { lo: 30, hi: 150, cap: 90 },
  inot: { lo: 20, hi: 90, cap: 60 },
};
export const DEMONSTRATED_WINDOW_DAYS = 42;
const MIN_SESSIONS = 3;
const r5 = (x: number) => Math.round(x / 5) * 5;

export function demonstrated(acts: { date: string; sport: Sport; minutes: number }[], today: string, days = DEMONSTRATED_WINDOW_DAYS): Demonstrated {
  const out: Demonstrated = { easy: {}, longest: {}, n: {} };
  const recent = acts.filter((a) => diffDays(a.date, today) >= 0 && diffDays(a.date, today) <= days);
  for (const sport of Object.keys(RANGE) as Sport[]) {
    const r = RANGE[sport]!;
    const all = recent.filter((a) => a.sport === sport && a.minutes > 0);
    if (all.length) out.longest[sport] = Math.max(...all.map((a) => a.minutes));
    const xs = all.map((a) => a.minutes).filter((m) => m >= r.lo && m <= r.hi).sort((a, b) => a - b);
    out.n[sport] = xs.length;
    if (xs.length < MIN_SESSIONS) continue;
    const mid = xs.length % 2 ? xs[(xs.length - 1) / 2]! : (xs[xs.length / 2 - 1]! + xs[xs.length / 2]!) / 2;
    out.easy[sport] = Math.min(r.cap, r5(mid));
  }
  return out;
}

/** Podeaua unei ședințe ușoare pe sport: în descărcare și taper, 80% din ce e obișnuit. */
export function easyFloor(dem: Demonstrated | undefined, sport: Sport, light = false): number | null {
  const e = dem?.easy[sport];
  if (!e) return null;
  return light ? r5(e * 0.8) : e;
}

/** Ieșirea lungă de la care pornește triatlonul: ~80% din cea mai lungă alergare recentă (45–105 min). */
export function longRunStart(dem: Demonstrated | undefined): number | null {
  const l = dem?.longest.alergare;
  if (!l || l < 45) return null;
  return Math.max(45, Math.min(105, r5(l * 0.8)));
}

/**
 * Planul deja activ: ședințele ușoare viitoare (z2 / tehnică, fără cheie, neschimbate de o regulă de sănătate sau de
 * alegerea sportivului) urcă la durata obișnuită. Întoarce doar ședințele schimbate (fără structura rescrisă: o face
 * apelantul cu aceleași funcții ca generatorul).
 */
export function raiseToDemonstrated(plan: PlannedWorkout[], today: string, dem: Demonstrated): PlannedWorkout[] {
  const out: PlannedWorkout[] = [];
  for (const w of plan) {
    if (w.date < today || (w.status !== 'planificat' && w.status !== 'mutat') || w.key) continue;
    if (w.type !== 'z2' && w.type !== 'tehnica') continue;
    if (w.note || w.suggestion?.accepted === true) continue; // schimbată de reguli sau aleasă de sportiv
    const f = easyFloor(dem, w.sport);
    if (!f || w.plannedMinutes >= f) continue;
    out.push({ ...w, plannedMinutes: f });
  }
  return out;
}
