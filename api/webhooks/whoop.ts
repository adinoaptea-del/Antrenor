import { createHmac, timingSafeEqual } from 'node:crypto';
import { fail, json, readJson } from '../_lib/auth.js';
import type { Req, Res } from '../_lib/http.js';
import { one } from '../_lib/db.js';
import { syncUser } from '../_lib/sync.js';
import type { WhoopWebhookEvent } from '../../src/collector/providers/whoop.js';

/**
 * POST /api/webhooks/whoop — WHOOP anunță o noapte / un antrenament nou; recordul se cere apoi prin API (sync pe 3 zile).
 * Semnătura: HMAC-SHA256(timestamp + body, client secret), base64, în X-WHOOP-Signature; timestamp în X-WHOOP-Signature-Timestamp.
 * De verificat numele exacte ale header-elor în docs la prima rulare; dacă diferă, semnătura pică și evenimentul e ignorat (log).
 */
export default async function handler(req: Req, res: Res): Promise<void> {
  try {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(typeof c === 'string' ? Buffer.from(c) : c);
    const raw = Buffer.concat(chunks).toString('utf8');
    const sig = String(req.headers['x-whoop-signature'] ?? '');
    const ts = String(req.headers['x-whoop-signature-timestamp'] ?? '');
    const expected = createHmac('sha256', process.env.WHOOP_CLIENT_SECRET ?? '').update(ts + raw).digest('base64');
    if (!sig || sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
      json(res, 401, { error: 'semnătură invalidă' });
      return;
    }
    const ev = JSON.parse(raw) as WhoopWebhookEvent;
    const row = await one<{ user_id: string }>('oauth_tokens', { provider: 'eq.whoop', external_user_id: `eq.${ev.user_id}` });
    if (row) await syncUser(row.user_id, 3);
    json(res, 200, { ok: true });
  } catch (e) {
    void readJson;
    fail(res, e);
  }
}
