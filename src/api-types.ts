import type { LabsComparison } from './collector/labs-compare.js';
// Contractul dintre server (api/) și aplicație (apps/web): ce primește aplicația la /api/me.
// Un singur obiect, calculat pe server; aplicația nu estimează nimic. null = „fără date”.

import type { BarResult } from './bar/bar.js';
import type { EveningForm, MorningForm } from './collector/types.js';
import type { Color, Phase, PlannedWorkout, Sport } from './types.js';

export interface MeUser {
  id: string;
  email: string;
  name: string;
  goal: '70.3' | 'olimpic' | 'sprint' | 'semimaraton' | 'maraton' | 'full' | null;
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

/** Datele de bază ale protocolului, introduse de sportiv (sau încărcate mai târziu din PDF). null = încă nu există. */
export interface LabsForm {
  data: string; // data recoltării
  feritina: number | null; // µg/L
  vitamina_d: number | null; // ng/mL
  hemoglobina: number | null; // g/dL
  ck: number | null; // U/L
  crp: number | null; // mg/L
  /** Toate valorile citite din buletin (PDF/poză), cu intervalul laboratorului; confirmate de sportiv. */
  alte?: { nume: string; valoare: number | null; valoare_text: string | null; unitate: string | null; ref_text: string | null; ref_min?: number | null; ref_max?: number | null; in_afara: 'sub' | 'peste' | null }[];
  laborator?: string | null;
  /** Mai vechi de 12 luni: nu se mai folosesc în plan; trebuie analize noi. */
  expirat?: boolean;
}

export interface TestsForm {
  data: string;
  tip: 'cpet' | 'teren' | 'lactat' | 'altul';
  fcmax: number | null;
  /** Limitele superioare Z1..Z5 la alergare, bpm. */
  alergare_z: [number | null, number | null, number | null, number | null, number | null];
  pace_prag: string | null; // „5:45”
  ftp: number | null; // W
  bicicleta_z: [number | null, number | null, number | null, number | null, number | null];
  css: number | null; // s/100 m
}

export interface BodyForm {
  data: string;
  greutate: number | null; // kg
  grasime_pct: number | null;
}

export interface MeBaseline {
  labs: LabsForm | null;
  /** Comparația ultimului buletin cu cel anterior (calculată pe server). */
  labsCompare?: LabsComparison | null;
  tests: TestsForm | null;
  body: BodyForm | null;
  cardiolog: 'da' | 'nu' | 'programat' | null;
}

export interface SportTotal {
  km: number;
  ore: number;
  sedinte: number;
}

export interface Me {
  baseline: MeBaseline;
  /** Oraș (pentru vreme) și Apple Watch prin Health Auto Export. */
  profile: { city: string | null; appleConnected: boolean; appleLastSync: string | null };
  /** Doar pentru admin (primul cont): ce producători au cheile puse și adresele de copiat la ei. */
  admin: { providers: Record<'whoop' | 'strava' | 'oura', boolean>; appUrl: string } | null;
  /** Totaluri de la începutul pregătirii (data planului). null fără plan. */
  totals: { since: string; bySport: Record<Sport, SportTotal> } | null;
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
  readiness: { verdict: 'verde' | 'galben' | 'rosu' | 'stop'; reason: string | null; acwr: number | null; hooperSum: number | null } | null;
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
