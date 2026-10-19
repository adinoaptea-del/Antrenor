// Ce vede sportivul la mers: săptămâna curentă (bula), istoricul săptămânilor, jurnalul țintei și recomandarea de azi.
// Totul calculat aici, din rândurile salvate; serverul doar le citește, AI-ul doar le explică.

import type { PlannedWorkout } from '../types.js';
import { addDays, weekStart } from '../util/dates.js';
import { dedupeWalks, targetForWeek, walkWeek, type TargetChange, type WalkWeek } from './minutes.js';
import { restrictionOf, walkToday, type WalkProfile, type WalkToday } from './plan.js';
import { demonstratedMin, toWalkRecords, type WalkRow } from './rows.js';

export interface WalkingView {
  week: WalkWeek;
  /** Săptămânile trecute (cea mai recentă prima): intervalul, ținta de atunci, realizatul. */
  history: { weekStart: string; targetMin: number; doneSec: number; briskSec: number; met: boolean }[];
  changes: TargetChange[];
  /** Ținta săptămânii viitoare (dacă s-a programat o schimbare). */
  nextTargetMin: number;
  profile: Pick<WalkProfile, 'initial' | 'capacityMin' | 'brisk'>;
  today: WalkToday;
  /** Cea mai lungă plimbare din 14 zile (minute). */
  demonstratedMin: number | null;
  /** Plimbările manuale și cele importate, cu câmpurile pentru corectare (inclusiv cele șterse, pentru istoric). */
  items: { id: string; source: string; date: string; startUtc: string | null; minutes: number; movingMin: number | null; brisk: boolean; excluded: boolean; manual: boolean; reconciledWith: string | null; /** Dublură: se numără o singură dată, ca plimbarea cu id-ul acesta. */ duplicateOf: string | null }[];
  /** false = baza de date e pe o schemă veche: mersul alert, ștergerea și ora nu se pot salva încă. */
  schemaReady: boolean;
}

export function walkingView(input: { rows: WalkRow[]; tz: string; today: string; profile: WalkProfile; plan: PlannedWorkout[]; dayLevel?: string | null; dayWhy?: string | null; schemaReady: boolean; weeks?: number }): WalkingView {
  const records = toWalkRecords(input.rows, input.tz);
  const week = walkWeek(records, input.today, input.tz, input.profile.changes, input.profile.initial);
  const history: WalkingView['history'] = [];
  for (let i = 1; i <= (input.weeks ?? 8); i++) {
    const ws = addDays(weekStart(input.today), -7 * i);
    const w = walkWeek(records, ws, input.tz, input.profile.changes, input.profile.initial);
    history.push({ weekStart: ws, targetMin: w.targetMin, doneSec: w.doneSec, briskSec: w.briskSec, met: w.met });
  }
  const dup = new Map(dedupeWalks(records).merged.map((m) => [m.dropped, m.kept]));
  const today = walkToday({ today: input.today, plan: input.plan, restriction: restrictionOf(input.dayLevel), remainingSec: week.remainingSec, restrictionWhy: input.dayWhy ?? null });
  return {
    week,
    history,
    changes: input.profile.changes,
    nextTargetMin: targetForWeek(addDays(weekStart(input.today), 7), input.profile.changes, input.profile.initial),
    profile: { initial: input.profile.initial, capacityMin: input.profile.capacityMin, brisk: input.profile.brisk },
    today,
    demonstratedMin: demonstratedMin(records, input.today),
    items: records
      .filter((r) => r.date >= addDays(weekStart(input.today), -56))
      .sort((a, b) => ((a.startUtc ?? a.date) < (b.startUtc ?? b.date) ? 1 : -1))
      .map((r) => ({ id: r.id, source: r.source, date: r.date, startUtc: r.startUtc, minutes: Math.round(r.elapsedSec / 60), movingMin: r.movingSec != null ? Math.round(r.movingSec / 60) : null, brisk: !!r.brisk, excluded: !!r.deleted, manual: r.source === 'manual' || r.source === 'aplicatie', reconciledWith: r.reconciledWith ?? null, duplicateOf: dup.get(r.id) ?? null })),
    schemaReady: input.schemaReady,
  };
}
