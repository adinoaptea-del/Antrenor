// GENERAT din server/ cu scripts/bundle-api.mjs — nu edita de mână.
import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);

// server/_lib/env.ts
import { createHmac } from "node:crypto";
function env(name, optional = false) {
  const v = process.env[name];
  if (!v && !optional) throw new Error(`lipse\u0219te variabila de mediu ${name}`);
  return v ?? "";
}
function first(names, optional = false) {
  for (const n of names) {
    const v = process.env[n];
    if (v) return v.trim();
  }
  if (optional) return "";
  throw new Error(`lipse\u0219te variabila de mediu ${names[0]}`);
}
var SERVICE = ["SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY"];
var PUBLIC_KEY = ["SUPABASE_PUBLISHABLE_KEY", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "VITE_SUPABASE_ANON_KEY"];
var URL_NAMES = ["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "VITE_SUPABASE_URL"];
var PG = ["POSTGRES_URL_NON_POOLING", "POSTGRES_URL", "DATABASE_URL"];
function derived(label) {
  return createHmac("sha256", first(SERVICE)).update(`antrenor:${label}`).digest("base64url");
}
function appUrl() {
  const explicit = first(["APP_URL"], true);
  if (explicit) return explicit.replace(/\/$/, "");
  const prod = first(["VERCEL_PROJECT_PRODUCTION_URL"], true);
  if (prod) return `https://${prod}`;
  const url = first(["VERCEL_URL"], true);
  if (url) return `https://${url}`;
  throw new Error("lipse\u0219te APP_URL");
}
var ENV = {
  supabaseUrl: () => first(URL_NAMES).replace(/\/$/, ""),
  supabaseService: () => first(SERVICE),
  supabaseAnon: () => first(PUBLIC_KEY),
  postgresUrl: () => first(PG, true),
  appUrl,
  stateSecret: () => first(["OAUTH_STATE_SECRET"], true) || derived("oauth-state"),
  cronSecret: () => first(["CRON_SECRET"], true) || derived("cron"),
  modelKey: () => env("ANTHROPIC_API_KEY"),
  modelSpecialist: () => env("MODEL_SPECIALIST", true) || "claude-sonnet-5-5",
  modelHead: () => env("MODEL_HEAD", true) || "claude-sonnet-5-5",
  /** Câte conturi se pot crea din aplicație (WHOOP dă acces de dezvoltator pentru 10 membri). */
  maxUsers: () => Number(env("MAX_USERS", true) || 10)
};
function supabaseKeyHeaders(key) {
  return key.startsWith("sb_") ? { apikey: key } : { apikey: key, authorization: `Bearer ${key}` };
}

// server/_lib/auth.ts
var HttpError = class extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
  status;
};
function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(body));
}
function fail(res, e) {
  const status = e instanceof HttpError ? e.status : 500;
  const message = e instanceof Error ? e.message : String(e);
  json(res, status, { error: message });
}

// server/_lib/tokens.ts
var PROVIDERS = ["whoop", "strava", "oura"];
function providerConfigured(p) {
  const k = { whoop: "WHOOP_CLIENT_ID", strava: "STRAVA_CLIENT_ID", oura: "OURA_CLIENT_ID" }[p];
  return !!process.env[k];
}

// server/config.ts
async function handler(_req, res) {
  try {
    let supabaseUrl = "";
    let publishableKey = "";
    try {
      supabaseUrl = ENV.supabaseUrl();
      publishableKey = ENV.supabaseAnon();
    } catch {
      json(res, 200, { configured: false, reason: "Lipse\u0219te integrarea Supabase \xEEn proiectul Vercel." });
      return;
    }
    let ready = false;
    let users = 0;
    try {
      const r = await fetch(`${supabaseUrl}/rest/v1/users?select=id`, { headers: { ...supabaseKeyHeaders(ENV.supabaseService()), prefer: "count=exact", range: "0-0" } });
      ready = r.ok;
      users = Number(r.headers.get("content-range")?.split("/")[1] ?? 0) || 0;
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
      providers: Object.fromEntries(PROVIDERS.map((p) => [p, providerConfigured(p)]))
    });
  } catch (e) {
    fail(res, e);
  }
}
export {
  handler as default
};
