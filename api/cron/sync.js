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
function bearer(req) {
  const h = req.headers.authorization;
  if (!h || !h.toLowerCase().startsWith("bearer ")) return null;
  return h.slice(7).trim();
}
function requireCron(req) {
  const token = bearer(req);
  if (!token || token !== ENV.cronSecret()) throw new HttpError(401, "cron neautorizat");
}
function todayIn(tz, now = /* @__PURE__ */ new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
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
    const rec = recoveries.find((r2) => r2.sleep_id === s.id) ?? null;
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
    const n = normalizeOuraNight(s, daily.data.find((d) => d.day === s.day) ?? null, readiness.data.find((r2) => r2.day === s.day) ?? null);
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

// src/util/dates.ts
var DAY_MS = 864e5;
function toUtc(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) throw new Error(`Dat\u0103 invalid\u0103: ${iso}`);
  return new Date(Date.UTC(y, m - 1, d));
}
function fromUtc(date) {
  return date.toISOString().slice(0, 10);
}
function addDays(iso, n) {
  return fromUtc(new Date(toUtc(iso).getTime() + n * DAY_MS));
}
function diffDays(a, b) {
  return Math.round((toUtc(b).getTime() - toUtc(a).getTime()) / DAY_MS);
}

// server/_lib/collect.ts
function toPlanned(r2) {
  return {
    id: r2.id,
    date: r2.date,
    sport: r2.sport,
    type: r2.type,
    plannedMinutes: r2.planned_minutes,
    targetZones: r2.target_zones,
    key: r2.is_key,
    step: r2.step ?? void 0,
    structure: r2.structure ?? void 0,
    intervals: r2.intervals ?? void 0,
    status: r2.status,
    note: r2.note ?? void 0
  };
}
function toSourceActivity(r2) {
  return {
    id: r2.id,
    externalId: r2.external_id,
    source: r2.source,
    date: r2.date,
    startLocal: r2.start_local,
    sport: r2.sport,
    minutes: r2.minutes,
    distanceKm: r2.distance_km,
    avgHr: r2.avg_hr,
    maxHr: r2.max_hr,
    avgPaceMinKm: r2.avg_pace_min_km,
    avgCadence: r2.avg_cadence,
    avgWatts: r2.avg_watts,
    timeInZonesMin: r2.time_in_zones_min ?? null,
    name: r2.name
  };
}
async function loadPlan(userId, from, to) {
  const plan = await one("plans", { user_id: `eq.${userId}`, active: "eq.true" }, { order: "version.desc" });
  if (!plan) return { planId: null, workouts: [] };
  const rows = await select("workouts_planned", { plan_id: `eq.${plan.id}`, date: [`gte.${from}`, `lte.${to}`] }, { order: "date.asc", limit: 500 });
  const workouts = rows.map(toPlanned);
  return { planId: plan.id, workouts };
}
async function loadActivities(userId, from) {
  const rows = await select("activities", { user_id: `eq.${userId}`, date: `gte.${from}` }, { order: "date.desc", limit: 500 });
  return rows.map(toSourceActivity);
}
async function loadForms(userId, today) {
  const morningRow = await one("questionnaires", { user_id: `eq.${userId}`, kind: "eq.dimineata", for_date: `eq.${today}` }, { order: "created_at.desc" });
  const eveningRows = await select("questionnaires", { user_id: `eq.${userId}`, kind: "eq.seara", for_date: `gte.${addDays(today, -14)}` }, { order: "created_at.desc", limit: 50 });
  const intakeRow = await one("questionnaires", { user_id: `eq.${userId}`, kind: "eq.intrare" }, { order: "created_at.desc" });
  return { morning: morningRow?.answers ?? null, evenings: eveningRows.map((r2) => r2.answers), intake: intakeRow?.answers ?? null };
}
async function loadZones(userId) {
  const z = await one("zones", { user_id: `eq.${userId}` });
  if (!z || z.source === "provizoriu") return null;
  const five = (a) => a && a.length === 5 ? a : null;
  return {
    alergare: { fc_z1_z5: five(z.run_hr_zones), pace_prag: z.run_threshold_pace_sec_km ? `${Math.floor(z.run_threshold_pace_sec_km / 60)}:${String(z.run_threshold_pace_sec_km % 60).padStart(2, "0")}` : null },
    bicicleta: { ftp: z.bike_ftp_w, fc_z1_z5: five(z.bike_hr_zones) },
    inot: { css: z.swim_css_sec_100m },
    fcmax_test: z.hr_max_test,
    data_test: z.tested_at
  };
}

// src/scoring/match.ts
var WINDOW_DAYS = 1;
function matchActivities(planned, activities, today) {
  const used = /* @__PURE__ */ new Set();
  const candidates = activities.filter((a) => diffDays(a.date, today) >= 0);
  const matches = [];
  const ordered = [...planned].filter((p) => p.status === "planificat" || p.status === "mutat").sort((a, b) => diffDays(b.date, a.date));
  for (const p of ordered) {
    const inWindow = (a) => {
      const d = diffDays(p.date, a.date);
      return d >= 0 && d <= WINDOW_DAYS && !used.has(a.id);
    };
    if (p.type === "brick") {
      const bike = pickClosest(candidates.filter((a) => a.sport === "bicicleta" && inWindow(a)), p.plannedMinutes * 0.75);
      let run = null;
      if (bike) {
        run = pickClosest(
          candidates.filter(
            (a) => a.sport === "alergare" && a.date === bike.date && !used.has(a.id) && a.afterBikeMinutes != null && a.afterBikeMinutes <= 30
          ),
          p.plannedMinutes * 0.25
        );
        used.add(bike.id);
        if (run) used.add(run.id);
      }
      matches.push({ planned: p, activity: bike, extraActivity: run });
      continue;
    }
    const best = pickClosest(candidates.filter((a) => a.sport === p.sport && inWindow(a)), p.plannedMinutes);
    if (best) used.add(best.id);
    matches.push({ planned: p, activity: best, extraActivity: null });
  }
  const unplanned = candidates.filter((a) => !used.has(a.id));
  return { matches, unplanned };
}
function pickClosest(list, targetMinutes) {
  if (list.length === 0) return null;
  return [...list].sort((a, b) => Math.abs(a.minutes - targetMinutes) - Math.abs(b.minutes - targetMinutes))[0] ?? null;
}

// src/scoring/score.ts
var EXPECTED_RPE = {
  odihna: 0,
  tehnica: 3,
  z2: 4,
  lung: 5,
  brick: 6,
  forta: 6,
  calitate: 7
};
function scoreWorkout(input) {
  const { planned, activity, extraActivity, questionnaire, systemCancelled, today } = input;
  const reasons = [];
  const empty = { durationPct: null, zonePct: null, rpeDelta: null, pain: null, cardiacDriftPct: null };
  const flags = { noQuestionnaire: !questionnaire, noZoneData: false, cardiacDrift: false, escalate: false };
  if (systemCancelled) {
    return { color: "gri", reasons: ["anulat de sistem"], metrics: empty, flags, final: true };
  }
  if (!activity) {
    const windowClosed = diffDays(addDays(planned.date, 1), today) > 0;
    if (windowClosed) {
      return { color: "rosu", reasons: ["nicio activitate potrivit\u0103 p\xE2n\u0103 la finalul zilei urm\u0103toare"], metrics: empty, flags, final: true };
    }
    return { color: "asteptare", reasons: [`fereastra se \xEEnchide la finalul zilei de ${addDays(planned.date, 1)}`], metrics: empty, flags, final: false };
  }
  const minutes = activity.minutes + (extraActivity?.minutes ?? 0);
  const durationPct = planned.plannedMinutes > 0 ? round1(minutes / planned.plannedMinutes * 100) : null;
  const zonePct = computeZonePct(planned, activity, extraActivity ?? null);
  if (zonePct == null) flags.noZoneData = true;
  const rpe = questionnaire?.rpe ?? null;
  const rpeDelta = rpe == null ? null : rpe - EXPECTED_RPE[planned.type];
  const pain = questionnaire?.painScore ?? null;
  const cardiacDriftPct = computeDrift(activity);
  if (cardiacDriftPct != null && cardiacDriftPct > 8) flags.cardiacDrift = true;
  const metrics = { durationPct, zonePct, rpeDelta, pain, cardiacDriftPct };
  if (durationPct != null && durationPct < 50) {
    reasons.push(`durat\u0103 ${durationPct}% din plan (sub 50%)`);
    return { color: "rosu", reasons, metrics, flags, final: isFinal(flags, planned, today) };
  }
  let level = 0;
  const bump = (to, why) => {
    reasons.push(why);
    if (to > level) level = to;
  };
  if (durationPct != null) {
    if (durationPct < 75) bump(2, `durat\u0103 ${durationPct}% din plan (50\u201375%)`);
    else if (durationPct < 90) bump(1, `durat\u0103 ${durationPct}% din plan (75\u201390%)`);
    else if (durationPct > 115) bump(1, `durat\u0103 ${durationPct}% din plan (peste 115%)`);
  }
  if (zonePct != null) {
    if (zonePct < 50) bump(2, `timp \xEEn zona-\u021Bint\u0103 ${zonePct}% (sub 50%)`);
    else if (zonePct < 75) bump(1, `timp \xEEn zona-\u021Bint\u0103 ${zonePct}% (50\u201375%)`);
  } else {
    reasons.push("f\u0103r\u0103 date de zone: criteriul de zon\u0103 nu s-a aplicat");
  }
  if (rpeDelta != null) {
    if (rpeDelta >= 3) bump(2, `RPE cu +${rpeDelta} peste a\u0219teptat`);
    else if (rpeDelta === 2) bump(1, "RPE cu +2 peste a\u0219teptat");
  }
  if (pain != null) {
    if (pain >= 5) {
      flags.escalate = true;
      bump(2, `durere ${pain}/10: escaladare la fizioterapeut`);
    } else if (pain >= 3) bump(2, `durere ${pain}/10`);
  }
  if (activity.mainSetAbandoned) bump(2, "set principal abandonat");
  else if ((activity.intervalsAbandoned ?? 0) >= 1) bump(1, `${activity.intervalsAbandoned} interval(e) abandonat(e)`);
  if (flags.cardiacDrift) bump(1, `deriva\u021Bie cardiac\u0103 ${cardiacDriftPct}% (peste 8%)`);
  const color = level === 0 ? "verde" : level === 1 ? "galben" : "portocaliu";
  if (color === "verde") reasons.unshift("durat\u0103, zone \u0219i RPE \xEEn \u021Bint\u0103");
  if (flags.noQuestionnaire) reasons.push("f\u0103r\u0103 chestionar: RPE \u0219i durerea lipsesc");
  return { color, reasons, metrics, flags, final: isFinal(flags, planned, today) };
}
function isFinal(flags, planned, today) {
  if (!flags.noQuestionnaire) return true;
  return diffDays(addDays(planned.date, 1), today) > 0;
}
function computeZonePct(planned, activity, extra) {
  if (planned.type === "calitate" && activity.intervalsHitPct != null) return round1(activity.intervalsHitPct);
  const parts = [activity, extra].filter((a) => !!a && !!a.timeInZonesMin);
  if (parts.length === 0) return null;
  let inTarget = 0;
  let total = 0;
  for (const a of parts) {
    const zones = a.timeInZonesMin;
    for (const z of [1, 2, 3, 4, 5]) {
      const m = zones[z] ?? 0;
      total += m;
      if (planned.targetZones.includes(z)) inTarget += m;
    }
  }
  if (total === 0) return null;
  return round1(inTarget / total * 100);
}
function computeDrift(a) {
  if (a.firstThirdHr == null || a.lastThirdHr == null || a.firstThirdHr <= 0) return null;
  if (a.firstThirdOutput != null && a.lastThirdOutput != null && a.firstThirdOutput > 0) {
    const outputChange = Math.abs(a.lastThirdOutput / a.firstThirdOutput - 1);
    if (outputChange > 0.03) return null;
  }
  return round1((a.lastThirdHr / a.firstThirdHr - 1) * 100);
}
function round1(n) {
  return Math.round(n * 10) / 10;
}

// src/bar/bar.ts
var WINDOW_DAYS2 = 42;
var CSS_TARGET_SEC = 150;
var TARGETS = {
  "70.3": { swimM: 1900, rideKm: 90, runKm: 18, brickRunKm: 8 },
  olimpic: { swimM: 1500, rideKm: 40, runKm: 10, brickRunKm: 4 },
  sprint: { swimM: 750, rideKm: 20, runKm: 5, brickRunKm: 2 }
};
function computeBar(input) {
  const t = TARGETS[input.goal];
  const recent = input.activities.filter(
    (a) => diffDays(a.date, input.today) >= 0 && diffDays(a.date, input.today) <= WINDOW_DAYS2 && (a.color === "verde" || a.color === "galben")
  );
  const components = [];
  {
    const swims = recent.filter((a) => a.sport === "inot" && a.distanceKm != null && a.distanceKm > 0);
    const best = maxBy(swims, (a) => a.distanceKm);
    if (!best) {
      components.push({ name: "inot", weight: 0.2, value: null, detail: "f\u0103r\u0103 \xEEnot cu distan\u021B\u0103 \xEEn ultimele 6 s\u0103pt\u0103m\xE2ni", evidence: [] });
    } else {
      const dist = Math.min(1, best.distanceKm * 1e3 / t.swimM);
      let value;
      let detail = `cel mai lung \xEEnot: ${Math.round(best.distanceKm * 1e3)} m din ${t.swimM} m`;
      if (input.cssSecPer100m && input.cssSecPer100m > 0) {
        const pace = Math.min(1, CSS_TARGET_SEC / input.cssSecPer100m);
        value = 100 * (0.7 * dist + 0.3 * pace);
        detail += `; CSS ${fmtPace(input.cssSecPer100m)} fa\u021B\u0103 de ${fmtPace(CSS_TARGET_SEC)}`;
      } else {
        value = 100 * dist;
        detail += "; f\u0103r\u0103 CSS (doar distan\u021Ba)";
      }
      components.push({ name: "inot", weight: 0.2, value: r(value), detail, evidence: [{ activityId: best.id, date: best.date, label: `${Math.round(best.distanceKm * 1e3)} m` }] });
    }
  }
  {
    const rides = recent.filter((a) => a.sport === "bicicleta" && a.distanceKm != null && a.distanceKm > 0);
    const best = maxBy(rides, (a) => a.distanceKm);
    const brick = recent.find((a) => a.sport === "alergare" && a.afterBikeMinutes != null && a.afterBikeMinutes <= 30 && a.minutes >= 20);
    if (!best) {
      components.push({ name: "bicicleta", weight: 0.25, value: null, detail: "f\u0103r\u0103 tur\u0103 cu distan\u021B\u0103 \xEEn ultimele 6 s\u0103pt\u0103m\xE2ni", evidence: [] });
    } else {
      const dist = Math.min(1, best.distanceKm / t.rideKm);
      const value = 100 * (0.6 * dist + 0.4 * (brick ? 1 : 0));
      const evidence = [{ activityId: best.id, date: best.date, label: `${r(best.distanceKm)} km` }];
      if (brick) evidence.push({ activityId: brick.id, date: brick.date, label: `brick ${brick.minutes} min, ${brick.color}` });
      components.push({
        name: "bicicleta",
        weight: 0.25,
        value: r(value),
        detail: `cea mai lung\u0103 tur\u0103: ${r(best.distanceKm)} km din ${t.rideKm}; brick dup\u0103 tur\u0103: ${brick ? "da" : "nu"}`,
        evidence
      });
    }
  }
  {
    const runs = recent.filter((a) => a.sport === "alergare" && a.distanceKm != null && a.distanceKm > 0);
    const best = maxBy(runs, (a) => a.distanceKm);
    const bestBrick = maxBy(runs.filter((a) => a.afterBikeMinutes != null && a.afterBikeMinutes <= 30), (a) => a.distanceKm);
    if (!best) {
      components.push({ name: "alergare", weight: 0.25, value: null, detail: "f\u0103r\u0103 alergare cu distan\u021B\u0103 \xEEn ultimele 6 s\u0103pt\u0103m\xE2ni", evidence: [] });
    } else {
      const dist = Math.min(1, best.distanceKm / t.runKm);
      const brickDist = bestBrick ? Math.min(1, bestBrick.distanceKm / t.brickRunKm) : 0;
      const value = 100 * (0.6 * dist + 0.4 * brickDist);
      const evidence = [{ activityId: best.id, date: best.date, label: `${r(best.distanceKm)} km` }];
      if (bestBrick) evidence.push({ activityId: bestBrick.id, date: bestBrick.date, label: `${r(bestBrick.distanceKm)} km dup\u0103 biciclet\u0103` });
      components.push({
        name: "alergare",
        weight: 0.25,
        value: r(value),
        detail: `cea mai lung\u0103 alergare: ${r(best.distanceKm)} km din ${t.runKm}; dup\u0103 biciclet\u0103: ${bestBrick ? `${r(bestBrick.distanceKm)} km din ${t.brickRunKm}` : "niciuna"}`,
        evidence
      });
    }
  }
  {
    const counted = input.plannedColorsLast4Weeks.filter((c) => c !== "gri" && c !== "asteptare" && c !== "albastru");
    if (counted.length === 0) {
      components.push({ name: "consistenta", weight: 0.15, value: null, detail: "f\u0103r\u0103 antrenamente scorate \xEEn ultimele 4 s\u0103pt\u0103m\xE2ni", evidence: [] });
    } else {
      const good = counted.filter((c) => c === "verde" || c === "galben").length;
      components.push({
        name: "consistenta",
        weight: 0.15,
        value: r(100 * good / counted.length),
        detail: `${good} din ${counted.length} antrenamente planificate executate (verde sau galben)`,
        evidence: []
      });
    }
  }
  {
    if (input.ctl == null || input.ctlTarget == null || input.ctlTarget <= 0) {
      components.push({ name: "forma", weight: 0.15, value: null, detail: "f\u0103r\u0103 CTL sau f\u0103r\u0103 \u021Bint\u0103 de faz\u0103", evidence: [] });
    } else {
      components.push({
        name: "forma",
        weight: 0.15,
        value: r(100 * Math.min(1, input.ctl / input.ctlTarget)),
        detail: `CTL ${r(input.ctl)} din \u021Binta ${r(input.ctlTarget)}`,
        evidence: []
      });
    }
  }
  const withData = components.filter((c) => c.value != null);
  const basis = `pe baza a ${withData.length} din ${components.length} componente`;
  if (input.openFlags.length > 0) {
    return { blocked: input.openFlags.join("; "), total: null, basis, components };
  }
  if (withData.length === 0) return { blocked: null, total: null, basis, components };
  const wsum = withData.reduce((s, c) => s + c.weight, 0);
  const total = withData.reduce((s, c) => s + c.value * c.weight / wsum, 0);
  return { blocked: null, total: r(total), basis, components };
}
function maxBy(list, f) {
  let best = null;
  let bv = -Infinity;
  for (const x of list) {
    const v = f(x);
    if (v > bv) {
      bv = v;
      best = x;
    }
  }
  return best;
}
function fmtPace(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}/100 m`;
}
function r(n) {
  return Math.round(n * 10) / 10;
}

// src/collector/packet.ts
function dedupeActivities(acts) {
  const kept = [];
  const sorted = [...acts].sort((a, b) => diffDays(b.date, a.date));
  for (const a of sorted) {
    const dup = kept.find((k) => k.date === a.date && k.sport === a.sport && Math.abs(k.minutes - a.minutes) <= 3 && (k.distanceKm == null || a.distanceKm == null || Math.abs(k.distanceKm - a.distanceKm) < 0.3));
    if (!dup) {
      kept.push(a);
      continue;
    }
    const fields = (x) => Object.values(x).filter((v) => v != null).length;
    if (fields(a) > fields(dup)) kept[kept.indexOf(dup)] = a;
  }
  return kept;
}

// server/_lib/score.ts
function toQuestionnaire(e) {
  if (!e) return null;
  return { rpe: e.rpe, vsExpected: e.fata_de_asteptari, painScore: e.durere.scor, painLoc: e.durere.loc, whatInterfered: e.ce_a_incurcat, fuelingOk: e.fueling_conform, comment: e.comentariu };
}
async function rescore(userId, today, goal) {
  const from = addDays(today, -42);
  const [{ workouts }, acts, forms, zones] = await Promise.all([loadPlan(userId, from, today), loadActivities(userId, from), loadForms(userId, today), loadZones(userId)]);
  const activities = dedupeActivities(acts);
  const planned = workouts.filter((w) => w.status !== "sters");
  const { matches, unplanned } = matchActivities(planned, activities, today);
  const colors = /* @__PURE__ */ new Map();
  const rows = matches.map((m) => {
    const evening = forms.evenings.find((e) => e.activityId && m.activity && (e.activityId === m.activity.id || e.activityId === m.activity.externalId)) ?? forms.evenings.find((e) => e.date === m.planned.date);
    const r2 = scoreWorkout({ planned: m.planned, activity: m.activity, extraActivity: m.extraActivity, questionnaire: toQuestionnaire(evening), systemCancelled: m.planned.status === "anulat_sistem", today });
    colors.set(m.planned.id, r2.color);
    return {
      workout_id: m.planned.id,
      user_id: userId,
      activity_id: m.activity?.id ?? null,
      extra_activity_id: m.extraActivity?.id ?? null,
      color: r2.color,
      reasons: r2.reasons,
      metrics: r2.metrics,
      flags: r2.flags,
      is_final: r2.final,
      scored_at: (/* @__PURE__ */ new Date()).toISOString()
    };
  });
  if (rows.length) await upsert("scores", rows, "workout_id");
  const activityColor = /* @__PURE__ */ new Map();
  for (const m of matches) {
    if (m.activity) activityColor.set(m.activity.id, colors.get(m.planned.id) ?? "asteptare");
    if (m.extraActivity) activityColor.set(m.extraActivity.id, colors.get(m.planned.id) ?? "asteptare");
  }
  const scored = activities.map((a) => ({ ...a, color: activityColor.get(a.id) ?? "albastru" }));
  const last4 = planned.filter((w) => w.date >= addDays(today, -28) && w.date < today).map((w) => colors.get(w.id) ?? "rosu");
  const openFlags = await openFlagsFor(userId, today);
  const bar = computeBar({ today, activities: scored, plannedColorsLast4Weeks: last4, cssSecPer100m: zones?.inot.css ?? null, ctl: null, ctlTarget: null, openFlags, goal });
  await upsert("bar_daily", { user_id: userId, date: today, total: bar.total, blocked: bar.blocked, basis: bar.basis, components: bar.components }, "user_id,date");
  return { scored: rows.length, unplanned: unplanned.map((a) => a.id), bar };
}
async function openFlagsFor(userId, today) {
  const flags = [];
  const evenings = await select("questionnaires", { user_id: `eq.${userId}`, kind: "eq.seara", for_date: `gte.${addDays(today, -7)}` }, { limit: 50 });
  if (evenings.some((e) => (e.answers.durere.scor ?? 0) >= 5)) flags.push("durere \u2265 5 \xEEn ultimele 7 zile, de v\u0103zut de fizioterapeut");
  const morning = await select("questionnaires", { user_id: `eq.${userId}`, kind: "eq.dimineata", for_date: `eq.${today}` }, { limit: 1 });
  if (morning[0]?.answers.semnale.febra) flags.push("febr\u0103 azi");
  return flags;
}

// server/cron/sync.ts
async function handler(req, res) {
  try {
    requireCron(req);
    const users = await select("users", {}, { select: "id,tz,goal,consents(health_data)" });
    const done = {};
    for (const u of users) {
      if (!u.consents?.health_data) continue;
      const reports = await syncUser(u.id, 3);
      if (reports.length) await rescore(u.id, todayIn(u.tz), u.goal && u.goal !== "full" ? u.goal : "70.3");
      done[u.id] = reports.map((r2) => `${r2.provider}:${r2.ok ? r2.rows : "eroare"}`);
    }
    json(res, 200, { ok: true, done });
  } catch (e) {
    fail(res, e);
  }
}
export {
  handler as default
};
