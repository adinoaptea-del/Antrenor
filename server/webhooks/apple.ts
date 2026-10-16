import { randomBytes } from 'node:crypto';
import { fail, HttpError, json, readJson } from '../_lib/auth.js';
import { q, type Req, type Res } from '../_lib/http.js';
import { one, upsert } from '../_lib/db.js';
import { parseHealthExport } from '../_lib/apple.js';

/** POST /api/webhooks/apple?t=<token personal> — trimis de Health Auto Export de pe iPhone-ul sportivului. */
export default async function handler(req: Req, res: Res): Promise<void> {
  try {
    if (req.method !== 'POST') throw new HttpError(405, 'POST');
    const token = q(req, 't');
    if (!token || token.length < 20) throw new HttpError(401, 'lipsește tokenul');
    const user = await one<{ id: string }>('users', { apple_token: `eq.${token}` });
    if (!user) throw new HttpError(401, 'token necunoscut');
    const days = parseHealthExport(await readJson(req));
    if (days.length) {
      await upsert(
        'wellness_daily',
        days.map((d) => ({ user_id: user.id, date: d.date, source: 'apple', hrv: d.hrv, rhr: d.rhr, sleep_min: d.sleep_min, bedtime: d.bedtime, wake_time: d.wake_time, synced_at: new Date().toISOString() })),
        'user_id,date,source',
      );
    }
    json(res, 200, { ok: true, zile: days.length });
  } catch (e) {
    fail(res, e);
  }
}

export function newAppleToken(): string {
  return randomBytes(24).toString('base64url');
}
