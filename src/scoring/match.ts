// Potrivirea activităților sincronizate cu antrenamentele propuse.
// Regula (corecția proprietarului, 20.10.2026): același sport, ACEEAȘI zi, cea mai apropiată durată. O activitate de azi
// nu se mai leagă de ședința ratată ieri: ieri rămâne nefăcută, iar activitatea apare azi (în afara planului, dacă azi
// nu era nimic propus de acel sport). O ședință mutată pe altă zi se mută explicit (status „mutat”), nu prin potrivire.
// Un brick planificat se potrivește cu o activitate de bicicletă + o alergare începută la ≤ 30 min după ea.

import type { Activity, PlannedWorkout } from '../types.js';
import { diffDays } from '../util/dates.js';
import { brickSplit as brickSplitShared } from '../calendar/coherence.js';

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


export function matchActivities(planned: PlannedWorkout[], activities: Activity[], today: string): MatchResult {
  const used = new Set<string>();
  const candidates = activities.filter((a) => diffDays(a.date, today) >= 0);
  const found = new Map<string, Match>();

  const ordered = [...planned]
    .filter((p) => p.status === 'planificat' || p.status === 'mutat')
    .sort((a, b) => diffDays(b.date, a.date));

  // O activitate acoperă o singură ședință, din ziua ei.
  for (const p of ordered) {
    if (found.get(p.id)?.activity) continue;
    const inWindow = (a: Activity) => a.date === p.date && !used.has(a.id);

    if (p.type === 'brick') {
      const split = brickSplit(p);
      const bike = pickClosest(candidates.filter((a) => a.sport === 'bicicleta' && inWindow(a)), split.bike);
      let run: Activity | null = null;
      if (bike) {
        run = pickClosest(candidates.filter((a) => a.sport === 'alergare' && a.date === bike.date && !used.has(a.id) && afterBike(a, bike) != null && afterBike(a, bike)! <= 30), split.run);
        used.add(bike.id);
        if (run) used.add(run.id);
      }
      found.set(p.id, { planned: p, activity: bike, extraActivity: run });
      continue;
    }

    const best = pickClosest(candidates.filter((a) => a.sport === p.sport && inWindow(a)), p.plannedMinutes);
    if (best) used.add(best.id);
    // Auditul v93, A18: aceeași ședință înregistrată în două fișiere (ceasul oprit și repornit, încălzirea separată):
    // o activitate din același sport și aceeași zi care începe la ≤ 15 min după sfârșitul celei potrivite (sau se termină
    // cu ≤ 15 min înainte de începutul ei) e a doua parte — minutele se adună o singură dată, nu devine „efort în plus”.
    // Doar când nu mai e altă ședință din același sport în ziua aceea care să o aștepte.
    let part: Activity | null = null;
    if (best && !ordered.some((o) => o !== p && o.date === p.date && o.sport === p.sport && !found.get(o.id)?.activity)) {
      part = candidates.find((a) => a.sport === p.sport && inWindow(a) && a.id !== best.id && gapBetween(best, a) != null && gapBetween(best, a)! <= 15) ?? null;
      if (part) used.add(part.id);
    }
    found.set(p.id, { planned: p, activity: best, extraActivity: part });
  }

  const matches = ordered.map((p) => found.get(p.id) ?? { planned: p, activity: null, extraActivity: null });
  const unplanned = candidates.filter((a) => !used.has(a.id));
  return { matches, unplanned };
}

/** Pauza (min) dintre două înregistrări ale aceleiași zile, în orice ordine; null fără ore de start. */
function gapBetween(a: Activity, b: Activity): number | null {
  const hm = (x: Activity) => {
    const s = (x as Activity & { startLocal?: string | null }).startLocal;
    const m = s ? /^(\d{1,2}):(\d{2})/.exec(s) : null;
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  };
  const as = hm(a);
  const bs = hm(b);
  if (as == null || bs == null) return null;
  const [first, second, fs, ss] = as <= bs ? [a, b, as, bs] : [b, a, bs, as];
  void second;
  const gap = ss - (fs + first.minutes);
  return gap >= -2 ? Math.max(0, gap) : null;
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

/**
 * Împărțirea bicicletă/alergare a brick-ului: ACEEAȘI definiție ca în calendar și în pași (coherence.ts brickSplit:
 * total = bicicletă + tranziție + alergare; regula 2). Fără text: 80% bicicletă din ce rămâne după tranziție.
 */
function brickSplit(p: PlannedWorkout): { bike: number; run: number } {
  const s = brickSplitShared(p.structure, p.plannedMinutes);
  return { bike: s.bike, run: s.run };
}

function pickClosest(list: Activity[], targetMinutes: number): Activity | null {
  if (list.length === 0) return null;
  return [...list].sort((a, b) => Math.abs(a.minutes - targetMinutes) - Math.abs(b.minutes - targetMinutes))[0] ?? null;
}
