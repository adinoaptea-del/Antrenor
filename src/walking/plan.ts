// Mers pe jos: ședințele săptămânii și recomandarea de azi (specificația „Mers pe jos / Bula 200 de minute”, §4 și §6).
//
// O singură structură pentru o ședință (regula 2): walkSpec(minute, fel) dă încălzirea, partea principală, revenirea,
// scopul, pașii de execuție și varianta mai scurtă. Generatorul o scrie în calendar; pagina și fereastra ședinței o
// recalculează din aceleași valori (durata + felul), deci nu pot diverge.
//
// Reguli:
//  - Durata unei ședințe nu trece de capacitatea declarată sau demonstrată (cea mai lungă plimbare recentă), cel mult 60.
//  - Ținta săptămânii se împarte pe zile; dacă nu încape în zilele și durata de acum, se spune (nu se umflă ședințele).
//  - Mersul alert doar dacă sportivul l-a confirmat; „nu știu” = o probă scurtă, cu opțiunea de a rămâne la ușor.
//  - Nicio datorie: ce a rămas din săptămână nu se adaugă la ședința de azi și nu trece în săptămâna următoare.
//  - Restricțiile: zi de oprire = fără mers prescris; zi roșie = varianta scurtă, ușoară; zi galbenă = fără mers alert.

import type { FreeBlock, PlannedWorkout } from '../types.js';
import { addDays, weekStart, weekday } from '../util/dates.js';
import { targetForWeek, type TargetChange, DEFAULT_TARGET_MIN } from './minutes.js';

export type Brisk = 'da' | 'nu' | 'nu_stiu';
/** z2 = mers ușor; calitate = cu mers alert; tehnica = probă de mers alert (pentru cine nu știe încă dacă îl tolerează). */
export type WalkKind = 'usor' | 'alert' | 'proba';

export const BRISK_EXPLAIN = 'Mergi într-un ritm care îți accelerează respirația, dar îți permite să vorbești.';
export const MAX_SESSION_MIN = 60;
export const MIN_SESSION_MIN = 10;

export interface WalkProfile {
  /** Ținta de la început (minute pe săptămână), aleasă la chestionar; implicit 200. */
  initial: number;
  /** Cât poate merge acum fără oprire, confortabil (declarat), minute. */
  capacityMin: number;
  brisk: Brisk;
  changes: TargetChange[];
}

export const DEFAULT_WALK_PROFILE: WalkProfile = { initial: DEFAULT_TARGET_MIN, capacityMin: 30, brisk: 'nu_stiu', changes: [] };

export interface WalkPart {
  min: number;
  what: string;
}

export interface WalkSpec {
  kind: WalkKind;
  totalMin: number;
  warmup: WalkPart;
  main: WalkPart;
  cooldown: WalkPart;
  purpose: string;
  /** Pașii de execuție, pe înțeles. */
  how: string[];
  /** Varianta mai scurtă (aceeași structură), pentru o zi cu mai puțin timp sau mai puțină energie. */
  shorter: { totalMin: number; warmup: number; main: number; cooldown: number; text: string } | null;
}

const r5 = (x: number) => Math.max(5, Math.round(x / 5) * 5);

function parts(total: number, kind: WalkKind): { w: number; m: number; c: number } {
  // Ședințele scurte au încălzirea și revenirea mai scurte, ca partea principală să rămână.
  const w = total >= 20 ? 5 : total >= 15 ? 3 : 2;
  const c = total >= 20 ? 5 : total >= 15 ? 3 : 2;
  if (kind === 'usor') return { w, m: total - w - c, c };
  return { w, m: total - w - c, c };
}

const KIND_FROM_TYPE: Record<string, WalkKind> = { z2: 'usor', calitate: 'alert', tehnica: 'proba' };
export const TYPE_OF_KIND: Record<WalkKind, PlannedWorkout['type']> = { usor: 'z2', alert: 'calitate', proba: 'tehnica' };
export const walkKindOf = (w: Pick<PlannedWorkout, 'type'>): WalkKind => KIND_FROM_TYPE[w.type] ?? 'usor';

/** Structura completă a unei ședințe de mers, din durata totală și fel. */
export function walkSpec(totalMin: number, kind: WalkKind): WalkSpec {
  const total = Math.max(MIN_SESSION_MIN, Math.round(totalMin));
  // Mersul alert are nevoie de cel puțin 10 minute principale; sub 20 de minute ședința rămâne ușoară.
  const k: WalkKind = kind !== 'usor' && total < 20 ? 'usor' : kind;
  const { w, m, c } = parts(total, k);
  const mainWhat = k === 'alert' ? `mers alert: ${BRISK_EXPLAIN.toLowerCase().replace(/\.$/, '')}` : k === 'proba' ? `mers ușor cu ${Math.min(3, Math.floor(m / 4))} bucăți de 2 min de mers alert, fiecare urmată de 2 min ușor` : 'mers ușor, constant, în ritmul tău';
  const purpose =
    k === 'alert'
      ? 'Mersul alert încarcă inima mai mult decât plimbarea ușoară, fără impactul alergării. Minutele tale se adună în bula săptămânii.'
      : k === 'proba'
        ? 'Afli cum răspunzi la mersul alert, în bucăți scurte. Dacă respirația nu-ți mai permite să vorbești sau apare o durere, rămâi la ușor.'
        : 'Minute de mers adunate fără oboseală: obișnuiesc corpul cu mișcarea zilnică și se adună în bula săptămânii.';
  const how: string[] = [
    `Încălzire ${w} min: mers lejer, pași mai scurți, umerii relaxați.`,
    k === 'alert'
      ? `Partea principală ${m} min: ${BRISK_EXPLAIN} Pași puțin mai rapizi, brațele îndoite și mișcate pe lângă corp. Viteza e a ta: nu există o viteză corectă pentru toată lumea.`
      : k === 'proba'
        ? `Partea principală ${m} min: mers ușor; de ${Math.min(3, Math.floor(m / 4))} ori, 2 min mai repede (respiri mai des, dar poți vorbi), apoi 2 min ușor. Dacă te simți bine, e semn că poți încerca mers alert ședința următoare.`
        : `Partea principală ${m} min: mers ușor, constant. Poți purta o conversație fără efort.`,
    `Revenire ${c} min: încetinești treptat până la pas lejer.`,
    'Te oprești dacă apare durere în piept, amețeală, lipsă de aer neobișnuită sau o durere care crește. Siguranța e înaintea țintei.',
  ];
  const sTotal = total >= 20 ? Math.max(MIN_SESSION_MIN, Math.min(total - 5, r5(total * 0.65))) : null;
  let shorter: WalkSpec['shorter'] = null;
  if (sTotal && sTotal < total) {
    const sk: WalkKind = k !== 'usor' && sTotal < 20 ? 'usor' : k;
    const p = parts(sTotal, sk);
    shorter = { totalMin: sTotal, warmup: p.w, main: p.m, cooldown: p.c, text: `${sTotal} min = ${p.w} min ușor + ${p.m} min ${sk === 'alert' ? 'alert' : 'ușor'} + ${p.c} min ușor` };
  }
  return { kind: k, totalMin: total, warmup: { min: w, what: 'mers lejer' }, main: { min: m, what: mainWhat }, cooldown: { min: c, what: 'mers lejer, încetinești' }, purpose, how, shorter };
}

/** Textul scurt din calendar (aceeași structură ca walkSpec). */
export function walkStructure(totalMin: number, kind: WalkKind): string {
  const s = walkSpec(totalMin, kind);
  const main = s.kind === 'alert' ? 'alert' : s.kind === 'proba' ? 'ușor cu 2 min alert' : 'ușor';
  return `Mers ${s.totalMin} min: ${s.warmup.min} min ușor + ${s.main.min} min ${main} + ${s.cooldown.min} min ușor${s.shorter ? `. Mai scurt: ${s.shorter.text}` : ''}`;
}

/** Capacitatea folosită: cea declarată sau cea demonstrată recent (cea mai lungă plimbare din 14 zile), cel mult 60. */
export function sessionCap(declaredMin: number, demonstratedMin: number | null): number {
  const c = Math.max(declaredMin || 0, demonstratedMin ?? 0);
  return Math.min(MAX_SESSION_MIN, Math.max(MIN_SESSION_MIN, Math.floor(c / 5) * 5 || MIN_SESSION_MIN));
}

/** Zilele cu o fereastră liberă de cel puțin 10 minute (fără program: toate). */
export function walkDays(blocks: FreeBlock[]): number[] {
  const m = new Map<number, number>();
  for (const b of blocks) m.set(b.day, Math.max(m.get(b.day) ?? 0, b.endMin - b.startMin));
  const ok = [...m.entries()].filter(([, x]) => x >= MIN_SESSION_MIN).map(([d]) => d).sort((a, b) => a - b);
  return ok.length ? ok : [0, 1, 2, 3, 4, 5, 6];
}

/** n zile cât mai depărtate dintre cele disponibile (pe săptămână circulară). */
function spread(avail: number[], n: number): number[] {
  if (n >= avail.length) return [...avail];
  const out: number[] = [];
  const step = avail.length / n;
  for (let i = 0; i < n; i++) out.push(avail[Math.floor(i * step)]!);
  return [...new Set(out)].sort((a, b) => a - b);
}

export interface WalkWeekPlan {
  weekStart: string;
  targetMin: number;
  plannedMin: number;
  sessions: { day: number; date: string; totalMin: number; kind: WalkKind }[];
  /** Ținta nu încape în zilele și durata de acum (spus, nu ascuns). */
  short: string | null;
}

/**
 * Ședințele unei săptămâni: ținta împărțită pe zile, fiecare cel mult cât capacitatea. Fără datorie: nu primește
 * minutele rămase din săptămâna trecută.
 */
export function planWalkWeek(input: { weekStart: string; targetMin: number; capMin: number; brisk: Brisk; days: number[] }): WalkWeekPlan {
  const cap = Math.max(MIN_SESSION_MIN, Math.min(MAX_SESSION_MIN, input.capMin));
  const target = Math.max(0, Math.round(input.targetMin));
  const avail = input.days.length ? input.days : [0, 1, 2, 3, 4, 5, 6];
  // Câte ședințe: cât trebuie ca nicio ședință să nu treacă de capacitate; peste 90 de minute, cel puțin 3 zile
  // (mișcarea distribuită, nu adunată într-o zi); cel mult zilele disponibile.
  let n = Math.ceil(target / cap);
  if (target >= 90) n = Math.max(n, Math.min(5, Math.ceil(target / 40)));
  n = Math.max(1, Math.min(avail.length, n));
  const days = spread(avail, n);
  const total = Math.min(target, days.length * cap);
  // Minutele pe ședințe, în multipli de 5, cele mai lungi întâi; niciuna peste capacitate.
  const base = Math.floor(total / days.length / 5) * 5;
  const mins = days.map(() => Math.max(MIN_SESSION_MIN, Math.min(cap, base)));
  let rest = total - mins.reduce((a, b) => a + b, 0);
  for (let i = 0; rest >= 5 && i < mins.length * 12; i++) {
    const j = i % mins.length;
    if (mins[j]! + 5 <= cap) {
      mins[j]! += 5;
      rest -= 5;
    }
  }
  // Mersul alert: doar confirmat; cel mult 3 ședințe pe săptămână, despărțite de zile ușoare. „Nu știu” = o probă.
  const longEnough = mins.map((m, i) => ({ m, i })).filter((x) => x.m >= 20);
  const briskIdx = new Set<number>();
  if (input.brisk === 'da') {
    const k = Math.min(3, Math.max(1, Math.floor(days.length / 2)));
    const step = longEnough.length / k;
    for (let q = 0; q < k && longEnough.length; q++) briskIdx.add(longEnough[Math.floor(q * step)]!.i);
  }
  const probeIdx = input.brisk === 'nu_stiu' && longEnough.length ? longEnough[Math.floor(longEnough.length / 2)]!.i : -1;
  const sessions = days.map((d, i) => ({ day: d, date: addDays(input.weekStart, d), totalMin: mins[i]!, kind: (briskIdx.has(i) ? 'alert' : i === probeIdx ? 'proba' : 'usor') as WalkKind }));
  const plannedMin = mins.reduce((a, b) => a + b, 0);
  const short = plannedMin < target ? `Ținta de ${target} min nu încape acum în ${days.length} ${days.length === 1 ? 'zi' : 'zile'} de câte cel mult ${cap} min: planificat ${plannedMin} min. Ține de capacitate și de zilele libere, nu de voință; ținta se poate ajusta, cu motiv.` : null;
  return { weekStart: input.weekStart, targetMin: target, plannedMin, sessions, short };
}

/** Ședințele din calendar pentru tot programul (de la `startDate`, până la `endDate` exclusiv). */
export function walkPlanWorkouts(input: { startDate: string; endDate: string; profile: WalkProfile; freeBlocks: FreeBlock[]; demonstratedMin?: number | null }): { weeks: (WalkWeekPlan & { workouts: PlannedWorkout[] })[] } {
  const days = walkDays(input.freeBlocks);
  const cap = sessionCap(input.profile.capacityMin, input.demonstratedMin ?? null);
  const out: (WalkWeekPlan & { workouts: PlannedWorkout[] })[] = [];
  for (let ws = weekStart(input.startDate); ws < input.endDate; ws = addDays(ws, 7)) {
    const target = targetForWeek(ws, input.profile.changes, input.profile.initial);
    const wp = planWalkWeek({ weekStart: ws, targetMin: target, capMin: cap, brisk: input.profile.brisk, days });
    const workouts: PlannedWorkout[] = wp.sessions
      .filter((s) => s.date >= input.startDate && s.date < input.endDate)
      .map((s, i) => ({
        id: `${ws}-m${i + 1}`,
        date: s.date,
        sport: 'mers',
        type: TYPE_OF_KIND[s.kind],
        plannedMinutes: s.totalMin,
        targetZones: [],
        key: false,
        structure: walkStructure(s.totalMin, s.kind),
        status: 'planificat',
        ...(wp.short && i === 0 ? { note: wp.short } : {}),
      }));
    out.push({ ...wp, workouts });
  }
  return { weeks: out };
}

export type WalkRestriction = 'none' | 'easy' | 'short' | 'stop';

export interface WalkToday {
  /** null = azi nu e mers în plan (sau e zi de oprire). */
  spec: WalkSpec | null;
  /** Ședința din calendar (id), dacă există. */
  workoutId: string | null;
  /** De ce arată așa (restricție, fără datorie). */
  note: string | null;
  stop: boolean;
}

/**
 * Recomandarea de azi: ședința din calendar, adaptată la ziua de azi. Minutele rămase din săptămână NU se adaugă:
 * duminică cu 120 de minute rămase, recomandarea rămâne ședința zilei (cel mult capacitatea).
 */
export function walkToday(input: { today: string; plan: PlannedWorkout[]; restriction: WalkRestriction; remainingSec: number; restrictionWhy?: string | null }): WalkToday {
  const w = input.plan.find((x) => x.sport === 'mers' && x.date === input.today && (x.status === 'planificat' || x.status === 'mutat')) ?? null;
  if (input.restriction === 'stop') return { spec: null, workoutId: w?.id ?? null, note: `Azi fără mers prescris${input.restrictionWhy ? `: ${input.restrictionWhy}` : ''}. Simptomele au prioritate față de bula săptămânii; minutele nu se recuperează.`, stop: true };
  if (!w) {
    const sunday = weekday(input.today) === 6;
    return { spec: null, workoutId: null, note: `Azi nu ai mers în plan. Dacă ai chef, o plimbare ușoară se adaugă în bulă.${sunday && input.remainingSec > 0 ? ' Minutele rămase nu trec în săptămâna următoare și nu se adună azi.' : ''}`, stop: false };
  }
  const kind = walkKindOf(w);
  let spec = walkSpec(w.plannedMinutes, kind);
  let note: string | null = null;
  if (input.restriction === 'short') {
    const s = spec.shorter?.totalMin ?? spec.totalMin;
    spec = walkSpec(s, 'usor');
    note = `Azi varianta scurtă, ușoară${input.restrictionWhy ? `: ${input.restrictionWhy}` : ''}.`;
  } else if (input.restriction === 'easy' && kind !== 'usor') {
    spec = walkSpec(w.plannedMinutes, 'usor');
    note = `Azi fără mers alert${input.restrictionWhy ? `: ${input.restrictionWhy}` : ''}; aceleași minute, ușor.`;
  }
  if (weekday(input.today) === 6 && input.remainingSec > spec.totalMin * 60) note = [note, 'Ce rămâne din săptămână nu se adaugă la ședința de azi: săptămâna viitoare pornește cu ținta ei, fără datorie.'].filter(Boolean).join(' ');
  return { spec, workoutId: w.id, note, stop: false };
}

/** Restricția zilei, din decizia zilei (aceeași pentru toate ecranele). */
export function restrictionOf(level: string | null | undefined): WalkRestriction {
  return level === 'stop' ? 'stop' : level === 'rosu' ? 'short' : level === 'galben' || level === 'portocaliu' ? 'easy' : 'none';
}
