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
  let prevLoaded = Math.max(avgHistory, 0.6 * hours[firstPhase].target);

  const runGoal = isRunGoal(input.goal);
  // La alergare, ieșirea lungă pornește de la ce poate sportivul acum (nu de la zero, nici peste).
  const startLong = runGoal ? (input.run?.canDoDistance ? (input.goal === 'maraton' ? 100 : 80) : (input.run?.longestRunKm ?? 0) >= 12 ? 70 : 50) : 60;
  const prog = { longRide: 90, longRun: startLong, brickRun: 15 };
  const out: WeekPlan[] = [];

  for (const pw of weeks) {
    const ph = hours[pw.phase];
    let target: number;
    if (pw.recovery) {
      target = round1(prevLoaded * RECOVERY_FACTOR);
    } else {
      target = Math.min(ph.target, Math.max(prevLoaded * 1.1, 0.6 * ph.target));
      target = round1(Math.min(target, budget.hours));
      prevLoaded = target;
    }

    if (runGoal) advanceRunProgression(prog, pw, input.goal as 'semimaraton' | 'maraton');
    else advanceProgression(prog, pw);
    const sessions = runGoal ? runWeekTemplate(pw, input, prog) : weekTemplate(pw, input, prog);
    const fitted = fitToHours(sessions, target, pw.recovery);
    const placed = place(fitted.sessions, budget.blocks, pw.weekStart, pw.phase);
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

  return { ok: true, weeks: out, budgetHours: budget.hours };
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
    prog.longRide = 90;
    prog.longRun = 60;
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
  return `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}/km`;
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
    s.push({ sport: 'forta', type: 'forta', minutes: early ? 40 : p === 'taper' ? 30 : 35, zones: [], key: false, priority: i === 0 ? 4 : 6.5, structure: p === 'taper' ? 'ușor, fără încărcări noi' : 'picioare, core, gambe + pliometrie ușoară' });
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
  else s.push({ sport: 'bicicleta', type: 'z2', minutes: p === 'baza1' || p === 'evaluare' ? 60 : p === 'taper' ? 45 : 75, zones: [2], key: false, priority: 7 });
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

  // Forță: 2 ședințe, încărcări mari + pliometrie; în taper una scurtă.
  const fortaCount = p === 'taper' ? 1 : 2;
  const fortaMin = p === 'baza1' || p === 'evaluare' ? 45 : p === 'taper' ? 30 : 40;
  for (let i = 0; i < fortaCount; i++) {
    s.push({ sport: 'forta', type: 'forta', minutes: fortaMin, zones: [], key: false, priority: i === 0 ? 4 : 6.5, structure: p === 'taper' ? 'ușor, fără încărcări noi' : 'încărcări mari + pliometrie' });
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

/** Potrivește ședințele la orele-țintă: cheile rămân, restul se scalează sau cade, după prioritate. */
function fitToHours(sessions: Session[], targetHours: number, recovery: boolean): { sessions: Session[]; notes: string[] } {
  const notes: string[] = [];
  const targetMin = targetHours * 60;
  const keys = sessions.filter((x) => x.key);
  let rest = sessions.filter((x) => !x.key).sort((a, b) => a.priority - b.priority);
  const keyMin = keys.reduce((s, x) => s + x.minutes, 0);
  let restMin = rest.reduce((s, x) => s + x.minutes, 0);
  const available = targetMin - keyMin;

  if (available <= 0) {
    notes.push('orele-țintă acoperă doar antrenamentele-cheie; restul lipsește săptămâna asta');
    return { sessions: keys, notes };
  }

  // Taie ședințele de prioritate mică (bicicletă Z2, a doua ședință de forță, alergare Z2, înot) până când
  // restul încape cu o scalare de cel mult −15%: o ședință scurtată la jumătate nu mai e ședința aia.
  while (restMin > 0 && available / restMin < 0.85 && rest.length > 1) {
    const dropped = rest.pop()!;
    restMin -= dropped.minutes;
    notes.push(`fără ${dropped.sport} ${dropped.type} ${dropped.minutes} min: nu încape în ore`);
  }
  const factor = restMin > 0 ? Math.min(1, available / restMin) : 1;
  const scaled = rest.map((x) => ({ ...x, minutes: Math.max(MIN_SESSION_MIN[x.sport], Math.round((x.minutes * factor) / 5) * 5) }));
  if (factor < 0.999) notes.push(`ședințele ușoare scalate la ${Math.round(factor * 100)}%${recovery ? ' (descărcare)' : ''}`);
  return { sessions: [...keys, ...scaled], notes };
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

function place(sessions: Session[], blocks: FreeBlock[], weekStart: string, phase: Phase = 'baza1'): { workouts: PlannedWorkout[]; notes: string[] } {
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
  const ordered = [...sessions].sort((a, b) => a.priority - b.priority || b.minutes - a.minutes);
  let n = 0;

  for (const s of ordered) {
    const need = s.minutes + CHANGE_MIN;
    const candidates = days
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
