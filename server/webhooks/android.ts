import { fail, HttpError, json, readJson } from '../_lib/auth.js';
import { q, webhookToken, type Req, type Res } from '../_lib/http.js';
import { insert, one, upsert } from '../_lib/db.js';
import { parseHealthConnect } from '../_lib/android.js';
import { saveOthers } from '../_lib/sync.js';
import { hasConsent } from '../_lib/consent.js';
import { reactNow } from '../_lib/react.js';
import { wellnessGroups } from './apple.js';

/**
 * POST /api/webhooks/android?t=<token personal> — Samsung Health / Health Connect, trimis de aplicația Android
 * „Health Connect Webhook” (sau alt exportator) de pe telefonul sportivului. Token propriu (nu cel de Apple Health).
 * Răspunsul spune ce s-a recunoscut și ce nu, iar sync_log păstrează tipurile necunoscute, ca să le adăugăm.
 */
export default async function handler(req: Req, res: Res): Promise<void> {
  let userId: string | null = null;
  try {
    const token = webhookToken(req);
    if (!token || token.length < 20) throw new HttpError(401, 'lipsește tokenul');
    // C5: tokenul Android e separat de cel Apple (users.android_token, schema 13). Tokenurile vechi folosite deja pe
    // Android au fost copiate de migrarea 0005, deci adresa lipită în telefon merge în continuare.
    const user = await one<{ id: string; tz: string | null }>('users', { android_token: `eq.${token}` }).catch(async (e: Error) => {
      // Schemă sub 13 (fără coloană): ca înainte, pe tokenul comun, până rulează actualizarea bazei.
      if (/android_token/.test(e.message)) return one<{ id: string; tz: string | null }>('users', { apple_token: `eq.${token}` });
      throw e;
    });
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
    // Butonul „Testează webhook” din HC Webhook trimite date inventate cu "test": true — nu le salvăm.
    if (body && typeof body === 'object' && (body as { test?: unknown }).test === true) {
      await insert('sync_log', { user_id: user.id, provider: 'android', ok: true, rows: 0, detail: 'test primit (date de probă, nesalvate)' }).catch(() => undefined);
      json(res, 200, { ok: true, test: true, mesaj: 'adresa e bună; datele de probă nu se salvează' });
      return;
    }
    const r = await ingestAndroid(user, body);
    json(res, 200, { ok: true, ...r });
  } catch (e) {
    if (userId) await insert('sync_log', { user_id: userId, provider: 'android', ok: false, rows: 0, detail: (e instanceof Error ? e.message : String(e)).slice(0, 300) }).catch(() => undefined);
    fail(res, e);
  }
}

/** Datele în formatul Health Connect (zilnic de pe telefon sau din exportul Samsung Health): zile, antrenamente, recuperare. */
export async function ingestAndroid(user: { id: string; tz: string | null }, body: unknown, opts: { history?: boolean } = {}): Promise<{ zile: number; antrenamente: number; recuperare: number; tipuri_necunoscute: string[] }> {
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
      // Istoricul importat nu e „antrenamentul de azi”: fără reacția antrenorilor.
      if (!opts.history) await reactNow(user.id);
    }
    const detail = `${opts.history ? 'istoric importat: ' : ''}${parsed.days.length} zile, ${workouts.length} antrenamente, ${parsed.others.length} recuperare${parsed.unknownTypes.length ? ` · tipuri necunoscute: ${parsed.unknownTypes.slice(0, 8).join(', ')}` : ''}`;
    await insert('sync_log', { user_id: user.id, provider: 'android', ok: parsed.recognized > 0 || parsed.unknownTypes.length === 0, rows: parsed.days.length + workouts.length, detail: detail.slice(0, 300) }).catch(() => undefined);
    return { zile: parsed.days.length, antrenamente: workouts.length, recuperare: parsed.others.length, tipuri_necunoscute: parsed.unknownTypes };
}
