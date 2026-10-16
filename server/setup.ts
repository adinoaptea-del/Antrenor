import { fail, HttpError, json, requireUser } from './_lib/auth.js';
import type { Req, Res } from './_lib/http.js';
import { one } from './_lib/db.js';
import { ENV } from './_lib/env.js';
import { runSetup, setupStatus } from './_lib/setup.js';

/**
 * GET  /api/setup → starea bazei de date (fără să schimbe nimic).
 * POST /api/setup → creează tabelele și programările. Prima dată merge fără cont (baza e goală, nu are ce strica);
 *                  după aceea doar adminul (primul cont creat) îl poate rula din nou, de exemplu după schimbarea domeniului.
 */
export default async function handler(req: Req, res: Res): Promise<void> {
  try {
    if (req.method === 'GET') {
      json(res, 200, await setupStatus());
      return;
    }
    if (req.method !== 'POST') throw new HttpError(405, 'GET sau POST');
    const status = await setupStatus();
    if (status.tables) {
      const u = await requireUser(req);
      const me = await one<{ role: string }>('users', { id: `eq.${u.id}` });
      if (me?.role !== 'admin') throw new HttpError(403, 'doar adminul poate rula din nou pregătirea');
    }
    const host = (req.headers['x-forwarded-host'] as string | undefined) ?? req.headers.host;
    const appUrl = process.env.APP_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL ? ENV.appUrl() : `https://${host}`;
    const steps = await runSetup(appUrl);
    json(res, 200, { ok: steps.every((s) => s.ok || s.step.startsWith('programare') || s.step === 'drepturi'), appUrl, steps });
  } catch (e) {
    fail(res, e);
  }
}
