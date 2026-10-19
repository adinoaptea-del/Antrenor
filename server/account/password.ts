import { fail, HttpError, json, readJson, requireUser } from '../_lib/auth.js';
import type { Req, Res } from '../_lib/http.js';
import { ENV, supabaseKeyHeaders } from '../_lib/env.js';

/**
 * POST /api/account/password { current, next } — sportivul își schimbă singur parola. Parola actuală se verifică la
 * Supabase (o sesiune deschisă pe un telefon uitat nu ajunge ca să schimbi parola). Parola nu se scrie în jurnale.
 */
export default async function handler(req: Req, res: Res): Promise<void> {
  try {
    if (req.method !== 'POST') throw new HttpError(405, 'POST');
    const user = await requireUser(req);
    const body = await readJson<{ current?: string; next?: string }>(req);
    const current = body.current ?? '';
    const next = body.next ?? '';
    if (next.length < 8) throw new HttpError(400, 'parola nouă: minimum 8 caractere');
    if (next === current) throw new HttpError(400, 'parola nouă e la fel ca cea actuală');
    const check = await fetch(`${ENV.supabaseUrl()}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { ...supabaseKeyHeaders(ENV.supabaseAnon()), 'content-type': 'application/json' },
      body: JSON.stringify({ email: user.email, password: current }),
    });
    if (check.status === 400) throw new HttpError(403, 'parola actuală nu e corectă');
    if (!check.ok) throw new HttpError(502, `nu am putut verifica parola (${check.status})`);
    const r = await fetch(`${ENV.supabaseUrl()}/auth/v1/admin/users/${user.id}`, {
      method: 'PUT',
      headers: { ...supabaseKeyHeaders(ENV.supabaseService()), 'content-type': 'application/json' },
      body: JSON.stringify({ password: next }),
    });
    if (!r.ok) throw new HttpError(500, `nu am putut schimba parola (${r.status})`);
    json(res, 200, { ok: true });
  } catch (e) {
    fail(res, e);
  }
}
