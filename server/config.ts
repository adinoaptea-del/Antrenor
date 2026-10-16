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
    try {
      const r = await fetch(`${supabaseUrl}/rest/v1/users?select=id`, { headers: { ...supabaseKeyHeaders(ENV.supabaseService()), prefer: 'count=exact', range: '0-0' } });
      ready = r.ok;
      users = Number(r.headers.get('content-range')?.split('/')[1] ?? 0) || 0;
    } catch {
      ready = false;
    }
    json(res, 200, {
      configured: true,
      supabaseUrl,
      publishableKey,
      ready,
      signupOpen: ready && users < ENV.maxUsers(),
      firstUser: ready && users === 0,
      agents: !!process.env.ANTHROPIC_API_KEY,
      providers: Object.fromEntries(PROVIDERS.map((p) => [p, providerConfigured(p)])),
    });
  } catch (e) {
    fail(res, e);
  }
}
