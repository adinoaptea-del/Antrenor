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

// server/_lib/auth.ts
var HttpError = class extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
  status;
};
function bearer(req) {
  const h = req.headers.authorization;
  if (!h || !h.toLowerCase().startsWith("bearer ")) return null;
  return h.slice(7).trim();
}
async function requireUser(req) {
  const token = bearer(req);
  if (!token) throw new HttpError(401, "f\u0103r\u0103 token");
  const res = await fetch(`${ENV.supabaseUrl()}/auth/v1/user`, { headers: { apikey: ENV.supabaseAnon(), authorization: `Bearer ${token}` } });
  if (!res.ok) throw new HttpError(401, "token invalid sau expirat");
  const u = await res.json();
  return { id: u.id, email: u.email };
}
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

// server/_lib/http.ts
function q(req, name) {
  const v = req.query[name];
  return Array.isArray(v) ? v[0] ?? "" : v ?? "";
}

// server/_lib/tokens.ts
import { createHmac as createHmac2, timingSafeEqual } from "node:crypto";

// src/collector/providers/oauth.ts
function authorizeUrl(cfg, state) {
  const u = new URL(cfg.authorizeUrl);
  u.searchParams.set("client_id", cfg.clientId);
  u.searchParams.set("redirect_uri", cfg.redirectUri);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", cfg.scopes.join(cfg.scopeSeparator ?? " "));
  u.searchParams.set("state", state);
  for (const [k, v] of Object.entries(cfg.extraAuthorizeParams ?? {})) u.searchParams.set(k, v);
  return u.toString();
}

// src/collector/providers/whoop.ts
var WHOOP_SCOPES = ["read:recovery", "read:cycles", "read:sleep", "read:workout", "read:body_measurement", "read:profile", "offline"];
function whoopConfig(env2) {
  return {
    authorizeUrl: "https://api.prod.whoop.com/oauth/oauth2/auth",
    tokenUrl: "https://api.prod.whoop.com/oauth/oauth2/token",
    clientId: env2.WHOOP_CLIENT_ID,
    clientSecret: env2.WHOOP_CLIENT_SECRET,
    redirectUri: env2.WHOOP_REDIRECT_URI,
    scopes: WHOOP_SCOPES,
    scopeSeparator: " "
  };
}

// src/collector/providers/strava.ts
function stravaConfig(env2) {
  return {
    authorizeUrl: "https://www.strava.com/oauth/authorize",
    tokenUrl: "https://www.strava.com/oauth/token",
    clientId: env2.STRAVA_CLIENT_ID,
    clientSecret: env2.STRAVA_CLIENT_SECRET,
    redirectUri: env2.STRAVA_REDIRECT_URI,
    scopes: ["read", "activity:read_all"],
    scopeSeparator: ",",
    extraAuthorizeParams: { approval_prompt: "auto" }
  };
}

// src/collector/providers/oura.ts
function ouraConfig(env2) {
  return {
    authorizeUrl: "https://cloud.ouraring.com/oauth/authorize",
    tokenUrl: "https://api.ouraring.com/oauth/token",
    clientId: env2.OURA_CLIENT_ID,
    clientSecret: env2.OURA_CLIENT_SECRET,
    redirectUri: env2.OURA_REDIRECT_URI,
    scopes: ["daily", "heartrate", "workout", "personal"],
    scopeSeparator: " "
  };
}

// server/_lib/tokens.ts
var PROVIDERS = ["whoop", "strava", "oura"];
function providerConfig(p) {
  const redirect = `${ENV.appUrl()}/api/oauth/${p}/callback`;
  switch (p) {
    case "whoop":
      return whoopConfig({ WHOOP_CLIENT_ID: process.env.WHOOP_CLIENT_ID, WHOOP_CLIENT_SECRET: process.env.WHOOP_CLIENT_SECRET, WHOOP_REDIRECT_URI: redirect });
    case "strava":
      return stravaConfig({ STRAVA_CLIENT_ID: process.env.STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET: process.env.STRAVA_CLIENT_SECRET, STRAVA_REDIRECT_URI: redirect });
    case "oura":
      return ouraConfig({ OURA_CLIENT_ID: process.env.OURA_CLIENT_ID, OURA_CLIENT_SECRET: process.env.OURA_CLIENT_SECRET, OURA_REDIRECT_URI: redirect });
  }
}
function providerConfigured(p) {
  const k = { whoop: "WHOOP_CLIENT_ID", strava: "STRAVA_CLIENT_ID", oura: "OURA_CLIENT_ID" }[p];
  return !!process.env[k];
}
function signState(userId) {
  const payload = `${userId}.${Date.now()}`;
  const sig = createHmac2("sha256", ENV.stateSecret()).update(payload).digest("base64url");
  return Buffer.from(`${payload}.${sig}`).toString("base64url");
}

// server/oauth/[provider]/start.ts
async function handler(req, res) {
  try {
    const u = await requireUser(req);
    const provider = q(req, "provider");
    if (!PROVIDERS.includes(provider)) throw new HttpError(404, "produc\u0103tor necunoscut");
    if (!providerConfigured(provider)) throw new HttpError(503, `${provider} nu e configurat pe server (lipsesc cheile aplica\u021Biei)`);
    json(res, 200, { url: authorizeUrl(providerConfig(provider), signState(u.id)) });
  } catch (e) {
    fail(res, e);
  }
}
export {
  handler as default
};
