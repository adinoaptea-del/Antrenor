import { fail, json } from './_lib/auth.js';
import type { Req, Res } from './_lib/http.js';
import { ENV, supabaseKeyHeaders } from './_lib/env.js';
import { PROVIDERS, providerConfigured } from './_lib/tokens.js';

/**
 * GET /api/config — public. Ce îi trebuie aplicației ca să pornească: adresa Supabase și cheia publică
 * (nu mai intră în bundle la build), plus ce e configurat pe server. Fără secrete.
 */
export default async function handler(_req: Req, res: Res): Promise<void> {
  try {
    let supabaseUrl = '';
    let publishableKey = '';
    try {
      supabaseUrl = ENV.supabaseUrl();
      publishableKey = ENV.supabaseAnon();
    } catch {
      json(res, 200, { configured: false, reason: 'Lipsește integrarea Supabase în proiectul Vercel.' });
      return;
    }
    let ready = false;
    let users = 0;
    let upgrade = false;
    try {
      const r = await fetch(`${supabaseUrl}/rest/v1/users?select=id`, { headers: { ...supabaseKeyHeaders(ENV.supabaseService()), prefer: 'count=exact', range: '0-0' } });
      ready = r.ok;
      users = Number(r.headers.get('content-range')?.split('/')[1] ?? 0) || 0;
      if (ready) {
        // Schema veche (fără coloanele din 0002): aplicația cere singură actualizarea.
        const h = { headers: supabaseKeyHeaders(ENV.supabaseService()) };
        const [c, t, l, o] = await Promise.all([
          fetch(`${supabaseUrl}/rest/v1/users?select=city,apple_token,schema_v,sex,birth_year,height_cm&limit=1`, h),
          fetch(`${supabaseUrl}/rest/v1/app_settings?select=key&limit=1`, h),
          fetch(`${supabaseUrl}/rest/v1/labs?select=uploaded_at&limit=1`, h),
          fetch(`${supabaseUrl}/rest/v1/other_activities?select=id&limit=1`, h),
        ]);
        upgrade = !c.ok || !t.ok || !l.ok || !o.ok;
      }
    } catch {
      ready = false;
    }
    json(res, 200, {
      configured: true,
      supabaseUrl,
      publishableKey,
      ready,
      upgrade,
      signupOpen: ready && users < ENV.maxUsers(),
      firstUser: ready && users === 0,
      agents: !!process.env.ANTHROPIC_API_KEY,
      providers: Object.fromEntries(PROVIDERS.map((p) => [p, providerConfigured(p)])),
    });
  } catch (e) {
    fail(res, e);
  }
}
