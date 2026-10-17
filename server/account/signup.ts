import { fail, HttpError, json, readJson } from '../_lib/auth.js';
import type { Req, Res } from '../_lib/http.js';
import { ENV, supabaseKeyHeaders } from '../_lib/env.js';
import { timingSafeEqual } from 'node:crypto';
import { select, update } from '../_lib/db.js';
import { inviteCode } from '../_lib/invite.js';

/**
 * POST /api/account/signup { email, password } — contul se creează pe server, deja confirmat, ca să nu depindem
 * de e-mailurile și adresele de redirect din Supabase. Primul cont devine admin. Limită: MAX_USERS (implicit 10).
 */
export default async function handler(req: Req, res: Res): Promise<void> {
  try {
    if (req.method !== 'POST') throw new HttpError(405, 'POST');
    const body = await readJson<{ email?: string; password?: string; invite?: string }>(req);
    const email = (body.email ?? '').trim().toLowerCase();
    const password = body.password ?? '';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(400, 'adresa de e-mail nu pare validă');
    if (password.length < 8) throw new HttpError(400, 'parola: minimum 8 caractere');
    const existing = await select<{ id: string }>('users', {}, { select: 'id' });
    const max = ENV.maxUsers();
    if (!Number.isInteger(max) || max < 1) throw new HttpError(500, 'MAX_USERS trebuie să fie un număr întreg pozitiv');
    if (existing.length >= max) throw new HttpError(403, `s-au ocupat toate cele ${max} locuri`);
    // Grup privat: după primul cont (adminul), un cont nou se face doar cu linkul de invitație din ecranul Prieteni.
    if (existing.length > 0) {
      const code = await inviteCode();
      const given = String(body.invite ?? '');
      if (!code || given.length !== code.length || !timingSafeEqual(Buffer.from(given), Buffer.from(code))) throw new HttpError(403, 'ai nevoie de linkul de invitație de la admin');
    }
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
    if (j.id) await update('users', { id: `eq.${j.id}` }, existing.length === 0 ? { role: 'admin', approved: true } : { approved: true });
    json(res, 200, { ok: true, admin: existing.length === 0 });
  } catch (e) {
    fail(res, e);
  }
}
