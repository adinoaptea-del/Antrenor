// Preferințele de calendar ale sportivului: plecări și întâlniri fixe. Stau pe users.calendar_prefs (schemă veche: gol).
import { one, update } from './db.js';
import type { Away, FixedMeet } from '../../src/calendar/actions.js';
import { DEFAULT_PREFS, type NutritionPrefs } from '../../src/nutrition/engine.js';
import { DEFAULT_WALK_PROFILE, type WalkProfile } from '../../src/walking/plan.js';

export interface CalendarPrefs {
  plecari: Away[];
  fixe: FixedMeet[];
  /** Unde înoată acum: bazin (implicit) sau ape libere. Schimbă structura ședințelor viitoare de înot, nu istoricul. */
  mediuInot?: 'bazin' | 'ape';
  /** Zilele în care sportivul a confirmat condițiile de ape libere (auditul v93, A43). */
  apeConfirmat?: string[];
  /** Mesele: dietă, alergii (confirmate sau nu), buget, câte mese, alegerile „Schimbă” pe zile. */
  nutritie?: NutritionPrefs;
  /** Mersul pe jos: ținta inițială, capacitatea declarată, mersul alert și jurnalul schimbărilor de țintă. */
  mers?: WalkProfile;
  /** Migrările de plan aplicate o singură dată: „nume@planId” → data (auditul v93, A23). */
  migrari?: Record<string, string>;
}

export async function loadPrefs(userId: string): Promise<CalendarPrefs> {
  const row = await one<{ calendar_prefs: Partial<CalendarPrefs> | null }>('users', { id: `eq.${userId}` }, { select: 'calendar_prefs' }).catch(() => null);
  const p = row?.calendar_prefs ?? {};
  return { plecari: Array.isArray(p.plecari) ? p.plecari : [], fixe: Array.isArray(p.fixe) ? p.fixe : [], mediuInot: p.mediuInot === 'ape' ? 'ape' : 'bazin', apeConfirmat: Array.isArray(p.apeConfirmat) ? p.apeConfirmat.filter((d: unknown) => typeof d === 'string').slice(-30) : [], nutritie: { ...DEFAULT_PREFS, ...(p.nutritie ?? {}) }, mers: walkProfileOf(p.mers), migrari: p.migrari && typeof p.migrari === 'object' ? (p.migrari as Record<string, string>) : {} };
}

/** Profilul de mers, validat (valori lipsă = implicite, jurnalul păstrat întreg). */
export function walkProfileOf(x: Partial<WalkProfile> | null | undefined): WalkProfile {
  const d = DEFAULT_WALK_PROFILE;
  const n = (v: unknown, lo: number, hi: number, def: number) => (typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? Math.round(v) : def);
  return {
    initial: n(x?.initial, 30, 1000, d.initial),
    capacityMin: n(x?.capacityMin, 5, 240, d.capacityMin),
    brisk: x?.brisk === 'da' || x?.brisk === 'nu' ? x.brisk : 'nu_stiu',
    changes: Array.isArray(x?.changes) ? x!.changes.filter((c) => c && typeof c.to === 'number' && typeof c.effectiveWeek === 'string') : [],
  };
}

export async function savePrefs(userId: string, prefs: CalendarPrefs): Promise<void> {
  await update('users', { id: `eq.${userId}` }, { calendar_prefs: prefs });
}

/** Plecările care încă nu s-au terminat (cele trecute nu mai contează). */
export function currentAway(prefs: CalendarPrefs, today: string): Away[] {
  return prefs.plecari.filter((a) => a.panala >= today);
}
