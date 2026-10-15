// Calendarul viu: regulile de adaptare din protocol, aplicate determinist pe antrenamentele viitoare.
// Agentul poate doar să scadă, să mute sau să înlocuiască; nu crește peste plan și nu anulează un roșu.

import type { Activity, Color, FreeBlock, PlannedWorkout } from '../types.js';
import { addDays, diffDays, weekday } from '../util/dates.js';

export type AdaptEvent =
  | { kind: 'scor'; workoutId: string; color: Color }
  | { kind: 'readiness'; date: string; verdict: 'verde' | 'galben' | 'rosu' | 'stop'; reason?: string }
  | { kind: 'durere'; date: string; score: number; loc: string }
  | { kind: 'febra'; date: string }
  | { kind: 'neplanificat'; activity: Activity; rpe?: number | null };

export interface AdaptContext {
  today: string;
  freeBlocks: FreeBlock[];
  /** Scorurile antrenamentelor-cheie din ultimele 14 zile (inclusiv cel curent, dacă e cazul). */
  recentKeyScores: { date: string; color: Color }[];
  /** Antrenamentele-cheie repetate în ultimele 28 de zile (treaptă repetată), pe tip+sport. */
  recentRepeats?: Record<string, number>;
}

export interface AdaptResult {
  plan: PlannedWorkout[];
  changes: string[];
}

const CHANGE_MIN = 10;

export function adapt(plan: PlannedWorkout[], event: AdaptEvent, ctx: AdaptContext): AdaptResult {
  const next = plan.map((w) => ({ ...w, targetZones: [...w.targetZones] }));
  const changes: string[] = [];

  switch (event.kind) {
    case 'scor':
      applyScore(next, event, ctx, changes);
      break;
    case 'readiness':
      applyReadiness(next, event, ctx, changes);
      break;
    case 'durere':
      applyPain(next, event, ctx, changes);
      break;
    case 'febra':
      applyFever(next, event, changes);
      break;
    case 'neplanificat':
      applyUnplanned(next, event, changes);
      break;
  }

  return { plan: next, changes };
}

function applyScore(plan: PlannedWorkout[], ev: Extract<AdaptEvent, { kind: 'scor' }>, ctx: AdaptContext, changes: string[]): void {
  const w = plan.find((x) => x.id === ev.workoutId);
  if (!w || !w.key) return;
  if (ev.color !== 'rosu' && ev.color !== 'portocaliu') return;

  // Treapta se repetă la următorul antrenament-cheie de același tip; a treia oară coboară.
  const sameType = plan
    .filter((x) => x.key && x.type === w.type && x.sport === w.sport && diffDays(w.date, x.date) > 0 && x.status === 'planificat')
    .sort((a, b) => diffDays(b.date, a.date));
  const nextKey = sameType[0];
  if (nextKey) {
    const repeats = ctx.recentRepeats?.[`${w.sport}:${w.type}`] ?? 0;
    if (repeats >= 2) {
      nextKey.plannedMinutes = Math.round((w.plannedMinutes * 0.9) / 5) * 5;
      nextKey.note = 'treaptă coborâtă (−10%) după trei nereușite';
      changes.push(`${nextKey.id}: ${nextKey.sport} ${nextKey.type} coborât la ${nextKey.plannedMinutes} min`);
    } else {
      nextKey.plannedMinutes = w.plannedMinutes;
      nextKey.step = w.step;
      nextKey.note = 'treaptă repetată';
      changes.push(`${nextKey.id}: ${nextKey.sport} ${nextKey.type} repetă treapta (${w.plannedMinutes} min)`);
    }
  }

  // Două antrenamente-cheie slabe în 14 zile → săptămâna următoare −20%, progresia oprită.
  const bad = ctx.recentKeyScores.filter((s) => (s.color === 'rosu' || s.color === 'portocaliu') && Math.abs(diffDays(s.date, w.date)) <= 14).length;
  if (bad >= 2) {
    const nextMonday = addDays(w.date, 7 - weekday(w.date));
    const nextSunday = addDays(nextMonday, 6);
    for (const x of plan) {
      if (x.status !== 'planificat') continue;
      if (diffDays(nextMonday, x.date) < 0 || diffDays(x.date, nextSunday) < 0) continue;
      if (!x.key) {
        x.plannedMinutes = Math.round((x.plannedMinutes * 0.8) / 5) * 5;
      }
      x.note = [x.note, 'săptămână −20%, progresie oprită'].filter(Boolean).join('; ');
    }
    changes.push(`săptămâna din ${nextMonday}: volum −20%, progresia oprită (${bad} antrenamente-cheie slabe în 14 zile)`);
  }
}

function applyReadiness(plan: PlannedWorkout[], ev: Extract<AdaptEvent, { kind: 'readiness' }>, ctx: AdaptContext, changes: string[]): void {
  if (ev.verdict === 'verde') return;
  const today = plan.filter((x) => x.date === ev.date && x.status === 'planificat');

  if (ev.verdict === 'galben') {
    for (const x of today) {
      if (x.type === 'calitate' || x.type === 'lung' || x.type === 'brick') {
        x.targetZones = [1, 2];
        x.plannedMinutes = Math.round((x.plannedMinutes * 0.75) / 5) * 5;
        x.intervals = undefined;
        x.note = 'galben: Z1–Z2, volum −25%';
        changes.push(`${x.id}: redus (galben)`);
      }
    }
    return;
  }

  // Roșu sau stop: ziua devine gri; un antrenament-cheie se mută cu maximum o zi dacă are loc.
  for (const x of today) {
    x.status = 'anulat_sistem';
    x.note = ev.verdict === 'stop' ? `stop: ${ev.reason ?? 'escaladare la om'}` : `roșu la readiness${ev.reason ? `: ${ev.reason}` : ''}`;
    changes.push(`${x.id}: anulat de sistem (${ev.verdict})`);

    if (x.key && ev.verdict === 'rosu') {
      const tomorrow = addDays(ev.date, 1);
      const dayAfter = addDays(ev.date, 2);
      const keyNearby = plan.some((y) => y.key && y.status === 'planificat' && y.id !== x.id && (y.date === tomorrow || y.date === dayAfter));
      const longest = ctx.freeBlocks.filter((b) => b.day === weekday(tomorrow)).reduce((m, b) => Math.max(m, b.endMin - b.startMin), 0);
      const countTomorrow = plan.filter((y) => y.date === tomorrow && y.status === 'planificat').length;
      if (!keyNearby && longest >= x.plannedMinutes + CHANGE_MIN && countTomorrow < 2) {
        plan.push({ ...x, id: `${x.id}-mutat`, date: tomorrow, status: 'mutat', note: `mutat de pe ${ev.date} (readiness roșu)` });
        changes.push(`${x.id}: antrenament-cheie mutat pe ${tomorrow}`);
      } else {
        changes.push(`${x.id}: antrenament-cheie pierdut (fără bloc liber sau altă cheie în 48 h)`);
      }
    }
  }
}

function applyPain(plan: PlannedWorkout[], ev: Extract<AdaptEvent, { kind: 'durere' }>, _ctx: AdaptContext, changes: string[]): void {
  if (ev.score < 3) return;
  const until = addDays(ev.date, 5);
  for (const x of plan) {
    if (x.status !== 'planificat') continue;
    if (diffDays(ev.date, x.date) < 0 || diffDays(x.date, until) < 0) continue;
    if (x.sport === 'alergare') {
      x.sport = 'bicicleta';
      x.type = 'z2';
      x.targetZones = [2];
      x.key = false;
      x.intervals = undefined;
      x.structure = undefined;
      x.note = `fără impact: durere ${ev.score}/10 la ${ev.loc}`;
      changes.push(`${x.id}: alergarea devine bicicletă Z2 (${x.plannedMinutes} min)`);
    } else if (x.type === 'brick') {
      x.type = 'lung';
      x.structure = 'tura lungă fără alergarea de după';
      x.note = `brick fără alergare: durere ${ev.score}/10 la ${ev.loc}`;
      changes.push(`${x.id}: brick fără alergare`);
    }
  }
  if (ev.score >= 5) changes.push(`durere ${ev.score}/10 la ${ev.loc}: escaladare la fizioterapeut în aceeași zi`);
}

function applyFever(plan: PlannedWorkout[], ev: Extract<AdaptEvent, { kind: 'febra' }>, changes: string[]): void {
  const stopUntil = addDays(ev.date, 2);
  const halfUntil = addDays(ev.date, 9);
  for (const x of plan) {
    if (x.status !== 'planificat') continue;
    const d = diffDays(ev.date, x.date);
    if (d < 0) continue;
    if (diffDays(x.date, stopUntil) >= 0) {
      x.status = 'anulat_sistem';
      x.note = 'febră: odihnă';
      changes.push(`${x.id}: anulat (febră)`);
    } else if (diffDays(x.date, halfUntil) >= 0) {
      x.plannedMinutes = Math.round((x.plannedMinutes * 0.5) / 5) * 5;
      x.key = false;
      if (x.type === 'calitate') {
        x.type = 'z2';
        x.intervals = undefined;
      }
      x.targetZones = x.sport === 'forta' ? [] : [1, 2];
      x.note = 'prima săptămână după febră: volum −50%, fără cheie';
      changes.push(`${x.id}: −50%, fără intensitate (după febră)`);
    }
  }
}

function applyUnplanned(plan: PlannedWorkout[], ev: Extract<AdaptEvent, { kind: 'neplanificat' }>, changes: string[]): void {
  const big = ev.activity.minutes >= 90 || (ev.rpe ?? 0) >= 7;
  if (!big) return;
  const tomorrow = addDays(ev.activity.date, 1);
  for (const x of plan) {
    if (x.status !== 'planificat' || x.date !== tomorrow) continue;
    if (x.key) continue; // un antrenament-cheie nu se înlocuiește din cauza unei activități neplanificate
    x.targetZones = x.sport === 'forta' ? [] : [1];
    if (x.type === 'calitate') {
      x.type = 'z2';
      x.intervals = undefined;
    }
    x.note = `Z1 după activitate neplanificată mare (${ev.activity.minutes} min)`;
    changes.push(`${x.id}: Z1 (activitate neplanificată ieri)`);
  }
}
