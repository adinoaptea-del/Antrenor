import { randomBytes } from 'node:crypto';
import { fail, HttpError, json, readJson } from '../_lib/auth.js';
import { q, type Req, type Res } from '../_lib/http.js';
import { insert, one, upsert } from '../_lib/db.js';
import { parseHealthExport, parseHealthOther, parseHealthWorkouts } from '../_lib/apple.js';
import { saveOthers } from '../_lib/sync.js';
import { hasConsent } from '../_lib/consent.js';
import { reactNow } from '../_lib/react.js';

/** POST /api/webhooks/apple?t=<token personal> — trimis de Health Auto Export de pe iPhone-ul sportivului. */
export default async function handler(req: Req, res: Res): Promise<void> {
  let userId: string | null = null;
  try {
    if (req.method !== 'POST') throw new HttpError(405, 'POST');
    const token = q(req, 't');
    if (!token || token.length < 20) throw new HttpError(401, 'lipsește tokenul');
    const user = await one<{ id: string }>('users', { apple_token: `eq.${token}` });
    if (!user) throw new HttpError(401, 'token necunoscut');
    userId = user.id;
    if (!(await hasConsent(user.id))) throw new HttpError(403, 'consimțământul pentru date de sănătate lipsește sau a fost retras');
    const body = await readJson(req);
    const days = parseHealthExport(body);
    // Aceeași ședință de două ori în același pachet ar opri scrierea (Postgres refuză două rânduri cu același id).
    // ID-ul intern include contul: aceeași ședință trimisă de doi sportivi dă două rânduri separate.
    const workouts = [...new Map(parseHealthWorkouts(body).map((w) => [w.id, { ...w, id: appleActivityId(user.id, w.id) }])).values()];
    await saveOthers(user.id, parseHealthOther(body).map((o) => ({ ...o, id: appleOtherId(user.id, o.externalId) })));
    for (const group of wellnessGroups(user.id, days)) await upsert('wellness_daily', group, 'user_id,date,source');
    if (workouts.length) {
      await upsert(
        'activities',
        workouts.map((w) => ({
          id: w.id,
          user_id: user.id,
          source: 'apple',
          external_id: w.id.slice(`apple-${user.id}-`.length),
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
    if (workouts.length) await reactNow(user.id);
    await insert('sync_log', { user_id: user.id, provider: 'apple', ok: true, rows: days.length + workouts.length, detail: `${days.length} zile, ${workouts.length} antrenamente` }).catch(() => undefined);
    json(res, 200, { ok: true, zile: days.length, antrenamente: workouts.length });
  } catch (e) {
    // Eroarea rămâne la vedere pe cardul Apple Health din Profil, ca să nu ghicim.
    if (userId) await insert('sync_log', { user_id: userId, provider: 'apple', ok: false, rows: 0, detail: (e instanceof Error ? e.message : String(e)).slice(0, 300) }).catch(() => undefined);
    fail(res, e);
  }
}

export function newAppleToken(): string {
  return randomBytes(24).toString('base64url');
}

export function appleActivityId(userId: string, parsedId: string): string {
  return `apple-${userId}-${parsedId.replace(/^apple-/, '')}`;
}
export function appleOtherId(userId: string, externalId: string): string {
  return `apple-o-${userId}-${externalId}`;
}

type Wellness = ReturnType<typeof parseHealthExport>[number];
const WELLNESS_FIELDS = ['hrv', 'rhr', 'sleep_min', 'bedtime', 'wake_time', 'respiratory_rate', 'weight_kg', 'body_fat_pct'] as const;

/**
 * Doar măsurătorile prezente în pachet: un export ulterior doar cu HRV nu șterge somnul salvat.
 * Rândurile se grupează după coloanele prezente (o scriere pe grup), ca PostgREST să nu completeze cu null.
 */
export function wellnessGroups(userId: string, days: Wellness[], source: 'apple' | 'android' = 'apple'): Record<string, unknown>[][] {
  const groups = new Map<string, Record<string, unknown>[]>();
  const now = new Date().toISOString();
  for (const d of days) {
    const row: Record<string, unknown> = { user_id: userId, date: d.date, source, synced_at: now };
    for (const f of WELLNESS_FIELDS) {
      const v = (d as unknown as Record<string, unknown>)[f];
      if (v != null) row[f] = v;
    }
    const sig = Object.keys(row).join(',');
    if (!groups.has(sig)) groups.set(sig, []);
    groups.get(sig)!.push(row);
  }
  return [...groups.values()];
}
