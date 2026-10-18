import { MODULE_PURPOSE, moduleSteps, parseModule } from '@core/calendar/run-modules.js';
import { parseStrides, stridesMinutes, stridesStep, swimSet } from '@core/calendar/session-steps.js';
import { shortIntervalSteps } from '@core/calendar/bike-swim-modules.js';
// Funcțiile aplicației peste obiectul `Me` venit de la server (sau din demo). Nimic nu se estimează aici:
// tot ce lipsește rămâne null și ecranele arată „fără date”.

import type { Me, MeActivity } from '@core/api-types.js';
import type { Color, PlannedWorkout, Sport } from '@core/types.js';
import { addDays, diffDays, weekStart, weekday } from '@core/util/dates.js';
import { decideDay, messageMatches, type DayDecision } from '@core/calendar/day.js';

export type { Me, MeActivity };

export const SPORT_LABEL: Record<Sport, string> = { inot: 'Înot', bicicleta: 'Bicicletă', alergare: 'Alergare', forta: 'Forță' };
export const TYPE_LABEL: Record<PlannedWorkout['type'], string> = { z2: 'Z2', tehnica: 'tehnică', calitate: 'calitate', lung: 'lung', brick: 'brick', forta: 'forță', odihna: 'odihnă' };
export const COLOR_LABEL: Record<Color, string> = {
  verde: 'conform planului',
  galben: 'parțial conform',
  portocaliu: 'departe de plan',
  rosu: 'nefăcut sau sub jumătate',
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
      .filter((w) => w.sport === sport && (w.status === 'planificat' || w.status === 'mutat') && diffDays(me.today, w.date) >= 0 && colorOf(me, w) === 'asteptare')
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
    // Aceleași categorii sus și jos: toate sporturile (și forța), fără ședințele anulate sau scoase din plan.
    const planned = me.plan.filter((w) => inWeek(w.date, s) && (w.status === 'planificat' || w.status === 'mutat')).reduce((n, w) => n + w.plannedMinutes, 0);
    return { start: s, label: weekLabel(s), hours: Math.round((mins / 60) * 10) / 10, plannedHours: Math.round((planned / 60) * 10) / 10 };
  });
}

export function weeklyExecution(me: Me): { label: string; pct: number | null }[] {
  return completedWeekStarts(me).map((s) => {
    const ws = me.plan.filter((w) => inWeek(w.date, s) && (w.status === 'planificat' || w.status === 'mutat') && diffDays(w.date, me.today) > 0);
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
  // Câmpuri ca [hrv.azi] sau [alte_activitati.lista[0].minute]: doar pentru verificare, nu pentru sportiv.
  return t.replace(/\s?\[[a-z_][\w.]*(?:\[\d+\][\w.]*)*\]/gi, '').replace(/\s+([.,;:])/g, '$1');
}

export function greeting(me: Me): string {
  // Mementoul AI doar dacă a fost scris pe decizia de acum; altfel ar contrazice cardul „Azi”.
  if (me.memento && !todayMessage(me).stale) return cleanRefs(me.memento);
  const ride = longest(me, 'bicicleta');
  const run = longest(me, 'alergare');
  const best = [ride, run].filter((x): x is MeActivity => x != null).sort((a, b) => b.minutes - a.minutes)[0];
  if (best) {
    const h = Math.floor(best.minutes / 60);
    const m = best.minutes % 60;
    const dur = h ? `${h} h${m ? ` ${m}` : ''}` : `${m} min`;
    const verb = best.sport === 'bicicleta' ? 'ai pedalat' : 'ai alergat';
    return `${cap(DAY_NAMES[weekday(best.date)]!)} ${verb} ${dur}, cea mai lungă ședință din ultimele 6 săptămâni.`;
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
  // Marginea ecranului = decizia zilei (aceeași ca peste tot).
  const d = dayOf(me);
  if (!d || d.rest || d.ask) return null;
  return d.level === 'stop' ? 'rosu' : d.level;
}

/** Decizia zilei: cea calculată pe server; în demo (fără server) aceeași regulă, din ce există. */
export function dayOf(me: Me): DayDecision | null {
  if (me.day !== undefined) return me.day;
  return decideDay({ state: me.state ?? null, readiness: me.readiness ? { verdict: me.readiness.verdict, reason: me.readiness.reason } : null, restriction: null, todayPlan: me.plan.filter((w) => w.date === me.today) });
}

/**
 * Desfășurarea unei ședințe: încălzire / partea principală / revenire, din tipul, durata și intervalele din plan.
 * Zonele în bpm vin doar din testul introdus (Date de bază → Test de efort); fără test rămân Z1–Z5 și testul vorbirii.
 * Dimineața, antrenorul sportului poate ajusta ședința zilei în mesajul head coach-ului.
 */
export function sessionSteps(me: Me, w: PlannedWorkout): { label: string; text: string }[] {
  // Aceeași ședință ca în plan: minutele însumate dau exact durata planificată, nicio parte negativă, zonele din prescripție.
  const t = me.baseline.tests;
  const zonesFor = w.sport === 'alergare' ? t?.alergare_z : w.sport === 'bicicleta' ? t?.bicicleta_z : null;
  const z = (n: number) => {
    const up = zonesFor?.[n - 1];
    const lo = n > 1 ? zonesFor?.[n - 2] : null;
    if (up == null) return `Z${n}`;
    return lo != null ? `Z${n} (${lo + 1}–${up} bpm)` : `Z${n} (sub ${up} bpm)`;
  };
  const target = w.targetZones.length ? (w.targetZones.length > 1 ? `${z(Math.min(...w.targetZones))}–${z(Math.max(...w.targetZones))}` : z(w.targetZones[0]!)) : z(2);
  const easyTarget = w.targetZones.some((x) => x > 2) ? z(2) : target;
  const talk = w.targetZones.every((x) => x <= 2) ? ' – poți vorbi în propoziții întregi' : '';
  const m = Math.max(0, w.plannedMinutes);
  if (w.type === 'odihna') return [{ label: 'Odihnă', text: 'Fără antrenament azi. Corpul se adaptează acum.' }];
  if (w.type === 'forta') {
    const warm = Math.min(5, Math.floor(m / 4));
    const cool = Math.min(5, Math.floor(m / 6));
    return [
      { label: 'Încălzire', text: `${warm} min mobilitate (șolduri, umeri, glezne)` },
      { label: 'Principal', text: `${m - warm - cool} min: exercițiile zilei din programul de forță, fără epuizare` },
      { label: 'Revenire', text: `${cool} min întinderi ușoare` },
    ];
  }
  const mod = moduleSteps(w.structure, m);
  if (mod) return mod;
  if (/^mers-alergare/.test(w.structure ?? '')) return [{ label: 'Ședința', text: w.structure! }];
  if (w.type === 'calitate' && w.intervals) {
    const iv = w.intervals;
    const restMatch = /(\d+)\s*min ușor între/.exec(w.structure ?? '');
    const rest = restMatch ? Number(restMatch[1]) : Math.max(1, Math.round(iv.minutes / 2));
    let count = iv.count;
    // Câte repetări încap realist în durata planificată, cu minimum 10 min încălzire + revenire.
    while (count > 1 && count * iv.minutes + (count - 1) * rest + 10 > m) count -= 1;
    const work = count * iv.minutes + (count - 1) * rest;
    const left = Math.max(0, m - work);
    const warm = Math.min(15, Math.max(0, left - Math.min(5, Math.floor(left / 3))));
    const cool = left - warm;
    return [
      { label: 'Încălzire', text: `${warm} min ${z(1)}–${z(2)}${warm >= 10 ? ', la final 3 accelerări scurte' : ''}` },
      { label: 'Principal', text: `${count} × ${iv.minutes} min în ${z(iv.zone)}${count > 1 ? `, pauză ${rest} min ușor între ele` : ''}` },
      { label: 'Revenire', text: `${cool} min ${z(1)}` },
    ];
  }
  if (w.type === 'brick') {
    const parsed = /tură (\d+) min.*alergare (\d+) min/.exec(w.structure ?? '');
    const bike = parsed && Number(parsed[1]) + Number(parsed[2]) === m ? Number(parsed[1]) : Math.round((m * 0.7) / 5) * 5;
    return [
      { label: 'Bicicletă', text: `${bike} min ${easyTarget}${talk}` },
      { label: 'Tranziție', text: 'schimbi echipamentul cât mai repede, fără pauză lungă' },
      { label: 'Alergare', text: `${m - bike} min ${easyTarget}, primele 5 min mai ușor până se „așază” picioarele` },
    ];
  }
  if (w.sport === 'inot') return swimSet({ type: w.type, minutes: m, css: t?.css ?? null, date: w.date, structure: w.structure }).steps;
  const si = shortIntervalSteps(w.structure, m);
  if (si) return si;
  const warm = m >= 30 ? 10 : Math.floor(m / 3);
  const cool = m >= 30 ? 5 : Math.floor(m / 6);
  // Accelerările din structură sunt un pas separat; minutele lor ies din partea ușoară (suma rămâne durata din plan).
  const strides = w.sport === 'alergare' ? parseStrides(w.structure) : null;
  const sMin = strides ? Math.min(stridesMinutes(strides), Math.max(0, m - warm - cool - 5)) : 0;
  const main = m - warm - cool - sMin;
  return [
    { label: 'Încălzire', text: `${warm} min ${z(1)}` },
    { label: 'Principal', text: `${main} min ${target}${w.type === 'lung' ? ', constant' : ''}${talk}` },
    ...(strides && sMin ? [{ ...stridesStep(strides), text: `${stridesStep(strides).text} (${sMin} min)` }] : []),
    { label: 'Revenire', text: `${cool} min ${z(1)}` },
  ];
}

/** De ce există ședința, într-o propoziție (din tipul ei). */
export function purposeOf(w: PlannedWorkout): string {
  if (w.status === 'anulat_sistem') return 'Anulată: corpul are nevoie de odihnă sau ziua nu permite.';
  if (/TEST/i.test(w.structure ?? '')) return 'Test: din el ies zonele tale, ca intensitatea să fie pe corpul tău.';
  if (/4\s*×\s*4/.test(w.structure ?? '')) return 'Metoda norvegiană 4×4: ridică VO2max, plafonul motorului.';
  const mod = parseModule(w.structure);
  if (mod) return MODULE_PURPOSE[mod.id];
  if (/^mers-alergare/.test(w.structure ?? '')) return 'Mers-alergare: toleranța la alergare crește treptat, fără grabă.';
  switch (w.type) {
    case 'z2':
      return w.sport === 'inot' ? 'Înot ușor: volum aerob fără oboseală.' : 'Bază aerobă: inima și mușchii învață să ardă grăsimi, fără să te obosească.';
    case 'tehnica':
      return 'Tehnică: înoți mai eficient cu același efort.';
    case 'calitate':
      return 'Intensitate: ridică pragul, ca ritmul de cursă să pară mai ușor.';
    case 'lung':
      return 'Rezistență: corpul se obișnuiește cu durata cursei.';
    case 'brick':
      return 'Brick: picioarele învață să alerge imediat după bicicletă.';
    case 'forta':
      return 'Forță: tendoane și mușchi mai rezistenți, mai puține accidentări.';
    default:
      return 'Odihnă: adaptarea se întâmplă acum.';
  }
}

/** Primele n propoziții dintr-un text (pentru rezumate scurte). */
export function firstSentences(text: string, n = 2): string {
  const flat = cleanRefs(text).replace(/\s*\n+\s*/g, ' ').trim();
  const parts = flat.match(/[^.!?]+[.!?]+(\s|$)/g) ?? [flat];
  return parts.slice(0, n).join('').trim();
}

/** Mesajul de azi al antrenorului, dacă a fost scris pe starea de acum (altfel e depășit). */
export function todayMessage(me: Me): { msg: Me['messages'][number] | null; stale: boolean } {
  const day = dayOf(me);
  const todays = me.messages.filter((m) => localDayOf(m.createdAt) === me.today);
  const msg = todays.find((m) => messageMatches(m.decision, day)) ?? null;
  return { msg, stale: !msg && todays.length > 0 };
}

export function localDayOf(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Ședința e încă de făcut (activă, azi sau în viitor, fără activitate legată și fără scor final). */
export function isUpcoming(me: Me, w: PlannedWorkout): boolean {
  return (w.status === 'planificat' || w.status === 'mutat') && w.date >= me.today && colorOf(me, w) === 'asteptare' && !(w.date === me.today && activityFor(me, w));
}

/** „acum 5 min”, „azi 08:12”, „ieri”, „acum 3 zile”. */
export function ago(iso: string | null, today: string): string {
  if (!iso) return 'niciodată';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  const min = Math.round((Date.now() - t) / 60000);
  if (min < 60) return `acum ${Math.max(1, min)} min`;
  const day = localDayOf(iso);
  const d = diffDays(day, today);
  if (d <= 0) return `azi ${new Date(t).toTimeString().slice(0, 5)}`;
  if (d === 1) return 'ieri';
  return `acum ${d} zile`;
}
