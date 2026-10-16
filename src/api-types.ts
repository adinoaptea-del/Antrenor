// Contractul dintre server (api/) și aplicație (apps/web): ce primește aplicația la /api/me.
// Un singur obiect, calculat pe server; aplicația nu estimează nimic. null = „fără date”.

import type { BarResult } from './bar/bar.js';
import type { EveningForm, MorningForm } from './collector/types.js';
import type { Color, Phase, PlannedWorkout, Sport } from './types.js';

export interface MeUser {
  id: string;
  email: string;
  name: string;
  goal: '70.3' | 'olimpic' | 'sprint' | 'full' | null;
  raceName: string | null;
  raceDate: string | null;
  tz: string;
}

export interface MeActivity {
  id: string;
  source: string;
  date: string;
  sport: Sport;
  minutes: number;
  distanceKm: number | null;
  avgHr: number | null;
  maxHr: number | null;
  name: string | null;
  /** Fără pereche în plan: apare albastru și cere „ce a fost?”. */
  unplanned: boolean;
  tipNeplanificat: 'cursa' | 'antrenament' | 'altceva' | null;
}

export interface MeMessage {
  id: string;
  kind: 'dimineata' | 'dupa_antrenament' | 'saptamanal' | 'memento' | 'avertisment' | 'uman';
  body: string;
  decision: 'verde' | 'galben' | 'rosu' | 'stop' | null;
  createdAt: string;
}

export interface MeDevice {
  provider: 'whoop' | 'strava' | 'oura';
  connectedAt: string;
  lastSync: string | null;
  lastOk: boolean | null;
  detail: string | null;
}

export interface Me {
  user: MeUser;
  consent: boolean;
  intakeComplete: boolean;
  today: string;
  phase: Phase | null;
  budgetHours: number | null;
  plan: PlannedWorkout[];
  scores: Record<string, { color: Color; reasons: string[]; final: boolean }>;
  activities: MeActivity[];
  wellnessToday: { hrv: number | null; rhr: number | null; sleepMin: number | null; bedtime: string | null; sleepScore: number | null; recoveryScore: number | null; source: string | null } | null;
  readiness: { verdict: 'verde' | 'galben' | 'rosu' | 'stop'; reason: string | null } | null;
  bar: BarResult | null;
  messages: MeMessage[];
  memento: string | null;
  forms: { intake: unknown | null; morning: MorningForm | null; evening: Record<string, EveningForm>; weeklyDone: boolean };
  devices: MeDevice[];
  lastSync: string | null;
  zones: { run: string | null; bike: string | null; swim: string | null; source: string | null } | null;
  dataAvailability: { have: string[]; missing: string[] };
  warnings: { title: string; text: string; fix: string }[];
}
