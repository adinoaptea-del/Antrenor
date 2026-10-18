// Modul local (previzualizare fără server): aceeași interfață ca serverul, cu un cont GOL care trăiește în telefon.
// Nimic nu e inventat: planul iese din chestionarul tău prin generatorul real; bara, scorurile și recuperarea rămân
// „fără date” până când un server citește brățările. Build cu VITE_LOCAL=1.

import type { BodyForm, LabsForm, Me, TestsForm } from '@core/api-types.js';
import { computeBar } from '@core/bar/bar.js';
import { generatePlan } from '@core/calendar/generate.js';
import { weeklyBudget } from '@core/calendar/budget.js';
import { GOAL_LABEL, isFitnessGoal, isRunGoal } from '@core/calendar/phases.js';
import { fitnessProfile } from '@core/strength/fitness.js';
import { currentFromIntake, isBeginnerRunner, planTarget } from '@core/goals/run-target.js';
import { declaredSwimM } from '@core/bar/sport-readiness.js';
import { parsePace } from '@core/util/run.js';
import type { PlannedWorkout } from '@core/types.js';
import { addDays, diffDays, labsExpired, weekStart } from '@core/util/dates.js';
import type { EveningForm, IntakeAnswers, MorningForm, WeeklyForm } from '../forms/types';

interface LocalState {
  intake: IntakeAnswers | null;
  plan: PlannedWorkout[];
  budgetHours: number | null;
  planStart: string | null;
  morning: Record<string, MorningForm>;
  evening: Record<string, EveningForm>;
  weekly: Record<string, WeeklyForm>;
  labs: LabsForm | null;
  tests: TestsForm | null;
  body: BodyForm | null;
  lastSync: string | null;
}

const KEY = 'antrenor.local.v1';
const EMPTY: LocalState = { intake: null, plan: [], budgetHours: null, planStart: null, morning: {}, evening: {}, weekly: {}, labs: null, tests: null, body: null, lastSync: null };

function load(): LocalState {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...EMPTY, ...(JSON.parse(raw) as Partial<LocalState>) } : { ...EMPTY };
  } catch {
    return { ...EMPTY };
  }
}

function save(s: LocalState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* fără storage: starea rămâne în memorie */
  }
}

let state = load();

export function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function raceName(goal: IntakeAnswers['obiectiv'] | undefined): string | null {
  if (!goal) return null;
  if (goal === 'full') return 'Ironman';
  const l = GOAL_LABEL[goal];
  return l.charAt(0).toUpperCase() + l.slice(1);
}

function buildMe(): Me {
  const today = todayLocal();
  const i = state.intake;
  const have: string[] = [];
  const missing: string[] = [];
  (i ? have : missing).push('chestionar de intrare');
  (state.plan.length ? have : missing).push('program săptămânal');
  missing.push('Whoop', 'Garmin / ceas (prin Strava)');
  (state.tests ? have : missing).push('zone testate (CPET / test de teren)');
  (state.labs ? have : missing).push('analize de sânge');
  if (i?.sanatate.limitareMedic !== true) have.push('aviz cardiologic');
  (state.body ? have : missing).push('compoziție corporală');
  missing.push('istoric de activități');

  // Bara: fără activități nu are date — exact ce trebuie să arate.
  const bar = state.plan.length ? computeBar({ today, activities: [], plannedColorsLast4Weeks: [], cssSecPer100m: state.tests?.css ?? null, ctl: null, ctlTarget: null, openFlags: [], goal: i?.obiectiv === 'full' || !i ? '70.3' : i.obiectiv }) : null;

  const z = state.tests;
  return {
    profile: { sex: null, birthYear: null, heightCm: null, city: null, appleConnected: false, appleLastSync: null },
    admin: null,
    totals: null,
    baseline: { labs: state.labs ? { ...state.labs, expirat: labsExpired(state.labs.data, today) } : null, tests: state.tests, body: state.body, cardiolog: i?.sanatate.limitareMedic === true ? 'nu' : 'da' },
    user: { id: 'local', email: '', name: i?.nume ?? '', goal: i?.obiectiv ?? null, raceName: raceName(i?.obiectiv), raceDate: i?.dataCursa ?? null, tz: 'Europe/Bucharest' },
    consent: !!i?.consimtamant,
    intakeComplete: !!i?.consimtamant,
    today,
    phase: state.plan.length ? 'evaluare' : null,
    budgetHours: state.budgetHours,
    plan: state.plan,
    scores: {},
    activities: [],
    wellnessToday: state.body && state.body.data === today ? { hrv: null, rhr: null, sleepMin: null, bedtime: null, sleepScore: null, recoveryScore: null, source: 'manual' } : null,
    readiness: null,
    bar,
    messages: [],
    memento: null,
    forms: { intake: i, morning: state.morning[today] ?? null, evening: state.evening, weeklyDone: !!state.weekly[weekStart(today)] },
    devices: [],
    lastSync: state.lastSync,
    zones: z
      ? {
          run: z.alergare_z[0] != null && z.alergare_z[1] != null ? `Z2 ${z.alergare_z[0]}–${z.alergare_z[1]} bpm` : null,
          bike: z.ftp ? `FTP ${z.ftp} W` : z.bicicleta_z[0] != null && z.bicicleta_z[1] != null ? `Z2 ${z.bicicleta_z[0]}–${z.bicicleta_z[1]} bpm` : null,
          swim: z.css ? `CSS ${z.css} s/100 m` : null,
          source: z.tip,
        }
      : null,
    dataAvailability: { have, missing },
    warnings: [],
  };
}

export const localServer = {
  async me(): Promise<Me> {
    return buildMe();
  },
  async sync(): Promise<{ lastSync: string; reports: { provider: string; ok: boolean; rows: number; detail: string | null }[] }> {
    const now = new Date().toISOString();
    state = { ...state, lastSync: now };
    save(state);
    return { lastSync: now, reports: [] };
  },
  async form(kind: string, body: unknown): Promise<{ ok: boolean; plan?: unknown }> {
    const today = todayLocal();
    if (kind === 'intrare') {
      const intake = body as IntakeAnswers;
      if (!intake.consimtamant) throw new Error('fără consimțământ nu se salvează date de sănătate');
      if (intake.obiectiv === 'full') return { ok: false, plan: { ok: false, reason: 'Ironman complet nu e în versiunea asta a planului; alege 70.3 pentru acum.' } };
      const startDate = addDays(weekStart(today), 7);
      const r = generatePlan({
        startDate,
        raceDate: intake.dataCursa,
        goal: intake.obiectiv,
        freeBlocks: intake.program,
        sportHours: intake.oreSport ?? null,
        historyHoursPerWeek: [],
        intensityAllowed: intake.sanatate.limitareMedic === true ? 'Z2' : 'toate',
        fitness: isFitnessGoal(intake.obiectiv) ? fitnessProfile(intake.obiectiv, intake.fitness) : undefined,
        swimContinuous400: intake.inot.nivel === 'continuu_400' || intake.inot.nivel === 'peste_1500',
        level: { longestRideH: intake.bicicleta.ceaMaiLungaOre, longestRunKm: intake.alergare.ceaMaiLungaKm, easyPaceSecKm: parsePace(intake.evaluare?.ritmUsor ?? intake.alergare.ritmActual ?? null) },
        swim: { continuousM: declaredSwimM(intake.inot.nivel, !!intake.evaluare?.inot400) },
        run: isRunGoal(intake.obiectiv) ? { goalPaceSecKm: (intake.alergare.ramura ?? (intake.alergare.tinta ? 'timp' : 'finalizare')) === 'finalizare' ? null : planTarget(intake.obiectiv, intake.alergare.tinta, currentFromIntake(intake), diffDays(startDate, intake.dataCursa) / 7).paceSecKm, canDoDistance: intake.alergare.poateDistanta ?? null, longestRunKm: intake.alergare.ceaMaiLungaKm, branch: intake.alergare.ramura ?? (intake.alergare.tinta ? 'timp' : 'finalizare'), beginner: isBeginnerRunner(intake.alergare.ceaMaiLungaKm) } : undefined,
      });
      if (!r.ok) {
        state = { ...state, intake, plan: [], budgetHours: r.budgetHours, planStart: null };
        save(state);
        return { ok: false, plan: { ok: false, reason: r.reason, budgetHours: r.budgetHours } };
      }
      state = { ...state, intake, plan: r.weeks.flatMap((w) => w.workouts), budgetHours: weeklyBudget(intake.program, undefined, intake.oreSport ?? null).hours, planStart: startDate };
      save(state);
      return { ok: true, plan: { ok: true, budgetHours: r.budgetHours, weeks: r.weeks.length } };
    }
    if (kind === 'dimineata') {
      const m = body as MorningForm;
      state = { ...state, morning: { ...state.morning, [m.date]: m } };
    } else if (kind === 'seara') {
      const e = body as EveningForm;
      state = { ...state, evening: { ...state.evening, [e.activityId ?? e.date]: e } };
    } else if (kind === 'saptamanal') {
      const w = body as WeeklyForm;
      state = { ...state, weekly: { ...state.weekly, [w.weekStart]: w } };
    } else if (kind === 'analize') {
      state = { ...state, labs: body as LabsForm };
    } else if (kind === 'teste') {
      state = { ...state, tests: body as TestsForm };
    } else if (kind === 'corp') {
      state = { ...state, body: body as BodyForm };
    } else if (kind === 'aviz') {
      const aviz = (body as { aviz: 'da' | 'nu' }).aviz;
      if (state.intake) {
        state = { ...state, intake: { ...state.intake, sanatate: { ...state.intake.sanatate, avizCardiolog: aviz, limitareMedic: aviz === 'nu' } } };
        save(state);
        return localServer.form('intrare', state.intake);
      }
    } else {
      throw new Error(`formular necunoscut: ${kind}`);
    }
    save(state);
    return { ok: true };
  },
  async oauthStart(): Promise<{ url: string }> {
    throw new Error('Conectarea brățărilor cere serverul (Supabase + Vercel): pașii sunt în docs/pornire.md.');
  },
  async runAgents(): Promise<{ skipped: string }> {
    return { skipped: 'Agenții rulează pe server, cu cheia modelului. În previzualizare nu există server.' };
  },
  async regeneratePlan(preview = false): Promise<{ ok: boolean; reason?: string; budgetHours: number; preview?: boolean }> {
    if (!state.intake) return { ok: false, reason: 'fără chestionar', budgetHours: 0 };
    if (preview) return { ok: true, preview: true, budgetHours: weeklyBudget(state.intake.program, undefined, state.intake.oreSport ?? null).hours };
    const r = await localServer.form('intrare', state.intake);
    return { ok: r.ok, budgetHours: state.budgetHours ?? 0 };
  },
  reset(): void {
    state = { ...EMPTY };
    save(state);
  },
};
