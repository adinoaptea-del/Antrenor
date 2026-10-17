import { DOSE_TEXT, dayById, doseFor, rotation } from '../strength/ppl.js';
import { enforceLimits, fitStructure } from './validate.js';
// Generatorul primului calendar: din bugetul de ore real, din volumul ultimelor 8 săptămâni și din data cursei.
// Dacă orele nu ajung pentru cursă, răspunsul e `ok: false` cu variante — nu un plan comprimat.

import type { FreeBlock, IntensityAllowed, Phase, PlannedWorkout, Sport, WorkoutType, Zone } from '../types.js';
import { addDays } from '../util/dates.js';
import { weeklyBudget } from './budget.js';
import { PHASE_HOURS, isRunGoal, phaseWeeks, type Goal, type PhaseWeek } from './phases.js';

export interface GenerateInput {
  startDate: string;
  raceDate: string;
  goal: Goal;
  freeBlocks: FreeBlock[];
  /** Ore totale pe săptămână, ultimele până la 8 săptămâni (din activități). Gol = fără istoric. */
  historyHoursPerWeek: number[];
  intensityAllowed: IntensityAllowed;
  swimContinuous400: boolean;
  /** Nivelul de acum din chestionar: de aici pornesc ședințele lungi (nu de la o valoare fixă). */
  level?: { longestRideH?: number | null; longestRunKm?: number | null; easyPaceSecKm?: number | null };
  /** Ce sporturi au deja date de test (zone/prag/CSS): pentru ele evaluarea nu mai pune test. */
  tests?: { alergare: boolean; bicicleta: boolean; inot: boolean };
  /** Vârsta și sexul. Vârsta schimbă structura (descărcare mai des, fără intervale VO2max după 55); sexul nu schimbă volumul, doar nutriția și pragurile analizelor. */
  athlete?: { age: number | null; sex: 'm' | 'f' | null };
  /** Doar la semimaraton / maraton: ritmul-țintă de cursă (s/km) și dacă poate alerga deja distanța. */
  run?: { goalPaceSecKm: number | null; canDoDistance: boolean | null; longestRunKm?: number | null };
}

export interface WeekPlan {
  weekStart: string;
  phase: Phase;
  recovery: boolean;
  targetHours: number;
  plannedHours: number;
  workouts: PlannedWorkout[];
  notes: string[];
}

export type GenerateResult =
  | { ok: true; weeks: WeekPlan[]; budgetHours: number }
  | { ok: false; reason: string; budgetHours: number; minimumHours: number; options: string[] };

interface Session {
  sport: Sport;
  type: WorkoutType;
  minutes: number;
  zones: Zone[];
  key: boolean;
  priority: number; // 1 = se plasează prima
  structure?: string;
  intervals?: { count: number; minutes: number; zone: Zone };
  step?: number;
}

const RECOVERY_FACTOR = 0.65;
const CHANGE_MIN = 10; // minute de schimbat/duș în jurul unei ședințe
/** Sub aceste durate o ședință nu mai are sens; se taie, nu se scurtează. */
const MIN_SESSION_MIN: Record<Sport, number> = { inot: 30, alergare: 30, bicicleta: 40, forta: 30 };

export function generatePlan(input: GenerateInput): GenerateResult {
  const budget = weeklyBudget(input.freeBlocks);
  const age = input.athlete?.age ?? null;
  const weeks = phaseWeeks(input.startDate, input.raceDate, age != null && age >= 40 ? 3 : 4);
  const hours = PHASE_HOURS[input.goal];

  const phasesUsed = [...new Set(weeks.map((w) => w.phase))];
  const minimumHours = Math.max(...phasesUsed.map((p) => hours[p].min));
  if (budget.hours < minimumHours) {
    const missing = Math.round((minimumHours - budget.hours) * 10) / 10;
    return {
      ok: false,
      reason: `Ai ${budget.hours} ore pe săptămână disponibile; pentru ${input.goal} ai nevoie de cel puțin ${minimumHours} în ${phasesUsed.includes('build') ? 'build' : 'faza cea mai încărcată'}.`,
      budgetHours: budget.hours,
      minimumHours,
      options: [
        `eliberezi ${missing} ore pe săptămână (blocuri de minimum 45 de minute)`,
        input.goal === '70.3' ? 'schimbi cursa cu una olimpică' : input.goal === 'maraton' ? 'alegi un semimaraton' : 'schimbi cursa cu una mai scurtă',
        'muți data cursei',
      ],
    };
  }

  const history = input.historyHoursPerWeek.filter((h) => h > 0);
  const avgHistory = history.length ? history.reduce((a, b) => a + b, 0) / history.length : 0;
  const firstPhase = weeks[0]!.phase;
  // Doza de start: din ce a făcut sportivul (istoric canonic), nu din șablon. Cu istoric, prima săptămână pornește de la
  // media lui (+ cel mult 2 h, ca să încapă toate sporturile la minimum); fără istoric, de la 60% din ținta fazei.
  // Timpul liber e plafonul, nu doza.
  let prevLoaded = history.length ? Math.min(Math.max(avgHistory, 0.6 * hours[firstPhase].target), avgHistory + 2) : 0.6 * hours[firstPhase].target;

  const runGoal = isRunGoal(input.goal);
  // La alergare, ieșirea lungă pornește de la ce poate sportivul acum (nu de la zero, nici peste).
  const startLong = runGoal ? (input.run?.canDoDistance ? (input.goal === 'maraton' ? 100 : 80) : (input.run?.longestRunKm ?? 0) >= 12 ? 70 : 50) : 60;
  // Triatlon: tura lungă pornește de la ~80% din cea mai lungă tură recentă (60–120 min), ieșirea lungă de la ~80% din cea mai lungă alergare (40–75 min).
  const lvl = input.level ?? {};
  // Ieșirile lungi pornesc de la ce a demonstrat sportivul (cel mult +25%), nu de la minimul șablonului: 15 min de
  // bicicletă nu devin 60. Podeaua e durata minimă a unei ședințe din sportul respectiv.
  const triRide = lvl.longestRideH ? Math.min(120, Math.max(MIN_SESSION_MIN.bicicleta, Math.round((lvl.longestRideH * 60 * 1.25) / 5) * 5)) : 60;
  const triRun = lvl.longestRunKm ? Math.min(75, Math.max(MIN_SESSION_MIN.alergare, Math.round((lvl.longestRunKm * ((lvl.easyPaceSecKm ?? 420) / 60) * 1.25) / 5) * 5)) : 45;
  const prog = { longRide: runGoal ? 90 : triRide, longRun: runGoal ? startLong : triRun, brickRun: 15 };
  const out: WeekPlan[] = [];

  for (const pw of weeks) {
    const ph = hours[pw.phase];
    let target: number;
    if (pw.recovery) {
      target = round1(prevLoaded * RECOVERY_FACTOR);
    } else {
      // Cu istoric, creșterea pornește din ce a făcut sportivul (+10%/săpt.), fără saltul la 60% din ținta fazei.
      target = Math.min(ph.target, Math.max(prevLoaded * 1.1, history.length ? 0 : 0.6 * ph.target));
      target = round1(Math.min(target, budget.hours));
      prevLoaded = target;
    }

    if (runGoal) advanceRunProgression(prog, pw, input.goal as 'semimaraton' | 'maraton');
    else advanceProgression(prog, pw);
    const sessions = runGoal ? runWeekTemplate(pw, input, prog) : weekTemplate(pw, input, prog);
    const minCount: Partial<Record<Sport, number>> = runGoal ? { alergare: 3, forta: 1 } : { inot: 2, bicicleta: 2, alergare: 2, forta: 1 };
    const fitted = fitToHours(sessions, target, pw.recovery, minCount);
    const placed = place(fitted.sessions, budget.blocks, pw.weekStart, pw.phase, minCount);
    const plannedHours = round1(placed.workouts.reduce((s, w) => s + w.plannedMinutes, 0) / 60);

    out.push({
      weekStart: pw.weekStart,
      phase: pw.phase,
      recovery: pw.recovery,
      targetHours: target,
      plannedHours,
      workouts: placed.workouts,
      notes: [...fitted.notes, ...placed.notes],
    });
  }

  assignStrengthDays(out);
  // Validatorul final: nicio fază sau șablon nu trece de limita de intensitate și de capacitatea de înot declarată.
  const limits = { intensityAllowed: input.intensityAllowed, swimContinuous400: input.swimContinuous400 };
  for (const w of out) {
    const v = enforceLimits(w.workouts, limits);
    // Nimic după cursă (nici în săptămâna ei, dacă e la mijlocul săptămânii); durata și repetările din aceleași cifre.
    w.workouts = v.workouts.filter((x) => x.date < input.raceDate).map(fitStructure);
    if (v.notes.length) w.notes.push(...v.notes);
  }
  return { ok: true, weeks: out, budgetHours: budget.hours };
}

/** Durata ședinței de forță: programul complet cere ~55–60 min (2–5 min pauză între seturi); menținerea mai puțin. */
function strengthMinutes(p: Phase): number {
  return p === 'taper' ? 35 : p === 'peak' ? 40 : p === 'build' ? 50 : 55;
}

/**
 * Ședințele de forță primesc pe rând zilele programului Push / Pull / Legs, în ordinea din program, pe tot planul
 * (Pull 1 se compară cu Pull 1-ul de data trecută). Doza ține de fază (doseFor).
 * Picioarele: nu în ziua dinaintea unei ședințe-cheie (ieșirea/tura lungă, calitate) — trec la următoarea ședință de forță;
 * în taper nu se fac deloc.
 */
export function assignStrengthDays(weeks: WeekPlan[]): void {
  const all = weeks.flatMap((w) => w.workouts.map((x) => ({ x, phase: w.phase })));
  const keyDates = new Set(all.filter((o) => o.x.key).map((o) => o.x.date));
  const strength = all.filter((o) => o.x.type === 'forta').sort((a, b) => (a.x.date < b.x.date ? -1 : 1));
  const perWeek = Math.max(...weeks.map((w) => w.workouts.filter((x) => x.type === 'forta').length), 0);
  const rot = rotation(perWeek);
  let i = 0;
  let deferredLegs = false;
  for (const o of strength) {
    const legsBlocked = keyDates.has(addDays(o.x.date, 1)) || o.phase === 'taper';
    let id: string;
    if (deferredLegs && !legsBlocked) {
      id = 'legs';
      deferredLegs = false;
    } else {
      id = rot[i++ % rot.length]!;
      if (id === 'legs' && legsBlocked) {
        if (o.phase !== 'taper') deferredLegs = true; // în taper picioarele nu se mai recuperează
        id = rot[i++ % rot.length]!;
      }
    }
    const day = dayById(id)!;
    const dose = doseFor(o.phase);
    o.x.structure = `${day.name} · ${DOSE_TEXT[dose]}`;
  }
}

/** Progresia ședințelor lungi: +15 min la două săptămâni pe bicicletă, +10 pe alergare, cu plafoane pe fază. */
function advanceProgression(prog: { longRide: number; longRun: number; brickRun: number }, pw: PhaseWeek): void {
  if (pw.recovery) return;
  const caps: Record<Phase, { ride: number; run: number; brick: number }> = {
    evaluare: { ride: 90, run: 60, brick: 0 },
    baza1: { ride: 150, run: 90, brick: 0 },
    baza2: { ride: 180, run: 100, brick: 20 },
    build: { ride: 210, run: 105, brick: 40 },
    peak: { ride: 180, run: 100, brick: 30 },
    taper: { ride: 90, run: 60, brick: 15 },
  };
  const cap = caps[pw.phase];
  if (pw.weekInPhase > 0 && pw.weekInPhase % 2 === 0) prog.longRide = Math.min(cap.ride, prog.longRide + 15);
  if (pw.weekInPhase > 0) prog.longRun = Math.min(cap.run, prog.longRun + (pw.phase === 'baza1' ? 10 : pw.weekInPhase % 2 === 0 ? 10 : 0));
  if (pw.phase === 'baza2' || pw.phase === 'build') prog.brickRun = Math.min(cap.brick, Math.max(prog.brickRun, 15) + (pw.weekInPhase % 2 === 0 ? 5 : 0));
  if (pw.phase === 'peak') prog.brickRun = 30;
  if (pw.phase === 'taper') {
    prog.longRide = Math.min(prog.longRide, 90); // taper-ul scade, nu urcă niciodată
    prog.longRun = Math.min(prog.longRun, 60);
    prog.brickRun = 15;
  }
  prog.longRide = Math.min(prog.longRide, cap.ride);
  prog.longRun = Math.min(prog.longRun, cap.run);
}

/** Ieșirea lungă la semimaraton / maraton: +10 min pe săptămână (fără descărcări), plafon pe fază. */
function advanceRunProgression(prog: { longRun: number }, pw: PhaseWeek, goal: 'semimaraton' | 'maraton'): void {
  if (pw.recovery) return;
  const caps: Record<'semimaraton' | 'maraton', Record<Phase, number>> = {
    semimaraton: { evaluare: 70, baza1: 85, baza2: 100, build: 115, peak: 120, taper: 60 },
    maraton: { evaluare: 90, baza1: 120, baza2: 150, build: 175, peak: 180, taper: 75 },
  };
  const cap = caps[goal][pw.phase];
  if (pw.phase === 'taper') {
    prog.longRun = cap;
    return;
  }
  if (pw.weekInPhase > 0) prog.longRun += 10;
  prog.longRun = Math.min(prog.longRun, cap);
}

function fmtPace(sec: number): string {
  const t = Math.round(sec);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}/km`;
}

/** Săptămâna la semimaraton / maraton: 2 alergări ușoare, una de calitate, ieșirea lungă, forță. */
function runWeekTemplate(pw: PhaseWeek, input: GenerateInput, prog: { longRun: number }): Session[] {
  const p = pw.phase;
  const s: Session[] = [];
  const pace = input.run?.goalPaceSecKm ?? null;
  const race = input.goal === 'maraton' ? 'maraton' : 'semimaraton';
  const quality = qualitySession(input.intensityAllowed, p, input.athlete?.age ?? null);
  const early = p === 'evaluare' || p === 'baza1';

  s.push({ sport: 'alergare', type: 'z2', minutes: early ? 40 : p === 'taper' ? 30 : 50, zones: [2], key: false, priority: 6 });
  s.push({ sport: 'alergare', type: 'z2', minutes: early ? 35 : p === 'taper' ? 25 : 45, zones: [1, 2], key: false, priority: 7, structure: 'ușor + 4–6 accelerări de 20 s' });

  const q = quality(p === 'taper' ? 35 : early ? 45 : 60);
  // Din build, calitatea devine specifică: bucăți la ritmul de cursă.
  if (q.type === 'calitate' && (p === 'build' || p === 'peak' || p === 'taper') && pace) {
    q.zones = [3, 4];
    q.structure = race === 'maraton' ? `3 × 15 min la ritm de maraton (${fmtPace(pace)}), 3 min ușor între` : `3 × 12 min la ritm de semimaraton (${fmtPace(pace)}), 3 min ușor între`;
    q.intervals = { count: 3, minutes: race === 'maraton' ? 15 : 12, zone: 4 };
  }
  s.push(q);

  if (!(p === 'taper' && pw.weekInPhase > 0)) {
    const specific = (p === 'build' || p === 'peak') && pace && input.intensityAllowed !== 'Z2';
    s.push({
      sport: 'alergare',
      type: 'lung',
      minutes: prog.longRun,
      zones: [2],
      key: true,
      priority: 1,
      structure: specific ? `ușor, cu ultimele ${race === 'maraton' ? 30 : 20} min la ritm de cursă (${fmtPace(pace!)})` : 'ușor, conversațional',
    });
  }

  for (const t of fieldTests(pw, input, ['alergare'])) {
    const easy = s.findIndex((x) => x.sport === 'alergare' && x.type === 'z2' && !x.key);
    if (easy >= 0) s.splice(easy, 1, t);
  }

  const fortaCount = p === 'taper' ? 1 : 2;
  for (let i = 0; i < fortaCount; i++) {
    s.push({ sport: 'forta', type: 'forta', minutes: strengthMinutes(p), zones: [], key: false, priority: i === 0 ? 4 : 6.5, structure: 'forță (Push / Pull / Legs)' });
  }

  if (pw.recovery) {
    for (const x of s) {
      x.minutes = Math.round((x.minutes * RECOVERY_FACTOR) / 5) * 5;
      x.key = false;
      if (x.type === 'calitate') {
        x.type = 'z2';
        x.zones = [2];
        x.structure = undefined;
        x.intervals = undefined;
      }
    }
  }
  return s;
}

function weekTemplate(pw: PhaseWeek, input: GenerateInput, prog: { longRide: number; longRun: number; brickRun: number }): Session[] {
  const p = pw.phase;
  const s: Session[] = [];
  const swimMin = input.swimContinuous400 ? (p === 'baza1' || p === 'evaluare' ? 40 : 45) : 30;
  const quality = qualitySession(input.intensityAllowed, p, input.athlete?.age ?? null);

  // Înot: 3 ședințe scurte, tehnica înainte de volum.
  const swimCount = p === 'taper' ? 2 : 3;
  for (let i = 0; i < swimCount; i++) {
    if ((p === 'build' || p === 'peak') && i === 1 && input.intensityAllowed !== 'Z2' && input.swimContinuous400) s.push({ sport: 'inot', type: 'calitate', minutes: 45, zones: [3, 4], key: false, priority: 5, structure: p === 'peak' ? 'set CSS la ritm de cursă' : 'set CSS' });
    else if (p === 'peak' && i === 0) s.push({ sport: 'inot', type: 'lung', minutes: 60, zones: [2, 3], key: false, priority: 5, structure: 'distanța de cursă continuu' });
    else s.push({ sport: 'inot', type: 'tehnica', minutes: p === 'taper' ? 35 : swimMin, zones: [1, 2], key: false, priority: 5, structure: 'un element de tehnică' });
  }

  // Bicicletă: a doua ședință crește și ea în trepte: Z2 în evaluare/baza1, sweet spot (Z3) în baza2, prag (Z4) în build, ritm de cursă în peak.
  if (p === 'baza2' && input.intensityAllowed !== 'Z2') s.push({ sport: 'bicicleta', type: 'calitate', minutes: 75, zones: [3], key: false, priority: 5.5, structure: '3 × 10 min sweet spot (Z3), 5 min ușor între' });
  else if (p === 'build' && input.intensityAllowed !== 'Z2') s.push({ sport: 'bicicleta', type: 'calitate', minutes: 75, zones: [4], key: false, priority: 5.5, structure: '2 × 15 min la prag (Z4), 5 min ușor între' });
  else if (p === 'peak' && input.intensityAllowed !== 'Z2') s.push({ sport: 'bicicleta', type: 'calitate', minutes: 75, zones: [3, 4], key: false, priority: 5.5, structure: '3 × 15 min la ritm de cursă, 5 min ușor între' });
  else s.push({ sport: 'bicicleta', type: 'z2', minutes: p === 'baza1' || p === 'evaluare' ? 60 : p === 'taper' ? 45 : 75, zones: [2], key: false, priority: 5.8 });
  if (p === 'evaluare' || p === 'baza1') {
    s.push({ sport: 'bicicleta', type: 'lung', minutes: prog.longRide, zones: [2], key: true, priority: 1 });
  } else if (p === 'taper' && pw.weekInPhase > 0) {
    s.push({ sport: 'bicicleta', type: 'calitate', minutes: 40, zones: [3, 4], key: false, priority: 3, structure: '3 × 5 min la pace de cursă' });
  } else {
    s.push({
      sport: 'bicicleta',
      type: 'brick',
      minutes: prog.longRide + prog.brickRun,
      zones: [2],
      key: true,
      priority: 1,
      structure: `tură ${prog.longRide} min Z2 + alergare ${prog.brickRun} min imediat după`,
    });
  }

  // Alergare: Z2 + calitate (dacă e permisă) + lungă.
  s.push({ sport: 'alergare', type: 'z2', minutes: p === 'baza1' || p === 'evaluare' ? 45 : p === 'taper' ? 30 : 50, zones: [2], key: false, priority: 6 });
  s.push(quality(p === 'taper' ? 30 : p === 'baza1' || p === 'evaluare' ? 50 : 55));
  if (!(p === 'taper' && pw.weekInPhase > 0)) {
    s.push({ sport: 'alergare', type: 'lung', minutes: prog.longRun, zones: [2], key: true, priority: 2 });
  }

  // Testele înlocuiesc o ședință ușoară a aceluiași sport din săptămâna lor.
  for (const t of fieldTests(pw, input, ['inot', 'bicicleta', 'alergare'])) {
    const easy = s.findIndex((x) => x.sport === t.sport && (x.type === 'z2' || x.type === 'tehnica') && !x.key);
    if (easy >= 0) s.splice(easy, 1, t);
    else s.push(t);
  }

  // Forță: programul Push / Pull / Legs, 2 ședințe pe săptămână (una în taper); ziua din rotație se pune după plasare.
  const fortaCount = p === 'taper' ? 1 : 2;
  for (let i = 0; i < fortaCount; i++) {
    s.push({ sport: 'forta', type: 'forta', minutes: strengthMinutes(p), zones: [], key: false, priority: i === 0 ? 4 : 6.5, structure: 'forță (Push / Pull / Legs)' });
  }

  if (pw.recovery) {
    for (const x of s) {
      x.minutes = Math.round((x.minutes * RECOVERY_FACTOR) / 5) * 5;
      x.key = false;
      if (x.type === 'calitate') {
        x.type = 'z2';
        x.zones = [2];
        x.structure = undefined;
        x.intervals = undefined;
      }
    }
  }
  return s;
}

/**
 * Calitatea la alergare crește în trepte, de la o fază la alta (crescendo):
 * evaluare = fără calitate (doar accelerări); baza1 = tempo scurt; baza2 = tempo lung; build = prag (Z4);
 * peak = intervale VO2max (Z5) — cel mai intens abia aproape de cursă.
 */
function qualitySession(allowed: IntensityAllowed, phase: Phase, age: number | null = null): (minutes: number) => Session {
  return (minutes) => {
    if (allowed === 'Z2') return { sport: 'alergare', type: 'z2', minutes: Math.round(minutes * 0.9), zones: [2], key: false, priority: 6, structure: 'calitatea e blocată până la avizul cardiologic' };
    if (phase === 'evaluare') return { sport: 'alergare', type: 'z2', minutes: Math.round(minutes * 0.9), zones: [2], key: false, priority: 6, structure: 'ușor + 6 accelerări de 20 s (fără calitate în evaluare)' };
    const capZ4 = allowed === 'pana_la_Z4' || (age != null && age >= 55);
    if (phase === 'baza1') return { sport: 'alergare', type: 'calitate', minutes, zones: [3], key: true, priority: 3, structure: '2 × 8 min tempo (Z3), 3 min ușor între', intervals: { count: 2, minutes: 8, zone: 3 } };
    if (phase === 'baza2' || phase === 'taper') return { sport: 'alergare', type: 'calitate', minutes, zones: [3, 4], key: true, priority: 3, structure: '3 × 10 min tempo (Z3–Z4), 3 min ușor între', intervals: { count: 3, minutes: 10, zone: 4 } };
    if (phase === 'build' || capZ4) return { sport: 'alergare', type: 'calitate', minutes, zones: [4], key: true, priority: 3, structure: '4–5 × 6 min la prag (Z4), 2 min ușor între', intervals: { count: 5, minutes: 6, zone: 4 } };
    return { sport: 'alergare', type: 'calitate', minutes, zones: [4, 5], key: true, priority: 3, structure: '5–6 × 3 min intervale (Z5), 3 min ușor între', intervals: { count: 5, minutes: 3, zone: 5 } };
  };
}

/** Testele de teren: în evaluare (doar unde lipsesc datele) și reluate la începutul fazelor baza2 și build. */
function fieldTests(pw: PhaseWeek, input: GenerateInput, sports: Sport[]): Session[] {
  if (pw.recovery || input.intensityAllowed === 'Z2') return [];
  const have = input.tests ?? { alergare: false, bicicleta: false, inot: false };
  const out: Session[] = [];
  const due = (sport: Sport, week: number) =>
    (pw.phase === 'evaluare' && pw.weekInPhase === week && !have[sport as 'alergare' | 'bicicleta' | 'inot']) || ((pw.phase === 'baza2' || pw.phase === 'build') && pw.weekInPhase === 0);
  if (sports.includes('alergare') && due('alergare', 1)) out.push({ sport: 'alergare', type: 'calitate', minutes: 50, zones: [4, 5], key: true, priority: 2.5, structure: 'TEST: 15 min ușor, 30 min cât de tare poți constant (pulsul mediu din ultimele 20 min = prag), 5 min ușor' });
  if (sports.includes('bicicleta') && due('bicicleta', 1)) out.push({ sport: 'bicicleta', type: 'calitate', minutes: 55, zones: [4, 5], key: true, priority: 2.5, structure: 'TEST: 20 min încălzire, 20 min cât de tare poți constant (FTP ≈ 95% din puterea medie; fără putere: pulsul mediu), 10 min ușor' });
  if (sports.includes('inot') && input.swimContinuous400 && due('inot', 2)) out.push({ sport: 'inot', type: 'calitate', minutes: 40, zones: [4, 5], key: true, priority: 2.5, structure: 'TEST CSS: încălzire, 400 m tare, 5 min pauză, 200 m tare; notează timpii' });
  return out;
}

/**
 * Potrivește ședințele la orele-țintă. Fiecare sport rămâne prezent din prima săptămână (minimum pe sport:
 * la triatlon 2 înot, 2 bicicletă, 2 alergare, 1 forță), adaptat ca durată la nivelul și orele sportivului:
 * întâi se scurtează, abia apoi cade ce e peste minimum, iar la nevoie se scurtează și ședințele-cheie.
 */
function fitToHours(sessions: Session[], targetHours: number, recovery: boolean, minCount: Partial<Record<Sport, number>>): { sessions: Session[]; notes: string[] } {
  const notes: string[] = [];
  const targetMin = targetHours * 60;
  let all = sessions.map((x) => ({ ...x }));
  const total = () => all.reduce((n, x) => n + x.minutes, 0);
  const count = (sp: Sport) => all.filter((x) => x.sport === sp).length;
  const floorOf = (x: Session) => (x.key ? Math.max(MIN_SESSION_MIN[x.sport], x.type === 'lung' || x.type === 'brick' ? (x.sport === 'bicicleta' ? 60 : 40) : 30) : MIN_SESSION_MIN[x.sport]);

  // 1. Scurtează ședințele ușoare până la minimul lor.
  const shrink = (pred: (x: Session) => boolean) => {
    const over = total() - targetMin;
    if (over <= 0) return;
    const pool = all.filter(pred);
    const room = pool.reduce((n, x) => n + (x.minutes - floorOf(x)), 0);
    if (room <= 0) return;
    const f = Math.min(1, over / room);
    for (const x of pool) x.minutes = Math.max(floorOf(x), Math.round((x.minutes - (x.minutes - floorOf(x)) * f) / 5) * 5);
  };
  shrink((x) => !x.key);

  // 2. Dacă tot nu încape: cade ce e peste minimul sportului, în ordinea priorității (cea mai puțin importantă întâi).
  while (total() > targetMin * 1.05) {
    const droppable = all
      .filter((x) => !x.key && count(x.sport) > (minCount[x.sport] ?? 0))
      .sort((a, b) => b.priority - a.priority);
    const d = droppable[0];
    if (!d) break;
    all = all.filter((x) => x !== d);
    notes.push(`fără ${d.sport} ${d.type} săptămâna asta: nu încape în ore`);
  }

  // 3. La nevoie, se scurtează și ședințele-cheie (nu sub o oră de bicicletă sau 40 min de alergare lungă).
  shrink((x) => x.key);
  if (total() > targetMin * 1.05) notes.push('minimul pe sport depășește puțin orele-țintă: ședințe scurte, toate sporturile păstrate');
  else if (all.some((x, i) => x.minutes !== sessions.find((y) => y === sessions[i])?.minutes)) notes.push(`ședințe scurtate ca să încapă în ${targetHours} h${recovery ? ' (descărcare)' : ''}`);
  return { sessions: all, notes };
}

interface DayState {
  blocks: number[]; // lungimi rămase
  count: number;
  hasKey: boolean;
  hasQuality: boolean;
  /** Orice ședință intensă (calitate, test), din orice sport. */
  hard: number;
  hasLongRun: boolean;
  hasLong: boolean;
  hasForta: boolean;
  sports: Set<Sport>;
}

function place(sessions: Session[], blocks: FreeBlock[], weekStart: string, phase: Phase = 'baza1', minCount: Partial<Record<Sport, number>> = {}): { workouts: PlannedWorkout[]; notes: string[] } {
  const days: DayState[] = Array.from({ length: 7 }, (_, d) => ({
    blocks: blocks.filter((b) => b.day === d).map((b) => b.endMin - b.startMin),
    count: 0,
    hasKey: false,
    hasQuality: false,
    hard: 0,
    hasLongRun: false,
    hasLong: false,
    hasForta: false,
    sports: new Set<Sport>(),
  }));
  const workouts: PlannedWorkout[] = [];
  const notes: string[] = [];
  let doubleHardDays = 0;
  // Întâi nucleul (ședințele-cheie + minimul fiecărui sport), apoi restul: așa niciun sport nu rămâne fără loc în program.
  const byPrio = [...sessions].sort((a, b) => a.priority - b.priority || b.minutes - a.minutes);
  const taken: Partial<Record<Sport, number>> = {};
  const core = new Set<Session>();
  for (const x of byPrio) {
    const n = taken[x.sport] ?? 0;
    if (x.key || n < (minCount[x.sport] ?? 0)) {
      core.add(x);
      taken[x.sport] = n + 1;
    }
  }
  const ordered = [...byPrio.filter((x) => core.has(x)), ...byPrio.filter((x) => !core.has(x))];
  let n = 0;

  for (const s of ordered) {
    let need = s.minutes + CHANGE_MIN;
    const findCandidates = () => days
      .map((st, d) => ({ st, d }))
      .filter(({ st, d }) => {
        if (st.count >= 2) return false;
        if (!st.blocks.some((b) => b >= need)) return false;
        if (s.key && st.hasKey) return false;
        if (st.sports.has(s.sport)) return false; // același sport o singură dată pe zi
        if (st.hasLong && s.sport !== 'inot') return false; // lângă o ședință lungă încape cel mult un înot
        if (s.type === 'lung' || s.type === 'brick') {
          if (st.hasLong) return false;
        }
        // O singură ședință intensă pe zi; două (ex. intervale la alergare + tempo la înot) doar aproape de cursă (peak), cel mult de 2 ori pe săptămână.
        if (s.type === 'calitate' && st.hard >= 1 && !(phase === 'peak' && st.hard === 1 && doubleHardDays < 2)) return false;
        if (s.type === 'calitate' && s.sport === 'alergare') {
          if (st.hasForta || st.hasLong) return false;
          const prev = days[d - 1];
          const next = days[d + 1];
          if ((prev && prev.hasLongRun) || (next && next.hasLongRun)) return false;
        }
        if (s.type === 'forta') {
          if (st.hasQuality || st.hasLong) return false;
          const prev = days[d - 1];
          const next = days[d + 1];
          if ((prev && prev.hasForta) || (next && next.hasForta)) return false;
        }
        return true;
      })
      .sort((a, b) => score(b, s) - score(a, s));

    let candidates = findCandidates();
    // Nu încape întreagă nicăieri: se scurtează până la cel mai mare bloc liber (nu sub minimul sportului), ca sportul să nu dispară.
    if (!candidates.length && !s.key) {
      const biggest = Math.max(0, ...days.flatMap((st) => st.blocks));
      const fit = Math.floor((biggest - CHANGE_MIN) / 5) * 5;
      if (fit >= MIN_SESSION_MIN[s.sport] && fit < s.minutes) {
        need = fit + CHANGE_MIN;
        candidates = findCandidates();
        if (candidates.length) {
          notes.push(`${s.sport} ${s.type} scurtat la ${fit} min ca să încapă în programul tău`);
          s.minutes = fit;
        }
      }
    }
    const pick = candidates[0];
    if (!pick) {
      notes.push(`nu există bloc pentru ${s.sport} ${s.type} ${s.minutes} min; ședința a căzut`);
      continue;
    }
    const st = pick.st;
    // Cel mai mic bloc care încape (best fit), ca blocurile mari să rămână pentru ședințele lungi.
    const idx = st.blocks
      .map((b, i) => ({ b, i }))
      .filter((x) => x.b >= need)
      .sort((a, b) => a.b - b.b)[0]!.i;
    st.blocks[idx] = st.blocks[idx]! - need;
    st.count += 1;
    st.sports.add(s.sport);
    if (s.key) st.hasKey = true;
    if (s.type === 'calitate' && s.sport === 'alergare') st.hasQuality = true;
    if (s.type === 'calitate') {
      if (st.hard === 1) doubleHardDays += 1;
      st.hard += 1;
    }
    if (s.type === 'lung' && s.sport === 'alergare') st.hasLongRun = true;
    if (s.type === 'lung' || s.type === 'brick') st.hasLong = true;
    if (s.type === 'forta') st.hasForta = true;

    n += 1;
    workouts.push({
      id: `${weekStart}-${n}`,
      date: addDays(weekStart, pick.d),
      sport: s.sport,
      type: s.type,
      plannedMinutes: s.minutes,
      targetZones: s.zones,
      key: s.key,
      step: s.step,
      structure: s.structure,
      intervals: s.intervals,
      status: 'planificat',
    });
  }
  workouts.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return { workouts, notes };
}

/** Preferințe de zi: ședințele lungi în weekend și în cel mai mare bloc; restul în zile cu loc. */
function score(c: { st: DayState; d: number }, s: Session): number {
  const biggest = Math.max(...c.st.blocks, 0);
  let v = biggest / 10 - c.st.count * 50;
  const weekend = c.d === 5 || c.d === 6;
  if ((s.type === 'lung' || s.type === 'brick') && weekend) v += 500;
  if (s.type === 'calitate' && !weekend) v += 100;
  if (s.type === 'forta' && !weekend) v += 100;
  return v;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
