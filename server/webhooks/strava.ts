import { fail, json, readJson } from '../_lib/auth.js';
import { q, type Req, type Res } from '../_lib/http.js';
import { one } from '../_lib/db.js';
import { syncUser } from '../_lib/sync.js';
import { reactNow } from '../_lib/react.js';
import type { StravaWebhookEvent } from '../../src/collector/providers/strava.js';

/**
 * GET  /api/webhooks/strava?hub.challenge=… — validarea abonamentului (STRAVA_VERIFY_TOKEN).
 * POST /api/webhooks/strava — activitate nouă / modificată: sincronizăm sportivul (owner_id = athlete id).
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
    const ev = await readJson<StravaWebhookEvent>(req);
    if (ev.object_type === 'activity') {
      const row = await one<{ user_id: string }>('oauth_tokens', { provider: 'eq.strava', external_user_id: `eq.${ev.owner_id}` });
      if (row) {
      await syncUser(row.user_id, 3);
      await reactNow(row.user_id);
    }
    }
    json(res, 200, { ok: true });
  } catch (e) {
    fail(res, e);
  }
}
