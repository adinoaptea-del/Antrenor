// Jurnalul meselor (auditul v93, A84 / T58): ce s-a propus, ce a acceptat sportivul, ce a înlocuit și ce a mâncat sunt
// patru lucruri diferite și se țin separat. Zilele trecute se citesc din jurnal, nu se regenerează cu preferințele de
// acum: o preferință nouă (dietă, alergie, buget) schimbă meniurile de azi înainte, nu istoria.
//
//  - suggested: rețeta propusă de cod pentru slot (ultima arătată în ziua ei, cât timp sportivul n-a făcut nimic cu ea);
//  - accepted: sportivul a confirmat propunerea;
//  - replaced: sportivul a ales altă rețetă cu „Schimbă” (replacedBy);
//  - consumed: sportivul a spus că a mâncat (rețeta mâncată = replacedBy ?? suggested). Necunoscut rămâne null.
// O zi trecută nu se mai rescrie: recordSuggested refuză datele dinaintea zilei curente.

import type { Slot } from './recipes.js';

export interface MealLogEntry {
  slot: Slot;
  suggested: string;
  accepted: boolean;
  replacedBy: string | null;
  /** true = mâncat, false = nemâncat, null = nedeclarat. */
  consumed: boolean | null;
  /** Ultima schimbare (ISO). */
  at: string;
}
export type MealLog = Record<string, MealLogEntry[]>;
export type MealState = 'suggested' | 'accepted' | 'replaced' | 'consumed';

/** Cât păstrăm (zile): destul pentru ferestrele de varietate (selectDays pornește cu cel mult 119 zile în urmă). */
export const LOG_KEEP_DAYS = 120;

const acted = (e: MealLogEntry) => e.accepted || e.replacedBy != null || e.consumed != null;

/** Starea unei mese din jurnal (consumat > înlocuit > acceptat > propus). */
export function stateOf(e: MealLogEntry): MealState {
  if (e.consumed === true) return 'consumed';
  if (e.replacedBy != null) return 'replaced';
  if (e.accepted) return 'accepted';
  return 'suggested';
}

/** Rețeta zilei pentru slot, după alegerea sportivului (înlocuită sau propusă). */
export const finalRecipe = (e: MealLogEntry) => e.replacedBy ?? e.suggested;

/**
 * Scrie propunerile zilei. Doar pentru ziua curentă (`today`): zilele trecute nu se rescriu. Un slot pe care sportivul
 * l-a atins (acceptat, înlocuit, mâncat) rămâne cum e; un slot neatins primește ultima propunere arătată.
 */
export function recordSuggested(log: MealLog, date: string, meals: { slot: Slot; recipeId: string }[], today: string, at = new Date().toISOString()): MealLog {
  if (date !== today) return log;
  const cur = [...(log[date] ?? [])];
  for (const m of meals) {
    const k = cur.findIndex((e) => e.slot === m.slot);
    if (k < 0) cur.push({ slot: m.slot, suggested: m.recipeId, accepted: false, replacedBy: null, consumed: null, at });
    else if (!acted(cur[k]!) && cur[k]!.suggested !== m.recipeId) cur[k] = { ...cur[k]!, suggested: m.recipeId, at };
  }
  return { ...log, [date]: cur };
}

/** „Schimbă”: recipeId = altă rețetă (replaced), aceeași rețetă (accepted), null = înapoi la propunere. */
export function recordChoice(log: MealLog, date: string, slot: Slot, recipeId: string | null, suggested?: string | null, at = new Date().toISOString()): MealLog {
  const cur = [...(log[date] ?? [])];
  const k = cur.findIndex((e) => e.slot === slot);
  const e: MealLogEntry = k >= 0 ? cur[k]! : { slot, suggested: suggested ?? recipeId ?? '', accepted: false, replacedBy: null, consumed: null, at };
  if (!e.suggested) return log;
  const next: MealLogEntry = recipeId == null ? { ...e, replacedBy: null, accepted: false, at } : recipeId === e.suggested ? { ...e, replacedBy: null, accepted: true, at } : { ...e, replacedBy: recipeId, accepted: false, at };
  if (k >= 0) cur[k] = next;
  else cur.push(next);
  return { ...log, [date]: cur };
}

/** „Am mâncat” / „N-am mâncat” / null = retrage declarația. */
export function recordConsumed(log: MealLog, date: string, slot: Slot, consumed: boolean | null, at = new Date().toISOString()): MealLog {
  const cur = [...(log[date] ?? [])];
  const k = cur.findIndex((e) => e.slot === slot);
  if (k < 0) return log;
  cur[k] = { ...cur[k]!, consumed, at };
  return { ...log, [date]: cur };
}

/** Rețetele finale ale zilei din jurnal (pentru varietate), sau null dacă ziua nu e în jurnal. */
export function loggedPicks(log: MealLog | undefined, date: string): Partial<Record<Slot, string>> | null {
  const day = log?.[date];
  if (!day?.length) return null;
  return Object.fromEntries(day.map((e) => [e.slot, finalRecipe(e)])) as Partial<Record<Slot, string>>;
}

/** Ce s-a mâncat declarat (doar consumed = true): o masă înlocuită nu apare ca mâncată. */
export function consumedOn(log: MealLog | undefined, date: string): { slot: Slot; recipeId: string }[] {
  return (log?.[date] ?? []).filter((e) => e.consumed === true).map((e) => ({ slot: e.slot, recipeId: finalRecipe(e) }));
}

/** Păstrează doar zilele de la `keepFrom` încoace (ex. azi − LOG_KEEP_DAYS). */
export function pruneLog(log: MealLog, keepFrom: string): MealLog {
  return Object.fromEntries(Object.entries(log).filter(([d]) => d >= keepFrom));
}
