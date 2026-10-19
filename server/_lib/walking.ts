// Mersul pe jos pe server: citește plimbările (other_activities), le adaugă ca activități de mers pentru sportivii cu
// obiectivul „mers” și construiește pagina. Calculul e în src/walking (testat).

import { select } from './db.js';
import { isWalkGoal } from '../../src/calendar/phases.js';
import type { SourceActivity } from '../../src/collector/types.js';
import { WALK_NAMES, toWalkRecords, walkActivities, type WalkRow } from '../../src/walking/rows.js';

const NEW_COLS = 'id,source,date,start_local,name,minutes,start_utc,elapsed_sec,moving_sec,brisk,excluded,reconciled_with,synced_at';
const OLD_COLS = 'id,source,date,start_local,name,minutes,synced_at';

/** Plimbările de la `from` încolo; `schemaReady` = false pe o schemă fără coloanele de mers (schema < 9). */
export async function loadWalkRows(userId: string, from: string): Promise<{ rows: WalkRow[]; schemaReady: boolean }> {
  const filters = { user_id: `eq.${userId}`, date: `gte.${from}`, name: `in.(${WALK_NAMES.join(',')})` };
  try {
    const rows = await select<WalkRow>('other_activities', filters, { select: NEW_COLS, order: 'date.desc', limit: 1000 });
    return { rows, schemaReady: true };
  } catch {
    const rows = await select<WalkRow>('other_activities', filters, { select: OLD_COLS, order: 'date.desc', limit: 1000 }).catch(() => [] as WalkRow[]);
    return { rows, schemaReady: false };
  }
}

/**
 * Pentru obiectivul „mers”: activitățile + plimbările (fără dubluri, ca sport „mers”), ca ședințele de mers din calendar
 * să se lege de plimbările făcute. La celelalte obiective plimbările rămân „mișcare în plus” (nu intră în plan).
 */
export async function withWalks(userId: string, goal: string | null | undefined, tz: string, acts: SourceActivity[], from: string): Promise<SourceActivity[]> {
  if (!isWalkGoal(goal)) return acts;
  const { rows } = await loadWalkRows(userId, from);
  return [...acts.filter((a) => a.sport !== 'mers'), ...walkActivities(toWalkRecords(rows, tz || 'Europe/Bucharest'), tz || 'Europe/Bucharest')];
}
