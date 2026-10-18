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
import type { Goal } from '../calendar/phases.js';
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
  pct: number;
  detail: string;
}

export interface RaceReady {
  /** Pe drum (0–100) sau null fără plan în ultimele 4 săptămâni. */
  onTrack: { pct: number; volumePct: number; keyDone: number; keyPlanned: number } | null;
  /** Gata de cursă = cea mai slabă verigă. */
  ready: number;
  weakest: string;
  links: Link[];
  benchmarks: Benchmark[];
  /** Timpul estimat (min) cu marjă și limitele; null când lipsesc ritmurile. */
  estimate: { swim: number | null; bike: number | null; run: number | null; total: number | null; low: number | null; high: number | null; cutoffs: { swim: number; swimBike: number; total: number } | null; assumptions: string[] } | null;
}

const WIN = 56;
const TRI: Goal[] = ['70.3', 'olimpic', 'sprint'];
const DIST: Record<Goal, { swim?: number; bike?: number; run: number; longRun: number; longRide?: number; brickRide?: number; brickRun?: number; bigDayH?: number }> = {
  '70.3': { swim: 1.9, bike: 90, run: 21.1, longRun: 18, longRide: 90, brickRide: 120, brickRun: 45, bigDayH: 4 },
  olimpic: { swim: 1.5, bike: 40, run: 10, longRun: 12, longRide: 50, brickRide: 75, brickRun: 30, bigDayH: 2.5 },
  sprint: { swim: 0.75, bike: 20, run: 5, longRun: 8, longRide: 30, brickRide: 45, brickRun: 20, bigDayH: 1.5 },
  semimaraton: { run: 21.1, longRun: 18 },
  maraton: { run: 42.2, longRun: 32 },
};
const CUTOFFS: Partial<Record<Goal, { swim: number; swimBike: number; total: number }>> = { '70.3': { swim: 70, swimBike: 330, total: 510 } };

const fmtH = (min: number) => `${Math.floor(min / 60)} h ${String(Math.round(min % 60)).padStart(2, '0')}`;
const pct = (x: number) => Math.round(Math.max(0, Math.min(1, x)) * 100);

export function raceReady(input: {
  goal: Goal;
  today: string;
  acts: SourceActivity[];
  plan: PlannedWorkout[];
  /** Ședințele lungi cu hrănire „conform” (formularul de seară): datele lor. */
  fueledDates: string[];
}): RaceReady {
  const { goal, today } = input;
  const d = DIST[goal];
  const tri = TRI.includes(goal);
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
  const contPace = swims.filter((a) => a.details?.continuousPace100mSec != null && (a.details?.continuousM ?? 0) >= 400).map((a) => a.details!.continuousPace100mSec!);
  const sessPace = swims.filter((a) => (a.distanceKm ?? 0) >= 0.4).map((a) => (a.minutes * 60) / ((a.distanceKm ?? 1) * 10));
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
    const run = runPace != null ? runPace * d.run : null;
    const total = swim != null && bike != null && run != null ? swim + bike + run + 10 : null;
    estimate = { swim, bike, run, total, low: total ? total * 0.9 : null, high: total ? total * 1.1 : null, cutoffs: CUTOFFS[goal] ?? null, assumptions: [...assumptions, 'tranziții: 10 min'] };
  } else if (runPace != null) {
    const run = runPace * d.run;
    estimate = { swim: null, bike: null, run, total: run, low: run * 0.95, high: run * 1.1, cutoffs: null, assumptions };
  }

  // ——— Ședințele-reper ———
  const benchmarks: Benchmark[] = [];
  const firstDate = (xs: SourceActivity[]) => xs.sort((a, b) => (a.date < b.date ? 1 : -1))[0]?.date ?? null;
  if (tri && d.swim) {
    const cont = swims.filter((a) => (a.details?.continuousM ?? 0) >= d.swim! * 1000);
    const sess = swims.filter((a) => (a.distanceKm ?? 0) >= d.swim!);
    const bestM = Math.max(0, ...swims.map((a) => a.details?.continuousM ?? 0));
    benchmarks.push({ id: 'inot-continuu', title: `${Math.round(d.swim * 1000)} m înot fără oprire`, how: 'Distanța cursei, continuu (din turele ceasului)', done: cont.length > 0, best: bestM ? `${bestM} m fără oprire` : sess.length ? `${Math.round((sess[0]!.distanceKm ?? 0) * 1000)} m cu pauze` : null, date: firstDate(cont) });
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
  {
    const ok = of('alergare').filter((a) => (a.distanceKm ?? 0) >= d.longRun);
    benchmarks.push({ id: 'alergare-lunga', title: `Alergare lungă de ${d.longRun} km`, how: tri ? 'Reperul obișnuit înainte de un 70.3 (nu e nevoie de toată distanța)' : 'Ieșirea lungă de referință', done: ok.length > 0, best: longest('alergare')?.distanceKm ? `${(longest('alergare')!.distanceKm ?? 0).toLocaleString('ro-RO', { maximumFractionDigits: 1 })} km` : null, date: firstDate(ok) });
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
    links.push({ name: 'Înot', pct: pct((bestM / (d.swim * 1000)) * paceOk), detail: `${bestM} m ${contM ? 'fără oprire' : 'într-o ședință, cu pauze'} din ${Math.round(d.swim * 1000)}${cut && swimMin ? `; estimat ${fmtH(swimMin)} față de limita ${fmtH(cut)}` : ''}` });
  }
  if (tri && d.bike) {
    const km = longest('bicicleta')?.distanceKm ?? 0;
    const cut = CUTOFFS[goal];
    const sb = estimate?.swim != null && estimate.bike != null ? estimate.swim + estimate.bike + 5 : null;
    const timeOk = cut && sb ? Math.min(1, cut.swimBike / sb) : 1;
    links.push({ name: 'Bicicletă', pct: pct((km / d.bike) * timeOk), detail: `${Math.round(km)} km din ${d.bike}${cut && sb ? `; înot + bicicletă estimat ${fmtH(sb)} față de ${fmtH(cut.swimBike)}` : ''}` });
  }
  {
    const km = longest('alergare')?.distanceKm ?? 0;
    links.push({ name: 'Alergare', pct: pct(km / d.longRun), detail: `${km.toLocaleString('ro-RO', { maximumFractionDigits: 1 })} km din reperul de ${d.longRun}` });
  }
  if (tri) {
    const need = estimate?.total ? estimate.total * 0.65 : (d.bigDayH ?? 4) * 60;
    links.push({ name: 'Cumul', pct: pct((bestDay?.min ?? 0) / need), detail: `cea mai lungă zi în mai multe sporturi: ${bestDay ? fmtH(bestDay.min) : 'niciuna'}, față de ~${fmtH(need)} (65% din cursă)` });
  }
  const weakestLink = links.reduce((a, b) => (b.pct < a.pct ? b : a), links[0]!);
  return { onTrack, ready: weakestLink.pct, weakest: weakestLink.name, links, benchmarks, estimate };
}
