import { fail, json, readJson } from '../_lib/auth.js';
import { afterResponse, q, type Req, type Res } from '../_lib/http.js';
import { one } from '../_lib/db.js';
import { syncUser } from '../_lib/sync.js';
import { reactNow } from '../_lib/react.js';
import { userToday } from '../_lib/collect.js';
import { jobRow, jobStarted, recentlyStarted } from '../_lib/jobs.js';
import { drainStravaInbox, enqueueStrava, processDeauth, processDelete } from '../_lib/strava-inbox.js';
import { isDeauthorization, parseStravaEvent, subscriptionMatches } from '../../src/collector/providers/strava-webhook.js';

/**
 * GET  /api/webhooks/strava?hub.challenge=… — validarea abonamentului (STRAVA_VERIFY_TOKEN).
 * POST /api/webhooks/strava — eveniment Strava (auditul consolidat, C1):
 *  1. forma evenimentului se validează (400 altfel); abonamentul, dacă STRAVA_SUBSCRIPTION_ID e setat (403 altfel);
 *  2. sportivul trebuie să fie conectat la AIRON (owner_id = id-ul Strava din tokenuri); altfel 200 fără efect;
 *  3. evenimentul intră în coadă (webhook_inbox; reîncercările Strava cad pe cheia unică) și primirea se confirmă imediat;
 *  4. procesarea vine după răspuns: ștergerea se aplică doar dacă API-ul Strava confirmă 404, retragerea accesului doar
 *     dacă tokenul e refuzat (401), iar creările/modificările unui sportiv se adună într-o singură sincronizare.
 *     Ce nu se termină acum se reia la cronul de 15 minute, cu reîncercări.
 */
export default async function handler(req: Req, res: Res): Promise<void> {
  try {
    if (req.method === 'GET') {
      // Auditul v93, A94: fără token configurat nu se validează nimic (un token gol nu mai e acceptat).
      if (!process.env.STRAVA_VERIFY_TOKEN || q(req, 'hub.verify_token') !== process.env.STRAVA_VERIFY_TOKEN) {
        json(res, 403, { error: 'verify token greșit' });
        return;
      }
      json(res, 200, { 'hub.challenge': q(req, 'hub.challenge') });
      return;
    }
    if (req.method !== 'POST') {
      json(res, 405, { error: 'POST' });
      return;
    }
    const parsed = parseStravaEvent(await readJson<unknown>(req).catch(() => null));
    if (!parsed.ok) {
      json(res, 400, { error: `eveniment invalid: ${parsed.why}` });
      return;
    }
    const ev = parsed.ev;
    if (!subscriptionMatches(ev, process.env.STRAVA_SUBSCRIPTION_ID)) {
      json(res, 403, { error: 'abonament necunoscut' });
      return;
    }
    const row = await one<{ user_id: string }>('oauth_tokens', { provider: 'eq.strava', external_user_id: `eq.${ev.owner_id}` });
    if (!row) {
      json(res, 200, { ok: true, ignorat: 'sportiv neconectat' });
      return;
    }
    const userId = row.user_id;
    const queued = await enqueueStrava(ev, userId);
    json(res, 200, { ok: true });
    const todayOf = async (id: string) => userToday(id);
    if (queued) {
      // Doar evenimentele acestui sportiv, cel mult o procesare imediată pe minut (un val de evenimente, adevărate
      // sau false, nu consumă limita de cereri Strava a aplicației); restul așteaptă cronul de 15 minute.
      const last = await jobRow(userId, 'strava-webhook');
      if (!recentlyStarted(last, Date.now(), 60_000)) {
        await jobStarted(userId, 'strava-webhook');
        afterResponse(drainStravaInbox(todayOf, { userId, max: 20 }));
      }
      return;
    }
    // Schemă veche (fără coadă): aceleași verificări, direct.
    afterResponse(
      (async () => {
        if (ev.object_type === 'activity' && ev.aspect_type === 'delete') await processDelete(userId, ev.object_id, await todayOf(userId));
        else if (isDeauthorization(ev)) await processDeauth(userId);
        else if (ev.object_type === 'activity') {
          await syncUser(userId, 3);
          await reactNow(userId);
        }
      })(),
    );
  } catch (e) {
    fail(res, e);
  }
}
