// Progresia pe familii de module, din execuții (auditul v2, V2-05): treapta următoare se alege din istoricul familiei,
// nu din faza și săptămâna calendarului. Generatorul propune trepta după calendar (planul inițial); înainte de fiecare
// ședință, regula de aici o verifică pe dovezi și o păstrează, o crește, o coboară sau cere recalibrare.
//
// Decizii (reguli de produs AIRON, nu praguri fiziologice):
//  - progress: ultimele DOUĂ expuneri la treapta curentă finalizate (verde), efort ≤ cel cerut, fără durere;
//  - keep: o singură expunere bună, feedback lipsă (lipsa feedbackului NU e toleranță), sau scurtată pentru timp
//    (scurtarea pentru timp nu e incapacitate, dar nici dovadă de toleranță);
//  - regress: două expuneri la rând nereușite (roșu / portocaliu) sau durere ≥ 3 la ultima;
//  - recalibrate: peste 21 de zile fără expunere în familie → o treaptă mai jos, ca reluare.

import type { Color, PlannedWorkout, Zone } from '../types.js';
import { diffDays } from '../util/dates.js';
import { moduleStructure, parseModule, type RunModuleId } from './run-modules.js';

export interface Execution {
  workoutId: string;
  color: Color | null;
  rpe?: number | null;
  pain?: number | null;
  /** Scurtată de sportiv pentru timp („Am mai puțin timp”). */
  shortenedForTime?: boolean;
}

export type Decision = 'progress' | 'keep' | 'regress' | 'recalibrate';

interface Family {
  id: string;
  steps: string[];
  /** Treapta (indexul) din structura ședinței, sau null dacă ședința nu e din familie. */
  stepOf: (w: PlannedWorkout) => number | null;
  /** Rescrie ședința la treapta dată, în minutele ei. */
  apply: (w: PlannedWorkout, step: number) => PlannedWorkout;
  /** Efortul maxim acceptat pentru „bine tolerat” (RPE). */
  rpeMax: number;
}

const runFamily = (id: string, steps: RunModuleId[], rpeMax: number): Family => ({
  id,
  steps,
  rpeMax,
  stepOf: (w) => {
    const p = parseModule(w.structure);
    if (!p) return null;
    const i = steps.indexOf(p.id);
    return i >= 0 ? i : null;
  },
  apply: (w, step) => {
    const p = parseModule(w.structure);
    const b = moduleStructure(steps[step]!, w.plannedMinutes, p?.paceSecKm ?? null);
    return { ...w, structure: b.text, intervals: w.intervals ? { ...w.intervals, count: b.count, minutes: Math.max(1, Math.round(b.work)) } : undefined };
  },
});

const SST = [
  [3, 10],
  [3, 12],
  [2, 20],
  [3, 15],
] as const;
const sstText = (i: number) => `${SST[i]![0]} × ${SST[i]![1]} min sweet spot (Z3, „greu dar stabil”, 88–94% FTP), 5 min ușor între`;

const TEMPO = [
  { n: 2, min: 8, zones: [3] as Zone[], text: '2 × 8 min tempo (Z3), 3 min ușor între' },
  { n: 3, min: 10, zones: [3, 4] as Zone[], text: '3 × 10 min tempo (Z3–Z4), 3 min ușor între' },
];

const CSS_SETS = ['8 × 100 m la ritmul CSS, 15 s pauză', '10 × 100 m la ritmul CSS, 15 s pauză', '5 × 200 m la ritmul CSS, 20 s pauză', '4 × 300 m la ritmul CSS, 30 s pauză'];

export const FAMILIES: Family[] = [
  runFamily('T', ['T1', 'T2'], 6),
  runFamily('V5', ['V5', 'V5b'], 8),
  runFamily('V10', ['V10a', 'V10'], 7),
  {
    id: 'SST',
    steps: SST.map((_, i) => sstText(i)),
    rpeMax: 7,
    stepOf: (w) => {
      // După lungimea repetării (unică pe treaptă): numărul de repetări poate fi scăzut ca să încapă în timp.
      const m = /(\d) × (\d+) min sweet spot/.exec(w.structure ?? '');
      if (!m) return null;
      const i = SST.findIndex(([, mm]) => mm === Number(m[2]));
      return i >= 0 ? i : null;
    },
    apply: (w, i) => ({ ...w, structure: sstText(i), intervals: { count: SST[i]![0], minutes: SST[i]![1], zone: 3 } }),
  },
  {
    // Triatlon: tempo-ul de alergare (2 × 8 min Z3 → 3 × 10 min Z3–Z4).
    id: 'TEMPO',
    steps: TEMPO.map((t) => t.text),
    rpeMax: 7,
    stepOf: (w) => {
      const m = /(\d+) × (\d+) min tempo/.exec(w.structure ?? '');
      if (!m || w.sport !== 'alergare') return null;
      const i = TEMPO.findIndex((t) => t.min === Number(m[2]));
      return i >= 0 ? i : null;
    },
    apply: (w, i) => ({ ...w, structure: `${TEMPO[i]!.text} · prima repetare puțin mai ușor, ultimele cele mai bune`, targetZones: TEMPO[i]!.zones, intervals: { count: TEMPO[i]!.n, minutes: TEMPO[i]!.min, zone: TEMPO[i]!.zones.at(-1)! } }),
  },
  {
    id: 'CSS',
    steps: CSS_SETS,
    rpeMax: 7,
    stepOf: (w) => {
      const i = CSS_SETS.findIndex((s) => (w.structure ?? '').startsWith(s));
      return i >= 0 ? i : null;
    },
    apply: (w, i) => ({ ...w, structure: `${CSS_SETS[i]} (set CSS)` }),
  },
];

export interface StepDecision {
  family: string;
  decision: Decision;
  /** Treapta aleasă pentru următoarea ședință a familiei. */
  step: number;
  stepName: string;
  /** Dovezile: ce expuneri au contat și de ce. */
  evidence: string;
}

/** Decizia pentru o familie, din expunerile ei trecute (cele mai vechi primele) și treapta curentă din plan. */
export function decideFamily(f: Family, past: { date: string; step: number; ex: Execution | null }[], plannedStep: number, nextDate: string): StepDecision {
  const name = (i: number) => f.steps[i]!.split(' (')[0]!;
  const last = past.at(-1);
  if (!last) return { family: f.id, decision: 'keep', step: Math.min(plannedStep, 0), stepName: name(Math.min(plannedStep, 0)), evidence: 'prima expunere din familie: se începe cu treapta de intrare' };
  const cur = last.step;
  if (diffDays(last.date, nextDate) > 21) {
    const s = Math.max(0, cur - 1);
    return { family: f.id, decision: 'recalibrate', step: s, stepName: name(s), evidence: `ultima expunere pe ${last.date} (peste 21 de zile): reluare cu o treaptă mai jos` };
  }
  const atCur = past.filter((p) => p.step === cur);
  const ok = (e: Execution | null) => !!e && e.color === 'verde' && (e.rpe == null || e.rpe <= f.rpeMax) && (e.pain ?? 0) < 3 && !e.shortenedForTime && e.rpe != null;
  const bad = (e: Execution | null) => !!e && (e.color === 'rosu' || e.color === 'portocaliu' || (e.pain ?? 0) >= 3);
  const l2 = atCur.slice(-2);
  if (last.ex && (last.ex.pain ?? 0) >= 3) {
    const s = Math.max(0, cur - 1);
    return { family: f.id, decision: 'regress', step: s, stepName: name(s), evidence: `durere ${last.ex.pain}/10 la ultima expunere (${last.date})` };
  }
  if (past.length >= 2 && bad(past.at(-1)!.ex) && bad(past.at(-2)!.ex)) {
    const s = Math.max(0, cur - 1);
    return { family: f.id, decision: 'regress', step: s, stepName: name(s), evidence: `două expuneri la rând nereușite (${past.at(-2)!.date}, ${last.date})` };
  }
  if (l2.length === 2 && l2.every((p) => ok(p.ex)) && cur + 1 < f.steps.length) {
    const s = cur + 1;
    return { family: f.id, decision: 'progress', step: s, stepName: name(s), evidence: `${name(cur)} finalizat de două ori la rând (${l2.map((p) => `${p.date}, efort ${p.ex!.rpe}/10`).join('; ')}), fără durere` };
  }
  const why = !last.ex || last.ex.color == null ? 'fără execuție înregistrată la ultima ședință (lipsa datelor nu e toleranță)' : last.ex.rpe == null ? 'fără feedback de efort la ultima ședință: rămâne treapta, se cere feedback' : last.ex.shortenedForTime ? 'ultima ședință a fost scurtată pentru timp: nici eșec, nici dovadă de toleranță' : l2.length < 2 ? 'o singură expunere bună la treapta asta; mai trebuie una' : `ultimele expuneri nu au fost amândouă bine tolerate (${l2.map((p) => p.ex?.color ?? '—').join(', ')})`;
  return { family: f.id, decision: 'keep', step: cur, stepName: name(cur), evidence: why };
}

/**
 * Aplică deciziile pe următoarea ședință din fiecare familie (în următoarele 10 zile, de la `today`). Ședința își
 * păstrează ziua și durata; se schimbă doar treapta. Întoarce planul și deciziile (cu dovezi), inclusiv „keep”.
 */
export function applyProgression(plan: PlannedWorkout[], executions: Execution[], today: string): { plan: PlannedWorkout[]; decisions: (StepDecision & { workoutId: string; from: string })[] } {
  const byId = new Map(executions.map((e) => [e.workoutId, e]));
  const active = (w: PlannedWorkout) => w.status === 'planificat' || w.status === 'mutat';
  const out = plan.map((w) => ({ ...w }));
  const decisions: (StepDecision & { workoutId: string; from: string })[] = [];
  for (const f of FAMILIES) {
    const fam = out.filter((w) => f.stepOf(w) != null).sort((a, b) => (a.date < b.date ? -1 : 1));
    const past = fam.filter((w) => w.date < today && (byId.has(w.id) || active(w))).map((w) => ({ date: w.date, step: f.stepOf(w)!, ex: byId.get(w.id) ?? null }));
    const next = fam.find((w) => w.date >= today && active(w) && diffDays(today, w.date) <= 10);
    if (!next) continue;
    const planned = f.stepOf(next)!;
    let d = decideFamily(f, past, planned, next.date);
    // Faza din calendar e plafonul (dozarea pe faze rămâne), dovezile decid dacă se ajunge la el: „gata de treapta
    // următoare” nu sare peste ce cere faza, iar o săptămână mai ușoară din calendar rămâne mai ușoară.
    if (d.step > planned) d = { ...d, step: planned, stepName: f.steps[planned]!.split(' (')[0]!, decision: d.decision === 'progress' ? 'keep' : d.decision, evidence: `${d.evidence}; faza nu cere încă treapta următoare (plafonul fazei)` };
    const from = f.steps[planned]!.split(' (')[0]!;
    if (d.step !== planned) {
      const i = out.indexOf(next);
      out[i] = { ...f.apply(next, d.step), note: `treapta: ${d.decision} — ${d.evidence}` };
    }
    // Decizia se scrie când schimbă treapta sau în ajunul ședinței (o dată, cu dovezile), nu în fiecare dimineață.
    if (d.step !== planned || diffDays(today, next.date) <= 1) decisions.push({ ...d, workoutId: next.id, from });
  }
  // Poarta pentru intervalele 30/15 (V2-08): cel puțin două ședințe de prag / over-under bine tolerate în ultimele
  // 6 săptămâni, cea mai recentă fără durere; altfel ședința devine ritmul de obiectiv (specific, mai sigur).
  for (const w of out.filter((x) => x.date >= today && active(x) && diffDays(today, x.date) <= 10 && /30 s tare \/ 15 s ușor/.test(x.structure ?? ''))) {
    const prior = out.filter((x) => x.sport === 'bicicleta' && x.date < today && diffDays(x.date, today) <= 42 && /la prag|over-under/.test(x.structure ?? ''));
    const okN = prior.filter((x) => {
      const e = byId.get(x.id);
      return !!e && e.color === 'verde' && e.rpe != null && e.rpe <= 8 && (e.pain ?? 0) < 3;
    }).length;
    if (okN >= 2) {
      if (diffDays(today, w.date) <= 1) decisions.push({ family: '30/15', decision: 'keep', step: 0, stepName: '30/15', evidence: `${okN} ședințe de prag / over-under bine tolerate în ultimele 6 săptămâni`, workoutId: w.id, from: '30/15' });
      continue;
    }
    const i = out.indexOf(w);
    out[i] = { ...w, structure: '3 × 15 min la ritmul pe care-l ții în cursă, 5 min ușor între', targetZones: [3, 4], intervals: { count: 3, minutes: 15, zone: 3 }, note: `30/15 amânat: doar ${okN} din 2 ședințe de prag tolerate necesare (un test nu ajunge)` };
    decisions.push({ family: '30/15', decision: 'regress', step: 0, stepName: 'ritm de obiectiv', evidence: `doar ${okN} ședințe de prag / over-under bine tolerate în ultimele 6 săptămâni (trebuie 2); testul calibrează, nu deblochează`, workoutId: w.id, from: '30/15' });
  }
  return { plan: out, decisions };
}
