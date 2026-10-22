// Coada evenimentelor Strava (auditul consolidat, C1 + E1). Webhook-ul doar validează și scrie aici, apoi confirmă
// primirea; procesarea (sincronizare, ștergere confirmată prin API, retragerea accesului) se face după răspuns și,
// pentru ce a rămas, la cronul de 15 minute. Reîncercările Strava ale aceluiași eveniment cad pe cheia unică.
import { insertIgnore, remove, select, update } from './db.js';
import { accessToken } from './tokens.js';
import { syncUser } from './sync.js';
import { reactNow } from './react.js';
import { deleteActivities } from './activity-delete.js';
import { backoffMs } from '../../src/util/fanout.js';
import { classifyDeleteCheck, deauthConfirmed, isDeauthorization, type StravaEvent } from '../../src/collector/providers/strava-webhook.js';

interface InboxRow {
  id: number;
  user_id: string;
  object_type: string;
  object_id: string;
  aspect: string;
  updates: Record<string, string> | null;
  attempts: number;
}

/** false = schema veche (fără coadă): webhook-ul procesează direct, ca înainte. */
export async function enqueueStrava(ev: StravaEvent, userId: string): Promise<boolean> {
  try {
    await insertIgnore('webhook_inbox', { provider: 'strava', owner_id: ev.owner_id, object_type: ev.object_type, object_id: ev.object_id, aspect: ev.aspect_type, event_time: ev.event_time, updates: ev.updates, user_id: userId }, 'provider,object_id,aspect,event_time');
    return true;
  } catch (e) {
    if (/webhook_inbox|PGRST20[45]|does not exist/i.test(e instanceof Error ? e.message : String(e))) return false;
    throw e;
  }
}

async function apiStatus(url: string, token: string): Promise<number | null> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 8000);
  try {
    const r = await fetch(url, { headers: { authorization: `Bearer ${token}` }, signal: ctl.signal });
    return r.status;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export type Outcome = { done: true; outcome: string } | { done: false; error: string };

/** Ce atinge baza sau tokenurile (înlocuibil în teste: probele rulează fără bază de date). */
export interface InboxDeps {
  tokenOf: (userId: string) => Promise<string | null>;
  deleter: (userId: string, ids: string[], today: string) => Promise<{ removed: number }>;
  forgetStrava: (userId: string) => Promise<void>;
}
const DEFAULT_DEPS: InboxDeps = {
  tokenOf: (userId) => accessToken(userId, 'strava'),
  deleter: deleteActivities,
  forgetStrava: (userId) => remove('oauth_tokens', { user_id: `eq.${userId}`, provider: 'eq.strava' }),
};

/** Ștergerea anunțată: se aplică doar dacă Strava confirmă (404). */
export async function processDelete(userId: string, objectId: string, today: string, deps: InboxDeps = DEFAULT_DEPS): Promise<Outcome> {
  let token: string | null;
  try {
    token = await deps.tokenOf(userId);
  } catch (e) {
    return { done: false, error: `token: ${e instanceof Error ? e.message : String(e)}` };
  }
  if (!token) return { done: true, outcome: 'neconectat: nimic de șters' };
  const check = classifyDeleteCheck(await apiStatus(`https://www.strava.com/api/v3/activities/${objectId}`, token));
  if (check === 'exista') return { done: true, outcome: 'ignorat: activitatea există încă pe Strava' };
  if (check === 'acces_refuzat') return { done: true, outcome: 'neaplicat: Strava a refuzat accesul (401/403), datele rămân' };
  if (check === 'reincearca') return { done: false, error: 'Strava nu a răspuns clar (429/5xx/rețea); se reîncearcă' };
  const r = await deps.deleter(userId, [`strava-${objectId}`, `strava-o-${objectId}`], today);
  return { done: true, outcome: `șters (confirmat 404): ${r.removed} rânduri, scor recalculat` };
}

/** Retragerea accesului din Strava: tokenul se șterge doar dacă API-ul îl refuză (401). */
export async function processDeauth(userId: string, deps: InboxDeps = DEFAULT_DEPS): Promise<Outcome> {
  let token: string | null = null;
  try {
    token = await deps.tokenOf(userId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!/\b(400|401)\b/.test(msg)) return { done: false, error: `token: ${msg}` };
  }
  const confirmed = token ? deauthConfirmed(await apiStatus('https://www.strava.com/api/v3/athlete', token)) : true;
  if (confirmed === null) return { done: false, error: 'Strava nu a răspuns clar; se reîncearcă' };
  if (!confirmed) return { done: true, outcome: 'ignorat: tokenul încă merge' };
  await deps.forgetStrava(userId);
  return { done: true, outcome: 'acces retras din Strava: conexiunea s-a închis' };
}

/**
 * Procesează evenimentele în așteptare (cel mult `max`). Creările și modificările unui sportiv se adună într-o singură
 * sincronizare (zece evenimente = o citire, nu zece). Eșecurile se reîncearcă cu așteptare crescătoare.
 */
export async function drainStravaInbox(todayOf: (userId: string) => Promise<string>, opts: { max?: number; userId?: string } = {}): Promise<{ processed: number; pending: number; errors: string[] }> {
  let rows: InboxRow[];
  try {
    rows = await select<InboxRow>('webhook_inbox', { provider: 'eq.strava', processed_at: 'is.null', next_try_at: `lte.${new Date().toISOString()}`, ...(opts.userId ? { user_id: `eq.${opts.userId}` } : {}) }, { order: 'received_at.asc', limit: opts.max ?? 50 });
  } catch {
    return { processed: 0, pending: 0, errors: [] };
  }
  const errors: string[] = [];
  let processed = 0;
  const finish = async (r: InboxRow, o: Outcome) => {
    if (o.done) {
      await update('webhook_inbox', { id: `eq.${r.id}`, user_id: `eq.${r.user_id}` }, { processed_at: new Date().toISOString(), outcome: o.outcome.slice(0, 300), last_error: null, attempts: r.attempts + 1 });
      processed++;
    } else {
      const attempts = r.attempts + 1;
      // După 8 încercări (~zile), evenimentul se închide cu eroarea vizibilă, ca să nu blocheze coada.
      const give = attempts >= 8;
      await update('webhook_inbox', { id: `eq.${r.id}`, user_id: `eq.${r.user_id}` }, { attempts, last_error: o.error.slice(0, 300), next_try_at: new Date(Date.now() + backoffMs(attempts)).toISOString(), ...(give ? { processed_at: new Date().toISOString(), outcome: `abandonat după ${attempts} încercări` } : {}) });
      errors.push(o.error);
    }
  };
  const byUser = new Map<string, InboxRow[]>();
  for (const r of rows) byUser.set(r.user_id, [...(byUser.get(r.user_id) ?? []), r]);
  for (const [userId, list] of byUser) {
    const today = await todayOf(userId);
    let changed = false;
    // Ștergerile și retragerea accesului, fiecare verificată la sursă.
    for (const r of list.filter((x) => x.aspect === 'delete' && x.object_type === 'activity')) {
      const o = await processDelete(userId, r.object_id, today).catch((e: Error) => ({ done: false as const, error: e.message }));
      if (o.done && o.outcome.startsWith('șters')) changed = true;
      await finish(r, o);
    }
    for (const r of list.filter((x) => x.object_type === 'athlete')) {
      const ev = { object_type: 'athlete', aspect_type: r.aspect, updates: r.updates } as StravaEvent;
      await finish(r, isDeauthorization(ev) ? await processDeauth(userId).catch((e: Error) => ({ done: false as const, error: e.message })) : { done: true, outcome: 'ignorat: eveniment de profil' });
    }
    // Creări și modificări: o sincronizare pentru toate.
    const ups = list.filter((x) => x.object_type === 'activity' && x.aspect !== 'delete');
    if (ups.length) {
      const o: Outcome = await syncUser(userId, 3)
        .then((rep) => {
          const bad = rep.find((x) => x.provider === 'strava' && !x.ok);
          return bad ? ({ done: false, error: `sincronizare: ${bad.detail ?? 'eroare'}` } as Outcome) : ({ done: true, outcome: `sincronizat (${ups.length} evenimente)` } as Outcome);
        })
        .catch((e: Error) => ({ done: false, error: e.message }));
      if (o.done) changed = true;
      for (const r of ups) await finish(r, o);
    }
    if (changed) await reactNow(userId).catch(() => undefined);
  }
  let pending = 0;
  try {
    pending = (await select('webhook_inbox', { provider: 'eq.strava', processed_at: 'is.null' }, { select: 'id', limit: 1000 })).length;
  } catch {
    /* */
  }
  return { processed, pending, errors };
}
