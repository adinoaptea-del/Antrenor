// Bara de pregătire: cât din cerințele cursei ai demonstrat în antrenament, pe date din ultimele 6 săptămâni.
// Nu prezice timpul de cursă. O componentă fără date arată „fără date”, nu 0 și nu o estimare.
// Registrul indicatorilor (src/bar/metrics.ts): „bara_interna” — scrisă în bar_daily pentru istoric, neafișată ca
// pregătire; pe ecrane și la AI indicele e „pregatire_cursa” (race-ready.ts) și „pregatire_proba” (sport-readiness.ts).

import type { Activity, Color } from '../types.js';
import { diffDays } from '../util/dates.js';
import { goalKind, type Goal } from '../calendar/phases.js';

export interface ScoredActivity extends Activity {
  color: Color;
}

export interface BarInput {
  today: string;
  /** Activitățile ultimelor săptămâni, cu culoarea antrenamentului de care s-au legat (albastru = neplanificat). */
  activities: ScoredActivity[];
  /** Culorile antrenamentelor propuse din ultimele 4 săptămâni (fără cele viitoare). */
  plannedColorsLast4Weeks: Color[];
  /** CSS, secunde pe 100 m; null dacă nu există test. */
  cssSecPer100m?: number | null;
  ctl?: number | null;
  ctlTarget?: number | null;
  /** Semnale deschise care blochează bara (durere ≥5 netratată, febră, aviz lipsă când faza cere intensitate). */
  openFlags: string[];
  goal: Goal;
}

export interface Evidence {
  activityId: string;
  date: string;
  label: string;
}

export interface BarComponent {
  name: 'inot' | 'bicicleta' | 'alergare' | 'consistenta' | 'forma';
  weight: number;
  /** 0–100 sau null = fără date */
  value: number | null;
  detail: string;
  evidence: Evidence[];
}

export interface BarResult {
  blocked: string | null;
  /** 0–100 sau null când nicio componentă n-are date. */
  total: number | null;
  basis: string;
  components: BarComponent[];
}

const WINDOW_DAYS = 42;
const CSS_TARGET_SEC = 150; // 2:30 / 100 m

const TARGETS: Record<Goal, { swimM: number; rideKm: number; runKm: number; brickRunKm: number }> = {
  '70.3': { swimM: 1900, rideKm: 90, runKm: 18, brickRunKm: 8 },
  olimpic: { swimM: 1500, rideKm: 40, runKm: 10, brickRunKm: 4 },
  sprint: { swimM: 750, rideKm: 20, runKm: 5, brickRunKm: 2 },
  // Ieșirea lungă de referință înainte de cursă (nu distanța întreagă): 18 km la semimaraton, 32 km la maraton.
  semimaraton: { swimM: 0, rideKm: 0, runKm: 18, brickRunKm: 0 },
  maraton: { swimM: 0, rideKm: 0, runKm: 32, brickRunKm: 0 },
  '5k': { swimM: 0, rideKm: 0, runKm: 8, brickRunKm: 0 },
  '10k': { swimM: 0, rideKm: 0, runKm: 12, brickRunKm: 0 },
  // Un singur sport: distanța obiectivului.
  'inot-1500': { swimM: 1500, rideKm: 0, runKm: 0, brickRunKm: 0 },
  'inot-1900': { swimM: 1900, rideKm: 0, runKm: 0, brickRunKm: 0 },
  'inot-3800': { swimM: 3800, rideKm: 0, runKm: 0, brickRunKm: 0 },
  'bike-50': { swimM: 0, rideKm: 50, runKm: 0, brickRunKm: 0 },
  'bike-100': { swimM: 0, rideKm: 100, runKm: 0, brickRunKm: 0 },
  'bike-160': { swimM: 0, rideKm: 160, runKm: 0, brickRunKm: 0 },
  // Fitness: fără cursă; bara rămâne consecvența și forma.
  'fit-slabire': { swimM: 0, rideKm: 0, runKm: 0, brickRunKm: 0 },
  'fit-tonifiere': { swimM: 0, rideKm: 0, runKm: 0, brickRunKm: 0 },
  'fit-intretinere': { swimM: 0, rideKm: 0, runKm: 0, brickRunKm: 0 },
  'fit-masa': { swimM: 0, rideKm: 0, runKm: 0, brickRunKm: 0 },
  mers: { swimM: 0, rideKm: 0, runKm: 0, brickRunKm: 0 },
};

export function computeBar(input: BarInput): BarResult {
  const t = TARGETS[input.goal];
  const recent = input.activities.filter(
    (a) => diffDays(a.date, input.today) >= 0 && diffDays(a.date, input.today) <= WINDOW_DAYS && (a.color === 'verde' || a.color === 'galben'),
  );

  const components: BarComponent[] = [];
  const kind = goalKind(input.goal);
  const run = kind !== 'tri' && kind != null;

  if (kind === 'run') {
    const runs = recent.filter((a) => a.sport === 'alergare' && a.distanceKm != null && a.distanceKm > 0);
    const best = maxBy(runs, (a) => a.distanceKm!);
    components.push(
      best
        ? { name: 'alergare', weight: 0.5, value: r(100 * Math.min(1, best.distanceKm! / t.runKm)), detail: `cea mai lungă alergare: ${r(best.distanceKm!)} km din ${t.runKm}`, evidence: [{ activityId: best.id, date: best.date, label: `${r(best.distanceKm!)} km` }] }
        : { name: 'alergare', weight: 0.5, value: null, detail: 'fără alergare cu distanță în ultimele 6 săptămâni', evidence: [] },
    );
  } else if (kind === 'swim') {
    const swims = recent.filter((a) => a.sport === 'inot' && a.distanceKm != null && a.distanceKm > 0);
    const best = maxBy(swims, (a) => a.distanceKm!);
    components.push(
      best
        ? { name: 'inot', weight: 0.5, value: r(100 * Math.min(1, (best.distanceKm! * 1000) / t.swimM)), detail: `cel mai lung înot: ${Math.round(best.distanceKm! * 1000)} m din ${t.swimM} m`, evidence: [{ activityId: best.id, date: best.date, label: `${Math.round(best.distanceKm! * 1000)} m` }] }
        : { name: 'inot', weight: 0.5, value: null, detail: 'fără înot cu distanță în ultimele 6 săptămâni', evidence: [] },
    );
  } else if (kind === 'bike') {
    const rides = recent.filter((a) => a.sport === 'bicicleta' && a.distanceKm != null && a.distanceKm > 0);
    const best = maxBy(rides, (a) => a.distanceKm!);
    components.push(
      best
        ? { name: 'bicicleta', weight: 0.5, value: r(100 * Math.min(1, best.distanceKm! / t.rideKm)), detail: `cea mai lungă tură: ${r(best.distanceKm!)} km din ${t.rideKm}`, evidence: [{ activityId: best.id, date: best.date, label: `${r(best.distanceKm!)} km` }] }
        : { name: 'bicicleta', weight: 0.5, value: null, detail: 'fără tură cu distanță în ultimele 6 săptămâni', evidence: [] },
    );
  }

  if (!run) {
  // Înot: distanța continuă (70%) + ritm din CSS (30%), sau doar distanța dacă nu există CSS.
  {
    const swims = recent.filter((a) => a.sport === 'inot' && a.distanceKm != null && a.distanceKm > 0);
    const best = maxBy(swims, (a) => a.distanceKm!);
    if (!best) {
      components.push({ name: 'inot', weight: 0.2, value: null, detail: 'fără înot cu distanță în ultimele 6 săptămâni', evidence: [] });
    } else {
      const dist = Math.min(1, (best.distanceKm! * 1000) / t.swimM);
      let value: number;
      let detail = `cel mai lung înot: ${Math.round(best.distanceKm! * 1000)} m din ${t.swimM} m`;
      if (input.cssSecPer100m && input.cssSecPer100m > 0) {
        const pace = Math.min(1, CSS_TARGET_SEC / input.cssSecPer100m);
        value = 100 * (0.7 * dist + 0.3 * pace);
        detail += `; CSS ${fmtPace(input.cssSecPer100m)} față de ${fmtPace(CSS_TARGET_SEC)}`;
      } else {
        value = 100 * dist;
        detail += '; fără CSS (doar distanța)';
      }
      components.push({ name: 'inot', weight: 0.2, value: r(value), detail, evidence: [{ activityId: best.id, date: best.date, label: `${Math.round(best.distanceKm! * 1000)} m` }] });
    }
  }

  // Bicicletă: cea mai lungă tură (60%) + un brick reușit după tură (40%).
  {
    const rides = recent.filter((a) => a.sport === 'bicicleta' && a.distanceKm != null && a.distanceKm > 0);
    const best = maxBy(rides, (a) => a.distanceKm!);
    const brick = recent.find((a) => a.sport === 'alergare' && a.afterBikeMinutes != null && a.afterBikeMinutes <= 30 && a.minutes >= 20);
    if (!best) {
      components.push({ name: 'bicicleta', weight: 0.25, value: null, detail: 'fără tură cu distanță în ultimele 6 săptămâni', evidence: [] });
    } else {
      const dist = Math.min(1, best.distanceKm! / t.rideKm);
      const value = 100 * (0.6 * dist + 0.4 * (brick ? 1 : 0));
      const evidence: Evidence[] = [{ activityId: best.id, date: best.date, label: `${r(best.distanceKm!)} km` }];
      if (brick) evidence.push({ activityId: brick.id, date: brick.date, label: `brick ${brick.minutes} min, ${brick.color}` });
      components.push({
        name: 'bicicleta',
        weight: 0.25,
        value: r(value),
        detail: `cea mai lungă tură: ${r(best.distanceKm!)} km din ${t.rideKm}; brick după tură: ${brick ? 'da' : 'nu'}`,
        evidence,
      });
    }
  }

  // Alergare: cea mai lungă alergare continuă (60%) + cea mai lungă după bicicletă (40%).
  {
    const runs = recent.filter((a) => a.sport === 'alergare' && a.distanceKm != null && a.distanceKm > 0);
    const best = maxBy(runs, (a) => a.distanceKm!);
    const bestBrick = maxBy(runs.filter((a) => a.afterBikeMinutes != null && a.afterBikeMinutes <= 30), (a) => a.distanceKm!);
    if (!best) {
      components.push({ name: 'alergare', weight: 0.25, value: null, detail: 'fără alergare cu distanță în ultimele 6 săptămâni', evidence: [] });
    } else {
      const dist = Math.min(1, best.distanceKm! / t.runKm);
      const brickDist = bestBrick ? Math.min(1, bestBrick.distanceKm! / t.brickRunKm) : 0;
      const value = 100 * (0.6 * dist + 0.4 * brickDist);
      const evidence: Evidence[] = [{ activityId: best.id, date: best.date, label: `${r(best.distanceKm!)} km` }];
      if (bestBrick) evidence.push({ activityId: bestBrick.id, date: bestBrick.date, label: `${r(bestBrick.distanceKm!)} km după bicicletă` });
      components.push({
        name: 'alergare',
        weight: 0.25,
        value: r(value),
        detail: `cea mai lungă alergare: ${r(best.distanceKm!)} km din ${t.runKm}; după bicicletă: ${bestBrick ? `${r(bestBrick.distanceKm!)} km din ${t.brickRunKm}` : 'niciuna'}`,
        evidence,
      });
    }
  }

  }

  // Consistență: (verde + galben) / (planificate − gri) în ultimele 4 săptămâni.
  {
    const counted = input.plannedColorsLast4Weeks.filter((c) => c !== 'gri' && c !== 'asteptare' && c !== 'albastru');
    if (counted.length === 0) {
      components.push({ name: 'consistenta', weight: run ? 0.25 : 0.15, value: null, detail: 'fără antrenamente scorate în ultimele 4 săptămâni', evidence: [] });
    } else {
      const good = counted.filter((c) => c === 'verde' || c === 'galben').length;
      components.push({
        name: 'consistenta',
        weight: run ? 0.25 : 0.15,
        value: r((100 * good) / counted.length),
        detail: `${good} din ${counted.length} antrenamente planificate executate (verde sau galben)`,
        evidence: [],
      });
    }
  }

  // Formă: CTL actual față de CTL-țintă al fazei.
  {
    if (input.ctl == null || input.ctlTarget == null || input.ctlTarget <= 0) {
      components.push({ name: 'forma', weight: run ? 0.25 : 0.15, value: null, detail: 'fără CTL sau fără țintă de fază', evidence: [] });
    } else {
      components.push({
        name: 'forma',
        weight: run ? 0.25 : 0.15,
        value: r(100 * Math.min(1, input.ctl / input.ctlTarget)),
        detail: `CTL ${r(input.ctl)} din ținta ${r(input.ctlTarget)}`,
        evidence: [],
      });
    }
  }

  const withData = components.filter((c) => c.value != null);
  const basis = `pe baza a ${withData.length} din ${components.length} componente`;
  if (input.openFlags.length > 0) {
    return { blocked: input.openFlags.join('; '), total: null, basis, components };
  }
  // Fără renormalizare pe componentele cu date (auditul v93, A74): ponderile împărțite doar pe ce există ar ridica
  // artificial totalul. Cât lipsește o componentă, totalul e necunoscut (null) și `basis` spune pe câte se bazează.
  if (withData.length < components.length) return { blocked: null, total: null, basis, components };
  const wsum = withData.reduce((s, c) => s + c.weight, 0);
  const total = withData.reduce((s, c) => s + (c.value! * c.weight) / wsum, 0);
  return { blocked: null, total: r(total), basis, components };
}

function maxBy<T>(list: T[], f: (x: T) => number): T | null {
  let best: T | null = null;
  let bv = -Infinity;
  for (const x of list) {
    const v = f(x);
    if (v > bv) {
      bv = v;
      best = x;
    }
  }
  return best;
}

function fmtPace(sec: number): string {
  const t = Math.round(sec);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}/100 m`;
}

function r(n: number): number {
  return Math.round(n * 10) / 10;
}
