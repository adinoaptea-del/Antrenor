// Preferințele de calendar ale sportivului: plecări și întâlniri fixe. Stau pe users.calendar_prefs (schemă veche: gol).
import { one, update } from './db.js';
import type { Away, FixedMeet } from '../../src/calendar/actions.js';

export interface CalendarPrefs {
  plecari: Away[];
  fixe: FixedMeet[];
}

export async function loadPrefs(userId: string): Promise<CalendarPrefs> {
  const row = await one<{ calendar_prefs: Partial<CalendarPrefs> | null }>('users', { id: `eq.${userId}` }, { select: 'calendar_prefs' }).catch(() => null);
  const p = row?.calendar_prefs ?? {};
  return { plecari: Array.isArray(p.plecari) ? p.plecari : [], fixe: Array.isArray(p.fixe) ? p.fixe : [] };
}

export async function savePrefs(userId: string, prefs: CalendarPrefs): Promise<void> {
  await update('users', { id: `eq.${userId}` }, { calendar_prefs: prefs });
}

/** Plecările care încă nu s-au terminat (cele trecute nu mai contează). */
export function currentAway(prefs: CalendarPrefs, today: string): Away[] {
  return prefs.plecari.filter((a) => a.panala >= today);
}
