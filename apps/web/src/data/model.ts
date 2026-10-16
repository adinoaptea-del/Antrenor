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
/** Scoate trimiterile tehnice la câmpuri („[hrv.azi]”) din textele pentru sportiv; ele rămân doar pentru verificare. */
export function cleanRefs(t: string): string {
  return t.replace(/\s?\[[a-z_][a-z0-9_.]*\]/gi, '').replace(/\s+([.,;:])/g, '$1');
}

export function greeting(me: Me): string {
  if (me.memento) return cleanRefs(me.memento);
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
  const start = planStart(me);
  if (start && start > me.today) return `Planul începe ${DAY_NAMES[weekday(start)]}, ${fmtDM(start)}. Până atunci: datele de bază de mai jos.`;
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

function fmtDM(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${Number(d)} ${['ian', 'feb', 'mar', 'apr', 'mai', 'iun', 'iul', 'aug', 'sept', 'oct', 'nov', 'dec'][Number(m) - 1]}`;
}

export type Level = 'verde' | 'galben' | 'portocaliu' | 'rosu';

/**
 * Nivelul zilei pentru marginea ecranului, din verdictul de dimineață al echipei:
 * verde → verde; galben → galben; galben cu încărcare peste 1,3 sau Hooper ≥ 20 → portocaliu; roșu sau stop → roșu.
 * Fără verdict azi (înainte de 05:30 sau fără date): fără culoare.
 */
export function dayLevel(me: Me): Level | null {
  // Marginile arată starea ta de azi: datele de sănătate (și cum te simți). Stop la febră/simptome = roșu.
  if (me.readiness?.verdict === 'stop') return 'rosu';
  if (me.state) return me.state.verdict;
  const r = me.readiness;
  if (!r) return null;
  if (r.verdict === 'rosu' || r.verdict === 'stop') return 'rosu';
  const loaded = (r.acwr != null && r.acwr > 1.3) || (r.hooperSum != null && r.hooperSum >= 20);
  if (r.verdict === 'galben') return loaded ? 'portocaliu' : 'galben';
  return loaded ? 'galben' : 'verde';
}

/**
 * Desfășurarea unei ședințe: încălzire / partea principală / revenire, din tipul, durata și intervalele din plan.
 * Zonele în bpm vin doar din testul introdus (Date de bază → Test de efort); fără test rămân Z1–Z5 și testul vorbirii.
 * Dimineața, antrenorul sportului poate ajusta ședința zilei în mesajul head coach-ului.
 */
export function sessionSteps(me: Me, w: PlannedWorkout): { label: string; text: string }[] {
  const t = me.baseline.tests;
  const zonesFor = w.sport === 'alergare' ? t?.alergare_z : w.sport === 'bicicleta' ? t?.bicicleta_z : null;
  const z = (n: number) => {
    const up = zonesFor?.[n - 1];
    const lo = n > 1 ? zonesFor?.[n - 2] : null;
    if (up == null) return `Z${n}`;
    return lo != null ? `Z${n} (${lo + 1}–${up} bpm)` : `Z${n} (sub ${up} bpm)`;
  };
  const talk = ' – poți vorbi în propoziții întregi';
  const m = w.plannedMinutes;
  if (w.type === 'odihna') return [{ label: 'Odihnă', text: 'Fără antrenament. Plimbare ușoară sau mobilitate, dacă ai chef.' }];
  if (w.type === 'forta') {
    return [
      { label: 'Încălzire', text: '5 min mobilitate (șolduri, umeri, glezne)' },
      { label: 'Principal', text: `${Math.max(m - 10, 15)} min forță generală: genuflexiuni, fandări, ridicări pe vârfuri, plank, cele două exerciții de prevenție de la fizio; 2–3 runde, fără epuizare` },
      { label: 'Revenire', text: '5 min întinderi ușoare' },
    ];
  }
  if (w.type === 'calitate' && w.intervals) {
    const iv = w.intervals;
    const warm = 15;
    const work = iv.count * iv.minutes;
    const rest = Math.max(1, Math.round(iv.minutes / 2));
    const cool = Math.max(5, m - warm - work - (iv.count - 1) * rest);
    return [
      { label: 'Încălzire', text: `${warm} min ${z(1)}–${z(2)}, la final 3 accelerări scurte` },
      { label: 'Principal', text: `${iv.count} × ${iv.minutes} min în ${z(iv.zone)}, pauză ${rest} min ușor între ele` },
      { label: 'Revenire', text: `${cool} min ${z(1)}` },
    ];
  }
  if (w.type === 'brick') {
    const bike = Math.round((m * 0.7) / 5) * 5;
    return [
      { label: 'Bicicletă', text: `${bike} min ${z(2)}${talk}` },
      { label: 'Tranziție', text: 'schimbi echipamentul cât mai repede, fără pauză lungă' },
      { label: 'Alergare', text: `${m - bike} min ${z(2)}, primele 5 min mai ușor până se „așază” picioarele` },
    ];
  }
  if (w.sport === 'inot') {
    const warm = Math.min(10, Math.round(m * 0.25));
    return [
      { label: 'Încălzire', text: `${warm} min înot ușor, cu pauze cât ai nevoie` },
      { label: 'Principal', text: w.type === 'tehnica' ? `${m - warm - 5} min tehnică: exerciții pe respirație și braț, apoi bazine întregi ușor` : `${m - warm - 5} min înot continuu sau pe bucăți, ${z(2)}${talk}` },
      { label: 'Revenire', text: '5 min înot foarte ușor' },
    ];
  }
  const warm = 10;
  const cool = 5;
  return [
    { label: 'Încălzire', text: `${warm} min ${z(1)}` },
    { label: 'Principal', text: `${m - warm - cool} min ${z(2)}${w.type === 'lung' ? ', constant, fără opriri lungi' : ''}${talk}` },
    { label: 'Revenire', text: `${cool} min ${z(1)}` },
  ];
}
