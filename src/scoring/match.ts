// Potrivirea activităților sincronizate cu antrenamentele propuse.
// Regula din protocol: același sport, aceeași zi sau ziua următoare, cea mai apropiată durată.
// Un brick planificat se potrivește cu o activitate de bicicletă + o alergare începută la ≤ 30 min după ea.

import type { Activity, PlannedWorkout } from '../types.js';
import { diffDays } from '../util/dates.js';

export interface Match {
  planned: PlannedWorkout;
  activity: Activity | null;
  /** La brick: alergarea de după bicicletă. */
  extraActivity: Activity | null;
}

export interface MatchResult {
  matches: Match[];
  /** Activități fără antrenament propus: albastru, intră în încărcare, nu în scor. */
  unplanned: Activity[];
}

const WINDOW_DAYS = 1;

export function matchActivities(planned: PlannedWorkout[], activities: Activity[], today: string): MatchResult {
  const used = new Set<string>();
  const candidates = activities.filter((a) => diffDays(a.date, today) >= 0);
  const found = new Map<string, Match>();

  const ordered = [...planned]
    .filter((p) => p.status === 'planificat' || p.status === 'mutat')
    .sort((a, b) => diffDays(b.date, a.date));

  // Două treceri: întâi fiecare ședință cu activitățile din ziua ei, abia apoi ce a rămas cu ziua următoare.
  // Așa activitatea de azi nu e „furată” de ședința ratată ieri, iar o activitate acoperă o singură ședință.
  for (const lag of [0, WINDOW_DAYS]) {
    for (const p of ordered) {
      if (found.get(p.id)?.activity) continue;
      const inWindow = (a: Activity) => diffDays(p.date, a.date) === lag && !used.has(a.id);

      if (p.type === 'brick') {
        const split = brickSplit(p);
        const bike = pickClosest(candidates.filter((a) => a.sport === 'bicicleta' && inWindow(a)), split.bike);
        let run: Activity | null = null;
        if (bike) {
          run = pickClosest(candidates.filter((a) => a.sport === 'alergare' && a.date === bike.date && !used.has(a.id) && afterBike(a, bike) != null && afterBike(a, bike)! <= 30), split.run);
          used.add(bike.id);
          if (run) used.add(run.id);
        }
        if (bike || lag === WINDOW_DAYS) found.set(p.id, { planned: p, activity: bike, extraActivity: run });
        continue;
      }

      const best = pickClosest(candidates.filter((a) => a.sport === p.sport && inWindow(a)), p.plannedMinutes);
      if (best) used.add(best.id);
      if (best || lag === WINDOW_DAYS) found.set(p.id, { planned: p, activity: best, extraActivity: null });
    }
  }

  const matches = ordered.map((p) => found.get(p.id) ?? { planned: p, activity: null, extraActivity: null });
  const unplanned = candidates.filter((a) => !used.has(a.id));
  return { matches, unplanned };
}

/** Minutele dintre sfârșitul bicicletei și începutul alergării: din câmpul sursei sau din orele de start. */
function afterBike(run: Activity, bike: Activity): number | null {
  if (run.afterBikeMinutes != null) return run.afterBikeMinutes;
  const hm = (a: Activity) => {
    const s = (a as Activity & { startLocal?: string | null }).startLocal;
    const m = s ? /^(\d{1,2}):(\d{2})/.exec(s) : null;
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  };
  const rs = hm(run);
  const bs = hm(bike);
  if (rs == null || bs == null) return null;
  const gap = rs - (bs + bike.minutes);
  return gap >= -5 ? Math.max(0, gap) : null;
}

/** Împărțirea bicicletă/alergare din prescripția brick-ului („tură 90 min Z2 + alergare 20 min”), altfel 75/25. */
function brickSplit(p: PlannedWorkout): { bike: number; run: number } {
  const m = /tură (\d+) min.*alergare (\d+) min/.exec(p.structure ?? '');
  if (m) return { bike: Number(m[1]), run: Number(m[2]) };
  return { bike: p.plannedMinutes * 0.75, run: p.plannedMinutes * 0.25 };
}

function pickClosest(list: Activity[], targetMinutes: number): Activity | null {
  if (list.length === 0) return null;
  return [...list].sort((a, b) => Math.abs(a.minutes - targetMinutes) - Math.abs(b.minutes - targetMinutes))[0] ?? null;
}
