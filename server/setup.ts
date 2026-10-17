import { fail, HttpError, json, requireUser } from './_lib/auth.js';
import type { Req, Res } from './_lib/http.js';
import { one } from './_lib/db.js';
import { ENV } from './_lib/env.js';
import { runSetup, setupStatus } from './_lib/setup.js';
import { supabaseKeyHeaders } from './_lib/env.js';

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
    const needsUpgrade = status.tables && !(await hasUpgrade());
    // Fără cont: doar prima pregătire (baza goală) sau actualizarea idempotentă a schemei. Programările (cron) nu se
    // ating pe calea fără cont, iar adresa lor vine numai din configurația serverului, niciodată din header-ul cererii.
    let admin = false;
    if (status.tables && !needsUpgrade) {
      const u = await requireUser(req);
      const me = await one<{ role: string }>('users', { id: `eq.${u.id}` });
      if (me?.role !== 'admin') throw new HttpError(403, 'doar adminul poate rula din nou pregătirea');
      admin = true;
    }
    if (!process.env.APP_URL && !process.env.VERCEL_PROJECT_PRODUCTION_URL) throw new HttpError(500, 'lipsește adresa aplicației în configurația serverului (APP_URL)');
    const appUrl = ENV.appUrl();
    const steps = await runSetup(appUrl, { schedule: admin || !status.tables });
    json(res, 200, { ok: steps.every((s) => s.ok || s.step.startsWith('programare') || s.step.startsWith('pg_')), appUrl, steps });
  } catch (e) {
    fail(res, e);
  }
}

/** Actualizarea (0002) e idempotentă și nu atinge date: o poate declanșa oricine când lipsește. */
async function hasUpgrade(): Promise<boolean> {
  const h = { headers: supabaseKeyHeaders(ENV.supabaseService()) };
  const [r, t, e, a2] = await Promise.all([
    fetch(`${ENV.supabaseUrl()}/rest/v1/users?select=city,apple_token&limit=1`, h),
    fetch(`${ENV.supabaseUrl()}/rest/v1/app_settings?select=key&limit=1`, h),
    fetch(`${ENV.supabaseUrl()}/rest/v1/agent_events?select=event_key&limit=1`, h),
    fetch(`${ENV.supabaseUrl()}/rest/v1/plans?select=audit2&limit=1`, h),
  ]);
  return r.ok && t.ok && e.ok && a2.ok;
}
