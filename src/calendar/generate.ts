import { fixedBonus, type FixedMeet } from './actions.js';
import { PPL_ROTATION, isLegsSession, newSplitState, nextSplit, prescribe, splitFamily, strengthBlocks, strengthStructure, upperLowerWeek, type LegsMode, type SessionId, type StrengthSpec } from '../strength/ppl.js';
import { enforceLimits, enforceSpacing, fitStructure } from './validate.js';
import { BIKE_TEST, BRICK_TRANSITION_MIN, RUN_TEST, brickText, normalizeWorkout } from './coherence.js';
// Generatorul primului calendar: din bugetul de ore real, din volumul ultimelor 8 săptămâni și din data cursei.
// Dacă orele nu ajung pentru cursă, răspunsul e `ok: false` cu variante — nu un plan comprimat.

import type { FreeBlock, IntensityAllowed, Phase, PlannedWorkout, Sport, WorkoutType, Zone } from '../types.js';
import { addDays, diffDays, weekStart } from '../util/dates.js';
import { RUN_MODULES, WALK_RUN_STEPS, moduleStructure, walkRunStructure, type RunModuleId } from './run-modules.js';
import { weeklyBudget } from './budget.js';
import { easyFloor, longRunStart, type Demonstrated } from './demonstrated.js';
import { SWIM_PYRAMID, bikeQuality, swimQuality } from './bike-swim-modules.js';
import { generateFitnessPlan } from './fitness-plan.js';
import type { FitnessProfile } from '../strength/fitness.js';
import { walkPlanWorkouts, type WalkProfile, DEFAULT_WALK_PROFILE } from '../walking/plan.js';
import { BIKE_DISTANCE_KM, GOAL_LABEL, PHASE_HOURS, SWIM_DISTANCE_M, goalKind, isBikeGoal, isRunGoal, isSwimGoal, phaseWeeks, type Goal, type PhaseWeek, type RunGoal } from './phases.js';

export interface GenerateInput {
  startDate: string;
  raceDate: string;
  goal: Goal;
  freeBlocks: FreeBlock[];
  /** Orele pe săptămână pe care sportivul le are pentru sport (declarate). null = nedeclarate. */
  sportHours?: number | null;
  /** Ore totale pe săptămână, ultimele până la 8 săptămâni (din activități). Gol = fără istoric. */
  historyHoursPerWeek: number[];
  /** Ore/săpt. antrenate recent, DECLARATE de sportiv (user_reported). Folosite doar când nu există istoric importat:
   *  dau doza de start și pragul de debutant, NU deblochează protocoale intense (30/15). */
  declaredRecentHours?: number | null;
  intensityAllowed: IntensityAllowed;
  swimContinuous400: boolean;
  /** Nivelul de acum din chestionar: de aici pornesc ședințele lungi (nu de la o valoare fixă). */
  level?: { longestRideH?: number | null; longestRunKm?: number | null; easyPaceSecKm?: number | null };
  /** Ce sporturi au deja date de test (zone/prag/CSS): pentru ele evaluarea nu mai pune test. */
  tests?: { alergare: boolean; bicicleta: boolean; inot: boolean };
  /** Vârsta și sexul. Vârsta schimbă structura (descărcare mai des, fără intervale VO2max după 55); sexul nu schimbă volumul, doar nutriția și pragurile analizelor. */
  athlete?: { age: number | null; sex: 'm' | 'f' | null };
  /** Doar la alergare (5 km … maraton): ritmul-țintă de cursă (s/km) și dacă poate alerga deja distanța. */
  run?: {
    goalPaceSecKm: number | null;
    canDoDistance: boolean | null;
    longestRunKm?: number | null;
    /** „finalizare” (rezistență) sau „timp” (viteză); implicit „timp” dacă există un ritm de cursă. */
    branch?: 'finalizare' | 'timp';
    /** Debutant sau revenire: mers-alergare și fără ședințe rapide în bază. */
    beginner?: boolean;
  };
  /** Doar la înot: câți metri înoată acum fără oprire (declarat sau măsurat). */
  swim?: { continuousM: number | null };
  /** Mers pe jos: ținta, capacitatea, mersul alert, jurnalul țintei; cea mai lungă plimbare recentă (minute). */
  walk?: { profile: WalkProfile; demonstratedMin: number | null };
  /** Intern: câte ședințe de forță încap în fazele de bază (3 când programul total o permite). */
  strengthSlots?: number;
  /** Întâlniri fixe (ex. alergarea cu grupul sâmbăta): ședința potrivită se pune în ziua aceea, dacă e în program. */
  fixed?: FixedMeet[];
  /** Intern: istoric consistent (≥ 6 h/săpt. în ultimele săptămâni) sau test de bicicletă; deblochează intervalele 30/15. */
  experiencedBike?: boolean;
  /** Doar la fitness: zilele, minutele, nivelul și contextul din chestionar. */
  fitness?: FitnessProfile;
  /** Ce a demonstrat sportivul în ultimele 6 săptămâni (src/calendar/demonstrated.ts): podeaua ședințelor ușoare și
   *  startul ieșirii lungi. Lipsă = fără istoric măsurat (rămân minimele pe sport). */
  demonstrated?: Demonstrated;
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

/** Săptămâni minime până la cursă [debutant, cu istoric] — decizie de produs AIRON, prudentă. */
const MIN_WEEKS: Partial<Record<Goal, [number, number]>> = {
  '5k': [8, 4], '10k': [10, 6], semimaraton: [14, 8], maraton: [20, 12],
  sprint: [8, 6], olimpic: [12, 8], '70.3': [20, 12],
  'bike-50': [6, 4], 'bike-100': [10, 6], 'bike-160': [14, 8],
  'inot-1500': [8, 4], 'inot-1900': [10, 6], 'inot-3800': [16, 10],
};

const RECOVERY_FACTOR = 0.65;
const CHANGE_MIN = 10; // minute de schimbat/duș în jurul unei ședințe
/** Sub aceste durate o ședință nu mai are sens; se taie, nu se scurtează. */
// Forța: nicio ședință sub 45 de minute cu încălzirea (regula proprietarului, 19.10.2026).
const MIN_SESSION_MIN: Record<Sport, number> = { inot: 30, alergare: 30, bicicleta: 40, forta: 45, mers: 10 };

export function generatePlan(input: GenerateInput): GenerateResult {
  if (goalKind(input.goal) === 'walk') {
    // Mersul: ținta săptămânii împărțită pe zile (src/walking/plan.ts), fără faze de anduranță și fără datorie.
    const w = walkPlanWorkouts({ startDate: input.startDate, endDate: input.raceDate, profile: input.walk?.profile ?? DEFAULT_WALK_PROFILE, freeBlocks: input.freeBlocks, demonstratedMin: input.walk?.demonstratedMin ?? null });
    const weeks: WeekPlan[] = w.weeks.map((x) => ({ weekStart: x.weekStart, phase: 'baza1', recovery: false, targetHours: Math.round((x.targetMin / 60) * 10) / 10, plannedHours: Math.round((x.plannedMin / 60) * 10) / 10, workouts: x.workouts, notes: x.short ? [x.short] : [] }));
    return { ok: true, weeks, budgetHours: Math.ceil(Math.max(0, ...w.weeks.map((x) => x.plannedMin)) / 6) / 10 };
  }
  if (goalKind(input.goal) === 'fitness') {
    const fitness: FitnessProfile = input.fitness ?? { goal: input.goal as FitnessProfile['goal'], days: 2, minutes: 45, beginner: true };
    return generateFitnessPlan({ startDate: input.startDate, raceDate: input.raceDate, freeBlocks: input.freeBlocks, fitness, male: input.athlete?.sex === 'm' });
  }
  const budget = weeklyBudget(input.freeBlocks, undefined, input.sportHours ?? null);
  if (!budget.valid) {
    return {
      ok: false,
      reason: `Ai bifat ${budget.freeHours} ore libere pe săptămână. Timpul liber nu e timp de sport: spune câte ore pe săptămână poți da, realist, antrenamentului, apoi fac planul.`,
      budgetHours: budget.hours,
      minimumHours: 0,
      options: ['completează „Câte ore pe săptămână ai pentru sport” în chestionar (pasul Program)'],
    };
  }
  const age = input.athlete?.age ?? null;
  let weeks: ReturnType<typeof phaseWeeks>;
  try {
    weeks = phaseWeeks(input.startDate, input.raceDate, age != null && age >= 40 ? 3 : 4, input.goal);
  } catch (e) {
    // Obiectiv prea aproape: un răspuns explicit, nu o eroare și nu o probabilitate inventată.
    return { ok: false, reason: `${e instanceof Error ? e.message : String(e)} Alege o dată mai îndepărtată sau un obiectiv mai scurt; până atunci, antrenament ușor de întreținere.`, budgetHours: budget.hours, minimumHours: 0, options: ['mută data cursei', 'alege un obiectiv mai scurt'] };
  }
  const hours = PHASE_HOURS[input.goal];

  const phasesUsed = [...new Set(weeks.map((w) => w.phase))];
  const minimumHours = Math.max(...phasesUsed.map((p) => hours[p].min));
  if (budget.hours < minimumHours) {
    const missing = Math.round((minimumHours - budget.hours) * 10) / 10;
    return {
      ok: false,
      reason: `Ai ${budget.hours} ore pe săptămână disponibile; pentru ${GOAL_LABEL[input.goal]} ai nevoie de cel puțin ${minimumHours} în ${phasesUsed.includes('build') ? 'build' : 'faza cea mai încărcată'}.`,
      budgetHours: budget.hours,
      minimumHours,
      options: [
        `eliberezi ${missing} ore pe săptămână (blocuri de minimum 45 de minute)`,
        input.goal === '70.3' ? 'schimbi cursa cu una olimpică' : input.goal === 'maraton' ? 'alegi un semimaraton' : input.goal === 'semimaraton' ? 'alegi 10 km' : 'alegi o distanță mai scurtă',
        'muți data cursei',
      ],
    };
  }

  const measured = input.historyHoursPerWeek.filter((h) => h > 0);
  const declaredUsed = !measured.length && (input.declaredRecentHours ?? 0) > 0;
  const history = declaredUsed ? [input.declaredRecentHours!] : measured;
  const avgHistory = history.length ? history.reduce((a, b) => a + b, 0) / history.length : 0;
  const measuredAvg = measured.length ? measured.reduce((a, b) => a + b, 0) / measured.length : 0;

  // Obiectiv prea aproape: nu comprimăm mecanic luni de pregătire în câteva săptămâni (auditul T12). Pragurile sunt
  // decizii de produs AIRON (prudente, nu standarde): debutant = fără istoric de antrenament sau debutant declarat.
  const beginner = !!input.run?.beginner || (isSwimGoal(input.goal) ? !input.swimContinuous400 : avgHistory === 0);
  const need = MIN_WEEKS[input.goal as Exclude<Goal, `fit-${string}`>];
  if (need && weeks.length < need[beginner ? 0 : 1]) {
    const n = need[beginner ? 0 : 1];
    return {
      ok: false,
      reason: `Până la cursă sunt ${weeks.length} săptămâni. Pentru ${GOAL_LABEL[input.goal]}${beginner ? ', pornind de la începutul pregătirii,' : ''} planul cere cel puțin ${n}: nu comprimăm pregătirea în mai puțin, pentru că riscul de accidentare crește și cursa nu mai e o țintă realistă.`,
      budgetHours: budget.hours,
      minimumHours: 0,
      options: [`alegi o cursă cu cel puțin ${n} săptămâni până la ea`, 'alegi o distanță mai scurtă pentru data asta', 'dacă ai deja istoric de antrenament, importă-l (ceasul sau exportul): pragul depinde de el'],
    };
  }
  const firstPhase = weeks[0]!.phase;
  // Doza de start: din ce a făcut sportivul (istoric canonic), nu din șablon. Cu istoric, prima săptămână pornește de la
  // media lui (+ cel mult 2 h, ca să încapă toate sporturile la minimum); fără istoric, de la 60% din ținta fazei.
  // Timpul liber e plafonul, nu doza.
  let prevLoaded = history.length ? Math.min(Math.max(avgHistory, 0.6 * hours[firstPhase].target), avgHistory + 2) : 0.6 * hours[firstPhase].target;

  const kind = goalKind(input.goal) ?? 'tri';
  // A treia ședință de forță (PPL) doar când programul total o permite: un singur sport de la 5 h/săpt., triatlon de la 12 h.
  // 30/15: istoricul consistent e condiția de plan; un test de bicicletă calibrează intensitatea, nu deblochează singur
  // protocolul (auditul v2, V2-08). Toleranța la intervale se verifică înaintea fiecărei ședințe (progression.ts).
  input = { ...input, experiencedBike: measuredAvg >= 6, strengthSlots: input.strengthSlots ?? ((kind === 'tri' ? budget.hours >= 12 : budget.hours >= 5) ? 3 : 2) };
  const runGoal = kind === 'run';
  // La alergare, ieșirea lungă pornește de la ce poate sportivul acum (nu de la zero, nici peste).
  const startLong = runGoal ? runStartLong(input.goal as RunGoal, input.run?.canDoDistance ?? null, input.run?.longestRunKm ?? null) : 60;
  // Triatlon: tura lungă pornește de la ~80% din cea mai lungă tură recentă (60–120 min), ieșirea lungă de la ~80% din cea mai lungă alergare (40–75 min).
  const lvl = input.level ?? {};
  // Ieșirile lungi pornesc de la ce a demonstrat sportivul (cel mult +25%), nu de la minimul șablonului: 15 min de
  // bicicletă nu devin 60. Podeaua e durata minimă a unei ședințe din sportul respectiv.
  const triRide = lvl.longestRideH ? Math.min(120, Math.max(MIN_SESSION_MIN.bicicleta, Math.round((lvl.longestRideH * 60 * 1.25) / 5) * 5)) : 60;
  // Ieșirea lungă: din ce a alergat măsurat în ultimele 6 săptămâni (~80% din cea mai lungă, 45–105 min) când există;
  // altfel din chestionar (declarat, prudent: cel mult 75 min).
  const demLong = longRunStart(input.demonstrated);
  const triRunDeclared = lvl.longestRunKm ? Math.min(75, Math.max(MIN_SESSION_MIN.alergare, Math.round((lvl.longestRunKm * ((lvl.easyPaceSecKm ?? 420) / 60) * 1.25) / 5) * 5)) : 45;
  const triRun = Math.max(triRunDeclared, demLong ?? 0);
  // Doar înot: ședința lungă pornește de la ce înoată acum fără oprire (≈ 2,5 min la 100 m la început), minimum 30 min.
  // Capacitate necunoscută: ședința lungă pornește de la minimul de timp (familiarizare), nu de la o distanță presupusă.
  const swimStart = input.swim?.continuousM == null ? MIN_SESSION_MIN.inot : Math.max(MIN_SESSION_MIN.inot, Math.min(60, Math.round((input.swim.continuousM / 100) * 2.5 * 1.25)));
  const prog: { longRide: number; longRun: number; brickRun: number; longSwim: number; runExposures?: number; walkStep?: number; longRunFloor?: number } = { longRide: runGoal ? 90 : triRide, longRun: runGoal ? (input.run?.beginner ? 30 : startLong) : triRun, brickRun: 15, longSwim: swimStart, walkStep: runGoal && input.run?.beginner ? 0 : undefined, ...(demLong ? { longRunFloor: demLong } : {}) };
  // Podeaua ședințelor ușoare: ce face sportivul de obicei, nu minimul unui începător (corecția proprietarului, 20.10.2026).
  const dem = input.demonstrated;
  const easyOf = (x: { sport: Sport; type: WorkoutType; key: boolean }, light: boolean): number =>
    !x.key && (x.type === 'z2' || x.type === 'tehnica') ? Math.max(MIN_SESSION_MIN[x.sport], easyFloor(dem, x.sport, light) ?? 0) : MIN_SESSION_MIN[x.sport];
  const out: WeekPlan[] = [];
  // Ieșirea lungă nu poate depăși cel mai mare bloc liber: altfel ar cădea din plan fără explicație (bug găsit de
  // audit la 160 km). O plafonăm aici și o spunem o dată, cu ce ar trebui pentru obiectiv.
  const maxBlock = Math.max(0, ...budget.blocks.map((b) => b.endMin - b.startMin)) - CHANGE_MIN;
  let longCapNoted = false;

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

    if (kind === 'run') advanceRunProgression(prog, pw, input.goal as RunGoal);
    else if (kind === 'swim') advanceSwimProgression(prog, pw, input.goal);
    else if (kind === 'bike') advanceBikeProgression(prog, pw, input.goal);
    else advanceProgression(prog, pw);
    const wanted = { ride: prog.longRide, run: prog.longRun, brick: prog.brickRun };
    const capNotes: string[] = [];
    if (maxBlock > 0) {
      if (kind === 'tri' && prog.longRide + BRICK_TRANSITION_MIN + prog.brickRun > maxBlock) prog.longRide = Math.max(MIN_SESSION_MIN.bicicleta, Math.floor((maxBlock - prog.brickRun - BRICK_TRANSITION_MIN) / 5) * 5);
      if (prog.longRide > maxBlock) prog.longRide = Math.floor(maxBlock / 5) * 5;
      if (prog.longRun > maxBlock) prog.longRun = Math.floor(maxBlock / 5) * 5;
      if (!longCapNoted && (prog.longRide < wanted.ride || prog.longRun < wanted.run)) {
        longCapNoted = true;
        const what = prog.longRide < wanted.ride ? `tura lungă ar trebui să ajungă acum la ${wanted.ride} min și să crească în continuare` : `ieșirea lungă ar trebui să ajungă acum la ${wanted.run} min și să crească în continuare`;
        capNotes.push(`ATENȚIE: ${what}, dar cel mai mare bloc liber din programul tău are ${maxBlock + CHANGE_MIN} min. Plafonată la ${Math.min(maxBlock, Math.max(prog.longRide, prog.longRun))} min; eliberează o fereastră mai lungă (de obicei în weekend) ca să fii pregătit pentru ${GOAL_LABEL[input.goal]}.`);
      }
    }
    const light = pw.recovery || pw.phase === 'taper';
    const templated = (kind === 'run' ? runWeekTemplate(pw, input, prog) : kind === 'swim' ? swimWeekTemplate(pw, input, prog) : kind === 'bike' ? bikeWeekTemplate(pw, input, prog) : weekTemplate(pw, input, prog)).map((x) => (x.minutes < easyOf(x, light) ? { ...x, minutes: easyOf(x, light) } : x));
    // Săptămâna cursei (și când taper-ul are o singură săptămână): fără ședință lungă, fără forță, totul scurt, dezmorțire înainte de cursă.
    const raceWeek = pw.weekStart === weekStart(input.raceDate);
    const sessions = raceWeek ? raceWeekSessions(templated) : templated;
    const minCount: Partial<Record<Sport, number>> = kind === 'run' ? { alergare: 3, forta: 1 } : kind === 'swim' ? { inot: 2, forta: 1 } : kind === 'bike' ? { bicicleta: 2, forta: 1 } : { inot: 2, bicicleta: 2, alergare: 2, forta: 1 };
    const fitted = fitToHours(sessions, target, pw.recovery, minCount, (x) => easyOf(x, light));
    const placed = place(fitted.sessions, budget.blocks, pw.weekStart, pw.phase, minCount, input.fixed);
    if (raceWeek) shakeoutBeforeRace(placed.workouts, input.raceDate);
    const plannedHours = round1(placed.workouts.reduce((s, w) => s + w.plannedMinutes, 0) / 60);
    // Distribuția explicată (auditul M35, V02): ședințe în toate cele 7 zile = minimul pe sport, scurte, nu timp umplut.
    const days = new Set(placed.workouts.map((w) => w.date)).size;
    if (days >= 7 && out.length === 0) {
      const mins = Object.entries(minCount).map(([sp, n]) => `${n} × ${({ inot: 'înot', bicicleta: 'bicicletă', alergare: 'alergare', forta: 'forță' } as Record<string, string>)[sp]}`).join(', ');
      placed.notes.push(`De ce în fiecare zi: obiectivul cere cel puțin ${mins} pe săptămână; ședințele sunt scurte (${Math.min(...placed.workouts.map((w) => w.plannedMinutes))}–${Math.max(...placed.workouts.map((w) => w.plannedMinutes))} min) ca să construiască obișnuința, nu ca să umple timpul liber (${round1(plannedHours)} h din ${budget.hours} h). Dacă vrei o zi liberă, mută o ședință scurtă în aceeași zi cu alta.`);
    }

    out.push({
      weekStart: pw.weekStart,
      phase: pw.phase,
      recovery: pw.recovery,
      targetHours: target,
      plannedHours,
      workouts: placed.workouts,
      notes: [...capNotes, ...(declaredUsed && out.length === 0 ? [`Doza de start: ${round1(avgHistory)} h/săpt. declarate de tine (nu avem încă activități importate). Când apar activitățile, planul pornește din ele.`] : []), ...fitted.notes, ...placed.notes],
    });
  }

  assignStrengthDays(out, input.raceDate, input.athlete?.sex === 'm' ? 'ppl' : undefined);
  // Validatorul final: nicio fază sau șablon nu trece de limita de intensitate și de capacitatea de înot declarată.
  const limits = { intensityAllowed: input.intensityAllowed, swimContinuous400: input.swimContinuous400 };
  // Zi tare, zi ușoară și cel mult 3 ședințe grele pe săptămână, pe toate sporturile la un loc.
  const spaced = enforceSpacing(out.flatMap((w) => w.workouts));
  const byId = new Map(spaced.workouts.map((w) => [w.id, w]));
  for (const w of out) {
    w.workouts = w.workouts.map((x) => byId.get(x.id) ?? x);
    const own = spaced.notes.filter((n) => w.workouts.some((x) => n.startsWith(`${x.id}:`)));
    if (own.length) w.notes.push(...own);
  }
  for (const w of out) {
    const v = enforceLimits(w.workouts, limits);
    // Nimic după cursă (nici în săptămâna ei, dacă e la mijlocul săptămânii); durata și repetările din aceleași cifre.
    w.workouts = v.workouts.filter((x) => x.date < input.raceDate).map(fitStructure).map(normalizeWorkout);
    if (v.notes.length) w.notes.push(...v.notes);
    capToBudget(w, budget.hours, (x) => easyOf(x, w.recovery || w.phase === 'taper'));
  }
  return { ok: true, weeks: out, budgetHours: budget.hours };
}

/**
 * Bugetul declarat e un plafon, nu o țintă aproximativă (L-SIM-10): dacă rotunjirile și duratele minime împing
 * săptămâna peste, se scurtează câte 5 min ședințele ușoare (cele mai lungi întâi), apoi forța, fără să coboare sub
 * minimul sportului; ședințele-cheie și ieșirea lungă rămân. Structura se rescrie din aceleași cifre.
 */
export function capToBudget(w: WeekPlan, hours: number, floor: (x: PlannedWorkout) => number = (x) => MIN_SESSION_MIN[x.sport]): void {
  const cap = Math.round(hours * 60);
  const total = () => w.workouts.filter((x) => x.status !== 'anulat_sistem').reduce((n, x) => n + x.plannedMinutes, 0);
  let guard = 200;
  while (total() > cap && guard-- > 0) {
    const pick = (pred: (x: PlannedWorkout) => boolean) =>
      w.workouts.filter((x) => x.status !== 'anulat_sistem' && !x.key && x.type !== 'lung' && x.type !== 'brick' && pred(x) && x.plannedMinutes - 5 >= Math.max(MIN_SESSION_MIN[x.sport], floor(x))).sort((a, b) => b.plannedMinutes - a.plannedMinutes)[0];
    // Ultima soluție: orice ședință care nu e test, chiar și cea lungă (câte 5 min, cea mai lungă întâi).
    const anyLong = () => w.workouts.filter((y) => y.status !== 'anulat_sistem' && !/^TEST:/.test(y.structure ?? '') && y.plannedMinutes - 5 >= MIN_SESSION_MIN[y.sport]).sort((a, b) => b.plannedMinutes - a.plannedMinutes)[0];
    const x = pick((y) => y.type === 'z2' || y.type === 'tehnica') ?? pick((y) => y.type === 'forta') ?? pick((y) => y.type === 'calitate') ?? anyLong();
    if (!x) break;
    const i = w.workouts.indexOf(x);
    w.workouts[i] = x.type === 'forta' ? { ...x, plannedMinutes: x.plannedMinutes - 5 } : normalizeWorkout(fitStructure({ ...x, plannedMinutes: x.plannedMinutes - 5 }));
  }
  w.plannedHours = Math.round((total() / 60) * 10) / 10;
}

/**
 * Săptămâna cursei: nimic lung, nimic de forță, calitatea rămâne doar ca „deschidere” scurtă (cel mult 35 min),
 * ședințele ușoare cel mult 30 min. Ziua cursei nu e în plan (planul se oprește înaintea ei); cursa o înregistrează ceasul.
 */
function raceWeekSessions(sessions: Session[]): Session[] {
  return sessions
    .filter((s) => s.type !== 'lung' && s.type !== 'brick' && s.type !== 'forta')
    .map((s) => {
      if (s.type === 'calitate') return { ...s, minutes: Math.min(s.minutes, 35), key: false, structure: `${s.structure ?? 'scurt, la ritm de cursă'} · deschidere, nu antrenament` };
      return { ...s, minutes: Math.min(s.minutes, 30), key: false };
    });
}

/** Ultima ședință dinaintea cursei devine dezmorțire: 20 min foarte ușor cu câteva accelerări (dacă nu e chiar deschiderea). */
function shakeoutBeforeRace(workouts: PlannedWorkout[], raceDate: string): void {
  const last = [...workouts].filter((w) => w.date < raceDate).sort((a, b) => (a.date < b.date ? -1 : 1)).at(-1);
  if (!last || last.type === 'calitate') return;
  last.plannedMinutes = Math.min(last.plannedMinutes, 20);
  last.targetZones = [1, 2];
  last.key = false;
  last.structure = 'dezmorțire înainte de cursă: 15–20 min foarte ușor + 3–4 accelerări de 20 s; apoi odihnă, mâncare cunoscută, somn';
}

/**
 * Ieșirea lungă alternează (metoda Sang, scalată): o săptămână mai scurtă și constantă (~85%), una plină cu finalul
 * progresiv (ultimele 15–20 min în partea de sus a Z2). Niciodată pornit tare și terminat greu.
 */
function longRunOf(pw: PhaseWeek, minutes: number, easyText: string): Session {
  const alternate = !pw.recovery && pw.phase !== 'evaluare' && pw.phase !== 'taper';
  if (alternate && pw.weekInPhase % 2 === 1) {
    return { sport: 'alergare', type: 'lung', minutes: Math.max(30, Math.round((minutes * 0.85) / 5) * 5), zones: [2], key: true, priority: 2, structure: `${easyText}, constant de la început la sfârșit (săptămâna scurtă)` };
  }
  return { sport: 'alergare', type: 'lung', minutes, zones: [2], key: true, priority: 2, structure: alternate ? `${easyText}; ultimele 15–20 min progresiv, în partea de sus a Z2, fără să cazi pe final` : `${easyText}, constant` };
}

/** Timpul alocat unei ședințe de forță (programul cere 45–65 min); conținutul se potrivește apoi în el. */
function strengthMinutes(p: Phase): number {
  return p === 'taper' ? 45 : p === 'peak' ? 50 : p === 'build' ? 55 : 60;
}

/**
 * Ședințele de forță ale săptămânii: 2 de regulă (tot corpul A/B), 3 în fazele de bază când programul total o permite
 * (PPL A/B), una în taper. A treia are prioritatea cea mai mică: cade prima dacă orele sau zilele nu ajung.
 */
// Prioritatea: prima ședință de forță e importantă (4); a doua (≥ 45 min, regula proprietarului) cade înaintea
// alergărilor ușoare când orele nu ajung (7,2 > 7), a treia prima.
function strengthSessions(p: Phase, slots: number): Session[] {
  const n = p === 'taper' ? 1 : (p === 'baza1' || p === 'baza2') && slots >= 3 ? 3 : 2;
  return Array.from({ length: n }, (_, i) => ({ sport: 'forta' as Sport, type: 'forta' as const, minutes: strengthMinutes(p), zones: [] as Zone[], key: false, priority: i === 0 ? 4 : i === 1 ? 7.2 : 7.5, structure: 'forță' }));
}

/**
 * Forța, după programul AIRON (src/strength/ppl.ts): blocurile programului se întind pe săptămânile până la cursă
 * (strânse sub 26, extinse peste), fiecare ședință primește varianta din rotație și doza blocului, apoi conținutul
 * se potrivește în minutele pe care le are ședința în calendar (accesoriile cad primele, pauzele rămân întregi).
 * Structura după frecvența săptămânii (auditul v93, A50; decizia proprietarului, 20.10.2026), nu după sex:
 *  - 1 ședință: tot corpul (excepția „fullBody”, singurul caz în care picioarele merg cu partea de sus);
 *  - 2 ședințe: picioare / partea de sus, fiecare o dată pe săptămână (picioarele în ziua care nu e în ajunul cheii);
 *  - 3+: bărbații (`split = 'ppl'`) Push → Pull → Picioare cu exerciții care se schimbă; ceilalți Push A … Legs B.
 * Picioarele: în PPL nu cad în ajunul unei ședințe-cheie (trec la următoarea, dar nu dispar — vin ușoare după o
 * ședință de așteptare); cu sus / jos, picioarele sunt ușoare în ajunul ei. În ultimele 10 zile dinaintea cursei, fără
 * picioare.
 */
export function assignStrengthDays(weeks: WeekPlan[], raceDate?: string, split?: 'ppl'): void {
  const blocks = strengthBlocks(weeks.length);
  const keyDates = new Set(weeks.flatMap((w) => w.workouts.filter((x) => x.key).map((x) => x.date)));
  let pplI = 0;
  let deferred: SessionId | null = null;
  const st = newSplitState();
  weeks.forEach((w, wi) => {
    const bw = blocks[wi] ?? { block: 'mentinere' as const, week: 1, len: 1 };
    const fs = w.workouts.filter((x) => x.type === 'forta').sort((a, b) => (a.date < b.date ? -1 : 1));
    const family = splitFamily(fs.length);
    const ul = family === 'upper-lower' ? upperLowerWeek(fs.map((x) => keyDates.has(addDays(x.date, 1)))) : [];
    fs.forEach((x, k) => {
      const beforeKey = keyDates.has(addDays(x.date, 1));
      const nearRace = raceDate ? diffDays(x.date, raceDate) <= 10 : w.phase === 'taper';
      let session: SessionId;
      let variant: number | undefined;
      let legs: LegsMode = nearRace ? 'fara' : beforeKey ? 'usor' : 'normal';
      if (family === 'full') {
        session = 'full';
      } else if (family === 'upper-lower') {
        session = ul[k]!.session;
        if (!nearRace) legs = ul[k]!.legs;
        // Lângă cursă, ziua de picioare devine partea de sus.
        if (session === 'fullA' && nearRace) session = 'fullB';
      } else if (split === 'ppl') {
        const n = nextSplit(st, beforeKey, nearRace);
        session = n.session;
        variant = n.variant;
        legs = nearRace ? 'fara' : n.light ? 'usor' : 'normal';
      } else {
        if (deferred && !beforeKey && !nearRace) {
          session = deferred;
          deferred = null;
        } else {
          session = PPL_ROTATION[pplI++ % PPL_ROTATION.length]!;
          if (isLegsSession(session) && (beforeKey || nearRace)) {
            if (!nearRace) deferred = session;
            session = PPL_ROTATION[pplI++ % PPL_ROTATION.length]!;
            if (isLegsSession(session)) session = PPL_ROTATION[pplI++ % PPL_ROTATION.length]!;
          }
        }
      }
      // Taper (blocul „înainte de cursă”): excepție de la regula 20 (decizia proprietarului, 20.10.2026, A49) — varianta
      // scurtă de ~30 min, 2–3 serii, nimic nou.
      const taper = bw.block === 'precursa';
      const spec: StrengthSpec = { session, block: bw.block, week: bw.week, len: bw.len, recovery: w.recovery, legs, ...(variant != null ? { variant } : {}), ...(taper ? { reduced: { why: 'taper' as const, minutes: Math.min(30, x.plannedMinutes) } } : {}) };
      const rx = prescribe(spec, x.plannedMinutes);
      x.structure = strengthStructure(spec);
      // O singură durată: cea a prescripției (cel puțin 45 de minute, cel mult cât are în calendar când încape).
      x.plannedMinutes = rx.minutes;
    });
  });
}

/** Progresia ședințelor lungi: +15 min la două săptămâni pe bicicletă, +10 pe alergare, cu plafoane pe fază. */
function advanceProgression(prog: { longRide: number; longRun: number; brickRun: number; longRunFloor?: number }, pw: PhaseWeek): void {
  if (pw.recovery) return;
  const caps: Record<Phase, { ride: number; run: number; brick: number }> = {
    evaluare: { ride: 90, run: 60, brick: 0 },
    baza1: { ride: 150, run: 90, brick: 0 },
    baza2: { ride: 180, run: 100, brick: 20 },
    build: { ride: 210, run: 105, brick: 40 },
    peak: { ride: 180, run: 100, brick: 30 },
    taper: { ride: 90, run: 60, brick: 15 },
  };
  // Cine aleargă deja mai mult decât plafonul fazei nu e tras înapoi (în afară de taper).
  const cap = { ...caps[pw.phase], run: pw.phase === 'taper' ? caps.taper.run : Math.max(caps[pw.phase].run, prog.longRunFloor ?? 0) };
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

/** De unde pornește ieșirea lungă la alergare: de la ce poate sportivul acum, pe distanța aleasă. */
function runStartLong(goal: RunGoal, canDoDistance: boolean | null, longestRunKm: number | null): number {
  const long = longestRunKm ?? 0;
  switch (goal) {
    case '5k':
      return canDoDistance ? 50 : long >= 5 ? 45 : 35;
    case '10k':
      return canDoDistance ? 60 : long >= 8 ? 50 : 40;
    case 'semimaraton':
      return canDoDistance ? 80 : long >= 12 ? 70 : 50;
    default:
      return canDoDistance ? 100 : long >= 12 ? 70 : 50;
  }
}

/** Ieșirea lungă la alergare: crește după două expuneri comparabile (~10%, 5–10 min), plafon pe fază și pe distanță (la 5 și 10 km ieșirea e mai lungă decât cursa, dar nu dublă). */
function advanceRunProgression(prog: { longRun: number; runExposures?: number; walkStep?: number }, pw: PhaseWeek, goal: RunGoal): void {
  if (pw.recovery) return;
  const caps: Record<RunGoal, Record<Phase, number>> = {
    '5k': { evaluare: 45, baza1: 55, baza2: 65, build: 75, peak: 75, taper: 40 },
    '10k': { evaluare: 55, baza1: 65, baza2: 80, build: 90, peak: 90, taper: 50 },
    semimaraton: { evaluare: 70, baza1: 85, baza2: 100, build: 115, peak: 120, taper: 60 },
    maraton: { evaluare: 90, baza1: 120, baza2: 150, build: 175, peak: 180, taper: 75 },
  };
  const cap = caps[goal][pw.phase];
  if (pw.phase === 'taper') {
    prog.longRun = Math.min(prog.longRun, cap);
    return;
  }
  // Două expuneri comparabile, apoi un singur element crește: ~10% (5–10 min), nu în fiecare săptămână.
  prog.runExposures = (prog.runExposures ?? 0) + 1;
  if (prog.runExposures >= 2 && prog.longRun < cap) {
    prog.longRun += Math.min(10, Math.max(5, Math.round((prog.longRun * 0.1) / 5) * 5));
    prog.runExposures = 0;
  }
  // Mers-alergare: treapta urcă la două săptămâni bine tolerate, până la alergare continuă.
  if (prog.walkStep != null && prog.runExposures === 0) prog.walkStep += 1;
  prog.longRun = Math.min(prog.longRun, cap);
}

/** Doar înot: ședința lungă crește cu 5 min pe săptămână, plafon pe fază după distanța-obiectiv (1.500 m ≈ 40 min, 3.800 m ≈ 90 min la vârf). */
function advanceSwimProgression(prog: { longSwim: number }, pw: PhaseWeek, goal: Goal): void {
  if (pw.recovery) return;
  const peakMin = isSwimGoal(goal) ? { 'inot-1500': 40, 'inot-1900': 50, 'inot-3800': 90 }[goal] : 45;
  const scale: Record<Phase, number> = { evaluare: 0.6, baza1: 0.7, baza2: 0.85, build: 1, peak: 1, taper: 0.5 };
  const cap = Math.round((peakMin * scale[pw.phase]) / 5) * 5;
  if (pw.phase === 'taper') {
    prog.longSwim = Math.min(prog.longSwim, cap);
    return;
  }
  if (pw.weekInPhase > 0) prog.longSwim += 5;
  prog.longSwim = Math.min(prog.longSwim, Math.max(cap, MIN_SESSION_MIN.inot));
}

/** Doar bicicletă: tura lungă crește cu 15 min pe săptămână, plafon pe fază după distanța-obiectiv (50 km ≈ 2 h 30, 100 km ≈ 4 h, 160 km ≈ 5 h 30 la vârf). */
function advanceBikeProgression(prog: { longRide: number }, pw: PhaseWeek, goal: Goal): void {
  if (pw.recovery) return;
  const peakMin = isBikeGoal(goal) ? { 'bike-50': 150, 'bike-100': 240, 'bike-160': 330 }[goal] : 180;
  const scale: Record<Phase, number> = { evaluare: 0.5, baza1: 0.65, baza2: 0.8, build: 1, peak: 1, taper: 0.45 };
  const cap = Math.round((peakMin * scale[pw.phase]) / 15) * 15;
  if (pw.phase === 'taper') {
    prog.longRide = Math.min(prog.longRide, cap);
    return;
  }
  if (pw.weekInPhase > 0) prog.longRide += 15;
  prog.longRide = Math.min(prog.longRide, Math.max(cap, MIN_SESSION_MIN.bicicleta));
}

function fmtPace(sec: number): string {
  const t = Math.round(sec);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}/km`;
}

/**
 * Săptămâna de alergare (5 km … maraton), după documentul antrenorului de alergare AIRON:
 * - două ramuri: „finalizare” (rezistență: toleranță, regularitate, durată; zero sau o ședință moderată) și „timp”
 *   (baza aerobă + stimuli specifici distanței: V5, V10, H, M, cu tempo fragmentat T1/T2 alternat);
 * - debutantul / revenirea pornește cu mers-alergare și nu are ședințe rapide în bază;
 * - modulele se înlocuiesc, nu se adună; o ieșire lungă cu final la efort de cursă consumă bugetul de calitate al
 *   săptămânii (nu lungă grea + intervale grele automat);
 * - ritmul apare doar când are suport în date (planTarget), altfel efortul (RPE 0–10).
 */
function runWeekTemplate(pw: PhaseWeek, input: GenerateInput, prog: { longRun: number; walkStep?: number }): Session[] {
  const p = pw.phase;
  const s: Session[] = [];
  const pace = input.run?.goalPaceSecKm ?? null;
  const race = (isRunGoal(input.goal) ? input.goal : 'semimaraton') as RunGoal;
  const short = race === '5k' || race === '10k';
  const branch = input.run?.branch ?? (pace ? 'timp' : 'finalizare');
  const beginner = !!input.run?.beginner;
  const early = p === 'evaluare' || p === 'baza1';
  const raceWeek = pw.weekStart === weekStart(input.raceDate);
  const walk = beginner && prog.walkStep != null && prog.walkStep < WALK_RUN_STEPS ? prog.walkStep : null;
  const easyText = (min: number) => (walk != null ? walkRunStructure(walk, min) ?? undefined : undefined);

  const easyA = early ? (beginner ? 30 : 40) : p === 'taper' ? 30 : beginner ? 35 : 50;
  s.push({ sport: 'alergare', type: 'z2', minutes: easyA, zones: [2], key: false, priority: 6, structure: easyText(easyA) ?? 'ușor, RPE 2–3: conversație confortabilă; mersul e permis' });
  // A doua alergare ușoară: la 5–10 km pe ramura „finalizare” sunt 3 ieșiri pe săptămână; în rest 4 (cea mai ușor de scos).
  const fourRuns = !(short && branch === 'finalizare') && !(beginner && early);
  if (fourRuns) {
    const easyB = early ? 35 : p === 'taper' ? 25 : 45;
    s.push({ sport: 'alergare', type: 'z2', minutes: easyB, zones: [1, 2], key: false, priority: 7, structure: beginner ? 'ușor, RPE 2–3' : 'ușor + 4–6 accelerări relaxate de 15–20 s (progresiv, nu sprint)' });
  }

  // Ședința de calitate a săptămânii (sau nimic): un singur stimul greu, ales după ramură, nivel, fază și distanță.
  const longFinish = branch === 'timp' && !short && !beginner && (p === 'build' || p === 'peak') && pw.weekInPhase % 2 === 1 && input.intensityAllowed !== 'Z2';
  const mod = (() => {
    if (input.intensityAllowed === 'Z2' || p === 'evaluare') return null;
    if (raceWeek) return race === '5k' ? 'R5' : race === '10k' ? 'R10' : 'RL';
    if (beginner && (p === 'baza1' || p === 'baza2')) return null;
    if (longFinish) return null;
    const alt = pw.weekInPhase % 2 === 0;
    if (branch === 'finalizare') {
      if (p === 'build' || p === 'peak') return alt ? 'T1' : null;
      return null;
    }
    // ramura „timp”
    if (p === 'baza1') return null; // regularitate + accelerări; progresivul vine mai jos
    if (p === 'taper') return race === '5k' ? 'R5' : race === '10k' ? 'R10' : 'RL';
    if (p === 'baza2') return race === '5k' ? (alt ? 'T1' : 'V5') : race === '10k' ? (alt ? 'T1' : 'V10a') : alt ? 'T1' : 'T2';
    if (p === 'build') return race === '5k' ? (alt ? 'V5' : 'V5b') : race === '10k' ? (alt ? 'V10' : 'T2') : race === 'semimaraton' ? (alt ? 'H' : 'T2') : alt ? 'M' : 'T2';
    return race === '5k' ? 'V5b' : race === '10k' ? 'V10' : race === 'semimaraton' ? 'H' : 'M';
  })() as RunModuleId | null;

  if (mod) {
    const b = moduleStructure(mod, null, pace);
    // De la 55 de ani (sau intensitate plafonată la Z4), modulele cu Z5 rămân la Z4: același format, efort plafonat.
    const cap4 = input.intensityAllowed === 'pana_la_Z4' || (input.athlete?.age ?? 0) >= 55;
    const z = (cap4 && RUN_MODULES[mod].zone === 5 ? 4 : RUN_MODULES[mod].zone) as Zone;
    s.push({ sport: 'alergare', type: 'calitate', minutes: b.minutes, zones: z === 5 ? [4, 5] : [z], key: true, priority: 3, structure: cap4 && RUN_MODULES[mod].zone === 5 ? `${b.text} · plafonat la Z4 (vârsta)` : b.text, intervals: { count: b.count, minutes: Math.max(1, Math.round(b.work)), zone: z } });
  } else if (branch === 'timp' && p === 'baza1' && !beginner && input.intensityAllowed !== 'Z2') {
    // Baza pe ramura „timp”: o alergare progresivă la două săptămâni (moderat la final), altfel ușor cu accelerări.
    if (pw.weekInPhase % 2 === 1) s.push({ sport: 'alergare', type: 'calitate', minutes: 45, zones: [2, 3], key: true, priority: 3, structure: 'progresiv: primele două treimi ușor (RPE 2–3), apoi crești treptat până la moderat (RPE 4–5) în ultimele 10–15 min; nu termini în sprint' });
    else s.push({ sport: 'alergare', type: 'z2', minutes: 40, zones: [2], key: false, priority: 5, structure: 'ușor + 6 accelerări relaxate de 15–20 s, recuperare amplă' });
  } else if (!fourRuns || beginner) {
    // Fără calitate (debutant, finalizare): a treia ieșire e tot ușoară; prioritatea e regularitatea.
  } else {
    s.push({ sport: 'alergare', type: 'z2', minutes: early ? 40 : 45, zones: [2], key: false, priority: 5, structure: p === 'evaluare' ? 'ușor + 6 accelerări de 20 s' : 'ușor, constant' });
  }

  if (!raceWeek && !(p === 'taper' && pw.weekInPhase > 0)) {
    const finish = race === 'maraton' ? 30 : 20;
    s.push({
      sport: 'alergare',
      type: 'lung',
      ...(longFinish
        ? { minutes: prog.longRun, zones: [2, 3] as Zone[], key: true, priority: 1, structure: `ușor, cu ultimele ${finish} min la efort de cursă (RPE 5–6${pace ? `, orientativ ${fmtPace(pace)}` : ''}); săptămâna asta e singura ședință solicitantă; exersezi alimentarea` }
        : walk != null
          ? { minutes: prog.longRun, zones: [2] as Zone[], key: true, priority: 1, structure: walkRunStructure(walk, prog.longRun) ?? 'ușor' }
          : { ...longRunOf(pw, prog.longRun, short ? 'ușor, conversațional; 4 accelerări de 20 s la final' : race === 'semimaraton' || race === 'maraton' ? 'ușor, conversațional; exersezi alimentarea de la 75 min' : 'ușor, conversațional'), priority: 1 }),
    });
  }

  const tests = beginner ? [] : fieldTests(pw, input, ['alergare']);
  for (const t of tests) {
    const easy = s.findIndex((x) => x.sport === 'alergare' && x.type === 'z2' && !x.key);
    if (easy >= 0) s.splice(easy, 1, t);
  }
  // Săptămâna cu test: testul e stimulul greu; modulul de calitate devine alergare ușoară (un singur stimul greu).
  if (tests.length) {
    for (const x of s) {
      if (x.type === 'calitate' && !/TEST/.test(x.structure ?? '')) {
        x.type = 'z2';
        x.zones = [2];
        x.key = false;
        x.priority = 6;
        x.intervals = undefined;
        x.minutes = Math.min(x.minutes, 40);
        x.structure = 'ușor, RPE 2–3: săptămâna asta testul e ședința grea';
      }
    }
  }

  s.push(...strengthSessions(p, input.strengthSlots ?? 2));

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
 * Săptămâna doar de înot: tehnică, o ședință lungă în care distanța fără oprire crește treptat (25–50 m în plus pe
 * săptămână până la 400 m, apoi minute), calitate (set CSS) din baza2 dacă înoată 400 m și intensitatea e permisă,
 * la 3.800 m încă un înot ușor din build; forța de 2 ori. Fără 400 m continuu, totul rămâne tehnică + bucăți legate.
 */
function swimWeekTemplate(pw: PhaseWeek, input: GenerateInput, prog: { longSwim: number }): Session[] {
  const p = pw.phase;
  const s: Session[] = [];
  const can400 = input.swimContinuous400;
  const early = p === 'evaluare' || p === 'baza1';
  const targetM = isSwimGoal(input.goal) ? SWIM_DISTANCE_M[input.goal] : 1500;

  s.push({ sport: 'inot', type: 'tehnica', minutes: early ? 35 : p === 'taper' ? 30 : 40, zones: [1, 2], key: false, priority: 6, structure: 'un element de tehnică (respirație, poziție, tracțiune), bucăți scurte' });
  if (can400) {
    s.push({ sport: 'inot', type: 'lung', minutes: prog.longSwim, zones: [2], key: true, priority: 1, structure: p === 'peak' ? `distanța obiectivului (${targetM.toLocaleString('ro-RO')} m) sau cât poți fără oprire, ritm constant` : 'cea mai lungă bucată fără oprire de până acum + 100 m, apoi ușor' });
  } else {
    s.push({ sport: 'inot', type: 'tehnica', minutes: prog.longSwim, zones: [1, 2], key: true, priority: 1, structure: 'bucăți legate: cât ai demonstrat fără oprire + 25 m, pauză până respiri liniștit; ținta e 400 m legat' });
  }
  if (can400 && input.intensityAllowed !== 'Z2' && !early && p !== 'taper') {
    s.push({ sport: 'inot', type: 'calitate', minutes: 45, zones: [3, 4], key: true, priority: 3, structure: swimQuality(p, pw.weekInPhase) ?? '10 × 100 m la ritmul CSS, 15 s pauză (set CSS)' });
  } else if (!early && p !== 'taper') {
    s.push({ sport: 'inot', type: 'tehnica', minutes: 35, zones: [1, 2], key: false, priority: 5, structure: can400 && pw.weekInPhase % 2 === 1 ? SWIM_PYRAMID : 'tehnică + 8 × 50 m cu accent pe alunecare' });
  }
  if (targetM >= 3800 && (p === 'build' || p === 'peak')) s.push({ sport: 'inot', type: 'z2', minutes: 45, zones: [2], key: false, priority: 6.5, structure: 'ușor, continuu (cât ai demonstrat fără oprire), respirație cum îți e comod' });

  for (const t of fieldTests(pw, input, ['inot'])) {
    const easy = s.findIndex((x) => x.sport === 'inot' && x.type === 'tehnica' && !x.key);
    if (easy >= 0) s.splice(easy, 1, t);
    else s.push(t);
  }
  s.push(...strengthSessions(p, input.strengthSlots ?? 2));
  if (pw.recovery) {
    for (const x of s) {
      x.minutes = Math.round((x.minutes * RECOVERY_FACTOR) / 5) * 5;
      x.key = false;
      if (x.type === 'calitate') {
        x.type = 'tehnica';
        x.zones = [1, 2];
        x.structure = 'tehnică, ușor';
        x.intervals = undefined;
      }
    }
  }
  return s;
}

/**
 * Săptămâna doar de bicicletă: o tură ușoară (Z2, cu cadență), una de calitate (sweet spot din baza2, prag în build,
 * ritm de obiectiv în peak), tura lungă care crește spre distanța-obiectiv, forța de 2 ori.
 */
function bikeWeekTemplate(pw: PhaseWeek, input: GenerateInput, prog: { longRide: number }): Session[] {
  const p = pw.phase;
  const s: Session[] = [];
  const early = p === 'evaluare' || p === 'baza1';
  const targetKm = isBikeGoal(input.goal) ? BIKE_DISTANCE_KM[input.goal] : 100;
  const hard = input.intensityAllowed !== 'Z2';

  s.push({ sport: 'bicicleta', type: 'z2', minutes: early ? 60 : p === 'taper' ? 45 : 75, zones: [2], key: false, priority: 6, structure: 'ușor, cadență 90–100' });
  const bq = hard ? bikeQuality(p, pw.weekInPhase, { raceKm: targetKm, capZ4: input.intensityAllowed === 'pana_la_Z4' || (input.athlete?.age ?? 0) >= 55, experienced: !!input.experiencedBike }) : null;
  if (bq) s.push({ sport: 'bicicleta', type: 'calitate', minutes: bq.minutes, zones: bq.zones, key: p !== 'taper', priority: 3, structure: bq.structure, ...(bq.intervals ? { intervals: bq.intervals } : {}) });
  else s.push({ sport: 'bicicleta', type: 'z2', minutes: early ? 60 : 70, zones: [2], key: false, priority: 5.8, structure: 'ușor, cu 6 × 1 min cadență 110' });
  if (!(p === 'taper' && pw.weekInPhase > 0)) {
    s.push({ sport: 'bicicleta', type: 'lung', minutes: prog.longRide, zones: [2], key: true, priority: 1, structure: p === 'peak' ? `tură lungă Z2, cu hrănire la fiecare 30 min (obiectiv: ${targetKm} km)` : 'tură lungă Z2, constantă, cu hrănire exersată' });
  }
  for (const t of fieldTests(pw, input, ['bicicleta'])) {
    const easy = s.findIndex((x) => x.sport === 'bicicleta' && x.type === 'z2' && !x.key);
    if (easy >= 0) s.splice(easy, 1, t);
    else s.push(t);
  }
  s.push(...strengthSessions(p, input.strengthSlots ?? 2));
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
  const quality = qualitySession(input.intensityAllowed, p, input.athlete?.age ?? null, pw.weekInPhase);

  // Înot: 3 ședințe scurte, tehnica înainte de volum.
  const swimCount = p === 'taper' ? 2 : 3;
  for (let i = 0; i < swimCount; i++) {
    if ((p === 'build' || p === 'peak') && i === 1 && input.intensityAllowed !== 'Z2' && input.swimContinuous400) s.push({ sport: 'inot', type: 'calitate', minutes: 45, zones: [3, 4], key: false, priority: 5, structure: swimQuality(p, pw.weekInPhase) ?? 'set CSS' });
    else if (p === 'peak' && i === 0) s.push({ sport: 'inot', type: 'lung', minutes: 60, zones: [2, 3], key: false, priority: 5, structure: 'distanța de cursă continuu' });
    else if (i === 2 && input.swimContinuous400 && (p === 'baza2' || p === 'build') && pw.weekInPhase % 2 === 1) s.push({ sport: 'inot', type: 'z2', minutes: swimMin, zones: [2], key: false, priority: 5, structure: SWIM_PYRAMID });
    else s.push({ sport: 'inot', type: 'tehnica', minutes: p === 'taper' ? 35 : swimMin, zones: [1, 2], key: false, priority: 5, structure: 'un element de tehnică' });
  }

  // Bicicletă: a doua ședință crește și ea în trepte: Z2 în evaluare/baza1, sweet spot (Z3) în baza2, prag (Z4) în build, ritm de cursă în peak.
  // Triatlon: în peak, specificitate (ritm de cursă) — intervalele scurte rămân pentru obiectivele doar de bicicletă.
  const tq = input.intensityAllowed !== 'Z2' && (p === 'baza2' || p === 'build' || p === 'peak') ? bikeQuality(p, p === 'peak' ? 1 : pw.weekInPhase) : null;
  if (tq) s.push({ sport: 'bicicleta', type: 'calitate', minutes: tq.minutes, zones: tq.zones, key: false, priority: 3.5, structure: tq.structure, ...(tq.intervals ? { intervals: tq.intervals } : {}) });
  else s.push({ sport: 'bicicleta', type: 'z2', minutes: p === 'baza1' || p === 'evaluare' ? 60 : p === 'taper' ? 45 : 75, zones: [2], key: false, priority: 5.8 });
  if (p === 'evaluare' || p === 'baza1') {
    s.push({ sport: 'bicicleta', type: 'lung', minutes: prog.longRide, zones: [2], key: true, priority: 1 });
  } else if (p === 'taper' && pw.weekInPhase > 0) {
    // Auditul v93, A37: intervalele explicite (3 × 5 min), nu text din care pașii deduceau 27 min continuu în Z4.
    s.push({ sport: 'bicicleta', type: 'calitate', minutes: 40, zones: [2, 3], key: false, priority: 3, structure: '3 × 5 min la ritm de cursă, 3 min ușor între', intervals: { count: 3, minutes: 5, zone: 3 } });
  } else {
    s.push({
      sport: 'bicicleta',
      type: 'brick',
      minutes: prog.longRide + BRICK_TRANSITION_MIN + prog.brickRun,
      zones: [2],
      key: true,
      priority: 1,
      structure: brickText(prog.longRide, prog.brickRun),
    });
  }

  // Alergare: Z2 + calitate (dacă e permisă) + lungă.
  s.push({ sport: 'alergare', type: 'z2', minutes: p === 'baza1' || p === 'evaluare' ? 45 : p === 'taper' ? 30 : 50, zones: [2], key: false, priority: 6 });
  s.push(quality(p === 'taper' ? 30 : p === 'baza1' || p === 'evaluare' ? 50 : 55));
  if (!(p === 'taper' && pw.weekInPhase > 0)) {
    s.push(longRunOf(pw, prog.longRun, 'ușor'));
  }

  // Testele înlocuiesc o ședință ușoară a aceluiași sport din săptămâna lor.
  for (const t of fieldTests(pw, input, ['inot', 'bicicleta', 'alergare'])) {
    const easy = s.findIndex((x) => x.sport === t.sport && (x.type === 'z2' || x.type === 'tehnica') && !x.key);
    if (easy >= 0) s.splice(easy, 1, t);
    else s.push(t);
  }

  // Forță: programul Push / Pull / Legs, 2 ședințe pe săptămână (una în taper); ziua din rotație se pune după plasare.
  s.push(...strengthSessions(p, input.strengthSlots ?? 2));

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
function qualitySession(allowed: IntensityAllowed, phase: Phase, age: number | null = null, weekInPhase = 0): (minutes: number) => Session {
  return (minutes) => {
    if (allowed === 'Z2') return { sport: 'alergare', type: 'z2', minutes: Math.round(minutes * 0.9), zones: [2], key: false, priority: 6, structure: 'calitatea e limitată (restricție de la medic sau din analize)' };
    if (phase === 'evaluare') return { sport: 'alergare', type: 'z2', minutes: Math.round(minutes * 0.9), zones: [2], key: false, priority: 6, structure: 'ușor + 6 accelerări de 20 s' };
    const capZ4 = allowed === 'pana_la_Z4' || (age != null && age >= 55);
    // Regula Sang: prima repetare puțin mai ușor, ultimele cele mai bune; ziua tare la ~80%, nu la maxim.
    const CTRL = ' · prima repetare puțin mai ușor, ultimele cele mai bune';
    if (phase === 'baza1') {
      // Baza 1: alternează tempo-ul scurt cu alergarea progresivă (pornești ușor, termini în Z3).
      if (weekInPhase % 2 === 1) return { sport: 'alergare', type: 'calitate', minutes, zones: [2, 3], key: true, priority: 3, structure: 'progresiv: primele două treimi ușor (Z2), apoi crești treptat până în Z3 în ultimele 10–15 min' };
      return { sport: 'alergare', type: 'calitate', minutes, zones: [3], key: true, priority: 3, structure: `2 × 8 min tempo (Z3), 3 min ușor între${CTRL}`, intervals: { count: 2, minutes: 8, zone: 3 } };
    }
    if (phase === 'baza2' && weekInPhase % 2 === 1) {
      // Fartlek-ul lui Sang după timp: pauza se face la trap ușor, nu oprit.
      return { sport: 'alergare', type: 'calitate', minutes: Math.max(minutes, 45), zones: [3, 4], key: true, priority: 3, structure: `8 × 3 min tare, 1 min ușor între (fartlek, Z3–Z4, pauza la trap)${CTRL}`, intervals: { count: 8, minutes: 3, zone: 4 } };
    }
    if (phase === 'baza2' || phase === 'taper') return { sport: 'alergare', type: 'calitate', minutes, zones: [3, 4], key: true, priority: 3, structure: `3 × 10 min tempo (Z3–Z4), 3 min ușor între${CTRL}`, intervals: { count: 3, minutes: 10, zone: 4 } };
    const prag: Session = { sport: 'alergare', type: 'calitate', minutes, zones: [4], key: true, priority: 3, structure: `5 × 6 min la prag (Z4), 2 min ușor între${CTRL}`, intervals: { count: 5, minutes: 6, zone: 4 } };
    // 4×4 norvegian (NTNU): VO2max, o dată pe săptămână, doar cu aviz și fără limită de vârstă pentru Z5.
    const fourByFour: Session = { sport: 'alergare', type: 'calitate', minutes: Math.max(minutes, 45), zones: [5], key: true, priority: 3, structure: `4 × 4 min la 90–95% din pulsul maxim (4×4 norvegian, Z5), 3 min ușor între${CTRL}`, intervals: { count: 4, minutes: 4, zone: 5 } };
    if (capZ4) return prag;
    // Build: o săptămână prag, una 4×4; peak: 4×4.
    if (phase === 'build') return weekInPhase % 2 === 1 ? fourByFour : prag;
    return fourByFour;
  };
}

/** Testele de teren: în evaluare (doar unde lipsesc datele) și reluate la începutul fazelor baza2 și build. */
function fieldTests(pw: PhaseWeek, input: GenerateInput, sports: Sport[]): Session[] {
  // Testele de teren sunt eforturi maximale: aceleași restricții ca intervalele. Cu intensitatea plafonată (Z2, Z4,
  // sau de la 55 de ani), fără test maximal; zonele rămân estimate și etichetate, iar efortul conduce.
  const age = input.athlete?.age ?? null;
  if (pw.recovery || input.intensityAllowed !== 'toate' || (age != null && age >= 55)) return [];
  const have = input.tests ?? { alergare: false, bicicleta: false, inot: false };
  const out: Session[] = [];
  const due = (sport: Sport, week: number) =>
    (pw.phase === 'evaluare' && pw.weekInPhase === week && !have[sport as 'alergare' | 'bicicleta' | 'inot']) || ((pw.phase === 'baza2' || pw.phase === 'build') && pw.weekInPhase === 0);
  if (sports.includes('alergare') && due('alergare', 1)) out.push({ sport: 'alergare', type: 'calitate', minutes: 50, zones: [4, 5], key: true, priority: 2.5, structure: RUN_TEST(15, 30, 5) });
  if (sports.includes('bicicleta') && due('bicicleta', 1)) out.push({ sport: 'bicicleta', type: 'calitate', minutes: 55, zones: [4, 5], key: true, priority: 2.5, structure: BIKE_TEST(25, 10) });
  if (sports.includes('inot') && input.swimContinuous400 && due('inot', 2)) out.push({ sport: 'inot', type: 'calitate', minutes: 40, zones: [4, 5], key: true, priority: 2.5, structure: 'TEST CSS: încălzire, 400 m tare, 5 min pauză, 200 m tare; notează timpii' });
  return out;
}

/**
 * Potrivește ședințele la orele-țintă. Fiecare sport rămâne prezent din prima săptămână (minimum pe sport:
 * la triatlon 2 înot, 2 bicicletă, 2 alergare, 1 forță), adaptat ca durată la nivelul și orele sportivului:
 * întâi se scurtează, abia apoi cade ce e peste minimum, iar la nevoie se scurtează și ședințele-cheie.
 */
function fitToHours(sessions: Session[], targetHours: number, recovery: boolean, minCount: Partial<Record<Sport, number>>, easyMin: (x: Session) => number = (x) => MIN_SESSION_MIN[x.sport]): { sessions: Session[]; notes: string[] } {
  const notes: string[] = [];
  const targetMin = targetHours * 60;
  let all = sessions.map((x) => ({ ...x }));
  const total = () => all.reduce((n, x) => n + x.minutes, 0);
  const count = (sp: Sport) => all.filter((x) => x.sport === sp).length;
  // Ședințele ușoare nu coboară sub ce face sportivul de obicei; dacă săptămâna tot nu încape, cade o ședință (pasul 2),
  // în loc să devină toate „de sedentar”.
  const floorOf = (x: Session) => (x.key ? Math.max(MIN_SESSION_MIN[x.sport], x.type === 'lung' || x.type === 'brick' ? (x.sport === 'bicicleta' ? 60 : 40) : 30) : Math.max(MIN_SESSION_MIN[x.sport], easyMin(x)));

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
  /** Brick-ul: zi grea, ca intensitatea. */
  hasBrick?: boolean;
  sports: Set<Sport>;
}

function place(sessions: Session[], blocks: FreeBlock[], weekStart: string, phase: Phase = 'baza1', minCount: Partial<Record<Sport, number>> = {}, fixed?: FixedMeet[]): { workouts: PlannedWorkout[]; notes: string[] } {
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
  // Ședința legată de o întâlnire fixă (ex. lunga cu grupul) se plasează prima, ca ziua ei să nu fie luată de altele.
  const isFixed = (x: Session) => !!fixed?.some((f) => fixedBonus([f], f.zi, x.sport, x.type) > 0);
  const ordered0 = [...byPrio.filter((x) => core.has(x)), ...byPrio.filter((x) => !core.has(x))];
  const ordered = [...ordered0.filter(isFixed), ...ordered0.filter((x) => !isFixed(x))];
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
      .sort((a, b) => spaced(b) - spaced(a));
    // Zi tare, zi ușoară: o ședință grea preferă o zi fără altă zi grea înainte sau după (penalizare, nu interdicție).
    function spaced(c: { st: DayState; d: number }): number {
      const heavy = (x: DayState | undefined) => !!x && (x.hard > 0 || !!x.hasBrick);
      const hardSession = s.type === 'calitate' || s.type === 'brick';
      return score(c, s) + fixedBonus(fixed, c.d, s.sport, s.type) - (hardSession && (heavy(days[c.d - 1]) || heavy(days[c.d + 1])) ? 1000 : 0);
    }

    let candidates = findCandidates();
    // Nu încape întreagă nicăieri: se scurtează până la cel mai mare bloc liber (nu sub minimul sportului), ca sportul să nu dispară.
    // La fel pentru ședințele-cheie (ieșirea lungă): scurtată și spusă, nu ștearsă în tăcere.
    if (!candidates.length) {
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
    if (s.type === 'brick') st.hasBrick = true;
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
