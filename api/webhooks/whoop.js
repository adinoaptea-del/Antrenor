// GENERAT din server/ cu scripts/bundle-api.mjs — nu edita de mână.
import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);

// server/webhooks/whoop.ts
import { createHmac as createHmac2, timingSafeEqual } from "node:crypto";

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
async function one(table, filters, opts = {}) {
  const rows = await select(table, filters, { ...opts, limit: 1 });
  return rows[0] ?? null;
}
async function insert(table, rows) {
  return call("POST", table, Array.isArray(rows) ? rows : [rows], { prefer: "return=representation" });
}
async function upsert(table, rows, onConflict) {
  const list = Array.isArray(rows) ? rows : [rows];
  if (list.length === 0) return [];
  return call("POST", `${table}?on_conflict=${encodeURIComponent(onConflict)}`, list, { prefer: "resolution=merge-duplicates,return=representation" });
}

// src/collector/providers/oauth.ts
async function tokenRequest(cfg, body) {
  const res = await fetch(cfg.tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: cfg.clientId, client_secret: cfg.clientSecret, ...body }).toString()
  });
  if (!res.ok) throw new Error(`token ${res.status}: ${await res.text()}`);
  const j = await res.json();
  return {
    accessToken: j.access_token,
    refreshToken: j.refresh_token ?? null,
    expiresAt: j.expires_at ? j.expires_at * 1e3 : Date.now() + (j.expires_in ?? 3600) * 1e3,
    scope: j.scope,
    externalUserId: j.athlete ? String(j.athlete.id) : void 0
  };
}
function refresh(cfg, refreshToken, extra = {}) {
  return tokenRequest(cfg, { grant_type: "refresh_token", refresh_token: refreshToken, ...extra });
}
async function getJson(url, accessToken2) {
  const res = await fetch(url, { headers: { authorization: `Bearer ${accessToken2}` } });
  if (res.status === 429) throw new Error("rate limit (429): re\xEEncearc\u0103 dup\u0103 fereastra produc\u0103torului");
  if (!res.ok) throw new Error(`${url} \u2192 ${res.status}: ${await res.text()}`);
  return await res.json();
}
function localHm(iso, tzOffset) {
  const sign = tzOffset.startsWith("-") ? -1 : 1;
  const [h, m] = tzOffset.slice(1).split(":").map(Number);
  const t = new Date(iso).getTime() + sign * ((h ?? 0) * 60 + (m ?? 0)) * 6e4;
  const d = new Date(t);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}
function localDate(iso, tzOffset) {
  const sign = tzOffset.startsWith("-") ? -1 : 1;
  const [h, m] = tzOffset.slice(1).split(":").map(Number);
  const t = new Date(iso).getTime() + sign * ((h ?? 0) * 60 + (m ?? 0)) * 6e4;
  return new Date(t).toISOString().slice(0, 10);
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
var BASE = "https://api.prod.whoop.com/developer/v2";
async function pageAll(path, token, start, end) {
  const out = [];
  let next;
  do {
    const u = new URL(`${BASE}${path}`);
    u.searchParams.set("start", `${start}T00:00:00.000Z`);
    u.searchParams.set("end", `${end}T23:59:59.999Z`);
    u.searchParams.set("limit", "25");
    if (next) u.searchParams.set("nextToken", next);
    const page = await getJson(u.toString(), token);
    out.push(...page.records);
    next = page.next_token;
  } while (next);
  return out;
}
var whoopApi = {
  recovery: (token, start, end) => pageAll("/recovery", token, start, end),
  sleep: (token, start, end) => pageAll("/activity/sleep", token, start, end),
  workouts: (token, start, end) => pageAll("/activity/workout", token, start, end),
  body: (token) => getJson(`${BASE}/user/measurement/body`, token),
  profile: (token) => getJson(`${BASE}/user/profile/basic`, token)
};
function normalizeWhoopNight(sleep, recovery) {
  if (sleep.nap || sleep.score_state !== "SCORED" || !sleep.score) return null;
  const s = sleep.score.stage_summary;
  const asleepMin = Math.round((s.total_in_bed_time_milli - s.total_awake_time_milli) / 6e4);
  return {
    date: localDate(sleep.end, sleep.timezone_offset),
    source: "whoop",
    sleepMin: asleepMin,
    bedtime: localHm(sleep.start, sleep.timezone_offset),
    wakeTime: localHm(sleep.end, sleep.timezone_offset),
    sleepScore: sleep.score.sleep_performance_percentage ?? null,
    respiratoryRate: sleep.score.respiratory_rate ?? null,
    hrv: recovery?.score ? Math.round(recovery.score.hrv_rmssd_milli * 10) / 10 : null,
    rhr: recovery?.score ? recovery.score.resting_heart_rate : null,
    recoveryScore: recovery?.score ? recovery.score.recovery_score : null
  };
}
var WHOOP_SPORT = {
  running: "alergare",
  cycling: "bicicleta",
  swimming: "inot",
  weightlifting: "forta",
  functional_fitness: "forta",
  "functional fitness": "forta",
  activity: null,
  walking: null,
  hiking: null
};
function normalizeWhoopWorkout(w) {
  if (w.score_state !== "SCORED" || !w.score) return null;
  const sport = WHOOP_SPORT[w.sport_name.toLowerCase()];
  if (!sport) return null;
  const minutes = Math.round((new Date(w.end).getTime() - new Date(w.start).getTime()) / 6e4);
  const z = w.score.zone_durations;
  return {
    id: `whoop-${w.id}`,
    externalId: w.id,
    source: "whoop",
    date: localDate(w.start, w.timezone_offset),
    startLocal: localHm(w.start, w.timezone_offset),
    sport,
    minutes,
    distanceKm: w.score.distance_meter != null ? Math.round(w.score.distance_meter / 1e3 * 10) / 10 : null,
    avgHr: w.score.average_heart_rate,
    maxHr: w.score.max_heart_rate,
    // Zonele Whoop sunt ale Whoop (% din FCmax), nu ale sportivului: le păstrăm doar ca referință brută, nu ca timeInZonesMin.
    timeInZonesMin: null,
    name: z ? `whoop ${w.sport_name}; z1\u2013z5 (min): ${[z.zone_one_milli, z.zone_two_milli, z.zone_three_milli, z.zone_four_milli, z.zone_five_milli].map((ms) => Math.round(ms / 6e4)).join("/")}` : `whoop ${w.sport_name}`
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
var STRAVA_SPORT = {
  Run: "alergare",
  TrailRun: "alergare",
  VirtualRun: "alergare",
  Ride: "bicicleta",
  VirtualRide: "bicicleta",
  GravelRide: "bicicleta",
  MountainBikeRide: "bicicleta",
  Swim: "inot",
  WeightTraining: "forta",
  Workout: "forta",
  Crossfit: "forta",
  Walk: null,
  Hike: null
};
async function listActivities(token, afterEpochSec, beforeEpochSec) {
  const out = [];
  for (let page = 1; page <= 10; page++) {
    const u = new URL("https://www.strava.com/api/v3/athlete/activities");
    u.searchParams.set("after", String(afterEpochSec));
    u.searchParams.set("before", String(beforeEpochSec));
    u.searchParams.set("per_page", "100");
    u.searchParams.set("page", String(page));
    const rows = await getJson(u.toString(), token);
    out.push(...rows);
    if (rows.length < 100) break;
  }
  return out;
}
function normalizeStravaActivity(a) {
  const sport = STRAVA_SPORT[a.sport_type];
  if (!sport) return null;
  const minutes = Math.round(a.moving_time / 60);
  const km = a.distance > 0 ? Math.round(a.distance / 1e3 * 10) / 10 : null;
  return {
    id: `strava-${a.id}`,
    externalId: String(a.id),
    source: "strava",
    date: a.start_date_local.slice(0, 10),
    startLocal: a.start_date_local.slice(11, 16),
    sport,
    minutes,
    distanceKm: km,
    avgHr: a.average_heartrate != null ? Math.round(a.average_heartrate) : null,
    maxHr: a.max_heartrate != null ? Math.round(a.max_heartrate) : null,
    avgPaceMinKm: km && sport === "alergare" ? Math.round(minutes / km * 100) / 100 : null,
    avgCadence: a.average_cadence != null ? Math.round(sport === "alergare" ? a.average_cadence * 2 : a.average_cadence) : null,
    avgWatts: a.average_watts != null ? Math.round(a.average_watts) : null,
    timeInZonesMin: null,
    // se calculează din stream-ul de FC cu zonele sportivului, nu din Strava
    name: `${a.name}${a.device_name ? ` \xB7 ${a.device_name}` : ""}`
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
var BASE2 = "https://api.ouraring.com/v2/usercollection";
var ouraApi = {
  sleep: (token, start, end) => getJson(`${BASE2}/sleep?start_date=${start}&end_date=${end}`, token),
  dailySleep: (token, start, end) => getJson(`${BASE2}/daily_sleep?start_date=${start}&end_date=${end}`, token),
  dailyReadiness: (token, start, end) => getJson(`${BASE2}/daily_readiness?start_date=${start}&end_date=${end}`, token)
};
function normalizeOuraNight(sleep, dailySleep, readiness) {
  if (sleep.type !== "long_sleep") return null;
  return {
    date: sleep.day,
    source: "oura",
    sleepMin: Math.round(sleep.total_sleep_duration / 60),
    bedtime: sleep.bedtime_start.slice(11, 16),
    wakeTime: sleep.bedtime_end.slice(11, 16),
    hrv: sleep.average_hrv ?? null,
    rhr: sleep.lowest_heart_rate ?? null,
    sleepScore: dailySleep?.score ?? null,
    recoveryScore: readiness?.score ?? null,
    respiratoryRate: sleep.average_breath ?? null
  };
}

// server/_lib/tokens.ts
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
async function saveTokens(userId, provider, t) {
  await upsert(
    "oauth_tokens",
    {
      user_id: userId,
      provider,
      access_token: t.accessToken,
      refresh_token: t.refreshToken,
      expires_at: new Date(t.expiresAt).toISOString(),
      scope: t.scope ?? null,
      external_user_id: t.externalUserId ?? null,
      updated_at: (/* @__PURE__ */ new Date()).toISOString()
    },
    "user_id,provider"
  );
}
async function accessToken(userId, provider) {
  const row = await one("oauth_tokens", { user_id: `eq.${userId}`, provider: `eq.${provider}` });
  if (!row) return null;
  const expiresAt = new Date(row.expires_at).getTime();
  if (expiresAt - Date.now() > 5 * 6e4) return row.access_token;
  if (!row.refresh_token) return row.access_token;
  const t = await refresh(providerConfig(provider), row.refresh_token);
  await saveTokens(userId, provider, { ...t, refreshToken: t.refreshToken ?? row.refresh_token, externalUserId: t.externalUserId ?? row.external_user_id ?? void 0 });
  return t.accessToken;
}
async function connectedProviders(userId) {
  return select("oauth_tokens", { user_id: `eq.${userId}` });
}

// server/_lib/sync.ts
function isoDay(d) {
  return d.toISOString().slice(0, 10);
}
async function pullWhoop(userId, token, days) {
  const end = /* @__PURE__ */ new Date();
  const start = new Date(end.getTime() - days * 864e5);
  const [recoveries, sleeps, workouts] = await Promise.all([whoopApi.recovery(token, isoDay(start), isoDay(end)), whoopApi.sleep(token, isoDay(start), isoDay(end)), whoopApi.workouts(token, isoDay(start), isoDay(end))]);
  const wellness = [];
  for (const s of sleeps) {
    const rec = recoveries.find((r) => r.sleep_id === s.id) ?? null;
    const n = normalizeWhoopNight(s, rec);
    if (n) wellness.push(n);
  }
  const activities = workouts.map(normalizeWhoopWorkout).filter((a) => a != null);
  void userId;
  return { wellness, activities };
}
async function pullStrava(token, days) {
  const now = Math.floor(Date.now() / 1e3);
  const rows = await listActivities(token, now - days * 86400, now + 3600);
  return rows.map(normalizeStravaActivity).filter((a) => a != null);
}
async function pullOura(token, days) {
  const end = /* @__PURE__ */ new Date();
  const start = new Date(end.getTime() - days * 864e5);
  const [sleep, daily, readiness] = await Promise.all([ouraApi.sleep(token, isoDay(start), isoDay(end)), ouraApi.dailySleep(token, isoDay(start), isoDay(end)), ouraApi.dailyReadiness(token, isoDay(start), isoDay(end))]);
  const out = [];
  for (const s of sleep.data) {
    const n = normalizeOuraNight(s, daily.data.find((d) => d.day === s.day) ?? null, readiness.data.find((r) => r.day === s.day) ?? null);
    if (n) out.push(n);
  }
  return out;
}
function wellnessRow(userId, w) {
  return {
    user_id: userId,
    date: w.date,
    source: w.source,
    hrv: w.hrv ?? null,
    rhr: w.rhr ?? null,
    sleep_min: w.sleepMin ?? null,
    bedtime: w.bedtime ?? null,
    wake_time: w.wakeTime ?? null,
    sleep_score: w.sleepScore ?? null,
    recovery_score: w.recoveryScore ?? null,
    respiratory_rate: w.respiratoryRate ?? null,
    weight_kg: w.weightKg ?? null,
    body_fat_pct: w.bodyFatPct ?? null,
    synced_at: (/* @__PURE__ */ new Date()).toISOString()
  };
}
function activityRow(userId, a) {
  return {
    id: a.id,
    user_id: userId,
    source: a.source,
    external_id: a.externalId,
    date: a.date,
    start_local: a.startLocal ?? null,
    sport: a.sport,
    minutes: a.minutes,
    distance_km: a.distanceKm ?? null,
    avg_hr: a.avgHr ?? null,
    max_hr: a.maxHr ?? null,
    avg_pace_min_km: a.avgPaceMinKm ?? null,
    avg_cadence: a.avgCadence ?? null,
    avg_watts: a.avgWatts ?? null,
    time_in_zones_min: a.timeInZonesMin ?? null,
    name: a.name ?? null,
    synced_at: (/* @__PURE__ */ new Date()).toISOString()
  };
}
async function syncUser(userId, days = 3) {
  const connected = await connectedProviders(userId);
  const reports = [];
  for (const row of connected) {
    const provider = row.provider;
    try {
      const token = await accessToken(userId, provider);
      if (!token) throw new Error("f\u0103r\u0103 token");
      let rows = 0;
      if (provider === "whoop") {
        const { wellness, activities } = await pullWhoop(userId, token, days);
        if (wellness.length) await upsert("wellness_daily", wellness.map((w) => wellnessRow(userId, w)), "user_id,date,source");
        if (activities.length) await upsert("activities", activities.map((a) => activityRow(userId, a)), "id");
        rows = wellness.length + activities.length;
      } else if (provider === "strava") {
        const activities = await pullStrava(token, days);
        if (activities.length) await upsert("activities", activities.map((a) => activityRow(userId, a)), "id");
        rows = activities.length;
      } else if (provider === "oura") {
        const wellness = await pullOura(token, days);
        if (wellness.length) await upsert("wellness_daily", wellness.map((w) => wellnessRow(userId, w)), "user_id,date,source");
        rows = wellness.length;
      }
      reports.push({ provider, ok: true, rows, detail: null });
      await insert("sync_log", { user_id: userId, provider, ok: true, rows, detail: null });
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      reports.push({ provider, ok: false, rows: 0, detail });
      await insert("sync_log", { user_id: userId, provider, ok: false, rows: 0, detail: detail.slice(0, 500) }).catch(() => void 0);
    }
  }
  return reports;
}

// server/webhooks/whoop.ts
async function handler(req, res) {
  try {
    const chunks = [];
    for await (const c of req) chunks.push(typeof c === "string" ? Buffer.from(c) : c);
    const raw = Buffer.concat(chunks).toString("utf8");
    const sig = String(req.headers["x-whoop-signature"] ?? "");
    const ts = String(req.headers["x-whoop-signature-timestamp"] ?? "");
    const expected = createHmac2("sha256", process.env.WHOOP_CLIENT_SECRET ?? "").update(ts + raw).digest("base64");
    if (!sig || sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
      json(res, 401, { error: "semn\u0103tur\u0103 invalid\u0103" });
      return;
    }
    const ev = JSON.parse(raw);
    const row = await one("oauth_tokens", { provider: "eq.whoop", external_user_id: `eq.${ev.user_id}` });
    if (row) await syncUser(row.user_id, 3);
    json(res, 200, { ok: true });
  } catch (e) {
    void readJson;
    fail(res, e);
  }
}
export {
  handler as default
};
