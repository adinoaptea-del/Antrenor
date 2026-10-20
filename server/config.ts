import { encryptionEnabled } from './_lib/secretbox.js';
import { fail, json } from './_lib/auth.js';
import type { Req, Res } from './_lib/http.js';
import { ENV, supabaseKeyHeaders } from './_lib/env.js';
import { PROVIDERS, providerConfigured } from './_lib/tokens.js';
import { SCHEMA_VERSION } from '../src/schema-version.js';

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
        const [c, t, l, o, w, a, ov, ev, a2, sm] = await Promise.all([
          fetch(`${supabaseUrl}/rest/v1/users?select=city,apple_token,schema_v,sex,birth_year,height_cm,calendar_prefs&limit=1`, h),
          fetch(`${supabaseUrl}/rest/v1/app_settings?select=key&limit=1`, h),
          fetch(`${supabaseUrl}/rest/v1/labs?select=uploaded_at&limit=1`, h),
          fetch(`${supabaseUrl}/rest/v1/other_activities?select=id&limit=1`, h),
          fetch(`${supabaseUrl}/rest/v1/workouts_planned?select=suggestion&limit=1`, h),
          fetch(`${supabaseUrl}/rest/v1/ai_usage?select=id&limit=1`, h),
          fetch(`${supabaseUrl}/rest/v1/activity_overrides?select=activity_id&limit=1`, h),
          fetch(`${supabaseUrl}/rest/v1/agent_events?select=event_key&limit=1`, h),
          fetch(`${supabaseUrl}/rest/v1/badges_earned?select=badge_id&limit=1`, h),
          fetch(`${supabaseUrl}/rest/v1/schema_meta?select=value&key=eq.version`, h),
        ]);
        upgrade = !c.ok || !t.ok || !l.ok || !o.ok || !w.ok || !a.ok || !ov.ok || !ev.ok || !a2.ok || !(await schemaOk(sm));
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
      // A94: dacă tokenurile OAuth se păstrează criptate (cheia TOKEN_ENC_KEY în Vercel); doar da/nu, niciodată cheia.
      tokenEncryption: encryptionEnabled(),
      providers: Object.fromEntries(PROVIDERS.map((p) => [p, providerConfigured(p)])),
      // Versiunea publicată (commit), vizibilă în Profil: auditurile pot spune pe ce build au testat.
      build: (process.env.VERCEL_GIT_COMMIT_SHA ?? '').slice(0, 7) || null,
    });
  } catch (e) {
    fail(res, e);
  }
}

export { SCHEMA_VERSION };
export async function schemaOk(r: Response): Promise<boolean> {
  if (!r.ok) return false;
  try {
    const rows = (await r.json()) as { value?: number }[];
    return (rows[0]?.value ?? 0) >= SCHEMA_VERSION;
  } catch {
    return false;
  }
}
