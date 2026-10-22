// Starea pe sportiv a lucrărilor programate (auditul consolidat, E1): tabela athlete_jobs (migrarea 0005).
// Pe o schemă veche (fără tabelă) totul merge ca înainte, doar fără stare: încărcarea întoarce o hartă goală.
import { select, upsert } from './db.js';
import { backoffMs, type JobState } from '../../src/util/fanout.js';

export interface JobRow extends JobState {
  user_id: string;
  job: string;
  last_error?: string | null;
  failures: number;
}

/** Starea tuturor sportivilor pentru o lucrare; `ready` = false pe o schemă fără tabelă (fără stare, fără recuperări). */
export async function loadJobs(job: string): Promise<Map<string, JobRow> & { ready: boolean }> {
  try {
    const rows = await select<JobRow>('athlete_jobs', { job: `eq.${job}` }, { limit: 1000 });
    return Object.assign(new Map(rows.map((r) => [r.user_id, r] as const)), { ready: true });
  } catch {
    return Object.assign(new Map<string, JobRow>(), { ready: false });
  }
}

export async function jobStarted(userId: string, job: string): Promise<void> {
  await upsert('athlete_jobs', { user_id: userId, job, last_started_at: new Date().toISOString() }, 'user_id,job').catch(() => undefined);
}

/** Rezultatul: reușita șterge eșecurile; eșecul crește așteptarea (15 min, 30, 60 … max 6 h). */
export async function jobFinished(userId: string, job: string, prev: JobRow | undefined, error: string | null): Promise<void> {
  const now = Date.now();
  const failures = error ? (prev?.failures ?? 0) + 1 : 0;
  const row = error
    ? { user_id: userId, job, last_error: error.slice(0, 300), failures, next_try_at: new Date(now + backoffMs(failures)).toISOString() }
    : { user_id: userId, job, last_ok_at: new Date(now).toISOString(), last_error: null, failures: 0, next_try_at: null };
  await upsert('athlete_jobs', row, 'user_id,job').catch(() => undefined);
}

export async function jobRow(userId: string, job: string): Promise<JobRow | null> {
  try {
    return (await select<JobRow>('athlete_jobs', { user_id: `eq.${userId}`, job: `eq.${job}` }, { limit: 1 }))[0] ?? null;
  } catch {
    return null;
  }
}

/** Protecție la abuz (C1): o procesare imediată pe sportiv cel mult o dată la `minMs`; restul, la cron. */
export function recentlyStarted(row: JobRow | null, nowMs: number, minMs: number): boolean {
  return !!row?.last_started_at && nowMs - Date.parse(row.last_started_at) < minMs;
}
