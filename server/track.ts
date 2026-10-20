import { fail, HttpError, json, readJson, requireUser } from './_lib/auth.js';
import type { Req, Res } from './_lib/http.js';
import { rpc, upsert } from './_lib/db.js';
import { cleanPing } from '../src/usage.js';

/**
 * POST /api/track — folosirea aplicației (doar numărători pe zi, src/usage.ts) sau nota 1–5.
 *   { date, sessions, seconds, details, screens }  → se adună în app_usage_daily (track_usage, atomic)
 *   { nota: 1..5, text?, date }                    → app_feedback (una pe zi; a doua o înlocuiește)
 * Scrie doar pe contul celui logat. O bază încă nepregătită (schema < 12) nu strică nimic: răspunde ok fără să salveze.
 */
export default async function handler(req: Req, res: Res): Promise<void> {
  try {
    if (req.method !== 'POST') throw new HttpError(405, 'POST');
    const u = await requireUser(req);
    const body = await readJson<Record<string, unknown>>(req);
    const todayUtc = new Date().toISOString().slice(0, 10);
    if (body.nota != null) {
      const score = Number(body.nota);
      const date = typeof body.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.date) && Math.abs(Date.parse(body.date) - Date.parse(todayUtc)) <= 86_400_000 ? body.date : todayUtc;
      if (!Number.isInteger(score) || score < 1 || score > 5) throw new HttpError(400, 'nota e între 1 și 5');
      const note = typeof body.text === 'string' && body.text.trim() ? body.text.trim().slice(0, 500) : null;
      await upsert('app_feedback', { user_id: u.id, date, score, note }, 'user_id,date');
      json(res, 200, { ok: true });
      return;
    }
    const p = cleanPing(body, todayUtc);
    if (!p) {
      json(res, 200, { ok: true, skipped: true });
      return;
    }
    try {
      await rpc('track_usage', { p_user: u.id, p_date: p.date, p_sessions: p.sessions, p_seconds: p.seconds, p_details: p.details, p_screens: p.screens });
    } catch (e) {
      // Schemă veche (fără funcție): nu se pierde nimic important, telefonul nu reîncearcă la nesfârșit.
      console.error('track_usage', e instanceof Error ? e.message : e);
      json(res, 200, { ok: false });
      return;
    }
    json(res, 200, { ok: true });
  } catch (e) {
    fail(res, e);
  }
}
