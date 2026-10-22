// Starea unei ședințe schimbate, în câmpuri tipizate (auditul consolidat 22.10.2026, A2).
//
// Până acum starea („mutată de tine”, „vremea: …”, „pusă înapoi”, „plecat”, „ușurată: …”) se citea din începutul notei.
// Progresia și treptele rescriu nota („+10 min: creștere controlată”), deci după ele „Pune înapoi” dădea 409 și
// inversarea după vreme putea muta o ședință pe care sportivul o mutase el. Acum fiecare acțiune care schimbă starea
// scrie `flags` (coloana workouts_planned.flags), iar nota rămâne doar text pentru om. Rândurile vechi, fără `flags`,
// se citesc în continuare din notă (migrarea 0005 le completează o dată, din aceeași regulă).

import type { PlannedWorkout } from '../types.js';

/** Cine/ce a schimbat ședința față de plan. */
export type ChangeOrigin =
  | 'mutare' // sportivul a mutat-o pe altă zi
  | 'usor' // sportivul a cerut „Fă-o ușoară”
  | 'varianta' // sportivul a ales varianta sugerată
  | 'pus_inapoi' // sportivul a pus-o înapoi în ziua din plan („Pune înapoi” / „Lasă-le cum erau”)
  | 'vreme' // inversată automat după prognoză
  | 'vreme_revenit' // făcută oricum în ziua din plan, după ce vremea o mutase
  | 'plecat' // schimbată de o plecare anunțată
  | 'usurare'; // ușurată de aplicație după ședințe nefăcute declarate

export interface WorkoutFlags {
  origin: ChangeOrigin;
  /** Alegerea sportivului: automatizările (vremea, regenerarea) nu o suprascriu fără el. */
  manual_override: boolean;
  /** Doar la inversarea după vreme: motivul (prognoza). */
  weather_swap: { reason: string } | null;
  /** Ziua din plan dinainte de schimbare. */
  original_slot: string | null;
  /** De ce, în cuvinte (pentru om; nu se parsează). */
  change_reason: string | null;
}

const MANUAL: ReadonlySet<ChangeOrigin> = new Set(['mutare', 'usor', 'varianta', 'pus_inapoi']);
/** Stările care țin de o schimbare față de plan: fără `original` nu mai au sens (ședința e cum a fost planificată). */
const NEEDS_ORIGINAL: ReadonlySet<ChangeOrigin> = new Set(['mutare', 'vreme', 'usurare', 'usor']);

export function makeFlags(origin: ChangeOrigin, w: Pick<PlannedWorkout, 'date' | 'original'>, change_reason: string | null, weather?: { reason: string } | null): WorkoutFlags {
  return { origin, manual_override: MANUAL.has(origin), weather_swap: origin === 'vreme' ? (weather ?? { reason: '' }) : null, original_slot: w.original?.date ?? w.date, change_reason };
}

/** Starea din nota veche (rânduri scrise înainte de `flags`). Aceeași regulă ca migrarea 0005. */
export function legacyFlags(w: Pick<PlannedWorkout, 'note' | 'date' | 'original' | 'suggestion'>): WorkoutFlags | null {
  const n = w.note ?? '';
  const slot = w.original?.date ?? null;
  const f = (origin: ChangeOrigin, weather: { reason: string } | null = null): WorkoutFlags => ({ origin, manual_override: MANUAL.has(origin), weather_swap: weather, original_slot: slot, change_reason: n || null });
  if (/^mutată de tine/.test(n)) return f('mutare');
  if (/^pusă înapoi/.test(n)) return f('pus_inapoi');
  if (/^făcută în ziua din plan \(vremea/.test(n)) return f('vreme_revenit');
  if (/^vremea/.test(n)) return f('vreme', { reason: n.replace(/^vremea:\s*/, '').split(';')[0] ?? '' });
  if (/^plecat/.test(n)) return f('plecat');
  if (/^ușurată:/.test(n)) return f('usurare');
  if (/^ușoară la cererea ta/.test(n)) return f('usor');
  if (/^varianta aleasă de tine/.test(n) || w.suggestion?.accepted === true) return f('varianta');
  return null;
}

/**
 * Starea ședinței: din `flags` când există (null = explicit „cum e în plan”), altfel din nota veche.
 * O stare care cere o schimbare față de plan, fără `original`, nu se ia în seamă (ședința a revenit la plan).
 */
export function stateOf(w: PlannedWorkout): WorkoutFlags | null {
  const s = rawState(w);
  if (!s) return null;
  if (NEEDS_ORIGINAL.has(s.origin) && !w.original) return null;
  return s;
}

/** Starea declarată, fără verificarea lui `original` (pentru reguli de protecție: în dubiu, nu atinge). */
export function rawState(w: PlannedWorkout): WorkoutFlags | null {
  return w.flags !== undefined ? w.flags : legacyFlags(w);
}

export const isMovedByAthlete = (w: PlannedWorkout) => stateOf(w)?.origin === 'mutare';
export const isWeatherSwapped = (w: PlannedWorkout) => stateOf(w)?.origin === 'vreme';
export const isAwayChange = (w: PlannedWorkout) => rawState(w)?.origin === 'plecat';
export const isEasedBySystem = (w: PlannedWorkout) => stateOf(w)?.origin === 'usurare';
/** Ce a ales sportivul sau ce a schimbat deja vremea nu se mai atinge automat (regula 36). */
export const lockedForAutomation = (w: PlannedWorkout) => {
  const s = rawState(w);
  return !!s && (s.manual_override || s.origin === 'vreme');
};
/** Motivul inversării după vreme (pentru cardul de pe Acasă). */
export const weatherReason = (w: PlannedWorkout) => stateOf(w)?.weather_swap?.reason ?? '';
