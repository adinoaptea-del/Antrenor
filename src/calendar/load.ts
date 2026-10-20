// Echivalarea efortului: cât a primit inima, pe aceeași scară pentru ce ai făcut și ce era planificat.
//
// Metoda: TRIMP Edwards (1993) — minute în fiecare zonă de puls × ponderea zonei (Z1 = 1 … Z5 = 5).
//  - Activitatea: din minutele măsurate în zone (cu zonele tale), când ceasul a avut puls pe cel puțin jumătate din
//    ședință; minutele fără puls se socotesc în proporția celor măsurate.
//  - Fără puls: din RPE-ul declarat (scala CR-10 a lui Foster), tradus în zonă după corespondența uzuală
//    RPE 1–2 = Z1, 3–4 = Z2, 5–6 = Z3, 7–8 = Z4, 9–10 = Z5.
//  - Fără puls și fără RPE: nu echivalăm (null) și cerem RPE-ul. Nu ghicim.
//  - Ședința planificată: aceeași formulă, din minutele și zonele prescrise (intervalele în zona lor, restul în Z1–Z2).
//
// Efortul cardio se adună peste sporturi; efectul specific nu: o ședință-cheie de alergare nu e „acoperită” de bicicletă.

import type { Activity, PlannedWorkout, Sport, Zone } from '../types.js';
import { matchActivities } from '../scoring/match.js';
import { addDays } from '../util/dates.js';

export type LoadMethod = 'zone' | 'rpe';
export interface Load {
  trimp: number;
  method: LoadMethod;
}

const W: Record<Zone, number> = { 1: 1, 2: 2, 3: 3, 4: 4, 5: 5 };

export function rpeZone(rpe: number): Zone {
  if (rpe <= 2) return 1;
  if (rpe <= 4) return 2;
  if (rpe <= 6) return 3;
  if (rpe <= 8) return 4;
  return 5;
}

/** Efortul unei activități făcute. null = nu se poate echivala (fără puls și fără RPE). */
export function activityLoad(a: Pick<Activity, 'minutes' | 'timeInZonesMin'>, rpe?: number | null): Load | null {
  const tiz = a.timeInZonesMin;
  if (tiz) {
    const measured = (Object.entries(tiz) as [string, number][]).reduce((n, [, m]) => n + (m ?? 0), 0);
    if (measured >= a.minutes * 0.5 && measured > 0) {
      const raw = (Object.entries(tiz) as [string, number][]).reduce((n, [z, m]) => n + (m ?? 0) * (W[Number(z) as Zone] ?? 0), 0);
      return { trimp: Math.round((raw * a.minutes) / measured), method: 'zone' };
    }
  }
  if (rpe != null && rpe > 0) return { trimp: Math.round(a.minutes * W[rpeZone(rpe)]), method: 'rpe' };
  return null;
}

/** Efortul unei ședințe planificate, din prescripție. */
export function plannedLoad(w: Pick<PlannedWorkout, 'plannedMinutes' | 'targetZones' | 'intervals' | 'type' | 'sport'>): number {
  if (w.type === 'odihna') return 0;
  const m = w.plannedMinutes;
  const zones: Zone[] = w.targetZones.length ? w.targetZones : [2];
  // Intervalele: repetările în zona lor, restul (încălzire, pauze, revenire) în Z1–Z2 (pondere 1,5).
  if (w.intervals && w.intervals.count > 0) {
    const work = Math.min(m, w.intervals.count * w.intervals.minutes);
    return Math.round(work * W[w.intervals.zone] + (m - work) * 1.5);
  }
  const avg = zones.reduce((n, z) => n + W[z], 0) / zones.length;
  return Math.round(m * avg);
}

export interface CoverOption {
  id: string;
  /** Pentru sportiv și pentru agenți. */
  text: string;
  /** Ce se schimbă în plan dacă e aleasă. */
  changes: { workoutId: string; action: 'anuleaza' | 'scurteaza'; minutes?: number }[];
}

export interface DayCoverage {
  date: string;
  /** TRIMP făcut azi (toate activitățile echivalabile). */
  facut: number;
  /** TRIMP planificat azi (toate ședințele zilei). */
  planificat: number;
  /** facut / planificat, în %. null fără plan. */
  procent: number | null;
  /** Activități de azi fără puls și fără RPE: nu s-au putut echivala. */
  neechivalate: string[];
  /** acoperit = ai făcut cel puțin cât era planificat; partial = mai e loc; fara_plan = zi fără ședințe. */
  stare: 'acoperit' | 'partial' | 'fara_plan';
  /** Doar la „partial”: variantele calculate din cod; agenții aleg una, nu inventează alta. */
  optiuni: CoverOption[];
  /** Varianta din cod, dacă agenții nu răspund. */
  implicit: string | null;
}

const SPORT: Record<Sport, string> = { inot: 'înot', bicicleta: 'bicicletă', alergare: 'alergare', forta: 'forță', mers: 'mers' };

/**
 * Cât din ziua planificată a acoperit ce ai făcut deja. Se calculează doar când azi a apărut ceva în plus față de plan
 * (o activitate neplanificată sau una mult peste ședința ei) — `extra` = true.
 */
export function dayCoverage(input: {
  date: string;
  plan: PlannedWorkout[];
  acts: (Pick<Activity, 'id' | 'sport' | 'minutes' | 'timeInZonesMin'> & { rpe?: number | null })[];
  /** Ședințele de azi deja făcute (legate de o activitate). */
  doneIds: string[];
  /** Sporturile rămase în urmă în ultimele 3 săptămâni: au prioritate în varianta implicită. */
  behind?: Sport[];
}): DayCoverage {
  const today = input.plan.filter((w) => w.date === input.date && w.type !== 'odihna' && (w.status === 'planificat' || w.status === 'mutat'));
  const planificat = today.reduce((n, w) => n + plannedLoad(w), 0);
  const neechivalate: string[] = [];
  let facut = 0;
  for (const a of input.acts) {
    const l = activityLoad(a, a.rpe);
    if (l) facut += l.trimp;
    else neechivalate.push(a.id);
  }
  if (!today.length || planificat === 0) return { date: input.date, facut, planificat: 0, procent: null, neechivalate, stare: 'fara_plan', optiuni: [], implicit: null };
  const procent = Math.round((facut / planificat) * 100);
  const remaining = today.filter((w) => !input.doneIds.includes(w.id));
  if (facut >= planificat || !remaining.length) return { date: input.date, facut, planificat, procent, neechivalate, stare: 'acoperit', optiuni: [], implicit: null };

  const rest = planificat - facut;
  const doneSports = new Set(input.acts.map((a) => a.sport));
  const optiuni: CoverOption[] = [];
  for (const w of remaining) {
    const full = plannedLoad(w);
    const per = full / Math.max(1, w.plannedMinutes);
    const fit = Math.floor(rest / per / 5) * 5;
    if (full <= rest * 1.1) optiuni.push({ id: `intreg-${w.id}`, text: `${SPORT[w.sport]} cum e în plan (${w.plannedMinutes} min)`, changes: [] });
    else if (fit >= 20) optiuni.push({ id: `scurt-${w.id}`, text: `${SPORT[w.sport]} rămâne, cu varianta scurtă propusă: ${fit} min (cât a mai rămas din efortul zilei)`, changes: [{ workoutId: w.id, action: 'scurteaza', minutes: fit }] });
  }
  optiuni.push({ id: 'ajunge', text: 'efortul zilei e făcut: ședințele rămase rămân în plan, cu variantă ușoară propusă', changes: remaining.map((w) => ({ workoutId: w.id, action: 'anuleaza' as const })) });
  // Celelalte ședințe rămase azi nu se taie (regula proprietarului, 20.10.2026): primesc doar sugestia ușoară.
  for (const o of optiuni) {
    if (o.id === 'ajunge') continue;
    const keep = o.id.replace(/^(intreg|scurt)-/, '');
    for (const w of remaining) if (w.id !== keep) o.changes.push({ workoutId: w.id, action: 'anuleaza' });
  }
  // „anuleaza” e aplicat în src/calendar/adapt.ts ca sugestie ușoară, nu ca anulare.
  // Implicit (fără agenți): ce a rămas e puțin (sub 20% din zi) → ajunge; altfel ședința din alt sport decât ce ai făcut
  // (cardio e făcut, dar sportul celălalt are nevoie de stimulul lui), apoi cea scurtată.
  const sportOf = (o: CoverOption) => remaining.find((w) => o.id.endsWith(w.id))?.sport as Sport | undefined;
  const behind = optiuni.find((o) => o.id !== 'ajunge' && (input.behind ?? []).includes(sportOf(o) as Sport));
  const other = optiuni.find((o) => o.id !== 'ajunge' && !doneSports.has(sportOf(o) as Sport));
  const implicit = rest < planificat * 0.2 && !behind ? 'ajunge' : (behind ?? other ?? optiuni[0]!).id;
  return { date: input.date, facut, planificat, procent, neechivalate, stare: 'partial', optiuni, implicit };
}

type ActWithRpe = Activity & { rpe?: number | null };

/**
 * A apărut azi ceva în plus față de plan? O activitate în afara planului (≥ 20 min) sau una cu efort mult peste ședința
 * ei (peste 130%). Doar atunci se face echivalarea zilei.
 */
export function extraOn(date: string, plan: PlannedWorkout[], acts: ActWithRpe[], behind: Sport[] = []): { extra: boolean; coverage: DayCoverage } {
  const day = acts.filter((a) => a.date === date);
  const m = matchActivities(plan.filter((w) => w.date === date), day, date);
  const unplanned = m.unplanned.filter((a) => a.minutes >= 20);
  const over = m.matches.filter((x) => {
    if (!x.activity) return false;
    const l = activityLoad(x.activity, (x.activity as ActWithRpe).rpe);
    return !!l && l.trimp > plannedLoad(x.planned) * 1.3;
  });
  const doneIds = m.matches.filter((x) => x.activity).map((x) => x.planned.id);
  const coverage = dayCoverage({ date, plan, acts: day, doneIds, behind });
  return { extra: unplanned.length > 0 || over.length > 0, coverage };
}

/**
 * Ieri a fost efort peste plan? Activitate în plus și efortul zilei peste ce era planificat (într-o zi fără plan: peste
 * media zilnică planificată a săptămânii). Atunci dimineața contează și durerile musculare.
 */
export function overYesterday(today: string, plan: PlannedWorkout[], acts: ActWithRpe[]): { over: boolean; facut: number; planificat: number } {
  const y = addDays(today, -1);
  const { extra, coverage } = extraOn(y, plan, acts);
  const week = plan.filter((w) => w.date > addDays(y, -7) && w.date <= y && (w.status === 'planificat' || w.status === 'mutat'));
  const dailyAvg = week.reduce((n, w) => n + plannedLoad(w), 0) / 7;
  const ref = coverage.planificat > 0 ? coverage.planificat : dailyAvg;
  return { over: extra && ref > 0 && coverage.facut > ref, facut: coverage.facut, planificat: Math.round(ref) };
}
