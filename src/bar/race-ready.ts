import { swimPace100, swimPaceOk } from '../collector/details.js';
// „Pe drum” și „Gata de cursă”.
//
// PE DRUM: ești unde ar trebui să fii în faza de acum? Din execuția planului pe ultimele 4 săptămâni: cât din volumul
// planificat ai făcut și câte ședințe-cheie. La 40 de săptămâni de cursă asta contează, nu „gata de cursă”.
//
// GATA DE CURSĂ: cât de pregătit ești să TERMINI cursa, după cea mai slabă verigă (o probă slabă te scoate din cursă,
// oricât de bune ar fi celelalte; media ar ascunde-o). Verigile:
//   - fiecare probă: ce ai demonstrat în ultimele 8 săptămâni față de reperul ei;
//   - cumulul: cea mai lungă zi cu mai multe sporturi față de ~65% din timpul estimat al cursei (practica antrenorilor:
//     zilele cele mai lungi ajung la 60–75% din durata cursei; practică, nu studiu).
// Plus ședințele-reper (teste specifice cursei) și timpul estimat cu marjă, față de limitele uzuale ale unui 70.3
// (înot 1 h 10; înot + bicicletă 5 h 30; total 8 h 30 — verifică regulamentul cursei tale).
// Totul din ce au măsurat ceasul și formularele. Estimarea are marjă de ±10%: apa deschisă, traseul și căldura schimbă tot.

import type { SourceActivity } from '../collector/types.js';
import type { PlannedWorkout, Sport } from '../types.js';
import { BIKE_DISTANCE_KM, RUN_DISTANCE_KM, SWIM_DISTANCE_M, goalKind, isBikeGoal, isRunGoal, isSwimGoal, type Goal } from '../calendar/phases.js';
import { fmtTime, predictFromEffort, riegel, runTarget, type RunTargetVerdict } from '../goals/run-target.js';
import { matchActivities } from '../scoring/match.js';
import { isBrickRun } from './sport-readiness.js';
import { addDays, diffDays } from '../util/dates.js';

export interface Benchmark {
  id: string;
  title: string;
  how: string;
  done: boolean;
  /** Cea mai bună încercare, scrisă pentru om. */
  best: string | null;
  date: string | null;
}

export interface Link {
  name: string;
  /** Indicele față de reperele probei (0–100); null = fără date pentru proba asta (nu 0). */
  pct: number | null;
  /** Ce s-a măsurat, separat de indice (ex. „21,4 km, cea mai lungă ședință”). */
  measured: string | null;
  detail: string;
}

export interface RaceReady {
  /** Pe drum (0–100) sau null fără plan în ultimele 4 săptămâni. */
  onTrack: { pct: number; volumePct: number; keyDone: number; keyPlanned: number } | null;
  /** Gata de cursă = cea mai slabă verigă; null = evaluare incompletă (o probă fără date). */
  ready: number | null;
  weakest: string | null;
  /** Câte probe au date, din câte. */
  coverage: { withData: number; total: number; missing: string[] };
  links: Link[];
  benchmarks: Benchmark[];
  /** Timpul estimat (min) cu marjă și limitele; null când lipsesc ritmurile. */
  estimate: { swim: number | null; bike: number | null; run: number | null; total: number | null; low: number | null; high: number | null; cutoffs: { swim: number; swimBike: number; total: number } | null; assumptions: string[] } | null;
  /** Doar la alergare cu timp-țintă: ținta față de cel mai bun efort recent și verdictul de realism. */
  target: {
    targetSec: number;
    /** Timpul pe care e construit planul: ținta, sau timpul realist de acum când ținta e nerealistă (null = fără reper). */
    planSec: number | null;
    /** true când planul nu e pe ținta declarată. */
    adjusted: boolean;
    /** Cel mai bun efort recent pe distanța cursei sau cea mai apropiată, din ceas. */
    best: { km: number; sec: number; date: string; label: string } | null;
    /** Timpul estimat pe distanța cursei din cel mai bun efort (Riegel), s. */
    predictedSec: number | null;
    predictedLow: number | null;
    predictedHigh: number | null;
    verdict: RunTargetVerdict;
  } | null;
}

const WIN = 56;
const TRI: Goal[] = ['70.3', 'olimpic', 'sprint'];
const DIST: Record<Goal, { swim?: number; bike?: number; run?: number; longRun?: number; longRide?: number; brickRide?: number; brickRun?: number; bigDayH?: number }> = {
  '70.3': { swim: 1.9, bike: 90, run: 21.1, longRun: 18, longRide: 90, brickRide: 120, brickRun: 45, bigDayH: 4 },
  olimpic: { swim: 1.5, bike: 40, run: 10, longRun: 12, longRide: 50, brickRide: 75, brickRun: 30, bigDayH: 2.5 },
  sprint: { swim: 0.75, bike: 20, run: 5, longRun: 8, longRide: 30, brickRide: 45, brickRun: 20, bigDayH: 1.5 },
  // Alergare: ieșirea lungă de referință (la 5 și 10 km se aleargă mai mult decât cursa; la maraton mai puțin).
  '5k': { run: 5, longRun: 8 },
  '10k': { run: 10, longRun: 12 },
  semimaraton: { run: 21.1, longRun: 18 },
  maraton: { run: 42.2, longRun: 32 },
  // Înot: distanța fără oprire. Bicicletă: tura lungă = distanța obiectivului.
  'inot-1500': { swim: 1.5 },
  'inot-1900': { swim: 1.9 },
  'inot-3800': { swim: 3.8 },
  'bike-50': { bike: 50, longRide: 50 },
  'bike-100': { bike: 100, longRide: 100 },
  'bike-160': { bike: 160, longRide: 160 },
  'fit-slabire': {},
  'fit-tonifiere': {},
  'fit-intretinere': {},
  'fit-masa': {},
  mers: {},
};
const CUTOFFS: Partial<Record<Goal, { swim: number; swimBike: number; total: number }>> = { '70.3': { swim: 70, swimBike: 330, total: 510 } };

const fmtH = (min: number) => `${Math.floor(min / 60)} h ${String(Math.round(min % 60)).padStart(2, '0')}`;

/**
 * Cel mai bun efort recent de alergare, pentru estimarea timpului: „best efforts” de pe ceas (1 km … 42,2 km) și
 * alergările întregi (ritmul mediu), aduse la distanța cursei cu Riegel; câștigă cel mai rapid echivalent. Doar
 * eforturi de cel puțin o cincime din distanța cursei (un km rapid nu „prezice” un maraton) și de cel puțin 1 km.
 */
function bestRunEffort(runs: SourceActivity[], raceKm: number): { km: number; sec: number; date: string; label: string } | null {
  const EFF_KM: Record<string, number> = { '1 km': 1, '1 milă': 1.609, '5 km': 5, '10 km': 10, '21,1 km': 21.0975, '42,2 km': 42.195 };
  const minKm = Math.max(1, raceKm / 5);
  const cands: { km: number; sec: number; date: string; label: string }[] = [];
  for (const a of runs) {
    for (const [name, sec] of Object.entries(a.details?.bestEfforts ?? {})) {
      const km = EFF_KM[name];
      if (km && km >= minKm && sec > 0) cands.push({ km, sec, date: a.date, label: `cel mai bun ${name} (${fmtT(sec)})` });
    }
    const movingSec = (a.details?.movingMin ?? a.minutes) * 60;
    if ((a.distanceKm ?? 0) >= minKm && movingSec > 0) cands.push({ km: a.distanceKm!, sec: movingSec, date: a.date, label: `alergarea de ${a.distanceKm!.toLocaleString('ro-RO', { maximumFractionDigits: 1 })} km (${fmtT(movingSec)})` });
  }
  if (!cands.length) return null;
  const equiv = (c: { km: number; sec: number }) => riegel(c.sec, c.km, raceKm);
  return cands.sort((x, y) => equiv(x) - equiv(y))[0] ?? null;
}
const fmtT = (sec: number) => {
  const r = Math.round(sec);
  const h = Math.floor(r / 3600);
  const m = Math.floor((r % 3600) / 60);
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(r % 60).padStart(2, '0')}` : `${m}:${String(r % 60).padStart(2, '0')}`;
};
const pct = (x: number) => Math.round(Math.max(0, Math.min(1, x)) * 100);

export function raceReady(input: {
  goal: Goal;
  today: string;
  acts: SourceActivity[];
  plan: PlannedWorkout[];
  /** Ședințele lungi cu hrănire „conform” (formularul de seară): datele lor. */
  fueledDates: string[];
  /** La alergare: timpul-țintă (s) din chestionar. */
  targetSec?: number | null;
  /** Data cursei (pentru săptămânile rămase); fără ea, ultima zi din plan. */
  raceDate?: string | null;
}): RaceReady {
  const { goal, today } = input;
  const d = DIST[goal];
  const tri = TRI.includes(goal);
  const kind = goalKind(goal);
  const recent = input.acts.filter((a) => diffDays(a.date, today) >= 0 && diffDays(a.date, today) < WIN);
  const of = (s: Sport) => recent.filter((a) => a.sport === s);
  const longest = (s: Sport) => of(s).reduce<SourceActivity | null>((m, a) => ((a.distanceKm ?? 0) > (m?.distanceKm ?? 0) ? a : m), null);

  // ——— Pe drum ———
  const p4 = input.plan.filter((w) => w.date < today && w.date >= addDays(today, -28) && (w.status === 'planificat' || w.status === 'mutat') && w.type !== 'odihna');
  let onTrack: RaceReady['onTrack'] = null;
  if (p4.length) {
    const m = matchActivities(p4, input.acts, addDays(today, -1));
    const plannedMin = p4.reduce((n, w) => n + w.plannedMinutes, 0);
    const doneMin = input.acts.filter((a) => a.date < today && a.date >= addDays(today, -28)).reduce((n, a) => n + a.minutes, 0);
    const keys = p4.filter((w) => w.key);
    const keyDone = m.matches.filter((x) => x.planned.key && x.activity).length;
    const volumePct = pct(doneMin / Math.max(1, plannedMin));
    const keyPct = keys.length ? pct(keyDone / keys.length) : volumePct;
    onTrack = { pct: Math.round((Math.min(volumePct, 100) + keyPct) / 2), volumePct: Math.round((doneMin / Math.max(1, plannedMin)) * 100), keyDone, keyPlanned: keys.length };
  }

  // ——— Ritmurile demonstrate ———
  const swims = of('inot');
  const contPace = swims.filter((a) => (a.details?.continuousM ?? 0) >= 400).map((a) => a.details?.continuousPace100mSec).filter(swimPaceOk);
  const sessPace = swims.filter((a) => (a.distanceKm ?? 0) >= 0.4).map((a) => swimPace100(a.minutes * 60, (a.distanceKm ?? 0) * 1000)).filter(swimPaceOk);
  const swimPace = contPace.length ? Math.min(...contPace) : sessPace.length ? Math.min(...sessPace) : null; // s/100 m
  const rides = of('bicicleta').filter((a) => a.minutes >= 90 && (a.distanceKm ?? 0) > 0);
  const bikeSpeed = rides.length ? Math.max(...rides.map((a) => (a.distanceKm ?? 0) / (a.minutes / 60))) : null; // km/h
  const brickRuns = of('alergare').filter((a) => isBrickRun(a, recent) && (a.distanceKm ?? 0) >= 3);
  const longRuns = of('alergare').filter((a) => (a.distanceKm ?? 0) >= 10);
  const assumptions: string[] = [];
  let runPace: number | null = null; // min/km
  if (brickRuns.length) {
    runPace = Math.min(...brickRuns.map((a) => a.minutes / (a.distanceKm ?? 1)));
    assumptions.push('alergarea: ritmul tău după bicicletă');
  } else if (longRuns.length) {
    runPace = Math.min(...longRuns.map((a) => a.minutes / (a.distanceKm ?? 1))) * (tri ? 1.1 : 1);
    if (tri) assumptions.push('alergarea: ritmul alergărilor lungi +10% (încă niciun brick măsurat; după bicicletă se aleargă de obicei mai încet)');
  }
  if (swimPace != null && !contPace.length) assumptions.push('înotul: ritmul ședinței cu pauze (fără ture de la ceas)');
  if (bikeSpeed != null) assumptions.push('bicicleta: viteza medie a celei mai rapide ture de peste 1 h 30');

  // ——— Estimarea ———
  let estimate: RaceReady['estimate'] = null;
  if (tri) {
    const swim = swimPace != null && d.swim ? (swimPace * d.swim * 10) / 60 : null;
    const bike = bikeSpeed && d.bike ? (d.bike / bikeSpeed) * 60 : null;
    const run = runPace != null && d.run ? runPace * d.run : null;
    const total = swim != null && bike != null && run != null ? swim + bike + run + 10 : null;
    estimate = { swim, bike, run, total, low: total ? total * 0.9 : null, high: total ? total * 1.1 : null, cutoffs: CUTOFFS[goal] ?? null, assumptions: [...assumptions, 'tranziții: 10 min'] };
  } else if (isRunGoal(goal)) {
    // Alergare: din cel mai bun efort recent (Riegel), nu din ritmul alergărilor lungi.
    const eff = bestRunEffort(of('alergare'), RUN_DISTANCE_KM[goal]);
    const pred = eff ? predictFromEffort(eff, goal) : null;
    if (pred) estimate = { swim: null, bike: null, run: pred.sec / 60, total: pred.sec / 60, low: pred.low / 60, high: pred.high / 60, cutoffs: null, assumptions: [`din ${eff!.label} (${eff!.date}), adus la distanța cursei cu formula lui Riegel`] };
  } else if (isSwimGoal(goal) && swimPace != null && d.swim) {
    const swim = (swimPace * d.swim * 10) / 60;
    estimate = { swim, bike: null, run: null, total: swim, low: swim * 0.95, high: swim * 1.15, cutoffs: null, assumptions: [...assumptions, 'ritmul porțiunii continue ținut pe toată distanța (pe distanțe mai lungi ritmul scade)'] };
  } else if (isBikeGoal(goal) && bikeSpeed && d.bike) {
    const bike = (d.bike / bikeSpeed) * 60;
    estimate = { swim: null, bike, run: null, total: bike, low: bike * 0.95, high: bike * 1.15, cutoffs: null, assumptions: [...assumptions, 'viteza medie ținută pe toată distanța; relieful și vântul schimbă mult'] };
  }

  // ——— Ținta de timp (alergare) ———
  let target: RaceReady['target'] = null;
  if (isRunGoal(goal) && input.targetSec && input.targetSec > 0) {
    const eff = bestRunEffort(of('alergare'), RUN_DISTANCE_KM[goal]);
    const pred = eff ? predictFromEffort(eff, goal) : null;
    const until = input.raceDate && input.raceDate > today ? input.raceDate : input.plan.reduce((m, w) => (w.date > m ? w.date : m), today);
    const weeks = Math.max(0, diffDays(today, until) / 7);
    const verdict = runTarget({ goal, targetSec: input.targetSec, current: eff ? { km: eff.km, sec: eff.sec, date: eff.date, label: eff.label } : null, weeks });
    // La o țintă nerealistă planul nu se face pe ea, ci pe timpul realist de acum (vezi planTarget); aici doar îl arătăm.
    const realistic = verdict.equivalentNowSec && verdict.feasiblePct != null ? Math.round(verdict.equivalentNowSec * (1 - verdict.feasiblePct / 100)) : null;
    const planSec = verdict.verdict === 'realist' ? input.targetSec : verdict.verdict === 'ambitios' ? Math.max(input.targetSec, realistic ?? input.targetSec) : verdict.verdict === 'nerealist' ? realistic : null;
    target = { targetSec: input.targetSec, planSec, adjusted: verdict.verdict === 'nerealist', best: eff, predictedSec: pred?.sec ?? null, predictedLow: pred?.low ?? null, predictedHigh: pred?.high ?? null, verdict };
  }

  // ——— Ședințele-reper ———
  const benchmarks: Benchmark[] = [];
  const firstDate = (xs: SourceActivity[]) => xs.sort((a, b) => (a.date < b.date ? 1 : -1))[0]?.date ?? null;
  if (tri && d.swim) {
    const cont = swims.filter((a) => (a.details?.continuousM ?? 0) >= d.swim! * 1000);
    const sess = swims.filter((a) => (a.distanceKm ?? 0) >= d.swim!);
    const bestM = Math.max(0, ...swims.map((a) => a.details?.continuousM ?? 0));
    benchmarks.push({ id: 'inot-continuu', title: `${Math.round(d.swim * 1000).toLocaleString('ro-RO')} m înot fără oprire`, how: 'Distanța cursei, continuu (din turele ceasului)', done: cont.length > 0, best: bestM ? `${bestM.toLocaleString('ro-RO')} m fără oprire` : sess.length ? `${Math.round((sess[0]!.distanceKm ?? 0) * 1000).toLocaleString('ro-RO')} m cu pauze` : null, date: firstDate(cont) });
    const cut = CUTOFFS[goal]?.swim;
    if (cut) {
      const need = (cut * 60) / (d.swim * 10);
      benchmarks.push({ id: 'inot-ritm', title: 'Ritm sub limita de înot', how: `Cel puțin 400 m fără oprire în ${Math.floor(need / 60)}:${String(Math.round(need % 60)).padStart(2, '0')}/100 m sau mai repede`, done: contPace.some((p) => p <= need), best: contPace.length ? `${Math.floor(Math.min(...contPace) / 60)}:${String(Math.round(Math.min(...contPace) % 60)).padStart(2, '0')}/100 m` : null, date: null });
    }
  }
  if (tri && d.longRide) {
    const ok = of('bicicleta').filter((a) => (a.distanceKm ?? 0) >= d.longRide!);
    benchmarks.push({ id: 'tura-lunga', title: `Tură de ${d.longRide} km`, how: 'Distanța cursei (sau mai mult) într-o tură', done: ok.length > 0, best: longest('bicicleta')?.distanceKm ? `${Math.round(longest('bicicleta')!.distanceKm!)} km` : null, date: firstDate(ok) });
  }
  if (tri && d.brickRide && d.brickRun) {
    const ok = of('alergare').filter((r) => isBrickRun(r, recent) && r.minutes >= d.brickRun! && recent.some((b) => b.sport === 'bicicleta' && b.date === r.date && b.minutes >= d.brickRide!));
    benchmarks.push({ id: 'brick-lung', title: `Brick: ${fmtH(d.brickRide)} bicicletă + ${d.brickRun} min alergare`, how: 'Alergarea pornește în cel mult 30 min după tură', done: ok.length > 0, best: brickRuns.length ? `alergare după bicicletă: ${Math.max(...brickRuns.map((a) => a.minutes))} min` : null, date: firstDate(ok) });
  }
  if (d.longRun) {
    const ok = of('alergare').filter((a) => (a.distanceKm ?? 0) >= d.longRun!);
    benchmarks.push({ id: 'alergare-lunga', title: `Alergare lungă de ${d.longRun} km`, how: tri ? 'Reperul obișnuit înainte de un 70.3 (nu e nevoie de toată distanța)' : goal === '5k' || goal === '10k' ? 'Mai lungă decât cursa: rezistența care ține ritmul până la final' : 'Ieșirea lungă de referință', done: ok.length > 0, best: longest('alergare')?.distanceKm ? `${(longest('alergare')!.distanceKm ?? 0).toLocaleString('ro-RO', { maximumFractionDigits: 1 })} km` : null, date: firstDate(ok) });
  }
  if (isRunGoal(goal) && input.targetSec) {
    // Ritmul de cursă ținut pe cel puțin 1 km (din cel mai rapid km al ceasului).
    const paceNeed = input.targetSec / RUN_DISTANCE_KM[goal];
    const ok = of('alergare').filter((a) => a.details?.fastestKmSec != null && a.details.fastestKmSec <= paceNeed);
    const bestKm = of('alergare').map((a) => a.details?.fastestKmSec).filter((x): x is number => x != null);
    benchmarks.push({ id: 'ritm-cursa', title: 'Ritmul de cursă pe cel puțin 1 km', how: `${Math.floor(paceNeed / 60)}:${String(Math.round(paceNeed % 60)).padStart(2, '0')}/km sau mai repede, într-un antrenament`, done: ok.length > 0, best: bestKm.length ? `cel mai rapid km: ${Math.floor(Math.min(...bestKm) / 60)}:${String(Math.round(Math.min(...bestKm) % 60)).padStart(2, '0')}/km` : null, date: firstDate(ok) });
  }
  if (isSwimGoal(goal) && d.swim) {
    const bestM = Math.max(0, ...of('inot').map((a) => a.details?.continuousM ?? 0));
    const ok = of('inot').filter((a) => (a.details?.continuousM ?? 0) >= d.swim! * 1000);
    benchmarks.push({ id: 'inot-continuu', title: `${Math.round(d.swim * 1000).toLocaleString('ro-RO')} m fără oprire`, how: 'Distanța obiectivului, continuu (din turele ceasului)', done: ok.length > 0, best: bestM ? `${bestM.toLocaleString('ro-RO')} m fără oprire` : null, date: firstDate(ok) });
    const half = of('inot').filter((a) => (a.details?.continuousM ?? 0) >= d.swim! * 500);
    benchmarks.push({ id: 'inot-jumatate', title: `${Math.round(d.swim * 500).toLocaleString('ro-RO')} m fără oprire`, how: 'Jumătatea distanței, pe drum spre toată', done: half.length > 0, best: null, date: firstDate(half) });
  }
  if (isBikeGoal(goal) && d.bike) {
    const ok = of('bicicleta').filter((a) => (a.distanceKm ?? 0) >= d.bike! * 0.75);
    benchmarks.push({ id: 'tura-75', title: `Tură de ${Math.round(d.bike * 0.75)} km`, how: 'Trei sferturi din distanță într-o tură; restul îl dă ziua cursei', done: ok.length > 0, best: longest('bicicleta')?.distanceKm ? `${Math.round(longest('bicicleta')!.distanceKm!)} km` : null, date: firstDate(ok) });
    const twoH = of('bicicleta').filter((a) => a.minutes >= 120);
    benchmarks.push({ id: 'tura-2h', title: 'Tură de peste 2 ore', how: 'Cu hrănire și hidratare exersate', done: twoH.length > 0, best: null, date: firstDate(twoH) });
  }
  // Ziua lungă: ore de mișcare în aceeași zi, în cel puțin două sporturi (triatlon).
  const days = new Map<string, { min: number; sports: Set<Sport> }>();
  for (const a of recent) {
    const x = days.get(a.date) ?? { min: 0, sports: new Set<Sport>() };
    x.min += a.minutes;
    x.sports.add(a.sport);
    days.set(a.date, x);
  }
  const bigDays = [...days.entries()].filter(([, v]) => !tri || v.sports.size >= 2).map(([date, v]) => ({ date, min: v.min }));
  const bestDay = bigDays.sort((a, b) => b.min - a.min)[0] ?? null;
  if (tri && d.bigDayH) {
    benchmarks.push({ id: 'zi-lunga', title: `Zi lungă: ${d.bigDayH} h în mai multe sporturi`, how: 'Mai multe probe în aceeași zi, cu hrănire', done: !!bestDay && bestDay.min >= d.bigDayH * 60, best: bestDay ? fmtH(bestDay.min) : null, date: bestDay && bestDay.min >= d.bigDayH * 60 ? bestDay.date : null });
  }
  const fueled = input.fueledDates.filter((x) => diffDays(x, today) >= 0 && diffDays(x, today) < WIN).length;
  benchmarks.push({ id: 'hranire', title: 'Hrănire exersată', how: '3 ședințe de peste 2 ore cu hrănirea făcută cum era planificată (formularul de seară)', done: fueled >= 3, best: `${fueled} din 3`, date: null });

  // ——— Verigile ———
  const links: Link[] = [];
  if (tri && d.swim) {
    // Fără oprire, din turele ceasului; fără ture, distanța ședinței (cu pauze) — spus ca atare.
    const contM = Math.max(0, ...swims.map((a) => a.details?.continuousM ?? 0));
    const sessM = Math.max(0, ...swims.map((a) => Math.round((a.distanceKm ?? 0) * 1000)));
    const bestM = contM || sessM;
    const cut = CUTOFFS[goal]?.swim;
    const swimMin = estimate?.swim ?? null;
    const paceOk = cut && swimMin ? Math.min(1, cut / swimMin) : 1;
    links.push({ name: 'Înot', pct: swims.length ? pct((bestM / (d.swim * 1000)) * paceOk) : null, measured: swims.length ? `${bestM.toLocaleString('ro-RO')} m ${contM ? 'fără oprire' : 'într-o ședință'}` : null, detail: `${bestM.toLocaleString('ro-RO')} m ${contM ? 'fără oprire (segment continuu din turele ceasului)' : 'distanță totală într-o ședință, cu pauze (fără ture de la ceas)'} · proba: ${Math.round(d.swim * 1000).toLocaleString('ro-RO')} m${cut && swimMin ? `; estimat ${fmtH(swimMin)} față de limita ${fmtH(cut)}` : ''}` });
  }
  if (tri && d.bike) {
    const km = longest('bicicleta')?.distanceKm ?? 0;
    const cut = CUTOFFS[goal];
    const sb = estimate?.swim != null && estimate.bike != null ? estimate.swim + estimate.bike + 5 : null;
    const timeOk = cut && sb ? Math.min(1, cut.swimBike / sb) : 1;
    const hasBike = of('bicicleta').some((a) => (a.distanceKm ?? 0) > 0);
    links.push({ name: 'Bicicletă', pct: hasBike ? pct((km / d.bike) * timeOk) : null, measured: hasBike ? `${Math.round(km)} km, cea mai lungă tură` : null, detail: `cea mai lungă tură: ${Math.round(km)} km · proba: ${d.bike} km${cut && sb ? `; înot + bicicletă estimat ${fmtH(sb)} față de ${fmtH(cut.swimBike)}` : ''}` });
  }
  if (d.longRun && d.run) {
    const km = longest('alergare')?.distanceKm ?? 0;
    const hasRun = of('alergare').some((a) => (a.distanceKm ?? 0) > 0);
    const over = d.longRun > d.run;
    links.push({ name: 'Alergare', pct: hasRun ? pct(km / d.longRun) : null, measured: hasRun ? `${km.toLocaleString('ro-RO', { maximumFractionDigits: 1 })} km, cea mai lungă ieșire` : null, detail: `cea mai lungă ieșire: ${km.toLocaleString('ro-RO', { maximumFractionDigits: 1 })} km · reperul de antrenament: ${d.longRun} km (proba are ${d.run.toLocaleString('ro-RO')} km; ${over ? 'în pregătire se aleargă mai mult decât cursa' : 'în pregătire nu se aleargă toată distanța'})` });
  }
  if (target) {
    // Obiectiv de timp: distanța nu ajunge; a doua verigă e ritmul — timpul estimat acum față de țintă (100% = ținta e deja la îndemână).
    const est = target.predictedSec;
    links.push({
      name: 'Ritm',
      pct: est ? pct(target.targetSec / est) : null,
      measured: est ? `estimat acum ${fmtTime(est)}` : null,
      detail: est ? `timp estimat acum ${fmtTime(est)} (din cel mai bun efort de pe ceas, Riegel) · ținta ${fmtTime(target.targetSec)}` : `fără un efort recent pe ceas nu putem estima timpul · ținta ${fmtTime(target.targetSec)}`,
    });
  }
  if (isSwimGoal(goal) && d.swim) {
    const contM = Math.max(0, ...swims.map((a) => a.details?.continuousM ?? 0));
    const sessM = Math.max(0, ...swims.map((a) => Math.round((a.distanceKm ?? 0) * 1000)));
    const bestM = contM || sessM;
    links.push({ name: 'Înot', pct: swims.length ? pct(bestM / (d.swim * 1000)) : null, measured: swims.length ? `${bestM.toLocaleString('ro-RO')} m ${contM ? 'fără oprire' : 'într-o ședință'}` : null, detail: `${bestM.toLocaleString('ro-RO')} m ${contM ? 'fără oprire (segment continuu din turele ceasului)' : 'distanță totală într-o ședință, cu pauze'} · obiectiv: ${Math.round(d.swim * 1000).toLocaleString('ro-RO')} m` });
  }
  if (isBikeGoal(goal) && d.bike) {
    const km = longest('bicicleta')?.distanceKm ?? 0;
    const hasBike = of('bicicleta').some((a) => (a.distanceKm ?? 0) > 0);
    links.push({ name: 'Bicicletă', pct: hasBike ? pct(km / d.bike) : null, measured: hasBike ? `${Math.round(km)} km, cea mai lungă tură` : null, detail: `cea mai lungă tură: ${Math.round(km)} km · obiectiv: ${d.bike} km` });
  }
  if (tri) {
    const need = estimate?.total ? estimate.total * 0.65 : (d.bigDayH ?? 4) * 60;
    links.push({ name: 'Cumul', pct: pct((bestDay?.min ?? 0) / need), measured: bestDay ? fmtH(bestDay.min) : 'nicio zi cu mai multe sporturi', detail: `cea mai lungă zi în mai multe sporturi: ${bestDay ? fmtH(bestDay.min) : 'niciuna'}, față de ~${fmtH(need)} (65% din cursă)` });
  }
  // Null rămâne null: o probă fără date nu devine 0 și nici nu e scoasă în tăcere din calcul.
  const missing = links.filter((l) => l.pct == null).map((l) => l.name);
  const legs = links.filter((l) => l.name !== 'Cumul');
  const coverage = { withData: legs.filter((l) => l.pct != null).length, total: legs.length, missing };
  const weakestLink = missing.length ? null : links.reduce((a, b) => ((b.pct ?? 0) < (a.pct ?? 0) ? b : a), links[0]!);
  return { onTrack, ready: weakestLink?.pct ?? null, weakest: weakestLink?.name ?? null, coverage, links, benchmarks, estimate, target };
}
