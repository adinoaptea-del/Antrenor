import { fail, HttpError, json, readJson } from '../_lib/auth.js';
import type { Req, Res } from '../_lib/http.js';
import { ENV, supabaseKeyHeaders } from '../_lib/env.js';
import { select, update } from '../_lib/db.js';

/**
 * POST /api/account/signup { email, password } — contul se creează pe server, deja confirmat, ca să nu depindem
 * de e-mailurile și adresele de redirect din Supabase. Primul cont devine admin. Limită: MAX_USERS (implicit 10).
 */
export default async function handler(req: Req, res: Res): Promise<void> {
  try {
    if (req.method !== 'POST') throw new HttpError(405, 'POST');
    const body = await readJson<{ email?: string; password?: string }>(req);
    const email = (body.email ?? '').trim().toLowerCase();
    const password = body.password ?? '';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(400, 'adresa de e-mail nu pare validă');
    if (password.length < 8) throw new HttpError(400, 'parola: minimum 8 caractere');
    const existing = await select<{ id: string }>('users', {}, { select: 'id' });
    if (existing.length >= ENV.maxUsers()) throw new HttpError(403, `s-au ocupat toate cele ${ENV.maxUsers()} locuri`);
    const r = await fetch(`${ENV.supabaseUrl()}/auth/v1/admin/users`, {
      method: 'POST',
      headers: { ...supabaseKeyHeaders(ENV.supabaseService()), 'content-type': 'application/json' },
      body: JSON.stringify({ email, password, email_confirm: true }),
    });
    const j = (await r.json().catch(() => ({}))) as { id?: string; msg?: string; message?: string; error_code?: string };
    if (!r.ok) {
      const exists = r.status === 422 || /already/i.test(j.msg ?? j.message ?? '');
      throw new HttpError(exists ? 409 : 400, exists ? 'există deja un cont cu adresa asta: intră cu parola' : (j.msg ?? j.message ?? `eroare ${r.status}`));
    }
    if (existing.length === 0 && j.id) await update('users', { id: `eq.${j.id}` }, { role: 'admin' });
    json(res, 200, { ok: true, admin: existing.length === 0 });
  } catch (e) {
    fail(res, e);
  }
}
