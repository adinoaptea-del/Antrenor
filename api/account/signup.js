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
async function readJson(req) {
  if (req.body !== void 0 && req.body !== null && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body);
  const chunks = [];
  for await (const c of req) chunks.push(typeof c === "string" ? Buffer.from(c) : c);
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
}

// server/_lib/db.ts
function headers(extra = {}) {
  return { ...supabaseKeyHeaders(ENV.supabaseService()), "content-type": "application/json", ...extra };
}
async function call(method, path, body, extra = {}) {
  const res = await fetch(`${ENV.supabaseUrl()}/rest/v1/${path}`, { method, headers: headers(extra), body: body === void 0 ? void 0 : JSON.stringify(body) });
  if (!res.ok) throw new Error(`db ${method} ${path} \u2192 ${res.status}: ${await res.text()}`);
  if (res.status === 204) return void 0;
  const text = await res.text();
  return text ? JSON.parse(text) : void 0;
}
function params(filters, base = {}) {
  const q = new URLSearchParams(base);
  for (const [k, v] of Object.entries(filters)) for (const x of Array.isArray(v) ? v : [v]) q.append(k, x);
  return q;
}
async function select(table, filters, opts = {}) {
  const q = params(filters, { select: opts.select ?? "*" });
  if (opts.order) q.set("order", opts.order);
  if (opts.limit) q.set("limit", String(opts.limit));
  return call("GET", `${table}?${q.toString()}`);
}
async function update(table, filters, patch) {
  const q = params(filters);
  await call("PATCH", `${table}?${q.toString()}`, patch, { prefer: "return=minimal" });
}

// server/account/signup.ts
async function handler(req, res) {
  try {
    if (req.method !== "POST") throw new HttpError(405, "POST");
    const body = await readJson(req);
    const email = (body.email ?? "").trim().toLowerCase();
    const password = body.password ?? "";
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(400, "adresa de e-mail nu pare valid\u0103");
    if (password.length < 8) throw new HttpError(400, "parola: minimum 8 caractere");
    const existing = await select("users", {}, { select: "id" });
    if (existing.length >= ENV.maxUsers()) throw new HttpError(403, `s-au ocupat toate cele ${ENV.maxUsers()} locuri`);
    const r = await fetch(`${ENV.supabaseUrl()}/auth/v1/admin/users`, {
      method: "POST",
      headers: { ...supabaseKeyHeaders(ENV.supabaseService()), "content-type": "application/json" },
      body: JSON.stringify({ email, password, email_confirm: true })
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const exists = r.status === 422 || /already/i.test(j.msg ?? j.message ?? "");
      throw new HttpError(exists ? 409 : 400, exists ? "exist\u0103 deja un cont cu adresa asta: intr\u0103 cu parola" : j.msg ?? j.message ?? `eroare ${r.status}`);
    }
    if (existing.length === 0 && j.id) await update("users", { id: `eq.${j.id}` }, { role: "admin" });
    json(res, 200, { ok: true, admin: existing.length === 0 });
  } catch (e) {
    fail(res, e);
  }
}
export {
  handler as default
};
