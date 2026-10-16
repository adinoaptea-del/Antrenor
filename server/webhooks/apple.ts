import { randomBytes } from 'node:crypto';
import { fail, HttpError, json, readJson } from '../_lib/auth.js';
import { q, type Req, type Res } from '../_lib/http.js';
import { one, upsert } from '../_lib/db.js';
import { parseHealthExport, parseHealthOther, parseHealthWorkouts } from '../_lib/apple.js';
import { saveOthers } from '../_lib/sync.js';

/** POST /api/webhooks/apple?t=<token personal> — trimis de Health Auto Export de pe iPhone-ul sportivului. */
export default async function handler(req: Req, res: Res): Promise<void> {
  try {
    if (req.method !== 'POST') throw new HttpError(405, 'POST');
    const token = q(req, 't');
    if (!token || token.length < 20) throw new HttpError(401, 'lipsește tokenul');
    const user = await one<{ id: string }>('users', { apple_token: `eq.${token}` });
    if (!user) throw new HttpError(401, 'token necunoscut');
    const body = await readJson(req);
    const days = parseHealthExport(body);
    const workouts = parseHealthWorkouts(body);
    await saveOthers(user.id, parseHealthOther(body));
    if (days.length) {
      await upsert(
        'wellness_daily',
        days.map((d) => ({ user_id: user.id, date: d.date, source: 'apple', hrv: d.hrv, rhr: d.rhr, sleep_min: d.sleep_min, bedtime: d.bedtime, wake_time: d.wake_time, respiratory_rate: d.respiratory_rate ?? null, weight_kg: d.weight_kg ?? null, body_fat_pct: d.body_fat_pct ?? null, synced_at: new Date().toISOString() })),
        'user_id,date,source',
      );
    }
    if (workouts.length) {
      await upsert(
        'activities',
        workouts.map((w) => ({
          id: w.id,
          user_id: user.id,
          source: 'apple',
          external_id: w.id.slice(6),
          date: w.date,
          start_local: w.start_local,
          sport: w.sport,
          minutes: w.minutes,
          distance_km: w.distance_km,
          avg_hr: w.avg_hr,
          max_hr: w.max_hr,
          avg_pace_min_km: w.avg_pace_min_km,
          name: w.name,
          raw: w.details,
          synced_at: new Date().toISOString(),
        })),
        'id',
      );
    }
    json(res, 200, { ok: true, zile: days.length, antrenamente: workouts.length });
  } catch (e) {
    fail(res, e);
  }
}

export function newAppleToken(): string {
  return randomBytes(24).toString('base64url');
}
