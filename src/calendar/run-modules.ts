// Ședințele specifice de alergare din documentul „AIRON — Antrenorul de alergare, ediția integrată” (18.10.2026).
// Fiecare modul e o ședință completă (încălzire + repetări + pauze + revenire); toate minutele intră în total.
// Modulele se înlocuiesc între ele, nu se adună. Efortul e pe scala 0–10 (RPE); ritmul apare doar când are suport în date.

import type { Zone } from '../types.js';

export type RunModuleId = 'V5' | 'V5b' | 'V10a' | 'V10' | 'T1' | 'T2' | 'H' | 'M' | 'D1' | 'R5' | 'R10' | 'RL';

export interface RunModule {
  id: RunModuleId;
  /** Ce dezvoltă și când e potrivit (eligibilitatea din document). */
  scop: string;
  warm: number;
  count: number;
  /** Lucru și pauză, minute (pot fi fracționare: 1,5 = 1:30). */
  work: number;
  rest: number;
  cool: number;
  /** Cum se numește efortul de lucru. */
  effort: string;
  rpe: string;
  zone: Zone;
  /** Ritmul de referință pentru lucru: „cursa” = ritmul de cursă al planului, null = doar efort. */
  paceRef: 'cursa' | null;
  restLabel: string;
}

export const RUN_MODULES: Record<RunModuleId, RunModule> = {
  V5: { id: 'V5', scop: 'specific 5 km, după bază consecventă și accelerări tolerate', warm: 12, count: 6, work: 1, rest: 1.5, cool: 11, effort: 'alert controlat', rpe: '7–8', zone: 5, paceRef: 'cursa', restLabel: 'ușor' },
  V5b: { id: 'V5b', scop: 'specific 5 km, varianta ulterioară (nu automat după V5)', warm: 10, count: 5, work: 2, rest: 2, cool: 10, effort: 'alert', rpe: '7–8', zone: 5, paceRef: 'cursa', restLabel: 'ușor' },
  V10a: { id: 'V10a', scop: 'intrare spre 10 km, înaintea V10', warm: 10, count: 6, work: 2, rest: 2, cool: 6, effort: 'alert', rpe: '7', zone: 4, paceRef: null, restLabel: 'ușor' },
  V10: { id: 'V10', scop: 'specific 10 km, doar după tolerarea unei doze mai mici', warm: 12, count: 4, work: 5, rest: 2, cool: 10, effort: 'solicitant controlat', rpe: '7', zone: 4, paceRef: 'cursa', restLabel: 'ușor' },
  T1: { id: 'T1', scop: 'tempo fragmentat; bază stabilă și o ședință controlată deja tolerată', warm: 12, count: 3, work: 5, rest: 2, cool: 7, effort: 'moderat controlat', rpe: '5–6', zone: 3, paceRef: null, restLabel: 'ușor' },
  T2: { id: 'T2', scop: 'progresie după T1 bine tolerat, fără să crească și viteza', warm: 12, count: 3, work: 7, rest: 2, cool: 6, effort: 'controlat', rpe: '5–6', zone: 3, paceRef: null, restLabel: 'ușor' },
  H: { id: 'H', scop: 'specific semimaraton; ritmul din date, nu cel dorit', warm: 15, count: 3, work: 8, rest: 2, cool: 10, effort: 'apropiat de cel sustenabil la semimaraton', rpe: '6–7', zone: 4, paceRef: 'cursa', restLabel: 'ușor' },
  M: { id: 'M', scop: 'specific maraton; alimentarea și controlul efortului fac parte din ședință', warm: 15, count: 3, work: 12, rest: 3, cool: 10, effort: 'de maraton realist', rpe: '5–6', zone: 3, paceRef: 'cursa', restLabel: 'ușor' },
  D1: { id: 'D1', scop: 'durabilitate; o alergare de 70 min ușoară deja tolerată; înlocuiește ieșirea lungă', warm: 50, count: 2, work: 5, rest: 3, cool: 4, effort: 'specific actual', rpe: '6–7', zone: 4, paceRef: 'cursa', restLabel: 'ușor' },
  // Întreținere în săptămâna cursei (deschidere, nu antrenament).
  R5: { id: 'R5', scop: 'deschidere înaintea cursei de 5 km', warm: 10, count: 4, work: 1, rest: 2, cool: 8, effort: 'alert relaxat', rpe: '7', zone: 4, paceRef: 'cursa', restLabel: 'ușor' },
  R10: { id: 'R10', scop: 'deschidere înaintea cursei de 10 km', warm: 12, count: 3, work: 3, rest: 2, cool: 8, effort: 'la efortul cursei', rpe: '6–7', zone: 4, paceRef: 'cursa', restLabel: 'ușor' },
  RL: { id: 'RL', scop: 'deschidere înaintea semimaratonului sau maratonului', warm: 15, count: 2, work: 6, rest: 3, cool: 10, effort: 'la efortul cursei', rpe: '5–6', zone: 3, paceRef: 'cursa', restLabel: 'ușor' },
};

const fmtMin = (m: number) => (Number.isInteger(m) ? `${m} min` : m < 1 ? `${Math.round(m * 60)} s` : `${Math.floor(m)}:${String(Math.round((m % 1) * 60)).padStart(2, '0')} min`);
const fmtPace = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}/km`;

export function moduleMinutes(m: Pick<RunModule, 'warm' | 'count' | 'work' | 'rest' | 'cool'>): number {
  return m.warm + m.count * (m.work + m.rest) + m.cool;
}

/**
 * Textul ședinței, potrivit în `minutes` (dacă e dat): întâi scade numărul de repetări (minimum 2), apoi încălzirea și
 * revenirea (minimum 8 și 5). Cu timp mai mult nu crește doza: restul rămâne alergare ușoară la revenire, cel mult +10.
 */
export function moduleStructure(id: RunModuleId, minutes?: number | null, paceSecKm?: number | null): { text: string; minutes: number; count: number; work: number; zone: Zone } {
  const base = RUN_MODULES[id];
  const m = { ...base };
  if (minutes != null && minutes > 0) {
    while (moduleMinutes(m) > minutes && m.count > 2) m.count -= 1;
    while (moduleMinutes(m) > minutes && m.warm > 8) m.warm -= 1;
    while (moduleMinutes(m) > minutes && m.cool > 5) m.cool -= 1;
    const extra = minutes - moduleMinutes(m);
    if (extra > 0) m.cool += Math.min(10, Math.floor(extra));
  }
  const pace = m.paceRef === 'cursa' && paceSecKm ? ` (orientativ ${fmtPace(paceSecKm)})` : '';
  const warmText = id === 'D1' ? `${m.warm} min ușor` : `${m.warm} min încălzire ușoară`;
  const text = `${id} · ${warmText} + ${m.count} × (${fmtMin(m.work)} ${m.effort}, RPE ${m.rpe}${pace} + ${fmtMin(m.rest)} ${m.restLabel}) + ${m.cool} min revenire`;
  return { text, minutes: Math.round(moduleMinutes(m)), count: m.count, work: m.work, zone: m.zone };
}

/** Recunoaște un modul în textul din plan („V5 · …”) și ritmul orientativ, ca să-l poată potrivi din nou în alt timp. */
export function parseModule(structure: string | null | undefined): { id: RunModuleId; paceSecKm: number | null } | null {
  const m = /^(V5b|V5|V10a|V10|T1|T2|H|M|D1|R5|R10|RL) · /.exec(structure ?? '');
  if (!m) return null;
  const p = /orientativ (\d+):(\d{2})\/km/.exec(structure ?? '');
  return { id: m[1] as RunModuleId, paceSecKm: p ? Number(p[1]) * 60 + Number(p[2]) : null };
}

/**
 * Mers-alergare pentru debutant sau revenire: 5 min mers + N × (alergare ușoară + mers) + 5 min mers.
 * Treapta crește doar după expuneri tolerate; generatorul o urcă la două săptămâni.
 */
const LADDER: { run: number; walk: number }[] = [
  { run: 1, walk: 1.5 },
  { run: 2, walk: 1.5 },
  { run: 3, walk: 1.5 },
  { run: 4, walk: 1 },
  { run: 6, walk: 1 },
  { run: 8, walk: 1 },
  { run: 12, walk: 1 },
];
export const WALK_RUN_STEPS = LADDER.length;

export function walkRunStructure(step: number, minutes: number): string | null {
  const s = LADDER[Math.max(0, Math.min(step, LADDER.length - 1))]!;
  if (step >= LADDER.length) return null; // alergare continuă, mersul rămâne permis
  const n = Math.max(2, Math.floor((minutes - 10) / (s.run + s.walk)));
  return `mers-alergare: 5 min mers + ${n} × (${fmtMin(s.run)} alergare ușoară + ${fmtMin(s.walk)} mers) + 5 min mers; dacă e prea greu, rămâi la treapta de data trecută`;
}

/** Pașii ședinței (încălzire / principal / revenire), din aceleași cifre ca textul din plan. */
export function moduleSteps(structure: string | null | undefined, minutes: number): { label: string; text: string }[] | null {
  const p = parseModule(structure);
  if (!p) return null;
  const base = RUN_MODULES[p.id];
  const m = { ...base };
  while (moduleMinutes(m) > minutes && m.count > 2) m.count -= 1;
  while (moduleMinutes(m) > minutes && m.warm > 8) m.warm -= 1;
  while (moduleMinutes(m) > minutes && m.cool > 5) m.cool -= 1;
  const extra = minutes - moduleMinutes(m);
  if (extra > 0) m.cool += Math.min(10, Math.floor(extra));
  const pace = m.paceRef === 'cursa' && p.paceSecKm ? `, orientativ ${fmtPace(p.paceSecKm)}` : '';
  return [
    { label: 'Încălzire', text: p.id === 'D1' ? `${m.warm} min ușor, RPE 2–3` : `${m.warm} min ușor, progresiv, cu mobilitate dinamică; înaintea repetărilor câteva accelerări controlate` },
    { label: 'Principal', text: `${m.count} × ${fmtMin(m.work)} ${m.effort} (RPE ${m.rpe}${pace}), cu ${fmtMin(m.rest)} ${m.restLabel} între; prima repetare puțin mai ușor` },
    { label: 'Revenire', text: `${m.cool} min ușor` },
  ];
}

export const MODULE_PURPOSE: Record<RunModuleId, string> = {
  V5: 'Specific 5 km: ritmul de cursă devine familiar, controlat, fără epuizare.',
  V5b: 'Specific 5 km: repetări mai lungi la efortul de cursă.',
  V10a: 'Intrarea spre 10 km: repetări scurte, alerte, înainte de bucățile lungi.',
  V10: 'Specific 10 km: efortul de cursă ținut în bucăți de 5 minute.',
  T1: 'Tempo fragmentat: efort moderat controlat, rezistența la ritm fără stresul intervalelor.',
  T2: 'Tempo fragmentat, mai mult timp de lucru la același efort.',
  H: 'Specific semimaraton: efortul pe care-l poți ține 21 km.',
  M: 'Specific maraton: efortul de cursă și alimentarea, exersate împreună.',
  D1: 'Durabilitate: efort specific pe picioare deja obosite, fără durată în plus.',
  R5: 'Deschidere înainte de cursă: picioarele „treze”, fără oboseală.',
  R10: 'Deschidere înainte de cursă: efortul cursei, puțin.',
  RL: 'Deschidere înainte de cursă: efortul cursei, puțin.',
};
