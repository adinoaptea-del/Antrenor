// Răspunsurile stau local (localStorage) în demo; în aplicația reală același obiect pleacă în tabelul `questionnaires`.
// Toate citirile/scrierile sunt în try/catch: fără storage, formularele merg doar în sesiunea curentă.

import { useSyncExternalStore } from 'react';
import type { EveningForm, IntakeAnswers, MorningForm, WeeklyForm } from './types';

export interface FormsState {
  intake?: IntakeAnswers;
  morning: Record<string, MorningForm>; // cheie: data
  evening: Record<string, EveningForm>; // cheie: activityId sau data
  weekly: Record<string, WeeklyForm>; // cheie: lunea săptămânii
  unplanned: Record<string, 'cursa' | 'antrenament' | 'altceva'>; // cheie: activityId
  lastSync: string | null; // ISO
}

const KEY = 'antrenor.forms.v1';
const EMPTY: FormsState = { morning: {}, evening: {}, weekly: {}, unplanned: {}, lastSync: null };

let state: FormsState = load();
const listeners = new Set<() => void>();

function load(): FormsState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<FormsState>;
    return { ...EMPTY, ...parsed };
  } catch {
    return EMPTY;
  }
}

function persist(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* fără storage: starea rămâne în memorie */
  }
}

export function update(fn: (s: FormsState) => FormsState): void {
  state = fn(state);
  persist();
  for (const l of listeners) l();
}

export function useForms(): FormsState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => state,
  );
}

export const forms = {
  read: (): FormsState => state,
  saveIntake: (intake: IntakeAnswers) => update((s) => ({ ...s, intake })),
  saveMorning: (m: MorningForm) => update((s) => ({ ...s, morning: { ...s.morning, [m.date]: m } })),
  saveEvening: (e: EveningForm) => update((s) => ({ ...s, evening: { ...s.evening, [e.activityId ?? e.date]: e } })),
  saveWeekly: (w: WeeklyForm) => update((s) => ({ ...s, weekly: { ...s.weekly, [w.weekStart]: w } })),
  saveUnplanned: (activityId: string, tip: 'cursa' | 'antrenament' | 'altceva') => update((s) => ({ ...s, unplanned: { ...s.unplanned, [activityId]: tip } })),
  setLastSync: (iso: string) => update((s) => ({ ...s, lastSync: iso })),
  reset: () => update(() => EMPTY),
};
