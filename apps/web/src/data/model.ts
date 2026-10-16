// Funcțiile aplicației peste obiectul `Me` venit de la server (sau din demo). Nimic nu se estimează aici:
// tot ce lipsește rămâne null și ecranele arată „fără date”.

import type { Me, MeActivity } from '@core/api-types.js';
import type { Color, PlannedWorkout, Sport } from '@core/types.js';
import { addDays, diffDays, weekStart, weekday } from '@core/util/dates.js';

export type { Me, MeActivity };

export const SPORT_LABEL: Record<Sport, string> = { inot: 'Înot', bicicleta: 'Bicicletă', alergare: 'Alergare', forta: 'Forță' };
export const TYPE_LABEL: Record<PlannedWorkout['type'], string> = { z2: 'Z2', tehnica: 'tehnică', calitate: 'calitate', lung: 'lung', brick: 'brick', forta: 'forță', odihna: 'odihnă' };
export const COLOR_LABEL: Record<Color, string> = {
  verde: 'executat bine',
  galben: 'executat mediu',
  portocaliu: 'executat slab',
  rosu: 'nefăcut',
  gri: 'anulat de sistem',
  albastru: 'în afara planului',
  asteptare: 'urmează',
};
export const DAY_NAMES = ['luni', 'marți', 'miercuri', 'joi', 'vineri', 'sâmbătă', 'duminică'];
export const DAY_SHORT = ['lu', 'ma', 'mi', 'jo', 'vi', 'sâ', 'du'];
export const MONTH_SHORT = ['ian', 'feb', 'mar', 'apr', 'mai', 'iun', 'iul', 'aug', 'sept', 'oct', 'nov', 'dec'];

const ORDER: Record<Sport, number> = { bicicleta: 1, alergare: 1, inot: 2, forta: 3 };

export function workoutsOn(me: Me, date: string): PlannedWorkout[] {
  return me.plan.filter((w) => w.date === date && w.status !== 'sters').sort((a, b) => Number(b.key) - Number(a.key) || ORDER[a.sport] - ORDER[b.sport]);
}

export function colorOf(me: Me, w: PlannedWorkout): Color {
  if (w.status === 'anulat_sistem') return 'gri';
  return me.scores[w.id]?.color ?? 'asteptare';
}

export function reasonsOf(me: Me, w: PlannedWorkout): string[] {
  return me.scores[w.id]?.reasons ?? [];
}

export function nextWorkout(me: Me, sport: Sport): PlannedWorkout | null {
  return (
    me.plan
      .filter((w) => w.sport === sport && w.status === 'planificat' && diffDays(me.today, w.date) >= 0 && colorOf(me, w) === 'asteptare')
      .sort((a, b) => diffDays(b.date, a.date))[0] ?? null
  );
}

export function lastDoneWorkout(me: Me): PlannedWorkout | null {
  return (
    me.plan
      .filter((w) => diffDays(w.date, me.today) > 0 && ['verde', 'galben', 'portocaliu'].includes(colorOf(me, w)))
      .sort((a, b) => diffDays(a.date, b.date))[0] ?? null
  );
}

/** Activitatea de care s-a legat un antrenament propus: aceeași zi (sau următoarea) și același sport. */
export function activityFor(me: Me, w: PlannedWorkout): MeActivity | null {
  return me.activities.find((a) => a.sport === w.sport && !a.unplanned && (a.date === w.date || a.date === addDays(w.date, 1))) ?? null;
}

export function unplannedActivities(me: Me): MeActivity[] {
  return me.activities.filter((a) => a.unplanned && diffDays(a.date, me.today) <= 10).sort((a, b) => diffDays(a.date, b.date));
}

export function activitiesOn(me: Me, date: string): MeActivity[] {
  return me.activities.filter((a) => a.date === date);
}

export function thisWeekDates(me: Me): string[] {
  const start = weekStart(me.today);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export function daysToRace(me: Me): number | null {
  return me.user.raceDate ? diffDays(me.today, me.user.raceDate) : null;
}

export function planStart(me: Me): string | null {
  return me.plan.length ? me.plan.reduce((m, w) => (w.date < m ? w.date : m), me.plan[0]!.date) : null;
}

export function dayIndex(me: Me): { day: number; total: number } | null {
  const start = planStart(me);
  if (!start || !me.user.raceDate) return null;
  return { day: Math.max(1, diffDays(start, me.today) + 1), total: diffDays(start, me.user.raceDate) };
}

// ---------- săptămâni încheiate, pentru grafice ----------

function inWeek(date: string, start: string): boolean {
  const d = diffDays(start, date);
  return d >= 0 && d < 7;
}

export function weekLabel(iso: string): string {
  return `${Number(iso.slice(8))} ${MONTH_SHORT[Number(iso.slice(5, 7)) - 1]}`;
}

export function completedWeekStarts(me: Me, max = 8): string[] {
  const cur = weekStart(me.today);
  const first = me.activities.reduce<string | null>((m, a) => (m == null || a.date < m ? a.date : m), null);
  if (!first) return [];
  const starts: string[] = [];
  let s = weekStart(first);
  while (diffDays(s, cur) > 0) {
    starts.push(s);
    s = addDays(s, 7);
  }
  return starts.slice(-max);
}

export function weeklyHours(me: Me): { start: string; label: string; hours: number; plannedHours: number }[] {
  return completedWeekStarts(me).map((s) => {
    const mins = me.activities.filter((a) => inWeek(a.date, s)).reduce((n, a) => n + a.minutes, 0);
    const planned = me.plan.filter((w) => inWeek(w.date, s) && w.sport !== 'forta' && w.status !== 'sters').reduce((n, w) => n + w.plannedMinutes, 0);
    return { start: s, label: weekLabel(s), hours: Math.round((mins / 60) * 10) / 10, plannedHours: Math.round((planned / 60) * 10) / 10 };
  });
}

export function weeklyExecution(me: Me): { label: string; pct: number | null }[] {
  return completedWeekStarts(me).map((s) => {
    const ws = me.plan.filter((w) => inWeek(w.date, s) && w.status !== 'sters' && diffDays(w.date, me.today) > 0);
    if (ws.length === 0) return { label: weekLabel(s), pct: null };
    const good = ws.filter((w) => ['verde', 'galben'].includes(colorOf(me, w))).length;
    return { label: weekLabel(s), pct: Math.round((good / ws.length) * 100) };
  });
}

export function weeklyKm(me: Me, sport: Sport): number[] {
  return completedWeekStarts(me).map((s) => Math.round(me.activities.filter((a) => a.sport === sport && inWeek(a.date, s)).reduce((n, a) => n + (a.distanceKm ?? 0), 0) * 10) / 10);
}

export function sessionsInWeek(me: Me, start: string): { perDay: number[]; done: number; planned: number } {
  const dates = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const perDay = dates.map((d) => workoutsOn(me, d).filter((w) => ['verde', 'galben'].includes(colorOf(me, w))).length);
  return { perDay, done: perDay.reduce((a, b) => a + b, 0), planned: dates.reduce((n, d) => n + workoutsOn(me, d).length, 0) };
}

export function longest(me: Me, sport: Sport): MeActivity | null {
  return me.activities.filter((a) => a.sport === sport && a.distanceKm != null).sort((a, b) => (b.distanceKm ?? 0) - (a.distanceKm ?? 0))[0] ?? null;
}

export function barComponent(me: Me, name: string): string {
  const c = me.bar?.components.find((x) => x.name === name);
  return c?.value == null ? '–' : `${Math.round(c.value)}%`;
}

/** Mementoul: cel scris de head coach azi; altfel, un fapt din date calculat aici; altfel ziua din plan. */
export function greeting(me: Me): string {
  if (me.memento) return me.memento;
  const ride = longest(me, 'bicicleta');
  const run = longest(me, 'alergare');
  const best = [ride, run].filter((x): x is MeActivity => x != null).sort((a, b) => b.minutes - a.minutes)[0];
  if (best) {
    const h = Math.floor(best.minutes / 60);
    const m = best.minutes % 60;
    const dur = h ? `${h} h${m ? ` ${m}` : ''}` : `${m} min`;
    const verb = best.sport === 'bicicleta' ? 'ai pedalat' : 'ai alergat';
    return `${cap(DAY_NAMES[weekday(best.date)]!)} ${verb} ${dur} fără oprire, cel mai mult din ultimele 6 săptămâni.`;
  }
  const d = dayIndex(me);
  if (d) return `Ziua ${d.day} din ${d.total}.`;
  return 'Conectează o brățară și completează chestionarul: de aici încolo, faptele vin din datele tale.';
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function fmtMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m} min`;
  return m ? `${h} h ${m}` : `${h} h`;
}
