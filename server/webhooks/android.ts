import { fail, HttpError, json, readJson } from '../_lib/auth.js';
import { q, type Req, type Res } from '../_lib/http.js';
import { insert, one, upsert } from '../_lib/db.js';
import { parseHealthConnect } from '../_lib/android.js';
import { saveOthers } from '../_lib/sync.js';
import { hasConsent } from '../_lib/consent.js';
import { reactNow } from '../_lib/react.js';
import { wellnessGroups } from './apple.js';

/**
 * POST /api/webhooks/android?t=<token personal> — Samsung Health / Health Connect, trimis de aplicația Android
 * „Health Connect Webhook” (sau alt exportator) de pe telefonul sportivului. Același token ca la Apple Health.
 * Răspunsul spune ce s-a recunoscut și ce nu, iar sync_log păstrează tipurile necunoscute, ca să le adăugăm.
 */
export default async function handler(req: Req, res: Res): Promise<void> {
  let userId: string | null = null;
  try {
    const token = q(req, 't');
    if (!token || token.length < 20) throw new HttpError(401, 'lipsește tokenul');
    const user = await one<{ id: string; tz: string | null }>('users', { apple_token: `eq.${token}` });
    if (!user) throw new HttpError(401, 'token necunoscut');
    // Butonul „Test” al unor aplicații verifică adresa cu GET: răspundem că e bună, fără date.
    if (req.method === 'GET' || req.method === 'HEAD') {
      json(res, 200, { ok: true, mesaj: 'adresa e bună; trimite datele cu POST (JSON)' });
      return;
    }
    if (req.method !== 'POST') throw new HttpError(405, 'POST');
    userId = user.id;
    if (!(await hasConsent(user.id))) throw new HttpError(403, 'consimțământul pentru date de sănătate lipsește sau a fost retras');
    const body = await readJson(req);
    const parsed = parseHealthConnect(body, user.tz || 'Europe/Bucharest');
    const workouts = [...new Map(parsed.workouts.map((w) => [w.id, { ...w, id: `android-${user.id}-${w.id.replace(/^android-/, '')}` }])).values()];
    await saveOthers(user.id, parsed.others.map((o) => ({ ...o, id: `android-o-${user.id}-${o.externalId}` })));
    for (const group of wellnessGroups(user.id, parsed.days, 'android')) await upsert('wellness_daily', group, 'user_id,date,source');
    if (workouts.length) {
      await upsert(
        'activities',
        workouts.map((w) => ({
          id: w.id,
          user_id: user.id,
          source: 'android',
          external_id: w.id.slice(`android-${user.id}-`.length),
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
      await reactNow(user.id);
    }
    const detail = `${parsed.days.length} zile, ${workouts.length} antrenamente, ${parsed.others.length} recuperare${parsed.unknownTypes.length ? ` · tipuri necunoscute: ${parsed.unknownTypes.slice(0, 8).join(', ')}` : ''}`;
    await insert('sync_log', { user_id: user.id, provider: 'android', ok: parsed.recognized > 0 || parsed.unknownTypes.length === 0, rows: parsed.days.length + workouts.length, detail: detail.slice(0, 300) }).catch(() => undefined);
    json(res, 200, { ok: true, zile: parsed.days.length, antrenamente: workouts.length, recuperare: parsed.others.length, tipuri_necunoscute: parsed.unknownTypes });
  } catch (e) {
    if (userId) await insert('sync_log', { user_id: userId, provider: 'android', ok: false, rows: 0, detail: (e instanceof Error ? e.message : String(e)).slice(0, 300) }).catch(() => undefined);
    fail(res, e);
  }
}
