// Execuția programată pe mai mulți sportivi (auditul consolidat 22.10.2026, E1): concurență limitată, buget de timp,
// stare pe sportiv și reîncercare cu așteptare crescătoare. Funcții pure (timpul și lucrul vin din afară), testabile.

export interface FanOutResult<T> {
  /** Porniți și terminați (reușit sau nu: fn își notează singură rezultatul). */
  done: T[];
  /** Nepornite: bugetul de timp s-a terminat. Rămân pentru rularea următoare și apar în răspuns. */
  notStarted: T[];
}

/**
 * Rulează `fn` pe elemente, cel mult `limit` deodată. Un element nou pornește doar cât timp `now() - start < budgetMs`
 * (cele pornite se termină). O eroare în `fn` nu oprește restul.
 */
export async function fanOut<T>(items: T[], opts: { limit: number; budgetMs: number; now?: () => number }, fn: (item: T) => Promise<void>): Promise<FanOutResult<T>> {
  const now = opts.now ?? Date.now;
  const start = now();
  const done: T[] = [];
  const notStarted: T[] = [];
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      if (now() - start >= opts.budgetMs) break;
      const item = items[next++]!;
      try {
        await fn(item);
      } catch {
        /* fn își notează eroarea; aici doar nu oprim restul */
      }
      done.push(item);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(opts.limit, items.length)) }, worker));
  for (let i = next; i < items.length; i++) notStarted.push(items[i]!);
  return { done, notStarted };
}

/** Așteptarea după `failures` eșecuri la rând: 15 min, 30, 60, … cel mult 6 ore. */
export function backoffMs(failures: number): number {
  if (failures <= 0) return 0;
  return Math.min(6 * 3_600_000, 15 * 60_000 * 2 ** (failures - 1));
}

export interface JobState {
  last_started_at?: string | null;
  last_ok_at?: string | null;
  failures?: number | null;
  next_try_at?: string | null;
}

/** Se poate porni acum? (nu e în așteptare după eșecuri). */
export function jobDue(s: JobState | null | undefined, nowMs: number): boolean {
  if (!s?.next_try_at) return true;
  return Date.parse(s.next_try_at) <= nowMs;
}

/** Ordinea: cei mai vechi la ultima reușită întâi (cei fără reușită deloc, primii). */
export function stalestFirst<T>(items: T[], stateOf: (t: T) => JobState | null | undefined): T[] {
  const key = (t: T) => {
    const ok = stateOf(t)?.last_ok_at;
    return ok ? Date.parse(ok) : -Infinity;
  };
  return [...items].sort((a, b) => key(a) - key(b));
}
