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
  const matches: Match[] = [];

  const ordered = [...planned]
    .filter((p) => p.status === 'planificat' || p.status === 'mutat')
    .sort((a, b) => diffDays(b.date, a.date));

  for (const p of ordered) {
    const inWindow = (a: Activity) => {
      const d = diffDays(p.date, a.date);
      return d >= 0 && d <= WINDOW_DAYS && !used.has(a.id);
    };

    if (p.type === 'brick') {
      const bike = pickClosest(candidates.filter((a) => a.sport === 'bicicleta' && inWindow(a)), p.plannedMinutes * 0.75);
      let run: Activity | null = null;
      if (bike) {
        run = pickClosest(
          candidates.filter(
            (a) =>
              a.sport === 'alergare' &&
              a.date === bike.date &&
              !used.has(a.id) &&
              a.afterBikeMinutes != null &&
              a.afterBikeMinutes <= 30,
          ),
          p.plannedMinutes * 0.25,
        );
        used.add(bike.id);
        if (run) used.add(run.id);
      }
      matches.push({ planned: p, activity: bike, extraActivity: run });
      continue;
    }

    const best = pickClosest(candidates.filter((a) => a.sport === p.sport && inWindow(a)), p.plannedMinutes);
    if (best) used.add(best.id);
    matches.push({ planned: p, activity: best, extraActivity: null });
  }

  const unplanned = candidates.filter((a) => !used.has(a.id));
  return { matches, unplanned };
}

function pickClosest(list: Activity[], targetMinutes: number): Activity | null {
  if (list.length === 0) return null;
  return [...list].sort((a, b) => Math.abs(a.minutes - targetMinutes) - Math.abs(b.minutes - targetMinutes))[0] ?? null;
}
