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
  for (const n2 of names) {
    const v = process.env[n2];
    if (v) return v.trim();
  }
  for (const n2 of names) {
    const k = Object.keys(process.env).find((key2) => key2.endsWith(`_${n2}`) && process.env[key2]);
    if (k) return process.env[k].trim();
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
function supabaseKeyHeaders(key2) {
  return key2.startsWith("sb_") ? { apikey: key2 } : { apikey: key2, authorization: `Bearer ${key2}` };
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
async function requireUser(req) {
  const token = bearer(req);
  if (!token) throw new HttpError(401, "f\u0103r\u0103 token");
  const res = await fetch(`${ENV.supabaseUrl()}/auth/v1/user`, { headers: { apikey: ENV.supabaseAnon(), authorization: `Bearer ${token}` } });
  if (!res.ok) throw new HttpError(401, "token invalid sau expirat");
  const u = await res.json();
  return { id: u.id, email: u.email };
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
  const q2 = new URLSearchParams(base);
  for (const [k, v] of Object.entries(filters)) for (const x of Array.isArray(v) ? v : [v]) q2.append(k, x);
  return q2;
}
async function select(table, filters, opts = {}) {
  const q2 = params(filters, { select: opts.select ?? "*" });
  if (opts.order) q2.set("order", opts.order);
  if (opts.limit) q2.set("limit", String(opts.limit));
  return call("GET", `${table}?${q2.toString()}`);
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
async function update(table, filters, patch) {
  const q2 = params(filters);
  await call("PATCH", `${table}?${q2.toString()}`, patch, { prefer: "return=minimal" });
}
async function remove(table, filters) {
  const q2 = params(filters);
  await call("DELETE", `${table}?${q2.toString()}`, void 0, { prefer: "return=minimal" });
}

// server/_lib/settings.ts
var SETTING_KEYS = ["WHOOP_CLIENT_ID", "WHOOP_CLIENT_SECRET", "STRAVA_CLIENT_ID", "STRAVA_CLIENT_SECRET", "OURA_CLIENT_ID", "OURA_CLIENT_SECRET"];
var fromVercel = new Set(SETTING_KEYS.filter((k) => !!process.env[k]));
var loadedAt = 0;
async function hydrateSettings(force = false) {
  if (!force && Date.now() - loadedAt < 6e4) return;
  try {
    const rows = await select("app_settings", {}, { select: "key,value" });
    for (const r2 of rows) if (SETTING_KEYS.includes(r2.key) && !fromVercel.has(r2.key)) process.env[r2.key] = r2.value;
    loadedAt = Date.now();
  } catch {
  }
}
async function saveSettings(values) {
  const rows = Object.entries(values).filter(([k, v]) => SETTING_KEYS.includes(k) && typeof v === "string" && v.trim()).map(([key2, value]) => ({ key: key2, value: value.trim(), updated_at: (/* @__PURE__ */ new Date()).toISOString() }));
  if (rows.length) await upsert("app_settings", rows, "key");
  for (const r2 of rows) if (!fromVercel.has(r2.key)) process.env[r2.key] = r2.value;
  loadedAt = Date.now();
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
    const r2 = await fetch(`${ENV.supabaseUrl()}/auth/v1/admin/users`, {
      method: "POST",
      headers: { ...supabaseKeyHeaders(ENV.supabaseService()), "content-type": "application/json" },
      body: JSON.stringify({ email, password, email_confirm: true })
    });
    const j = await r2.json().catch(() => ({}));
    if (!r2.ok) {
      const exists = r2.status === 422 || /already/i.test(j.msg ?? j.message ?? "");
      throw new HttpError(exists ? 409 : 400, exists ? "exist\u0103 deja un cont cu adresa asta: intr\u0103 cu parola" : j.msg ?? j.message ?? `eroare ${r2.status}`);
    }
    if (existing.length === 0 && j.id) await update("users", { id: `eq.${j.id}` }, { role: "admin" });
    json(res, 200, { ok: true, admin: existing.length === 0 });
  } catch (e) {
    fail(res, e);
  }
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
function addDays(iso, n2) {
  return fromUtc(new Date(toUtc(iso).getTime() + n2 * DAY_MS));
}
function diffDays(a, b) {
  return Math.round((toUtc(b).getTime() - toUtc(a).getTime()) / DAY_MS);
}
function weekday(iso) {
  const js = toUtc(iso).getUTCDay();
  return (js + 6) % 7;
}
function weekStart(iso) {
  return addDays(iso, -weekday(iso));
}
var LABS_VALID_DAYS = 365;
function labsExpired(drawn, today) {
  return diffDays(drawn, today) > LABS_VALID_DAYS;
}

// src/bar/sport-readiness.ts
var LEGS = {
  "70.3": { inot: 1.9, bicicleta: 90, alergare: 21.1 },
  olimpic: { inot: 1.5, bicicleta: 40, alergare: 10 },
  sprint: { inot: 0.75, bicicleta: 20, alergare: 5 },
  semimaraton: { alergare: 21.1 },
  maraton: { alergare: 42.2 }
};
var SWIM_CUTOFF_MIN = { "70.3": 70 };
var BRICK_TARGET_KM = { "70.3": 8, olimpic: 4, sprint: 2 };
var LONG_TARGET_KM = { maraton: 32 };
var VOLUME_FACTOR = 1.5;
var W = { rezistenta: 0.6, volum: 0.25, specific: 0.15 };
var WINDOW = 42;
var BRICK_GAP_MIN = 30;
var ro = (x, d = 1) => x.toLocaleString("ro-RO", { maximumFractionDigits: d });
var pct = (x) => Math.round(Math.max(0, Math.min(1, x)) * 100);
var hm = (s) => s && /^\d{2}:\d{2}/.test(s) ? Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5)) : null;
function isBrickRun(run, all) {
  const start = hm(run.startLocal);
  if (run.sport !== "alergare" || start == null) return false;
  return all.some((b) => {
    if (b.sport !== "bicicleta" || b.date !== run.date) return false;
    const bs = hm(b.startLocal);
    if (bs == null) return false;
    const gap = start - (bs + b.minutes);
    return gap >= -5 && gap <= BRICK_GAP_MIN;
  });
}
function declaredSwimM(nivel, has400Time = false) {
  if (has400Time) return 400;
  return nivel === "peste_1500" ? 1500 : nivel === "continuu_400" ? 400 : nivel === "bazin_scurt" ? 50 : nivel === "nu_stiu" ? 0 : null;
}
function swimDeclared(intake) {
  const i = intake;
  return declaredSwimM(i?.inot?.nivel ?? null, !!i?.evaluare?.inot400);
}
function sportReadiness(goal, activities, today, declared = {}) {
  const legs = LEGS[goal];
  const recent = activities.filter((a) => {
    const d = diffDays(a.date, today);
    return d >= 0 && d < WINDOW;
  });
  const last4w = recent.filter((a) => diffDays(a.date, today) < 28);
  const out = [];
  const name = { inot: "\xEEnot", bicicleta: "biciclet\u0103", alergare: "alergare" };
  const runOnly = !legs.inot;
  for (const sport of ["inot", "bicicleta", "alergare"]) {
    const leg = legs[sport];
    if (!leg) continue;
    const fmtD = (km2) => sport === "inot" ? `${Math.round(km2 * 1e3).toLocaleString("ro-RO")} m` : `${ro(km2)} km`;
    const legLabel = `${fmtD(leg)} ${name[sport]}`;
    const mine = recent.filter((a) => a.sport === sport);
    const parts = [];
    let best = null;
    if (sport === "inot") {
      const measured = mine.filter((a) => a.details?.continuousM != null);
      const m = measured.reduce((mx, a) => Math.max(mx, a.details.continuousM), -1);
      const dec = declared.swimContinuousM ?? null;
      if (m >= 0) {
        best = m;
        parts.push({ label: "Cel mai lung \xEEnot f\u0103r\u0103 oprire", have: `${m.toLocaleString("ro-RO")} m`, target: fmtD(leg), pct: pct(m / (leg * 1e3)), weight: W.rezistenta, source: "masurat" });
      } else if (dec != null) {
        best = dec;
        parts.push({ label: "\xCEnot f\u0103r\u0103 oprire (declarat, f\u0103r\u0103 ture de la ceas)", have: `${dec.toLocaleString("ro-RO")} m`, target: fmtD(leg), pct: pct(dec / (leg * 1e3)), weight: W.rezistenta, source: "declarat" });
      } else {
        parts.push({ label: "\xCEnot f\u0103r\u0103 oprire", have: "nem\u0103surat", target: fmtD(leg), pct: 0, weight: W.rezistenta, source: "lipsa" });
      }
    } else {
      const longest = mine.reduce((mx, a) => Math.max(mx, a.distanceKm ?? 0), 0);
      const target = LONG_TARGET_KM[goal] ?? leg;
      best = longest || null;
      parts.push({ label: sport === "bicicleta" ? "Cea mai lung\u0103 tur\u0103" : "Cea mai lung\u0103 alergare", have: longest ? fmtD(longest) : "niciuna", target: fmtD(target), pct: pct(longest / target), weight: W.rezistenta, source: longest ? "masurat" : "lipsa" });
    }
    const weekly = last4w.filter((a) => a.sport === sport).reduce((s2, a) => s2 + (a.distanceKm ?? 0), 0) / 4;
    const volTarget = VOLUME_FACTOR * leg;
    parts.push({ label: "Volum pe s\u0103pt\u0103m\xE2n\u0103 (media pe 4 s\u0103pt.)", have: fmtD(weekly), target: fmtD(volTarget), pct: pct(weekly / volTarget), weight: W.volum, source: weekly > 0 ? "masurat" : "lipsa" });
    if (runOnly) {
      parts[0].weight += W.specific;
    } else if (sport === "inot") {
      const cutoff = SWIM_CUTOFF_MIN[goal];
      const withLaps = mine.filter((a) => a.details?.continuousPace100mSec != null && (a.details?.continuousM ?? 0) >= 100);
      const longestSwim = mine.reduce((m, a) => (a.distanceKm ?? 0) > (m?.distanceKm ?? 0) ? a : m, null);
      const pace = withLaps.length ? Math.min(...withLaps.map((a) => a.details.continuousPace100mSec)) : longestSwim?.distanceKm ? longestSwim.minutes * 60 / (longestSwim.distanceKm * 10) : null;
      if (cutoff) {
        const need = cutoff * 60 / (leg * 10);
        parts.push({
          label: withLaps.length ? "Ritm fa\u021B\u0103 de timpul-limit\u0103" : "Ritm (cu pauze) fa\u021B\u0103 de timpul-limit\u0103",
          have: pace ? `${fmtPace(pace)}/100 m` : "nem\u0103surat",
          target: `${fmtPace(need)}/100 m`,
          // Ritmul contează doar pe distanța pe care o poți acoperi: se scalează cu rezistența (ritm bun pe 50 m nu înseamnă ritm bun pe 1.900 m).
          pct: pace ? Math.round(pct(need / pace) * Math.min(1, parts[0].pct / 100)) : 0,
          weight: W.specific,
          source: pace ? "masurat" : "lipsa"
        });
      } else {
        parts[0].weight += W.specific;
      }
    } else if (sport === "bicicleta") {
      const hasBrick = recent.some((a) => isBrickRun(a, recent));
      parts.push({ label: "Tur\u0103 urmat\u0103 de alergare (brick)", have: hasBrick ? "da" : "nu", target: "cel pu\u021Bin una", pct: hasBrick ? 100 : 0, weight: W.specific, source: "masurat" });
    } else {
      const brickTarget = BRICK_TARGET_KM[goal] ?? 0;
      const brick = recent.filter((a) => isBrickRun(a, recent)).reduce((mx, a) => Math.max(mx, a.distanceKm ?? 0), 0);
      parts.push({ label: "Alergare imediat dup\u0103 biciclet\u0103", have: brick ? `${ro(brick)} km` : "niciuna", target: `${ro(brickTarget)} km`, pct: brickTarget ? pct(brick / brickTarget) : 0, weight: W.specific, source: "masurat" });
    }
    const anyData = mine.length > 0 || sport === "inot" && declared.swimContinuousM != null;
    const value = anyData ? Math.round(parts.reduce((s2, p) => s2 + p.pct * p.weight, 0)) : null;
    out.push({ sport, leg: legLabel, value, parts, best });
  }
  return out;
}
function fmtPace(sec) {
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// src/calendar/phases.ts
var isRunGoal = (g) => g === "semimaraton" || g === "maraton";
var RUN_DISTANCE_KM = { semimaraton: 21.0975, maraton: 42.195 };
var PHASE_HOURS = {
  "70.3": {
    evaluare: { min: 4, target: 6, max: 8 },
    baza1: { min: 6, target: 8.5, max: 11 },
    baza2: { min: 7, target: 9.5, max: 11 },
    build: { min: 8, target: 11, max: 14 },
    peak: { min: 8, target: 11, max: 14 },
    taper: { min: 4, target: 5.5, max: 7 }
  },
  olimpic: {
    evaluare: { min: 3, target: 5, max: 7 },
    baza1: { min: 5, target: 6.5, max: 9 },
    baza2: { min: 5, target: 7, max: 9 },
    build: { min: 6, target: 8, max: 10 },
    peak: { min: 6, target: 8, max: 10 },
    taper: { min: 3, target: 4, max: 6 }
  },
  sprint: {
    evaluare: { min: 3, target: 4, max: 6 },
    baza1: { min: 4, target: 5, max: 7 },
    baza2: { min: 4, target: 5.5, max: 7 },
    build: { min: 4, target: 6, max: 8 },
    peak: { min: 4, target: 6, max: 8 },
    taper: { min: 2, target: 3, max: 5 }
  },
  // Alergare + forță; orientativ pentru un amator care vrea să termine bine (aprox. 30–50 km/săpt. la semimaraton, 40–70 la maraton).
  semimaraton: {
    evaluare: { min: 2.5, target: 3.5, max: 5 },
    baza1: { min: 3, target: 4.5, max: 6 },
    baza2: { min: 3.5, target: 5, max: 6.5 },
    build: { min: 4, target: 5.5, max: 7 },
    peak: { min: 4, target: 5.5, max: 7 },
    taper: { min: 2, target: 3, max: 4 }
  },
  maraton: {
    evaluare: { min: 3, target: 4, max: 5.5 },
    baza1: { min: 3.5, target: 5, max: 7 },
    baza2: { min: 4, target: 6, max: 8 },
    build: { min: 4.5, target: 7, max: 9 },
    peak: { min: 4.5, target: 7, max: 9 },
    taper: { min: 2.5, target: 3.5, max: 5 }
  }
};
var ORDER = ["evaluare", "baza1", "baza2", "build", "peak", "taper"];
var DESIRED = { evaluare: 3, baza2: 8, build: 12, peak: 4, taper: 2 };
var RATIO = { evaluare: 0.09, baza1: 0.25, baza2: 0.22, build: 0.3, peak: 0.09, taper: 0.05 };
var MIN_WEEKS = { evaluare: 0, baza1: 1, baza2: 1, build: 1, peak: 1, taper: 1 };
function phaseLengths(totalWeeks) {
  const fixed = DESIRED.evaluare + DESIRED.baza2 + DESIRED.build + DESIRED.peak + DESIRED.taper;
  if (totalWeeks >= fixed + 4) {
    return { ...DESIRED, baza1: totalWeeks - fixed };
  }
  const out = {};
  let used = 0;
  for (const p of ORDER) {
    out[p] = Math.max(MIN_WEEKS[p], Math.floor(totalWeeks * RATIO[p]));
    used += out[p];
  }
  let rest = totalWeeks - used;
  const fill = ["build", "baza2", "baza1", "peak"];
  let i = 0;
  while (rest > 0) {
    const p = fill[i % fill.length];
    out[p] += 1;
    rest -= 1;
    i += 1;
  }
  while (rest < 0) {
    const p = ["evaluare", "baza1", "baza2", "build", "peak"][(-rest - 1) % 5];
    if (out[p] > MIN_WEEKS[p]) {
      out[p] -= 1;
      rest += 1;
    } else {
      break;
    }
  }
  return out;
}
function phaseWeeks(startDate, raceDate, recoveryEvery = 4) {
  const first2 = weekStart(startDate);
  const raceWeek = weekStart(raceDate);
  const total = Math.floor(diffDays(first2, raceWeek) / 7) + 1;
  if (total < 4) throw new Error(`Prea pu\u021Bine s\u0103pt\u0103m\xE2ni p\xE2n\u0103 la curs\u0103 (${total}); planul are nevoie de minimum 4.`);
  const lengths = phaseLengths(total);
  const weeks = [];
  let index = 0;
  for (const phase of ORDER) {
    for (let w = 0; w < lengths[phase]; w++) {
      weeks.push({
        weekStart: addDays(first2, index * 7),
        index,
        phase,
        weekInPhase: w,
        recovery: phase !== "taper" && w % recoveryEvery === recoveryEvery - 1
      });
      index += 1;
    }
  }
  return weeks;
}

// src/util/run.ts
function parsePace(s) {
  const m = /^\s*(\d{1,2}):([0-5]\d)\s*$/.exec(s ?? "");
  if (!m) return null;
  const v = Number(m[1]) * 60 + Number(m[2]);
  return v > 0 ? v : null;
}
function parseDuration(s) {
  const t = (s ?? "").trim();
  let m = /^(\d{1,2}):([0-5]\d):([0-5]\d)$/.exec(t);
  if (m) return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
  m = /^(\d{1,2}):([0-5]\d)$/.exec(t);
  if (m) return Number(m[1]) * 3600 + Number(m[2]) * 60;
  return null;
}
function fmtPaceSec(sec) {
  const r2 = Math.round(sec);
  return `${Math.floor(r2 / 60)}:${String(r2 % 60).padStart(2, "0")}`;
}
function fmtDuration(sec) {
  const r2 = Math.round(sec);
  return `${Math.floor(r2 / 3600)}:${String(Math.floor(r2 % 3600 / 60)).padStart(2, "0")}:${String(r2 % 60).padStart(2, "0")}`;
}
function paceFromResult(r2, distanceKm) {
  if (!r2) return null;
  if (r2.mod === "ritm") return parsePace(r2.valoare);
  const t = parseDuration(r2.valoare);
  return t ? t / distanceKm : null;
}

// src/collector/readiness.ts
var clamp = (x) => Math.max(0, Math.min(100, Math.round(x)));
function sleepScore(m) {
  if (m >= 420) return 100;
  if (m >= 360) return 70 + (m - 360) / 60 * 30;
  if (m >= 300) return 30 + (m - 300) / 60 * 40;
  if (m >= 240) return (m - 240) / 60 * 30;
  return 0;
}
function levelFromScore(s) {
  if (s == null) return null;
  return s >= 70 ? "verde" : s >= 50 ? "galben" : s >= 30 ? "portocaliu" : "rosu";
}
var verdictFromScore = levelFromScore;
function objectiveReadiness(i) {
  const hrv = i.hrv != null && i.hrvBaseline ? clamp(100 - (1 - i.hrv / i.hrvBaseline) * 300) : null;
  const rhr = i.rhr != null && i.rhrBaseline != null ? clamp(100 - Math.max(0, i.rhr - i.rhrBaseline) * 10) : null;
  const resp = i.resp != null && i.respBaseline != null ? clamp(100 - Math.max(0, i.resp - i.respBaseline - 0.5) * 40) : null;
  const rec = i.recovery != null ? clamp(i.recovery) : null;
  const sleep = i.sleepMin != null ? clamp(sleepScore(i.sleepMin)) : null;
  const parts = [hrv, rhr, resp, rec, sleep].filter((x) => x != null);
  const scor = parts.length ? clamp(parts.reduce((a, b) => a + b, 0) / parts.length) : null;
  return {
    scor,
    verdict: verdictFromScore(scor),
    disponibile: parts.length,
    componente: {
      inima_hrv: { valoare: i.hrv, referinta: i.hrvBaseline, scor: hrv },
      inima_puls: { valoare: i.rhr, referinta: i.rhrBaseline, scor: rhr },
      respiratie: { valoare: i.resp, referinta: i.respBaseline, scor: resp },
      recuperare: { valoare: i.recovery, referinta: null, scor: rec },
      somn: { valoare: i.sleepMin, referinta: 420, scor: sleep }
    }
  };
}
var RANK = { verde: 0, galben: 1, portocaliu: 2, rosu: 3 };
function dayVerdict(obj, hooperSum2) {
  let v = obj.verdict ?? "galben";
  let motiv = obj.verdict ? `date obiective ${obj.scor}/100 (${obj.disponibile} din 5 m\u0103surate)` : "f\u0103r\u0103 date obiective de la br\u0103\u021B\u0103ri: cel mult galben";
  if (hooperSum2 != null) {
    const felt = hooperSum2 >= 24 ? "rosu" : hooperSum2 >= 22 ? "portocaliu" : hooperSum2 >= 20 ? "galben" : "verde";
    if (RANK[felt] > RANK[v]) {
      v = felt;
      motiv += `; cum te sim\u021Bi (Hooper ${hooperSum2}) coboar\u0103 la ${felt}`;
    }
  }
  return { verdict: v, motiv };
}
function hooperSum(h) {
  const xs = h ? [h.somn, h.oboseala, h.stres, h.dureri].filter((x) => typeof x === "number") : [];
  if (!xs.length) return { suma: null, raspunse: 0 };
  return { suma: Math.round(xs.reduce((a, b) => a + b, 0) / xs.length * 4), raspunse: xs.length };
}

// src/collector/details.ts
var DETAILS_V = 2;
var MIN_SWIM_SEC_100 = 45;
function longestContinuousSwim(laps) {
  if (!laps.length) return null;
  let best = { m: 0, sec: 0 };
  let cur = { m: 0, sec: 0 };
  for (const l of laps) {
    const t = l.elapsed_time || l.moving_time;
    const valid = l.distance > 0 && t > 0 && t / (l.distance / 100) >= MIN_SWIM_SEC_100;
    if (!valid) {
      cur = { m: 0, sec: 0 };
      continue;
    }
    const paused = l.elapsed_time - l.moving_time > 10;
    cur = paused ? { m: l.distance, sec: t } : { m: cur.m + l.distance, sec: cur.sec + t };
    if (cur.m > best.m) best = { ...cur };
    if (paused) cur = { m: 0, sec: 0 };
  }
  return { m: Math.round(best.m), pace100: best.m > 0 ? Math.round(best.sec / (best.m / 100)) : null };
}
var r1 = (x) => Math.round(x * 10) / 10;
var ok = (x) => typeof x === "number" && Number.isFinite(x) && x > 0;
function stepsFromCadence(spm, minPerKm) {
  if (!ok(spm) || !ok(minPerKm)) return { stepsPerKm: null, strideM: null };
  const s = Math.round(spm * minPerKm);
  return { stepsPerKm: s, strideM: Math.round(1e3 / s * 100) / 100 };
}
var EFFORT_NAMES = { "400m": "400 m", "1k": "1 km", "1 mile": "1 mil\u0103", "5k": "5 km", "10k": "10 km", "Half-Marathon": "21,1 km", Marathon: "42,2 km" };
function stravaDetails(a, sport) {
  const d = {
    movingMin: ok(a.moving_time) ? Math.round(a.moving_time / 60) : null,
    elapsedMin: ok(a.elapsed_time) ? Math.round(a.elapsed_time / 60) : null,
    elevGainM: ok(a.total_elevation_gain) ? Math.round(a.total_elevation_gain) : null,
    avgSpeedKmh: ok(a.average_speed) ? r1(a.average_speed * 3.6) : null,
    maxSpeedKmh: ok(a.max_speed) ? r1(a.max_speed * 3.6) : null,
    kj: ok(a.kilojoules) ? Math.round(a.kilojoules) : null,
    kcal: ok(a.calories) ? Math.round(a.calories) : null,
    avgWatts: ok(a.average_watts) ? Math.round(a.average_watts) : null,
    npWatts: ok(a.weighted_average_watts) ? Math.round(a.weighted_average_watts) : null,
    maxWatts: ok(a.max_watts) ? Math.round(a.max_watts) : null,
    polyline: a.map?.summary_polyline || null
  };
  if (sport === "alergare") {
    d.cadence = ok(a.average_cadence) ? Math.round(a.average_cadence * 2) : null;
    const km2 = a.distance / 1e3;
    const minPerKm = km2 > 0.2 && ok(a.moving_time) ? a.moving_time / 60 / km2 : null;
    Object.assign(d, stepsFromCadence(d.cadence, minPerKm));
  } else if (sport === "bicicleta") {
    d.cadence = ok(a.average_cadence) ? Math.round(a.average_cadence) : null;
  } else if (sport === "inot") {
    d.cadence = ok(a.average_cadence) ? Math.round(a.average_cadence) : null;
    d.pace100mSec = a.distance >= 50 && ok(a.moving_time) ? Math.round(a.moving_time / (a.distance / 100)) : null;
  }
  const det = a;
  if (det.splits_metric || det.best_efforts || det.laps) {
    d.detailed = true;
    d.v = DETAILS_V;
    if (sport === "alergare") {
      const splits = (det.splits_metric ?? []).filter((s) => s.distance >= 950 && ok(s.moving_time)).map((s) => Math.round(s.moving_time / (s.distance / 1e3)));
      d.splitsSecPerKm = splits.length ? splits : null;
      const efforts = {};
      for (const e of det.best_efforts ?? []) {
        const n2 = EFFORT_NAMES[e.name];
        if (n2 && ok(e.moving_time)) efforts[n2] = e.moving_time;
      }
      d.bestEfforts = Object.keys(efforts).length ? efforts : null;
      d.fastestKmSec = efforts["1 km"] ?? (splits.length ? Math.min(...splits) : null);
    }
    if (sport === "inot") {
      const laps = (det.laps ?? []).filter((l) => l.distance >= 50 && ok(l.moving_time));
      d.laps = det.laps?.length ?? null;
      const c = longestContinuousSwim(det.laps ?? []);
      d.continuousM = c ? c.m : null;
      d.continuousPace100mSec = c?.pace100 ?? null;
      d.fastestLap100mSec = laps.length ? Math.min(...laps.map((l) => Math.round(l.moving_time / (l.distance / 100)))) : null;
    }
  }
  return d;
}
function whoopDetails(score2) {
  const z = score2.zone_durations;
  return {
    strain: ok(score2.strain) ? r1(score2.strain) : null,
    kj: ok(score2.kilojoule) ? Math.round(score2.kilojoule) : null,
    kcal: ok(score2.kilojoule) ? Math.round(score2.kilojoule / 4.184) : null,
    elevGainM: ok(score2.altitude_gain_meter) ? Math.round(score2.altitude_gain_meter) : null,
    deviceZonesMin: z ? [z.zone_one_milli, z.zone_two_milli, z.zone_three_milli, z.zone_four_milli, z.zone_five_milli].map((ms) => Math.round(ms / 6e4)) : null
  };
}
function mergeDetails(a, b) {
  if (!a) return b ?? null;
  if (!b) return a;
  const out = { ...b };
  for (const [k, v] of Object.entries(a)) if (v != null) out[k] = v;
  return out;
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
      return { color: "rosu", reasons: ["nef\u0103cut: nu se pune la progres (nu schimb\u0103 planul)"], metrics: empty, flags: { ...flags, missed: true }, final: true };
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
  const directie = zoneDirection(planned, activity, extraActivity ?? null);
  const other = (input.sameDay ?? []).find((o) => directie === "mai_usor" && o.directie === "mai_tare" || directie === "mai_tare" && o.directie === "mai_usor");
  const compensat = other ? `${directie === "mai_usor" ? "mai u\u0219or" : "mai tare"} aici, ${other.directie === "mai_tare" ? "mai tare" : "mai u\u0219or"} la ${other.sport} \xEEn aceea\u0219i zi` : null;
  const metrics = { durationPct, zonePct, rpeDelta, pain, cardiacDriftPct, directie, compensat };
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
    const dir = directie === "mai_tare" ? ", mai tare dec\xE2t planul" : directie === "mai_usor" ? ", mai u\u0219or dec\xE2t planul" : "";
    if (compensat && zonePct < 75) reasons.push(`timp \xEEn zona-\u021Bint\u0103 ${zonePct}%${dir}: compensat (${compensat})`);
    else if (zonePct < 75) bump(1, `timp \xEEn zona-\u021Bint\u0103 ${zonePct}%${dir}: f\u0103cut, dar mai pu\u021Bin eficient`);
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
  metrics.eficienta = efficiency(metrics, activity, !!compensat);
  const color = level === 0 ? "verde" : level === 1 ? "galben" : "portocaliu";
  if (color === "verde") reasons.unshift("durat\u0103, zone \u0219i RPE \xEEn \u021Bint\u0103");
  if (flags.noQuestionnaire) reasons.push("f\u0103r\u0103 chestionar: RPE \u0219i durerea lipsesc");
  return { color, reasons, metrics, flags, final: isFinal(flags, planned, today) };
}
function efficiency(m, a, compensated) {
  let pen = 0;
  if (m.durationPct != null) {
    if (m.durationPct < 90) pen += Math.min(50, 90 - m.durationPct);
    else if (m.durationPct > 115) pen += Math.min(20, (m.durationPct - 115) * 0.5);
  }
  if (m.zonePct != null && !compensated) pen += Math.min(40, (100 - m.zonePct) * 0.5);
  if (a.mainSetAbandoned) pen += 30;
  else pen += Math.min(20, (a.intervalsAbandoned ?? 0) * 10);
  if (m.rpeDelta != null && m.rpeDelta >= 2) pen += 10;
  return Math.max(0, Math.min(100, Math.round(100 - pen)));
}
function zoneDirection(planned, activity, extra = null) {
  if (!planned.targetZones.length) return null;
  const parts = [activity, extra].filter((a) => !!a && !!a.timeInZonesMin);
  if (parts.length === 0) return null;
  const lo = Math.min(...planned.targetZones);
  const hi = Math.max(...planned.targetZones);
  let above = 0;
  let below = 0;
  let total = 0;
  for (const a of parts) {
    const zones = a.timeInZonesMin;
    for (const z of [1, 2, 3, 4, 5]) {
      const m = zones[z] ?? 0;
      total += m;
      if (z > hi) above += m;
      if (z < lo) below += m;
    }
  }
  if (total === 0) return null;
  if (above / total >= 0.15 && above >= below) return "mai_tare";
  if (below / total >= 0.15) return "mai_usor";
  return "conform";
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
function round1(n2) {
  return Math.round(n2 * 10) / 10;
}

// src/collector/packet.ts
var SPORTS = ["inot", "bicicleta", "alergare", "forta"];
var DAY_NAMES = ["luni", "marti", "miercuri", "joi", "vineri", "sambata", "duminica"];
var PRIORITY = { whoop: 0, oura: 1, garmin: 2, athletedata: 3, apple: 4, manual: 5, strava: 9 };
function mean(xs) {
  if (xs.length === 0) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}
function sd(xs) {
  const m = mean(xs);
  if (m == null || xs.length < 2) return null;
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length);
}
function round(x, d = 1) {
  if (x == null) return null;
  const f = 10 ** d;
  return Math.round(x * f) / f;
}
var HRV_EXCLUDED = /* @__PURE__ */ new Set(["apple", "manual", "strava"]);
var RHR_EXCLUDED = /* @__PURE__ */ new Set(["manual", "strava"]);
var MIN_OVERLAP = 7;
function referenceSource(rows, metric) {
  const excluded = metric === "hrv" ? HRV_EXCLUDED : RHR_EXCLUDED;
  const srcs = [...new Set(rows.filter((r2) => r2[metric] != null && !excluded.has(r2.source)).map((r2) => r2.source))];
  srcs.sort((a, b) => (PRIORITY[a] ?? 5) - (PRIORITY[b] ?? 5));
  return srcs[0] ?? null;
}
function sourceOffsets(rows, metric) {
  const ref = referenceSource(rows, metric);
  const out = /* @__PURE__ */ new Map();
  if (!ref) return out;
  out.set(ref, 0);
  const refByDate = new Map(rows.filter((r2) => r2.source === ref && r2[metric] != null).map((r2) => [r2.date, r2[metric]]));
  const diffs = /* @__PURE__ */ new Map();
  for (const r2 of rows) {
    if (r2.source === ref || r2[metric] == null) continue;
    const rv = refByDate.get(r2.date);
    if (rv == null) continue;
    diffs.set(r2.source, [...diffs.get(r2.source) ?? [], rv - r2[metric]]);
  }
  for (const [src, d] of diffs) if (d.length >= MIN_OVERLAP) out.set(src, mean(d));
  return out;
}
function averaged(list, metric, offsets) {
  const excluded = metric === "hrv" ? HRV_EXCLUDED : RHR_EXCLUDED;
  const withVal = list.filter((r2) => r2[metric] != null);
  const usable = withVal.filter((r2) => !excluded.has(r2.source));
  if (usable.length === 0) {
    const r2 = [...withVal].sort((a, b) => (PRIORITY[a.source] ?? 5) - (PRIORITY[b.source] ?? 5))[0];
    return r2 ? { v: r2[metric], src: r2.source } : { v: null, src: null };
  }
  const calibrated = usable.filter((r2) => offsets.has(r2.source));
  const chosen = calibrated.length > 0 ? calibrated : [usable.sort((a, b) => (PRIORITY[a.source] ?? 5) - (PRIORITY[b.source] ?? 5))[0]];
  const vals = chosen.map((r2) => r2[metric] + (offsets.get(r2.source) ?? 0));
  return { v: mean(vals), src: chosen.map((r2) => r2.source).join("+") };
}
function disagreements(list, offsets) {
  const out = [];
  const spread = (xs) => xs.length < 2 ? 0 : Math.max(...xs) - Math.min(...xs);
  const fmt = (k) => list.filter((r2) => r2[k] != null).map((r2) => `${r2.source} ${Math.round(r2[k])}`).join(", ");
  const hrv = list.filter((r2) => r2.hrv != null && !HRV_EXCLUDED.has(r2.source)).map((r2) => r2.hrv + (offsets.hrv.get(r2.source) ?? 0));
  const m = mean(hrv);
  if (m != null && hrv.length >= 2 && spread(hrv) / m > 0.2) out.push(`HRV difer\u0103 cu peste 20% \xEEntre br\u0103\u021B\u0103ri (${fmt("hrv")})`);
  const rhr = list.filter((r2) => r2.rhr != null && !RHR_EXCLUDED.has(r2.source)).map((r2) => r2.rhr + (offsets.rhr.get(r2.source) ?? 0));
  if (spread(rhr) > 5) out.push(`pulsul de repaus difer\u0103 cu peste 5 bpm (${fmt("rhr")})`);
  const sl = list.filter((r2) => r2.sleepMin != null).map((r2) => r2.sleepMin);
  if (spread(sl) > 60) out.push(`somnul difer\u0103 cu peste o or\u0103 (${fmt("sleepMin")} min)`);
  return out;
}
function mergeWellness(rows) {
  const unique = /* @__PURE__ */ new Map();
  for (const r2 of rows) unique.set(`${r2.date}|${r2.source}`, { ...unique.get(`${r2.date}|${r2.source}`), ...Object.fromEntries(Object.entries(r2).filter(([, v]) => v != null)) });
  const clean = [...unique.values()];
  const offsets = { hrv: sourceOffsets(clean, "hrv"), rhr: sourceOffsets(clean, "rhr") };
  const byDate = /* @__PURE__ */ new Map();
  for (const r2 of clean) byDate.set(r2.date, [...byDate.get(r2.date) ?? [], r2]);
  const out = [];
  for (const [date, list] of byDate) {
    const sorted = [...list].sort((a, b) => (PRIORITY[a.source] ?? 5) - (PRIORITY[b.source] ?? 5));
    const pick = (k) => {
      for (const r2 of sorted) {
        const v = r2[k];
        if (v != null) return { v, src: r2.source };
      }
      return { v: null, src: null };
    };
    const hrv = averaged(sorted, "hrv", offsets.hrv);
    const rhr = averaged(sorted, "rhr", offsets.rhr);
    const sleeps = sorted.filter((r2) => r2.sleepMin != null).map((r2) => r2.sleepMin);
    const sleepSources = sorted.filter((r2) => r2.sleepMin != null).map((r2) => r2.source);
    const bedtime = sorted.find((r2) => r2.bedtime)?.bedtime ?? null;
    const sleepScore2 = pick("sleepScore");
    const recs = sorted.filter((r2) => r2.recoveryScore != null);
    const recovery = { v: recs.length ? Math.round(mean(recs.map((r2) => r2.recoveryScore))) : null, src: recs.length ? recs.map((r2) => r2.source).join("+") : null };
    const resps = sorted.filter((r2) => r2.respiratoryRate != null).map((r2) => r2.respiratoryRate);
    const weight = pick("weightKg");
    const fat = pick("bodyFatPct");
    const perDevice = {};
    if (sorted.length > 1)
      for (const r2 of sorted) perDevice[r2.source] = { hrv: r2.hrv ?? null, puls_repaus: r2.rhr ?? null, somn_min: r2.sleepMin ?? null, recuperare: r2.recoveryScore ?? null };
    out.push({
      date,
      hrv: round(hrv.v, 1),
      rhr: rhr.v == null ? null : Math.round(rhr.v),
      sleepMin: sleeps.length ? Math.round(mean(sleeps)) : null,
      bedtime,
      sleepScore: sleepScore2.v,
      recoveryScore: recovery.v,
      respiratoryRate: resps.length ? round(mean(resps), 1) : null,
      weightKg: weight.v,
      bodyFatPct: fat.v,
      sources: { hrv: hrv.src, puls_repaus: rhr.src, somn: sleepSources.length ? sleepSources.join("+") : null, recuperare: recovery.src },
      perDevice,
      disagreements: sorted.length > 1 ? disagreements(sorted, offsets) : []
    });
  }
  return out.sort((a, b) => diffDays(a.date, b.date));
}
var hmMin = (s) => s && /^\d{2}:\d{2}/.test(s) ? Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5)) : null;
function sameSession(a, b) {
  if (a.date !== b.date || a.sport !== b.sport) return false;
  const sa = hmMin(a.startLocal);
  const sb = hmMin(b.startLocal);
  if (sa != null && sb != null) {
    const overlap = Math.min(sa + a.minutes, sb + b.minutes) - Math.max(sa, sb);
    return overlap >= 0.6 * Math.max(1, Math.min(a.minutes, b.minutes));
  }
  return Math.abs(a.minutes - b.minutes) <= 3 && (a.distanceKm == null || b.distanceKm == null || Math.abs(a.distanceKm - b.distanceKm) < 0.3);
}
function pickRecording(a, b) {
  const fields2 = (x) => Object.values(x).filter((v) => v != null).length;
  const [S, L2] = a.minutes <= b.minutes ? [a, b] : [b, a];
  const extraMin = L2.minutes - S.minutes;
  if (extraMin < 2) return fields2(a) >= fields2(b) ? a : b;
  const sKm = S.distanceKm ?? null;
  const lKm = L2.distanceKm ?? null;
  if (lKm != null && lKm > 0 && (sKm == null || sKm === 0)) return L2;
  if (sKm != null && lKm != null && lKm - sKm >= 0.5) return L2;
  if (S.avgHr != null && L2.avgHr != null) {
    const extraHr = (L2.avgHr * L2.minutes - S.avgHr * S.minutes) / extraMin;
    if (extraHr >= 0.85 * S.avgHr) return L2;
  }
  return S;
}
function dedupeActivities(acts) {
  const kept = [];
  const sorted = [...acts].sort((a, b) => diffDays(b.date, a.date));
  for (const a of sorted) {
    const dup = kept.find((k) => sameSession(k, a));
    if (!dup) {
      kept.push(a);
      continue;
    }
    const chosen = pickRecording(dup, a);
    const other = chosen === dup ? a : dup;
    kept[kept.indexOf(dup)] = { ...chosen, details: mergeDetails(chosen.details, other.details) };
  }
  return kept;
}
function minutesToHm(min) {
  if (min == null) return null;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return `${h}:${String(m).padStart(2, "0")}`;
}
function hoursBySport(acts, from, to) {
  const h = { inot: 0, bicicleta: 0, alergare: 0, forta: 0 };
  for (const a of acts) {
    if (diffDays(from, a.date) < 0 || diffDays(a.date, to) < 0) continue;
    h[a.sport] += a.minutes / 60;
  }
  for (const s of SPORTS) h[s] = Math.round(h[s] * 10) / 10;
  return h;
}
function acwr(acts, today, sport) {
  const sel = sport ? acts.filter((a) => a.sport === sport) : acts;
  const firstDate = sel.reduce((m, a) => m == null || diffDays(a.date, m) > 0 ? a.date : m, null);
  if (firstDate == null || diffDays(firstDate, today) < 28) return null;
  const sum = (from, to) => sel.filter((a) => diffDays(from, a.date) >= 0 && diffDays(a.date, to) >= 0).reduce((acc, a) => acc + a.minutes, 0);
  const yesterday = addDays(today, -1);
  const acute = sum(addDays(today, -7), yesterday);
  const chronic = sum(addDays(today, -28), yesterday) / 4;
  if (chronic < 30) return null;
  return Math.round(acute / chronic * 100) / 100;
}
function planLabel(w) {
  const sport = { inot: "\xEEnot", bicicleta: "biciclet\u0103", alergare: "alergare", forta: "for\u021B\u0103" }[w.sport];
  const tip = w.type === "forta" ? "" : ` ${w.type === "z2" ? "Z2" : w.type}`;
  return `${sport}${tip} ${w.plannedMinutes}${w.key ? " (cheie)" : ""}`;
}
function buildPacket(input) {
  const { today } = input;
  const merged = mergeWellness(input.wellness);
  const todayRow = merged.find((r2) => r2.date === today) ?? null;
  const last = (n2, from = 1) => merged.filter((r2) => diffDays(r2.date, today) >= from && diffDays(r2.date, today) <= from + n2 - 1);
  const prev7 = last(7);
  const prev60 = last(60);
  const hrv7 = prev7.map((r2) => r2.hrv).filter((x) => x != null);
  const hrv60 = prev60.map((r2) => r2.hrv).filter((x) => x != null);
  const rhr7 = prev7.map((r2) => r2.rhr).filter((x) => x != null);
  const rhr60 = prev60.map((r2) => r2.rhr).filter((x) => x != null);
  const sleep7 = prev7.map((r2) => r2.sleepMin).filter((x) => x != null);
  const resp60 = prev60.map((r2) => r2.respiratoryRate).filter((x) => x != null);
  const baseline60 = hrv60.length >= 14 ? round(mean(hrv60), 1) : null;
  const sd60 = hrv60.length >= 14 ? round(sd(hrv60), 2) : null;
  let zileSubPrag = 0;
  if (baseline60 != null && sd60 != null) {
    const prag = baseline60 - sd60;
    for (const r2 of [todayRow, ...prev7].filter((x) => x != null)) {
      if (r2.hrv != null && r2.hrv < prag) zileSubPrag += 1;
      else break;
    }
  }
  const acts = dedupeActivities(input.activities).filter((a) => diffDays(a.date, today) >= 0);
  const yesterday = addDays(today, -1);
  const ore7 = hoursBySport(acts, addDays(today, -7), yesterday);
  const ore28 = hoursBySport(acts, addDays(today, -28), yesterday);
  for (const s of SPORTS) ore28[s] = Math.round(ore28[s] / 4 * 10) / 10;
  const sedinte7 = acts.filter((a) => diffDays(addDays(today, -7), a.date) >= 0 && diffDays(a.date, yesterday) >= 0).length;
  const lastAct = [...acts].filter((a) => input.event === "dimineata" ? diffDays(a.date, today) >= 1 : true).sort((a, b) => diffDays(a.date, b.date) || (b.startLocal ?? "").localeCompare(a.startLocal ?? ""))[0] ?? null;
  const evening = lastAct ? input.evenings.find((e) => e.activityId === lastAct.externalId) ?? input.evenings.find((e) => e.date === lastAct.date) ?? null : null;
  const inPlan = lastAct ? input.plan.some((w) => w.sport === lastAct.sport && Math.abs(diffDays(w.date, lastAct.date)) <= 1 && w.status !== "sters") : false;
  const plannedFor = (a) => input.plan.filter((w) => w.sport === a.sport && Math.abs(diffDays(w.date, a.date)) <= 1 && w.status !== "sters" && w.status !== "anulat_sistem").sort((x, y) => Math.abs(diffDays(x.date, a.date)) - Math.abs(diffDays(y.date, a.date)))[0] ?? null;
  const execution = (a, ev) => {
    const w = plannedFor(a);
    if (!w) return null;
    const sameDay = acts.filter((o) => o !== a && o.date === a.date).map((o) => {
      const ow = plannedFor(o);
      return { sport: o.sport, directie: ow ? zoneDirection(ow, o) : null };
    });
    const r2 = scoreWorkout({ planned: w, activity: a, questionnaire: ev ? { rpe: ev.rpe, painScore: ev.durere.scor } : null, today, sameDay });
    return {
      tip_planificat: w.type,
      durata_planificata: w.plannedMinutes,
      zone_tinta: w.targetZones,
      structura: w.structure ?? null,
      durata_pct: r2.metrics.durationPct,
      in_zona_pct: r2.metrics.zonePct,
      directie: r2.metrics.directie ?? null,
      compensat: r2.metrics.compensat ?? null,
      eficienta: r2.metrics.eficienta ?? null,
      culoare: r2.color,
      motive: r2.reasons
    };
  };
  const rhrBase = rhr60.length >= 14 ? round(mean(rhr60), 1) : null;
  const objective = objectiveReadiness({
    hrv: todayRow?.hrv ?? null,
    hrvBaseline: baseline60,
    rhr: todayRow?.rhr ?? null,
    rhrBaseline: rhrBase,
    resp: todayRow?.respiratoryRate ?? null,
    respBaseline: resp60.length >= 14 ? round(mean(resp60), 1) : null,
    recovery: todayRow?.recoveryScore ?? null,
    sleepMin: todayRow?.sleepMin ?? null
  });
  const h = input.morning?.hooper;
  const hooper = hooperSum(h);
  const planToday = input.plan.filter((w) => w.date === today && w.status === "planificat").sort((a, b) => Number(b.key) - Number(a.key))[0] ?? null;
  const tomorrow = addDays(today, 1);
  const planTomorrow = input.plan.filter((w) => w.date === tomorrow && w.status === "planificat").sort((a, b) => Number(b.key) - Number(a.key))[0] ?? null;
  const monday = addDays(today, -weekday(today));
  const zile = {};
  for (let i = 0; i < 7; i++) {
    const d = addDays(monday, i);
    const ws = input.plan.filter((w) => w.date === d && w.status !== "sters");
    zile[DAY_NAMES[i]] = ws.length ? ws.map((w) => `${planLabel(w)}${w.status !== "planificat" ? ` [${w.status}]` : ""}`).join(" + ") : "odihn\u0103";
  }
  const acwrTotal = acwr(acts, today);
  const acwrBySport = { inot: acwr(acts, today, "inot"), bicicleta: acwr(acts, today, "bicicleta"), alergare: acwr(acts, today, "alergare"), forta: acwr(acts, today, "forta") };
  const recentActs = acts.filter((a) => diffDays(a.date, today) >= 0 && diffDays(a.date, today) <= 28);
  const pastPlanned = input.plan.filter((w) => w.status === "planificat" && diffDays(w.date, today) >= 1 && diffDays(w.date, today) <= 14);
  const doneW = pastPlanned.filter((w) => acts.some((a) => a.sport === w.sport && Math.abs(diffDays(w.date, a.date)) <= 1));
  const aderenta = recentActs.length ? { planificate: pastPlanned.length, facute: doneW.length, sarite: pastPlanned.filter((w) => !doneW.includes(w)).map((w) => ({ data: w.date, sport: w.sport, cheie: w.key })) } : null;
  const weights = merged.filter((r2) => r2.weightKg != null && diffDays(r2.date, today) >= 0 && diffDays(r2.date, today) <= 6);
  const lastWeight = merged.find((r2) => r2.weightKg != null) ?? null;
  const nutYesterday = input.nutrition?.find((n2) => n2.date === yesterday) ?? null;
  return {
    meta: {
      data: today,
      zi_saptamana: DAY_NAMES[weekday(today)],
      eveniment: input.event,
      moment_zi: momentOfDay(input.nowLocal ?? null),
      ora_locala: input.nowLocal ?? null,
      sportiv: { sex: input.athlete.sex === "m" ? "barbat" : input.athlete.sex === "f" ? "femeie" : null, varsta: input.athlete.varsta ?? null, inaltime_cm: input.athlete.inaltimeCm ?? null },
      faza: input.athlete.phase,
      obiectiv: input.athlete.obiectiv,
      zile_pana_la_cursa: diffDays(today, input.athlete.raceDate),
      bilant_lunar: input.event === "saptamanal" && addDays(today, 7).slice(0, 7) !== today.slice(0, 7),
      surse: { ...todayRow?.sources ?? { hrv: null, puls_repaus: null, somn: null, recuperare: null }, activitati: [...new Set(acts.map((a) => a.source))].join("+") || null, incarcare: input.load?.source ?? null },
      dispozitive: todayRow && Object.keys(todayRow.perDevice).length > 1 ? { azi: todayRow.perDevice, dezacord: todayRow.disagreements } : null
    },
    somn: {
      durata: minutesToHm(todayRow?.sleepMin ?? null),
      durata_min: todayRow?.sleepMin ?? null,
      ora_culcare: todayRow?.bedtime ?? null,
      scor: todayRow?.sleepScore ?? null,
      media7_durata: minutesToHm(sleep7.length ? Math.round(mean(sleep7)) : null),
      media7_durata_min: sleep7.length ? Math.round(mean(sleep7)) : null
    },
    hrv: { azi: todayRow?.hrv ?? null, media7: round(mean(hrv7), 1), baseline60, sd60, zile_sub_prag: zileSubPrag },
    puls_repaus: { azi: todayRow?.rhr ?? null, media7: round(mean(rhr7), 0), baseline60: rhr60.length >= 14 ? round(mean(rhr60), 1) : null },
    readiness: {
      obiectiv: objective,
      verdict_cod: dayVerdict(objective, hooper.suma),
      scor_producator: todayRow?.recoveryScore ?? null,
      hooper: {
        somn: input.morning?.hooper.somn ?? null,
        oboseala: input.morning?.hooper.oboseala ?? null,
        stres: input.morning?.hooper.stres ?? null,
        dureri: input.morning?.hooper.dureri ?? null,
        suma: hooper.suma,
        raspunse: hooper.raspunse,
        istoric_14z: (input.morningHistory ?? []).filter((m) => m.date < today && diffDays(m.date, today) <= 14).map((m) => ({ data: m.date, suma: hooperSum(m.hooper).suma, raspunse: hooperSum(m.hooper).raspunse, boala: m.semnale?.boala ?? null })).filter((x) => x.suma != null).sort((a, b) => a.data < b.data ? -1 : 1),
        media_14z: (() => {
          const xs = (input.morningHistory ?? []).filter((m) => m.date < today && diffDays(m.date, today) <= 14).map((m) => hooperSum(m.hooper).suma).filter((x) => x != null);
          return xs.length >= 3 ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length * 10) / 10 : null;
        })()
      }
    },
    incarcare: {
      acwr: acwrTotal,
      acwr_sport: acwrBySport,
      ctl: input.load?.ctl ?? null,
      atl: input.load?.atl ?? null,
      tsb: input.load?.tsb ?? null,
      ore_7z: ore7,
      ore_28z_medie_saptamanala: ore28,
      sedinte_7z: sedinte7
    },
    antrenament_ultim: lastAct ? {
      sport: lastAct.sport,
      data: lastAct.date,
      durata: lastAct.minutes,
      distanta: lastAct.distanceKm ?? null,
      fc_medie: lastAct.avgHr ?? null,
      fc_max: lastAct.maxHr ?? null,
      timp_zone: lastAct.timeInZonesMin ? Object.fromEntries(Object.entries(lastAct.timeInZonesMin).map(([z, m]) => [`Z${z}`, m])) : null,
      putere_medie: lastAct.avgWatts ?? null,
      pace_mediu: lastAct.avgPaceMinKm ?? null,
      cadenta: lastAct.avgCadence ?? null,
      rpe: evening?.rpe ?? null,
      fata_de_asteptari: evening?.fata_de_asteptari ?? null,
      durere: { scor: evening?.durere.scor ?? null, loc: evening?.durere.loc ?? null },
      ce_a_incurcat: evening?.ce_a_incurcat ?? null,
      fueling_conform: evening?.fueling_conform ?? null,
      comentariu: evening?.comentariu ?? null,
      in_plan: inPlan,
      tip_neplanificat: inPlan ? null : evening?.tip_neplanificat ?? null,
      fata_de_plan: execution(lastAct, evening)
    } : null,
    sedinte_48h: lastAct ? acts.filter((a) => a !== lastAct && diffDays(a.date, lastAct.date) >= 0 && diffDays(a.date, lastAct.date) <= 1).sort((a, b) => diffDays(a.date, b.date) || (b.startLocal ?? "").localeCompare(a.startLocal ?? "")).map((a) => ({
      sport: a.sport,
      data: a.date,
      ora: a.startLocal ?? null,
      durata: a.minutes,
      fc_medie: a.avgHr ?? null,
      z4_z5_min: a.timeInZonesMin ? (a.timeInZonesMin[4] ?? 0) + (a.timeInZonesMin[5] ?? 0) : null,
      fata_de_plan: execution(a, input.evenings.find((e) => e.activityId === a.externalId) ?? null)
    })) : [],
    plan_azi: planToday ? { sport: planToday.sport, tip: planToday.type === "z2" ? "Z2" : planToday.type, durata_planificata: planToday.plannedMinutes, zone_tinta: planToday.targetZones, structura: planToday.structure ?? null, cheie: planToday.key } : null,
    plan_maine: planTomorrow ? { sport: planTomorrow.sport, tip: planTomorrow.type === "z2" ? "Z2" : planTomorrow.type, durata_planificata: planTomorrow.plannedMinutes, cheie: planTomorrow.key } : null,
    plan_saptamana: { interval: `${monday} \u2013 ${addDays(monday, 6)}${input.athlete.weekLabel ? `, ${input.athlete.weekLabel}` : ""}`, zile },
    vreme: input.weather ?? null,
    progres: progresStatus(input, acwrTotal, acwrBySport, aderenta),
    pregatire_proba: input.athlete.goal ? sportReadiness(input.athlete.goal, dedupeActivities(input.activities), today, { swimContinuousM: input.athlete.declaredSwimM ?? null }).map((r2) => ({ proba: r2.leg, procent: r2.value, demonstrat: r2.parts.map((p) => `${p.label}: ${p.have} din ${p.target}`) })) : [],
    alte_activitati: (() => {
      const recent = (input.others ?? []).filter((o) => diffDays(o.date, today) >= 0 && diffDays(o.date, today) <= 7);
      return {
        recuperare_7z_min: recent.filter((o) => o.kind === "recuperare").reduce((n2, o) => n2 + o.minutes, 0),
        activ_extra_7z_min: recent.filter((o) => o.kind === "activ").reduce((n2, o) => n2 + o.minutes, 0),
        lista: recent.sort((a, b) => diffDays(a.date, b.date) || (b.startLocal ?? "").localeCompare(a.startLocal ?? "")).map((o) => ({ data: o.date, ora: o.startLocal, tip: o.kind, nume: o.name, minute: o.minutes, fc_medie: o.avgHr }))
      };
    })(),
    totaluri_de_la_start: input.totals ?? null,
    aderenta_14z: aderenta,
    verdict_fiziolog: null,
    zone: input.zones,
    corp: {
      greutate_azi: todayRow?.weightKg ?? null,
      greutate_media7: weights.length ? round(mean(weights.map((r2) => r2.weightKg)), 1) : null,
      imc: (() => {
        const h2 = input.athlete.inaltimeCm;
        const w = weights.length ? mean(weights.map((r2) => r2.weightKg)) : lastWeight?.weightKg ?? null;
        return h2 && w ? round(w / (h2 / 100) ** 2, 1) : null;
      })(),
      cantariri_7z: weights.length,
      grasime_pct: lastWeight?.bodyFatPct ?? null,
      data_masurare: lastWeight?.date ?? null
    },
    nutritie_ieri: nutYesterday ? { kcal: nutYesterday.kcal, carbohidrati_g: nutYesterday.carbohidrati_g, proteine_g: nutYesterday.proteine_g, apa_l: nutYesterday.apa_l } : null,
    semnale: {
      boala: input.morning?.semnale.boala ?? null,
      febra: input.morning?.semnale.febra ?? null,
      deplasare: input.morning?.semnale.deplasare ?? null,
      simptom_cardiac: input.morning?.semnale.simptom_cardiac ?? null
    },
    analize: input.labs ?? null,
    aviz: input.aviz
  };
}
function progresStatus(input, acwrTotal, bySport, aderenta) {
  const h = input.history ?? null;
  const base = { zile_verzi_la_rand: h ? h.greenStreak : null, ultima_crestere: h?.lastIncrease ?? null };
  const no = (motiv) => ({ ...base, eligibil: false, motiv });
  if (!h) return no("f\u0103r\u0103 istoric de readiness");
  if (h.greenStreak < 7) return no(`${h.greenStreak} zile verzi la r\xE2nd (trebuie 7)`);
  if (acwrTotal == null) return no("\xEEnc\u0103rcare necunoscut\u0103 (sub 4 s\u0103pt\u0103m\xE2ni de istoric)");
  if (acwrTotal >= 1.3) return no("\xEEnc\u0103rcare total\u0103 peste 1,3");
  const hot = Object.entries(bySport).filter(([, v]) => v != null && v >= 1.3).map(([k]) => k);
  if (hot.length) return no(`\xEEnc\u0103rcare peste 1,3 la ${hot.join(", ")}`);
  if (!aderenta || aderenta.planificate === 0 || aderenta.facute / aderenta.planificate < 0.8) return no("aderen\u021B\u0103 sub 80% \xEEn 14 zile");
  if (h.lastIncrease && diffDays(h.lastIncrease, input.today) < 13) return no(`cre\u0219tere deja pe ${h.lastIncrease}`);
  return { ...base, eligibil: true, motiv: "7 zile verzi, \xEEnc\u0103rcare sub 1,3, aderen\u021B\u0103 bun\u0103" };
}
function momentOfDay(hm3) {
  if (!hm3 || !/^\d{2}:\d{2}/.test(hm3)) return null;
  const h = Number(hm3.slice(0, 2));
  return h >= 22 || h < 5 ? "noapte" : h < 11 ? "dimineata" : h < 17 ? "zi" : "seara";
}

// server/_lib/weather.ts
async function geocode(city) {
  const r2 = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=ro&format=json`);
  if (!r2.ok) return null;
  const j = await r2.json();
  const g = j.results?.[0];
  return g ? { name: `${g.name}${g.country ? `, ${g.country}` : ""}`, lat: g.latitude, lon: g.longitude } : null;
}
async function forecast(city, lat, lon, tz) {
  const q2 = "temperature_2m_max,temperature_2m_min,apparent_temperature_max,precipitation_sum,wind_speed_10m_max";
  try {
    const r2 = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=${q2}&timezone=${encodeURIComponent(tz)}&forecast_days=2`);
    if (!r2.ok) return null;
    const d = await r2.json();
    const day2 = (i) => ({
      tmax: d.daily?.temperature_2m_max?.[i] ?? null,
      tmin: d.daily?.temperature_2m_min?.[i] ?? null,
      resimtita_max: d.daily?.apparent_temperature_max?.[i] ?? null,
      ploaie_mm: d.daily?.precipitation_sum?.[i] ?? null,
      vant_kmh: d.daily?.wind_speed_10m_max?.[i] ?? null
    });
    return d.daily ? { oras: city, azi: day2(0), maine: day2(1) } : null;
  } catch {
    return null;
  }
}

// src/collector/labs-compare.ts
var APP_RANGE = {
  feritina: { min: 30, max: null, unit: "\xB5g/L" },
  vitamina_d: { min: 30, max: null, unit: "ng/mL" },
  hemoglobina: { min: null, max: null, unit: "g/dL" },
  ck: { min: null, max: null, unit: "U/L" },
  crp: { min: null, max: 5, unit: "mg/L" }
};
var LABEL = { feritina: "Feritin\u0103", vitamina_d: "Vitamina D", hemoglobina: "Hemoglobin\u0103", ck: "CK", crp: "CRP" };
function distance(v, min, max) {
  if (min != null && v < min) return min - v;
  if (max != null && v > max) return v - max;
  return 0;
}
function direction(before, now, min, max) {
  const pct2 = before === 0 ? now === 0 ? 0 : 100 : (now - before) / Math.abs(before) * 100;
  if (Math.abs(pct2) < 5) return "stabil";
  if (min == null && max == null) return null;
  const d0 = distance(before, min, max);
  const d1 = distance(now, min, max);
  if (d1 < d0) return "mai_bine";
  if (d1 > d0) return "mai_rau";
  if (d0 === 0 && d1 === 0) {
    if (min != null && max == null) return now > before ? "mai_bine" : "mai_rau";
    if (max != null && min == null) return now < before ? "mai_bine" : "mai_rau";
    return "stabil";
  }
  return "stabil";
}
var key = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
function compareLabs(now, before) {
  if (!before || before.data >= now.data) return null;
  const out = [];
  const r12 = (x) => Math.round(x * 10) / 10;
  for (const k of ["feritina", "vitamina_d", "hemoglobina", "ck", "crp"]) {
    const a = before[k];
    const b = now[k];
    if (a == null || b == null) continue;
    const range = APP_RANGE[k];
    const lab = now.alte.find((x) => key(x.nume).includes(key(LABEL[k])) && (x.ref_min != null || x.ref_max != null));
    const min = lab?.ref_min ?? range.min;
    const max = lab?.ref_max ?? range.max;
    out.push({ nume: LABEL[k], inainte: a, acum: b, unitate: range.unit, schimbare_pct: r12(a === 0 ? 0 : (b - a) / Math.abs(a) * 100), directie: direction(a, b, min, max) });
  }
  const seen = new Set(out.map((c) => key(c.nume)));
  for (const v of now.alte) {
    if (v.valoare == null || seen.has(key(v.nume))) continue;
    const prev = before.alte.find((x) => key(x.nume) === key(v.nume) && x.valoare != null && (x.unitate ?? "") === (v.unitate ?? ""));
    if (!prev) continue;
    seen.add(key(v.nume));
    out.push({
      nume: v.nume,
      inainte: prev.valoare,
      acum: v.valoare,
      unitate: v.unitate,
      schimbare_pct: r12(prev.valoare === 0 ? 0 : (v.valoare - prev.valoare) / Math.abs(prev.valoare) * 100),
      directie: direction(prev.valoare, v.valoare, v.ref_min, v.ref_max)
    });
  }
  return { data_anterioare: before.data, schimbari: out };
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
    note: r2.note ?? void 0,
    suggestion: r2.suggestion ?? null
  };
}
function toWorkoutRow(w, userId, planId) {
  return {
    id: w.id,
    plan_id: planId,
    user_id: userId,
    date: w.date,
    sport: w.sport,
    type: w.type,
    planned_minutes: w.plannedMinutes,
    target_zones: w.targetZones,
    is_key: w.key,
    step: w.step ?? null,
    structure: w.structure ?? null,
    intervals: w.intervals ?? null,
    status: w.status,
    note: w.note ?? null,
    // Doar când există: tabelele vechi (fără coloană) nu primesc câmpul.
    ...w.suggestion ? { suggestion: w.suggestion } : {}
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
    name: r2.name,
    details: r2.raw && typeof r2.raw === "object" ? r2.raw : null
  };
}
function toSourceDaily(r2) {
  return { date: r2.date, source: r2.source, hrv: r2.hrv, rhr: r2.rhr, sleepMin: r2.sleep_min, bedtime: r2.bedtime, wakeTime: r2.wake_time, sleepScore: r2.sleep_score, recoveryScore: r2.recovery_score, respiratoryRate: r2.respiratory_rate, weightKg: r2.weight_kg, bodyFatPct: r2.body_fat_pct };
}
async function loadUser(userId) {
  const u = await one("users", { id: `eq.${userId}` });
  if (!u) throw new Error("utilizator inexistent");
  return u;
}
async function loadPlan(userId, from, to) {
  const plan = await one("plans", { user_id: `eq.${userId}`, active: "eq.true" }, { order: "version.desc" });
  if (!plan) return { planId: null, workouts: [] };
  const rows = await select("workouts_planned", { plan_id: `eq.${plan.id}`, date: [`gte.${from}`, `lte.${to}`] }, { order: "date.asc", limit: 1e3 });
  const workouts = rows.map(toPlanned);
  return { planId: plan.id, workouts };
}
async function loadActivities(userId, from) {
  const [rows, ov] = await Promise.all([
    select("activities", { user_id: `eq.${userId}`, date: `gte.${from}` }, { order: "date.desc", limit: 500 }),
    loadOverrides(userId)
  ]);
  return applyOverrides(rows.map(toSourceActivity), ov);
}
async function loadOverrides(userId) {
  return select("activity_overrides", { user_id: `eq.${userId}` }, { limit: 1e3 }).catch(() => []);
}
function applyOverrides(acts, ov) {
  if (!ov.length) return acts;
  const by = new Map(ov.map((o) => [o.activity_id, o]));
  return acts.filter((a) => !by.get(a.id)?.ignored).map((a) => by.get(a.id)?.sport ? { ...a, sport: by.get(a.id).sport } : a);
}
async function loadWellness(userId, from) {
  const rows = await select("wellness_daily", { user_id: `eq.${userId}`, date: `gte.${from}` }, { order: "date.desc", limit: 500 });
  return rows.map(toSourceDaily);
}
async function loadForms(userId, today) {
  const morningRow = await one("questionnaires", { user_id: `eq.${userId}`, kind: "eq.dimineata", for_date: `eq.${today}` }, { order: "created_at.desc" });
  const eveningRows = await select("questionnaires", { user_id: `eq.${userId}`, kind: "eq.seara", for_date: `gte.${addDays(today, -14)}` }, { order: "created_at.desc", limit: 50 });
  const intakeRow = await one("questionnaires", { user_id: `eq.${userId}`, kind: "eq.intrare" }, { order: "created_at.desc" });
  const morningRows = await select("questionnaires", { user_id: `eq.${userId}`, kind: "eq.dimineata", for_date: `gte.${addDays(today, -14)}` }, { order: "created_at.desc", limit: 60 }).catch(() => []);
  const byDay = /* @__PURE__ */ new Map();
  for (const r2 of morningRows) if (!byDay.has(r2.for_date)) byDay.set(r2.for_date, { ...r2.answers, date: r2.for_date });
  return { morning: morningRow?.answers ?? null, mornings: [...byDay.values()], evenings: eveningRows.map((r2) => r2.answers), intake: intakeRow?.answers ?? null };
}
async function loadZones(userId) {
  const z = await one("zones", { user_id: `eq.${userId}` });
  if (!z || z.source === "provizoriu") return null;
  const five2 = (a) => a && a.length === 5 ? a : null;
  return {
    alergare: { fc_z1_z5: five2(z.run_hr_zones), pace_prag: z.run_threshold_pace_sec_km ? `${Math.floor(z.run_threshold_pace_sec_km / 60)}:${String(z.run_threshold_pace_sec_km % 60).padStart(2, "0")}` : null },
    bicicleta: { ftp: z.bike_ftp_w, fc_z1_z5: five2(z.bike_hr_zones) },
    inot: { css: z.swim_css_sec_100m },
    fcmax_test: z.hr_max_test,
    data_test: z.tested_at
  };
}
function labSnapshot(l) {
  const n2 = (v) => v == null || v === "" ? null : Number(v);
  return {
    data: l.drawn_at,
    feritina: n2(l.feritina),
    vitamina_d: n2(l.vitamina_d),
    hemoglobina: n2(l.hemoglobina),
    ck: n2(l.ck),
    crp: n2(l.crp),
    alte: (l.other?.valori ?? []).map((v) => ({ nume: v.nume, valoare: v.valoare, unitate: v.unitate, ref_min: v.ref_min ?? null, ref_max: v.ref_max ?? null }))
  };
}
async function loadLabs(userId) {
  const rows = await select("labs", { user_id: `eq.${userId}` }, { order: "drawn_at.desc", limit: 2 });
  const l = rows[0];
  const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  if (!l || labsExpired(l.drawn_at, today)) return null;
  const now = labSnapshot(l);
  const out = (l.other?.valori ?? []).filter((v) => v.in_afara).map((v) => ({ nume: v.nume, valoare: v.valoare, unitate: v.unitate, interval: v.ref_text, directie: v.in_afara }));
  const uploaded = l.uploaded_at ? l.uploaded_at.slice(0, 10) : null;
  return {
    feritina: now.feritina,
    vitamina_d: now.vitamina_d,
    hemoglobina: now.hemoglobina,
    ck: now.ck,
    crp: now.crp,
    data_analize: l.drawn_at,
    in_afara_intervalului: out,
    noi: uploaded != null && uploaded >= addDays(today, -3),
    comparatie: compareLabs(now, rows[1] ? labSnapshot(rows[1]) : null)
  };
}
async function loadClearance(userId) {
  const c = await one("clearances", { user_id: `eq.${userId}` });
  if (!c) return { cardiolog: "nu", intensitate_permisa: "Z2" };
  return { cardiolog: c.cardiology ? c.cleared_at ?? "da" : "nu", intensitate_permisa: c.intensity_allowed };
}
function phaseAt(startDate, raceDate, today) {
  try {
    const weeks = phaseWeeks(startDate, raceDate);
    const w = [...weeks].reverse().find((x) => x.weekStart <= today);
    return w?.phase ?? null;
  } catch {
    return null;
  }
}
async function collect(userId, today, event) {
  const user = await loadUser(userId);
  const [planRes, activities, wellness, forms, zones, labs, aviz] = await Promise.all([
    loadPlan(userId, addDays(today, -35), addDays(today, 14)),
    loadActivities(userId, addDays(today, -70)),
    loadWellness(userId, addDays(today, -70)),
    loadForms(userId, today),
    loadZones(userId),
    loadLabs(userId),
    loadClearance(userId)
  ]);
  const planRow = planRes.planId ? await one("plans", { id: `eq.${planRes.planId}` }) : null;
  const phase = planRow ? phaseAt(planRow.start_date, planRow.race_date, today) ?? "evaluare" : "evaluare";
  const [weather, history, totals] = await Promise.all([
    user.lat != null && user.lon != null && user.city ? forecast(user.city, user.lat, user.lon, user.tz) : Promise.resolve(null),
    loadHistory(userId, today),
    planRow ? loadTotals(userId, planRow.start_date) : Promise.resolve(null)
  ]);
  const others = await loadOthers(userId, addDays(today, -8));
  const input = {
    others,
    today,
    event,
    nowLocal: new Intl.DateTimeFormat("en-GB", { timeZone: user.tz || "Europe/Bucharest", hour: "2-digit", minute: "2-digit", hour12: false }).format(/* @__PURE__ */ new Date()),
    athlete: { goal: user.goal ?? null, declaredSwimM: swimDeclared(forms.intake), obiectiv: `${user.race_name ?? "curs\u0103"}${user.race_date ? `, ${user.race_date}` : ""}${runGoalText(user.goal, forms.intake)}${declaredLevel(forms.intake)}`, raceDate: user.race_date ?? addDays(today, 365), phase, sex: user.sex ?? null, varsta: user.birth_year ? Number(today.slice(0, 4)) - user.birth_year : null, inaltimeCm: user.height_cm ?? null },
    wellness,
    activities,
    plan: planRes.workouts,
    zones,
    morning: forms.morning,
    morningHistory: forms.mornings,
    evenings: forms.evenings,
    labs,
    load: null,
    aviz,
    weather,
    history,
    totals
  };
  return { input, user, planId: planRes.planId };
}
async function loadHistory(userId, today) {
  const [rows, inc] = await Promise.all([
    select("readiness_daily", { user_id: `eq.${userId}`, date: [`gte.${addDays(today, -30)}`, `lt.${today}`] }, { order: "date.desc", limit: 31 }),
    one("journal", { user_id: `eq.${userId}`, entry: "like.calendar: progres:*" }, { order: "date.desc" })
  ]);
  let streak = 0;
  let expected = addDays(today, -1);
  for (const r2 of rows) {
    if (r2.date !== expected || r2.verdict !== "verde") break;
    streak++;
    expected = addDays(expected, -1);
  }
  return { greenStreak: streak, lastIncrease: inc?.date ?? null };
}
async function loadTotals(userId, since) {
  const raw = [];
  const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  for (let from = since; from <= today; from = addDays(from, 30)) {
    const rows = await select("activities", { user_id: `eq.${userId}`, date: [`gte.${from}`, `lt.${addDays(from, 30)}`] }, { limit: 1e3 });
    raw.push(...rows.map(toSourceActivity));
  }
  const acts = dedupeActivities(applyOverrides(raw, await loadOverrides(userId)));
  const bySport = { inot: { km: 0, ore: 0, sedinte: 0 }, bicicleta: { km: 0, ore: 0, sedinte: 0 }, alergare: { km: 0, ore: 0, sedinte: 0 }, forta: { km: 0, ore: 0, sedinte: 0 } };
  for (const a of acts) {
    const t = bySport[a.sport];
    t.km += a.distanceKm ?? 0;
    t.ore += a.minutes / 60;
    t.sedinte += 1;
  }
  for (const t of Object.values(bySport)) {
    t.km = Math.round(t.km * 10) / 10;
    t.ore = Math.round(t.ore * 10) / 10;
  }
  return { since, bySport };
}
function runGoalText(goal, intake) {
  if (!isRunGoal(goal) || !intake) return "";
  const a = intake.alergare ?? {};
  const d = RUN_DISTANCE_KM[goal];
  const t = paceFromResult(a.tinta, d);
  const now = paceFromResult(a.rezultatActual, d);
  const parts = [
    t ? `\u021Binta ${fmtDuration(t * d)} (${fmtPaceSec(t)}/km)` : null,
    a.ritmActual ? `ritm u\u0219or acum ${a.ritmActual}/km` : null,
    a.poateDistanta === true ? `poate distan\u021Ba acum${now ? `: ${fmtDuration(now * d)} (${fmtPaceSec(now)}/km)` : ""}` : a.poateDistanta === false ? "nu poate \xEEnc\u0103 distan\u021Ba" : null
  ].filter(Boolean);
  return parts.length ? ` \xB7 doar alergare \xB7 ${parts.join(" \xB7 ")}` : " \xB7 doar alergare";
}
function declaredLevel(intake) {
  const e = intake?.evaluare ?? null;
  if (!e) return "";
  const parts = [
    e.inot400 ? `400 m \xEEnot ${e.inot400}` : null,
    e.bicicletaViteza ? `biciclet\u0103 ${e.bicicletaViteza} km/h medie` : null,
    e.ftp ? `FTP declarat ${e.ftp} W` : null,
    e.ritmUsor ? `alergare u\u0219oar\u0103 ${e.ritmUsor}/km` : null,
    e.alergare5k ? `5 km \xEEn ${e.alergare5k}` : null,
    e.alergare10k ? `10 km \xEEn ${e.alergare10k}` : null,
    e.testEfort && e.testEfort !== "nu" ? `test de efort: ${e.testEfort}` : null
  ].filter(Boolean);
  return parts.length ? ` \xB7 nivel declarat: ${parts.join(", ")}` : "";
}
async function loadOthers(userId, from) {
  const rows = await select("other_activities", { user_id: `eq.${userId}`, date: `gte.${from}` }, { order: "date.desc", limit: 200 }).catch(() => []);
  return rows.map((r2) => ({ id: r2.id, source: r2.source, externalId: r2.external_id, date: r2.date, startLocal: r2.start_local, kind: r2.kind, name: r2.name, minutes: r2.minutes, avgHr: r2.avg_hr, maxHr: r2.max_hr }));
}

// server/_lib/usage.ts
var PRICE_IN = 2;
var PRICE_OUT = 10;
function costUsd(input, output) {
  return (input * PRICE_IN + output * PRICE_OUT) / 1e6;
}
async function recordUsage(userId, kind, model, u) {
  if (!u) return;
  const input = (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0);
  await insert("ai_usage", { user_id: userId, kind, model, input_tokens: input, output_tokens: u.output_tokens ?? 0 }).catch(() => void 0);
}

// src/agents/schema.ts
var SPECIALIST_SCHEMA = {
  type: "object",
  properties: {
    agent: { type: "string", enum: ["fiziolog", "antrenor_inot", "antrenor_bicicleta", "antrenor_alergare", "antrenor_forta", "nutritionist", "fizioterapeut", "minte"] },
    verdict: { type: "string", enum: ["ok", "atentie", "stop", "tacere", "verde", "galben", "rosu"] },
    ce: {
      type: "array",
      items: {
        type: "object",
        properties: {
          text: { type: "string" },
          cifre: {
            type: "array",
            items: {
              type: "object",
              properties: { valoare: { type: ["number", "string"] }, camp: { type: "string" } },
              required: ["valoare", "camp"],
              additionalProperties: false
            }
          }
        },
        required: ["text", "cifre"],
        additionalProperties: false
      }
    },
    mese: { type: "array", items: { type: "string" } },
    pentru_viitor: { type: "string" },
    lipseste: { type: "array", items: { type: "string" } }
  },
  required: ["agent", "verdict", "ce", "mese", "pentru_viitor", "lipseste"],
  additionalProperties: false
};
var HEAD_SCHEMA = {
  type: "object",
  properties: {
    decizie: { type: "string", enum: ["verde", "galben", "rosu", "stop"] },
    mesaj: { type: "string" },
    memento: { type: "string" },
    jurnal: { type: "array", items: { type: "string" } },
    intrebare: { type: ["string", "null"] }
  },
  required: ["decizie", "mesaj", "memento", "jurnal", "intrebare"],
  additionalProperties: false
};

// src/agents/verify.ts
var AGENTS = ["fiziolog", "antrenor_inot", "antrenor_bicicleta", "antrenor_alergare", "antrenor_forta", "nutritionist", "fizioterapeut", "minte"];
var VERDICTS = ["ok", "atentie", "stop", "tacere", "verde", "galben", "rosu"];
var MAX_CE = { fiziolog: 4, antrenor_inot: 4, antrenor_bicicleta: 4, antrenor_alergare: 4, antrenor_forta: 4, nutritionist: 4, fizioterapeut: 3, minte: 2 };
var FREE_FIELDS = /* @__PURE__ */ new Set(["prescriptie", "regula"]);
function getPath(obj, path) {
  let cur = obj;
  for (const part of path.split(".")) {
    if (cur != null && typeof cur === "object" && part in cur) {
      cur = cur[part];
    } else if (Array.isArray(cur) && /^\d+$/.test(part) && Number(part) < cur.length) {
      cur = cur[Number(part)];
    } else {
      return { found: false, value: void 0 };
    }
  }
  return { found: true, value: cur };
}
function numbersIn(text) {
  const cleaned = text.replace(/\bZ[1-5](?:\s*[–-]\s*Z?[1-5])?\b/g, " ").replace(/\b\d{4}-\d{2}-\d{2}\b/g, " ").replace(/\b\d{1,2}\.\d{1,2}\.\d{4}\b/g, " ");
  const out = [];
  for (const m of cleaned.matchAll(/(?<![\w.,])(-?\d+(?:[.,]\d+)?)(?![\w])/g)) {
    out.push(Number(m[1].replace(",", ".")));
  }
  const durations = text.match(/\b\d{1,2}:\d{2}\b/g) ?? [];
  for (const d of durations) {
    const [h, m] = d.split(":").map(Number);
    const ih = out.indexOf(h);
    if (ih >= 0) out.splice(ih, 1);
    const im = out.indexOf(m);
    if (im >= 0) out.splice(im, 1);
  }
  return out;
}
function valueEquals(claimed, actual) {
  if (actual == null) return false;
  if (typeof actual === "number") {
    const c = typeof claimed === "number" ? claimed : Number(String(claimed).replace(",", "."));
    return Number.isFinite(c) && Math.abs(c - actual) < 0.051;
  }
  if (typeof actual === "string") return String(claimed).trim().toLowerCase() === actual.trim().toLowerCase();
  if (typeof actual === "boolean") return String(claimed).toLowerCase() === String(actual);
  if (Array.isArray(actual)) return JSON.stringify(actual) === JSON.stringify(claimed) || actual.map(String).join("\u2013") === String(claimed);
  return false;
}
function verifyResponse(resp, packet) {
  const avertismente = [];
  let valid = true;
  if (!AGENTS.includes(resp.agent)) {
    avertismente.push(`agent necunoscut: ${resp.agent}`);
    valid = false;
  }
  if (!VERDICTS.includes(resp.verdict)) {
    avertismente.push(`verdict \xEEn afara listei: ${String(resp.verdict)}`);
    valid = false;
  }
  const ce = Array.isArray(resp.ce) ? resp.ce : [];
  const max = MAX_CE[resp.agent] ?? 4;
  if (ce.length > max) avertismente.push(`\u201Ece\u201D are ${ce.length} r\xE2nduri, maximum ${max}: r\xE2ndurile de dup\u0103 ${max} se ignor\u0103`);
  if (resp.verdict === "tacere" && ce.length > 0) {
    avertismente.push("t\u0103cere cu con\u021Binut \xEEn \u201Ece\u201D: con\u021Binutul se ignor\u0103");
  }
  if (typeof resp.pentru_viitor === "string" && resp.pentru_viitor.split("\n").filter((l) => l.trim()).length > 1) {
    avertismente.push("\u201Epentru_viitor\u201D are mai mult de un r\xE2nd");
  }
  const items = [];
  const usable = resp.verdict === "tacere" ? [] : ce.slice(0, max);
  for (const item of usable) {
    const cifre = item.cifre ?? [];
    const reasons = [];
    const coveredValues = [];
    for (const c of cifre) {
      if (FREE_FIELDS.has(c.camp)) {
        if (typeof c.valoare === "number") coveredValues.push(c.valoare);
        continue;
      }
      const { found, value } = getPath(packet, c.camp);
      if (!found) reasons.push(`c\xE2mp inexistent: ${c.camp}`);
      else if (value == null) reasons.push(`c\xE2mp null citat ca valoare: ${c.camp}`);
      else if (!valueEquals(c.valoare, value)) reasons.push(`${c.camp}: \xEEn pachet ${JSON.stringify(value)}, \xEEn text ${JSON.stringify(c.valoare)}`);
      else if (typeof c.valoare === "number") coveredValues.push(c.valoare);
      else if (typeof value === "number") coveredValues.push(value);
    }
    for (const n2 of numbersIn(item.text)) {
      const idx = coveredValues.findIndex((v) => Math.abs(v - n2) < 0.051);
      if (idx >= 0) coveredValues.splice(idx, 1);
      else reasons.push(`num\u0103r f\u0103r\u0103 c\xE2mp: ${n2}`);
    }
    items.push(reasons.length ? { ...item, stare: "respins", motiv: reasons.join("; ") } : { ...item, stare: "acceptat" });
  }
  const lipseste = [];
  for (const f of resp.lipseste ?? []) {
    const { found, value } = getPath(packet, f);
    if (!found) avertismente.push(`\u201Elipseste\u201D cu c\xE2mp inexistent \xEEn schem\u0103: ${f}`);
    else if (value != null) avertismente.push(`\u201Elipseste\u201D cu c\xE2mp care are valoare: ${f}`);
    else lipseste.push(f);
  }
  return {
    agent: resp.agent,
    verdict: resp.verdict,
    ce: items,
    mese: resp.agent === "nutritionist" ? (resp.mese ?? []).slice(0, 3) : [],
    pentru_viitor: typeof resp.pentru_viitor === "string" ? resp.pentru_viitor.split("\n").find((l) => l.trim()) ?? "-" : "-",
    lipseste,
    avertismente,
    valid
  };
}

// src/agents/runner.ts
function anthropicClient(apiKey, fetchImpl = fetch, onUsage) {
  return {
    async json(req) {
      const res = await fetchImpl("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({
          model: req.model,
          // Plafon larg: modelul poate gândi înainte de răspuns, iar gândirea consumă din max_tokens.
          max_tokens: Math.max(req.maxTokens ?? 0, 16e3),
          system: req.system,
          messages: [{ role: "user", content: req.user }],
          output_config: { format: { type: "json_schema", schema: req.schema } }
        })
      });
      if (!res.ok) throw new Error(`model ${res.status}: ${await res.text()}`);
      const data = await res.json();
      if (data.usage) onUsage?.(req.model, data.usage);
      const text = data.content.filter((b) => b.type === "text").map((b) => b.text ?? "").join("");
      if (!text) throw new Error(`model: r\u0103spuns f\u0103r\u0103 text (${data.stop_reason ?? "necunoscut"})`);
      try {
        return JSON.parse(text);
      } catch {
        throw new Error(`model: r\u0103spuns incomplet (${data.stop_reason ?? "necunoscut"})`);
      }
    }
  };
}
var COACH_OF = { inot: "antrenor_inot", bicicleta: "antrenor_bicicleta", alergare: "antrenor_alergare", forta: "antrenor_forta" };
function route(p) {
  const out = /* @__PURE__ */ new Set(["fiziolog"]);
  const sunday = p.meta.zi_saptamana === "duminica";
  const ultim = p.antrenament_ultim;
  const pain = (ultim?.durere.scor ?? 0) >= 3 || /dur(e|o)r/i.test(ultim?.comentariu ?? "");
  if (p.meta.eveniment === "dimineata") {
    const sport = p.plan_azi?.sport;
    const coach = sport ? COACH_OF[sport] : null;
    if (coach) out.add(coach);
    if (sport === "forta") out.add("fizioterapeut");
    out.add("nutritionist");
    if ((p.readiness.hooper.stres ?? 0) >= 5) out.add("minte");
  } else if (p.meta.eveniment === "dupa_antrenament") {
    const coach = ultim ? COACH_OF[ultim.sport] : null;
    if (coach) out.add(coach);
    if (ultim?.sport === "forta") out.add("fizioterapeut");
    if (p.plan_maine) out.add("nutritionist");
    if (ultim?.comentariu || ultim?.fata_de_asteptari === "mai_greu") out.add("minte");
  } else {
    for (const a of AGENTS) out.add(a);
  }
  if (pain || sunday) out.add("fizioterapeut");
  if (sunday) out.add("minte");
  return [...out];
}
function specialistSystem(agent, prompts) {
  if (agent.startsWith("antrenor_")) {
    const sport = agent.replace("antrenor_", "");
    const SPORT = { inot: "\xCENOT", bicicleta: "BICICLET\u0102", alergare: "ALERGARE", forta: "FOR\u021A\u0102" }[sport] ?? sport.toUpperCase();
    const common = prompts.antrenor_comun.replace(/<SPORT>/g, SPORT).replace(/<sport>/g, sport);
    const own = prompts[agent] ?? "";
    return `${common}
${own}

${prompts.ghid ?? ""}

${prompts.format}`;
  }
  return `${prompts[agent]}

${prompts.format}`;
}
function specialistUser(agent, p, file) {
  const fileName = `${agent.replace("antrenor_", "")}.md`;
  return [`=== FI\u0218IERUL T\u0102U (${fileName}) ===`, file?.trim() || "(gol: prima rulare)", "", `=== PACHETUL DE DATE (${p.meta.eveniment}, ${p.meta.data}) ===`, JSON.stringify(p, null, 1)].join("\n");
}
function headUser(p, specialists, journal) {
  return [
    `=== PACHETUL DE DATE (${p.meta.eveniment}, ${p.meta.data}) ===`,
    JSON.stringify(p, null, 1),
    "",
    "=== R\u0102SPUNSURILE SPECIALI\u0218TILOR, VERIFICATE MECANIC ===",
    JSON.stringify(specialists, null, 1),
    "",
    "=== jurnal.md (ultimele 14 zile) ===",
    journal.length ? journal.join("\n") : "(gol)"
  ].join("\n");
}
function flattenNumbers(obj, out = []) {
  if (typeof obj === "number") out.push(obj);
  else if (typeof obj === "string") {
    const m = /^(\d{1,2}):(\d{2})$/.exec(obj);
    if (m) out.push(Number(m[1]), Number(m[2]), Number(m[1]) * 60 + Number(m[2]));
    else for (const n2 of numbersIn(obj)) out.push(n2);
  } else if (Array.isArray(obj)) obj.forEach((x) => flattenNumbers(x, out));
  else if (obj && typeof obj === "object") Object.values(obj).forEach((x) => flattenNumbers(x, out));
  return out;
}
function verifyHeadText(text, packet, specialists) {
  const allowed = flattenNumbers(packet);
  for (const s of specialists) for (const item of s.ce) if (item.stare === "acceptat") {
    for (const c of item.cifre ?? []) if (typeof c.valoare === "number") allowed.push(c.valoare);
  }
  for (const s of specialists) for (const m of s.mese) allowed.push(...numbersIn(m));
  const problems = [];
  for (const n2 of numbersIn(text)) {
    if (!allowed.some((v) => Math.abs(v - n2) < 0.051)) problems.push(`num\u0103r f\u0103r\u0103 surs\u0103 \xEEn pachet sau la speciali\u0219ti: ${n2}`);
  }
  for (const m of text.matchAll(/\[([a-z_][a-z0-9_.]*)\]/gi)) {
    const { found } = getPath(packet, m[1]);
    if (!found) problems.push(`c\xE2mp inexistent citat: ${m[1]}`);
  }
  return problems;
}
function fallbackMessage(p, decision, specialists) {
  const lines = [];
  const label = { verde: "verde", galben: "galben", rosu: "ro\u0219u", stop: "stop" }[decision];
  lines.push(`Decizia: ${label}.`);
  if (decision === "rosu") lines.push("Azi: f\u0103r\u0103 antrenament.");
  else if (decision === "stop") lines.push("Azi: oprire. Vorbe\u0219te cu un medic / cardiolog / fizioterapeut.");
  else if (p.plan_azi) lines.push(`Azi: ${p.plan_azi.sport} ${p.plan_azi.tip} ${p.plan_azi.durata_planificata} min${decision === "galben" ? ", Z1\u2013Z2" : ""}.`);
  for (const s of specialists) for (const item of s.ce) if (item.stare === "acceptat") lines.push(`${s.agent}: ${item.text}`);
  return lines.slice(0, 12).join("\n");
}
function eventsFrom(p, decision) {
  const ev = [];
  if (p.semnale.febra) ev.push({ kind: "febra", date: p.meta.data });
  if (decision !== "verde") ev.push({ kind: "readiness", date: p.meta.data, verdict: decision });
  const d = p.antrenament_ultim?.durere;
  if (d?.scor != null && d.scor >= 3) ev.push({ kind: "durere", date: p.antrenament_ultim.data, score: d.scor, loc: d.loc ?? "nespecificat" });
  const u = p.antrenament_ultim;
  if (u && !u.in_plan && u.tip_neplanificat && u.tip_neplanificat !== "altceva") {
    ev.push({ kind: "neplanificat", activity: { id: `${u.sport}-${u.data}`, date: u.data, sport: u.sport, minutes: u.durata, distanceKm: u.distanta ?? null }, rpe: u.rpe ?? null, tip: u.tip_neplanificat });
  }
  if (p.meta.eveniment === "saptamanal" && decision === "verde" && p.progres?.eligibil) {
    const restricted = Object.entries(p.incarcare.acwr_sport).filter(([, v]) => v != null && v >= 1.3).map(([k]) => k);
    ev.push({ kind: "progres", date: p.meta.data, restricted });
  }
  return ev;
}
var RANK2 = { verde: 0, galben: 1, rosu: 2, stop: 3 };
function physVerdict(v, p) {
  const raw = p.readiness.verdict_cod?.verdict ?? "galben";
  let out = raw === "portocaliu" ? "galben" : raw;
  if (v?.verdict === "stop" || p.semnale.febra === true || p.semnale.simptom_cardiac === true) return "stop";
  if (p.semnale.boala === true || (p.antrenament_ultim?.durere.scor ?? 0) >= 5) out = "rosu";
  return out;
}
async function runPyramid(input, client) {
  const { packet, prompts, models } = input;
  const routed = route(packet);
  const specialists = [];
  const physRaw = await client.json({
    model: models.specialist,
    system: specialistSystem("fiziolog", prompts),
    user: specialistUser("fiziolog", packet, input.files.fiziolog),
    schema: SPECIALIST_SCHEMA
  });
  const phys = verifyResponse({ ...physRaw, agent: "fiziolog" }, packet);
  specialists.push(phys);
  let decision = physVerdict(phys, packet);
  const packetWithVerdict = { ...packet, verdict_fiziolog: decision };
  const others = routed.filter((a) => a !== "fiziolog");
  const results = await Promise.all(
    others.map(async (agent) => {
      const raw = await client.json({
        model: models.specialist,
        system: specialistSystem(agent, prompts),
        user: specialistUser(agent, packetWithVerdict, input.files[agent]),
        schema: SPECIALIST_SCHEMA
      });
      return verifyResponse({ ...raw, agent }, packetWithVerdict);
    })
  );
  specialists.push(...results);
  if (specialists.some((s) => s.verdict === "stop")) decision = "stop";
  let head = await client.json({ model: models.head, system: `${prompts.head_coach}

${prompts.ghid ?? ""}`, user: headUser(packetWithVerdict, specialists, input.journal), schema: HEAD_SCHEMA, maxTokens: 2e3 });
  let headWarnings = [...verifyHeadText(head.mesaj, packetWithVerdict, specialists), ...verifyHeadText(head.memento, packetWithVerdict, specialists)];
  if (RANK2[head.decizie] < RANK2[decision]) headWarnings.push(`decizia head coach-ului (${head.decizie}) e mai permisiv\u0103 dec\xE2t a Fiziologului (${decision}); se p\u0103streaz\u0103 ${decision}`);
  let fallbackUsed = false;
  if (headWarnings.length) {
    const retry = await client.json({
      model: models.head,
      system: `${prompts.head_coach}

${prompts.ghid ?? ""}`,
      user: `${headUser(packetWithVerdict, specialists, input.journal)}

=== VERIFICAREA PRIMEI VARIANTE A RESPINS ===
${headWarnings.join("\n")}
Rescrie f\u0103r\u0103 aceste cifre sau cu c\xE2mpul lor corect. Decizia nu poate fi mai permisiv\u0103 dec\xE2t ${decision}.`,
      schema: HEAD_SCHEMA,
      maxTokens: 2e3
    });
    const again = [...verifyHeadText(retry.mesaj, packetWithVerdict, specialists), ...verifyHeadText(retry.memento, packetWithVerdict, specialists)];
    if (again.length === 0 && RANK2[retry.decizie] >= RANK2[decision]) {
      head = retry;
      headWarnings = [];
    } else {
      fallbackUsed = true;
      head = {
        decizie: decision,
        mesaj: fallbackMessage(packetWithVerdict, decision, specialists),
        memento: `Ziua ${packet.meta.data}: preg\u0103tirea continu\u0103.`,
        jurnal: [...head.jurnal, `head coach respins de dou\u0103 ori la verificare: ${again.join("; ") || headWarnings.join("; ")}; mesaj din cod`],
        intrebare: null
      };
      headWarnings = again.length ? again : headWarnings;
    }
  }
  if (head.decizie === "stop") decision = "stop";
  head = { ...head, decizie: decision };
  return { routed, specialists, head, headWarnings, events: eventsFrom(packetWithVerdict, decision), decision, fallbackUsed };
}

// src/prompts/bundle.ts
var PROMPTS = {
  head_coach: 'E\u0219ti HEAD COACH-ul, coordonatorul preg\u0103tirii individuale pentru triatlon. Obiectivul \u0219i data sunt \xEEn pachet (meta.obiectiv, meta.zile_pana_la_cursa); pentru Ironman 70.3 asta \xEEnseamn\u0103 \xEEnot 1,9 km, biciclet\u0103 90 km \u0219i alergare 21,1 km. La semimaraton (21,1 km) sau maraton (42,2 km) planul e doar alergare + for\u021B\u0103: Antrenorii de \xEEnot \u0219i biciclet\u0103 tac, \u021Binta \u0219i nivelul de plecare sunt \xEEn meta.obiectiv (timp \u0219i ritm), iar laudele \u0219i bilan\u021Bul se raporteaz\u0103 la ritmul-\u021Bint\u0103.\n\nMISIUNEA TA\nConstruie\u0219ti \u0219i adaptezi un plan realist pentru obiectivul sportivului, folosind datele disponibile \u0219i rapoartele agen\u021Bilor specializa\u021Bi. Urm\u0103re\u0219ti progresul sus\u021Binut, recuperarea \u0219i compatibilitatea cu via\u021Ba sportivului.\nPlanul trebuie s\u0103 fie suficient de solicitant pentru progres \u0219i suficient de adaptabil ca s\u0103 poat\u0103 fi urmat. Nu maximizezi confortul, volumul sau scorurile de pe br\u0103\u021B\u0103ri. Nu promi\u021Bi finalizarea cursei \u0219i nu ascunzi c\xE2nd obiectivul e insuficient sus\u021Binut de date: c\xE2nd bara de preg\u0103tire, progresul pe un sport sau istoricul nu sus\u021Bin cursa la data ei, o spui o dat\u0103, cu cifrele, \u0219i propui o alternativ\u0103 concret\u0103: o curs\u0103 mai scurt\u0103 (olimpic, sprint), o dat\u0103 mai t\xE2rzie sau ce trebuie s\u0103 se schimbe \xEEn urm\u0103toarele 4 s\u0103pt\u0103m\xE2ni (ore, \u0219edin\u021Be, un test). Alternativa e o propunere; decide sportivul. Revii asupra ei doar c\xE2nd cifrele se schimb\u0103.\nTu comunici concluzia principal\u0103 sportivului. Agen\u021Bii furnizeaz\u0103 expertiz\u0103 \u0219i propuneri; nu modific\u0103 independent calendarul. Calendarul se schimb\u0103 prin regulile programului (readiness, durere, febr\u0103, activitate \xEEn afara planului), pe baza verdictelor pe care le confirmi tu.\n\nCUM G\xC2NDE\u0218TI (antrenor de anduran\u021B\u0103 cu experien\u021B\u0103)\n- Consecven\u021Ba bate eroismul: cel mai bun antrenament e cel care las\u0103 loc pentru cel de m\xE2ine. Progresul vine din s\u0103pt\u0103m\xE2ni bune la r\xE2nd, nu din zile mari.\n- Distribu\u021Bia intensit\u0103\u021Bii: aproximativ 80% din timp u\u0219or (Z1\u2013Z2), 20% tare; zonele de mijloc f\u0103r\u0103 motiv sunt cele mai scumpe.\n- Supra\xEEnc\u0103rcare progresiv\u0103: volumul cre\u0219te cel mult 10% pe s\u0103pt\u0103m\xE2n\u0103, cu desc\u0103rcare regulat\u0103; intensitatea cre\u0219te abia dup\u0103 ce baza aerob\u0103 e stabil\u0103.\n- Specificitatea vine t\xE2rziu: ritmul de curs\u0103, brick-urile lungi \u0219i repeti\u021Biile de alimentare se fac \xEEn build \u0219i peak, nu la \xEEnceput.\n- Sportul cel mai slab prime\u0219te frecven\u021B\u0103, nu volum: la un \xEEnot\u0103tor \xEEncep\u0103tor, 3 \u0219edin\u021Be scurte de tehnic\u0103 valoreaz\u0103 mai mult dec\xE2t una lung\u0103.\n- Toate sporturile sunt prezente din prima s\u0103pt\u0103m\xE2n\u0103, adaptate ca durat\u0103 la nivelul sportivului; nu se \u201Eadaug\u0103 mai t\xE2rziu\u201D un sport.\n- Recuperarea e antrenament: somnul, alimentarea \u0219i zilele u\u0219oare fac adaptarea; o s\u0103pt\u0103m\xE2n\u0103 de desc\u0103rcare nu e timp pierdut.\n- Ce s-a pierdut nu se recupereaz\u0103 prin dublare; se continu\u0103 planul.\n- Datele de s\u0103n\u0103tate decid ziua (vezi Fiziologul); experien\u021Ba ta decide cum o spui \u0219i ce accentuezi.\n\nCUM CONDUCI ECHIPA (manager)\n- Un singur plan; compari propunerile speciali\u0219tilor cu \xEEnc\u0103rcarea total\u0103 \u0219i cu zilele urm\u0103toare, nu le aduni mecanic. O restric\u021Bie medical\u0103 nu se anuleaz\u0103 prin consensul agen\u021Bilor.\n- Schimbi minimum necesar; nu rescrii s\u0103pt\u0103m\xE2na pentru fluctua\u021Bii mici. Nu pretinzi consult\u0103ri sau date care nu apar \xEEn pachet.\n- Ascul\u021Bi to\u021Bi speciali\u0219tii, dar decizia e una \u0219i o spui pe scurt, cu motivul; \xEEl lauzi pe fapte \u0219i \xEEi spui direct c\xE2nd se las\u0103 moale.\n\n1. Fiziolog: capacitate de efort, teste, zone, \xEEnc\u0103rcare \u0219i recuperare. D\u0103 verdictul zilei: verde / galben / ro\u0219u / stop.\n2. Antrenor de \xEEnot: nivel, tehnic\u0103, rezisten\u021B\u0103, bazin \u0219i ape deschise.\n3. Antrenor de biciclet\u0103: nivel, putere, rezisten\u021B\u0103, pozi\u021Bie \u0219i efort specific.\n4. Antrenor de alergare: nivel, ritm, toleran\u021B\u0103 la impact \u0219i progresie.\n5. Nutri\u021Bionist: mese, alimentare \xEEn efort, hidratare, toleran\u021B\u0103 digestiv\u0103, suplimente doar din analize.\n6. Fizioterapeut: dureri, \xEEnc\u0103rcare f\u0103r\u0103 impact, cele dou\u0103 exerci\u021Bii de preven\u021Bie; escaladare la om.\n7. Minte: motiva\u021Bie, a\u0219tept\u0103ri \u0219i rutin\u0103; nu s\u0103n\u0103tate mintal\u0103.\n\nCE PRIME\u0218TI\n(1) Pachetul de date JSON al evenimentului (diminea\u021Ba / dup\u0103 antrenament / s\u0103pt\u0103m\xE2nal). Orice cifr\u0103 pe care o spui vine de aici sau dintr-un r\xE2nd acceptat al unui specialist.\n(2) R\u0103spunsurile speciali\u0219tilor ruta\u021Bi, \xEEn JSON, deja trecute prin verificarea mecanic\u0103: fiecare r\xE2nd din "ce" are "stare": "acceptat" sau "respins" cu motivul. Folose\u0219ti doar r\xE2ndurile acceptate.\n(3) jurnal.md: deciziile ultimelor 14 zile \u0219i respingerile.\n\nCE FACI, \xCEN ORDINEA ASTA\n1. Dac\u0103 vreun specialist a dat "stop", mesajul t\u0103u con\u021Bine doar oprirea \u0219i cu cine vorbe\u0219te sportivul azi (cardiolog / fizioterapeut / medic). Nimic altceva.\n2. Decizia zilei = culoarea din datele de s\u0103n\u0103tate (readiness.verdict_cod: inim\u0103, respira\u021Bie, recuperare, somn mediate, apoi cum s-a sim\u021Bit sportivul); \xEEnc\u0103rcarea \u0219i ora de culcare sunt sfaturi \xEEn mesaj, nu schimb\u0103 culoarea; o po\u021Bi face doar mai strict\u0103, niciodat\u0103 mai permisiv\u0103. Ro\u0219u \xEEnseamn\u0103 f\u0103r\u0103 antrenament azi, oricare ar fi p\u0103rerea antrenorilor. Galben (sau portocaliu) nu schimb\u0103 singur planul: \u0219edin\u021Ba din plan r\u0103m\xE2ne, iar aplica\u021Bia \xEEi arat\u0103 sportivului o SUGESTIE mai u\u0219oar\u0103 (Z1\u2013Z2, volum \u221220\u201325%). Sportivul alege; tu \xEEi spui pe scurt de ce ai recomanda varianta u\u0219oar\u0103 \u0219i c\u0103, dac\u0103 se simte \xEEn stare, poate face ce era \xEEn plan.\n   Restric\u021Biile pe sport ale Fiziologului (\xEEnc\u0103rcarea pe un singur sport) se aplic\u0103 \u0219i pe o zi verde: sportul restric\u021Bionat nu se face sau se face u\u0219or; \xEEnlocuirea cu un sport f\u0103r\u0103 impact o confirmi doar dac\u0103 antrenorii au acceptat-o. \xCEnc\u0103rcarea pe un sport conteaz\u0103 \u0219i pentru restul preg\u0103tirii: o alergare grea obose\u0219te \u0219i bicicleta de m\xE2ine.\n3. Conflict \xEEntre speciali\u0219ti: c\xE2\u0219tig\u0103 ordinea siguran\u021B\u0103 > recuperare > performan\u021B\u0103 > nutri\u021Bie > longevitate. Notezi conflictul \xEEn jurnal \xEEntr-un r\xE2nd.\n4. Scrii un singur mesaj, \xEEn formatul evenimentului:\n   - diminea\u021Ba, cel mult 4 r\xE2nduri scurte: \u201EAzi: \u2026\u201D (\u0219edin\u021Ba \xEEn cuvinte simple sau \u201Epauz\u0103\u201D) / \u201EDe ce: \u2026\u201D (o propozi\u021Bie) / \u201EAten\u021Bie: \u2026\u201D (un singur lucru de urm\u0103rit sau c\xE2nd te opre\u0219ti) / \u201EM\xE2ncare: \u2026\u201D (doar dac\u0103 e ceva special);\n   - dup\u0103 antrenament, cel mult 3 r\xE2nduri scurte: \u201ECum a fost: \u2026\u201D / \u201EM\xE2ine: \u2026\u201D / \u201EM\u0103n\xE2nc\u0103: \u2026\u201D (doar dac\u0103 conteaz\u0103);\n   - duminica: ce a mers, ce nu, s\u0103pt\u0103m\xE2na urm\u0103toare \u2014 maximum 20 de r\xE2nduri (plus bilan\u021Bul lunar, c\xE2nd e cazul).\n   Cifrele r\u0103m\xE2n cu c\xE2mpul lor, \xEEn paranteze p\u0103trate: "HRV 27,9 ms [hrv.azi]" (aplica\u021Bia ascunde parantezele).\n   MOMENTUL ZILEI (meta.moment_zi, meta.ora_locala): scrii pentru ora la care cite\u0219te sportivul, nu pentru eveniment.\n   - dimineata: ce faci azi.\n   - zi: ce mai ai de f\u0103cut azi; dac\u0103 s-a antrenat deja, cum a fost.\n   - seara / noapte: ziua de azi s-a \xEEncheiat; nu mai propui antrenament azi. Scrii pe scurt cum a fost ziua, ce ai m\xE2ine (plan_maine) \u0219i un sfat de somn. F\u0103r\u0103 \u201Ebun\u0103 diminea\u021Ba\u201D, f\u0103r\u0103 \u201Eazi faci\u201D.\n   LIMBAJUL: sportivul nu e fiziolog. Scrii ca un antrenor care vorbe\u0219te cu omul la marginea pistei:\n   - F\u0103r\u0103 prescurt\u0103ri \u0219i termeni tehnici: nu ACWR, TSB, CTL, Hooper, CSS, FTP, verdict_cod. Spui ce \xEEnseamn\u0103: \u201Eai crescut volumul prea repede \xEEn ultima s\u0103pt\u0103m\xE2n\u0103\u201D, \u201Eritmul t\u0103u de prag la \xEEnot\u201D.\n   - Zonele le spui \xEEn cuvinte, cu cifra de puls: \u201Eu\u0219or, s\u0103 po\u021Bi vorbi (sub 140)\u201D, nu \u201EZ1\u2013Z2\u201D.\n   - Nu poveste\u0219ti cum lucreaz\u0103 echipa (speciali\u0219ti, r\xE2nduri acceptate, c\xE2mpuri, date lips\u0103 din pachet). Sportivul vrea decizia, nu ra\u021Bionamentul.\n   - O informa\u021Bie lips\u0103 o ceri \xEEntr-un singur r\xE2nd scurt, la final, doar dac\u0103 schimb\u0103 decizia de m\xE2ine.\n   - Culoarea zilei o spui o singur\u0103 dat\u0103 \u0219i e cea din datele de s\u0103n\u0103tate; nu o justifici cu \xEEnc\u0103rcarea.\n5. Scrii un memento: un singur r\xE2nd cu un fapt adev\u0103rat din datele sportivului (cea mai lung\u0103 \u0219edin\u021B\u0103, o serie de zile, o cifr\u0103 care a crescut), cu c\xE2mpul lui. F\u0103r\u0103 citate, f\u0103r\u0103 \xEEndemnuri. Dac\u0103 nu exist\u0103 niciun fapt nou, mementoul e ziua din plan: "Ziua N din M".\n6. Scrii decizia zilei \xEEn jurnal: data, verdictul, ce s-a schimbat fa\u021B\u0103 de plan, de ce (un c\xE2mp). Plus "respins: <agent> - <text> (<motiv>)" pentru fiecare r\xE2nd respins.\n\nPROGRES, VREME, TOTALURI\n- Planul cre\u0219te doar prin regula programului: progres.eligibil = true duminica, pe o zi verde, \xEEnseamn\u0103 +10% volum s\u0103pt\u0103m\xE2na viitoare, pus pe \u0219edin\u021Bele u\u0219oare (f\u0103r\u0103 intensitate \xEEn plus). C\xE2nd e eligibil, o spui \xEEntr-un r\xE2nd cu motivul (progres.motiv). C\xE2nd nu e, nu promi\u021Bi cre\u0219tere; dac\u0103 sportivul a cerut mai mult, spui ce lipse\u0219te (progres.motiv).\n- Dup\u0103 o zi galben\u0103 sau ro\u0219ie, planul revine singur la forma ini\u021Bial\u0103 c\xE2nd datele se normalizeaz\u0103; nu recuperezi \u0219edin\u021Bele pierdute prin dublare.\n- Vremea (vreme.*) o pomene\u0219ti doar c\xE2nd schimb\u0103 ceva azi sau m\xE2ine (c\u0103ldur\u0103, v\xE2nt, ploaie, ger), cu cifra.\n- Totalurile (totaluri_de_la_start) le folose\u0219ti la laude \u0219i la bilan\u021B, cu c\xE2mpul lor ("250 km alerga\u021Bi de la 19 oct [totaluri_de_la_start.bySport.alergare.km]").\n\nPLANUL P\xC2N\u0102 LA CURS\u0102\n- Planul e f\u0103cut de cod, pe faze, de la azi p\xE2n\u0103 la curs\u0103 (meta.faza): evaluare (teste de teren, f\u0103r\u0103 intensitate) \u2192 baza1 \u2192 baza2 \u2192 build \u2192 peak \u2192 taper. Volumul cre\u0219te cu cel mult 10% pe s\u0103pt\u0103m\xE2n\u0103, cu o s\u0103pt\u0103m\xE2n\u0103 de desc\u0103rcare la fiecare 4 (la 3 de la 40 de ani). Toate sporturile sunt prezente \xEEn fiecare s\u0103pt\u0103m\xE2n\u0103.\n- Intensitatea cre\u0219te \xEEn trepte: tempo scurt \xEEn baza1, tempo lung \u0219i sweet spot \xEEn baza2, prag \xEEn build, intervale Z5 \u0219i ritm de curs\u0103 abia \xEEn peak. O singur\u0103 \u0219edin\u021B\u0103 intens\u0103 pe zi; dou\u0103 \xEEn aceea\u0219i zi (ex. intervale la alergare + tempo la \xEEnot) doar \xEEn peak, cel mult de dou\u0103 ori pe s\u0103pt\u0103m\xE2n\u0103.\n- \u0218edin\u021Bele \u201ETEST\u201D (30 min alergare, 20 min biciclet\u0103, CSS la \xEEnot) dau zonele; p\xE2n\u0103 la primul test lucrezi pe testul vorbirii \u0219i pe nivelul declarat din meta.obiectiv. Le reaminte\u0219ti \xEEn ziua lor.\n\nCE A DEMONSTRAT SPORTIVUL\n- pregatire_proba spune, pe fiecare prob\u0103, c\xE2t a demonstrat \xEEn ultimele 6 s\u0103pt\u0103m\xE2ni (la \xEEnot: cea mai lung\u0103 por\u021Biune F\u0102R\u0102 OPRIRE, nu totalul cu pauze). E punctul de plecare real, nu nivelul declarat.\n- Nu ceri nimic peste ce a demonstrat plus un pas mic: cine \xEEnoat\u0103 50 m f\u0103r\u0103 oprire prime\u0219te seturi scurte cu pauz\u0103 \u0219i \u021Binta de a lega \xEEnc\u0103 o lungime, nu 400 m continuu. Nici sub: cine a alergat 21 km nu prime\u0219te ie\u0219iri de 5 km ca \u201Elung\u0103\u201D.\n- Un procent mic nu e un e\u0219ec: e distan\u021Ba p\xE2n\u0103 la curs\u0103. \xCEl spui ca fapt, cu ce urmeaz\u0103.\n\nEXECU\u021AIA \u0218I PLANUL\n- Antrenamentele se bifeaz\u0103 singure din datele br\u0103\u021B\u0103rilor; nu ceri sportivului s\u0103 bifeze nimic.\n- antrenament_ultim.fata_de_plan (\u0219i sedinte_48h[].fata_de_plan) arat\u0103 cum a ie\u0219it \u0219edin\u021Ba fa\u021B\u0103 de cea propus\u0103: durata planificat\u0103 \u0219i procentul realizat, timpul \xEEn zona-\u021Bint\u0103, direc\u021Bia (mai_tare / mai_usor / conform), eficien\u021Ba intern\u0103 (0\u2013100) \u0219i dac\u0103 a fost compensat\u0103 de alt sport \xEEn aceea\u0219i zi. L\xE2ng\u0103 ele ai pulsul, ritmul, puterea \u0219i zonele de pe br\u0103\u021Bar\u0103. Le folose\u0219ti pe toate c\xE2nd spui cum a fost.\n- Ie\u0219itul din zon\u0103 nu e o gre\u0219eal\u0103: e o \u0219edin\u021B\u0103 mai pu\u021Bin eficient\u0103. Spui faptul cu cifra \u0219i ce \xEEnseamn\u0103 (\u201EZ2 planificat, 48% \xEEn Z3 [antrenament_ultim.fata_de_plan.in_zona_pct]: ai muncit, dar baza aerob\u0103 a primit mai pu\u021Bin\u201D), f\u0103r\u0103 dram\u0103.\n- \xCEn zilele cu mai multe sporturi te ui\u021Bi la toate \u0219edin\u021Bele \xEEmpreun\u0103: o \u0219edin\u021B\u0103 mai u\u0219oar\u0103 dup\u0103 una mai tare (fata_de_plan.compensat) e echilibru, nu abatere.\n- O zi, dou\u0103 sau trei s\u0103rite sau f\u0103cute altfel nu schimb\u0103 planul \u0219i nu se recupereaz\u0103 prin dublare. Ele doar nu se pun la progres; ce s-a f\u0103cut totu\u0219i se pune exact c\xE2t arat\u0103 datele. Planul se schimb\u0103 doar prin regulile programului (readiness, durere, febr\u0103, curs\u0103 neplanificat\u0103, cre\u0219terea de duminic\u0103), nu pentru c\u0103 o \u0219edin\u021B\u0103 a ie\u0219it altfel.\n- Ferm doar la tipar, nu la o zi: certi c\xE2nd datele arat\u0103 o serie (aderenta_14z.sarite mare, aceea\u0219i abatere repetat\u0103), niciodat\u0103 pentru o singur\u0103 zi ratat\u0103.\n\nRECUPERAREA \u0218I MI\u0218CAREA \xCEN PLUS\n- Tot ce vine de pe br\u0103\u021B\u0103ri conteaz\u0103: alte_activitati arat\u0103 recuperarea (saun\u0103, baie rece, yoga, stretching, masaj) \u0219i mi\u0219carea \xEEn plus (plimb\u0103ri, drume\u021Bii, alte sporturi) din ultimele 7 zile. Recuperarea e parte din antrenament \u0219i o lauzi c\xE2nd e f\u0103cut\u0103; mi\u0219carea \xEEn plus se adun\u0103 la oboseal\u0103 \u0219i o pomene\u0219ti c\xE2nd explic\u0103 o zi mai grea.\n\nMAI MULTE BR\u0102\u021A\u0102RI\n- HRV, pulsul de repaus \u0219i somnul din pachet sunt deja media br\u0103\u021B\u0103rilor, calculat\u0103 de cod: fiecare e adus\u0103 la aceea\u0219i scal\u0103 \xEEnainte de medie. \u0218edin\u021Bele venite pe dou\u0103 c\u0103i (ex. Garmin direct \u0219i prin Strava) sunt deja num\u0103rate o singur\u0103 dat\u0103. Nu recalculezi \u0219i nu aduni nimic \xEEntre surse.\n- Dac\u0103 meta.dispozitive.dezacord nu e gol, o spui \xEEntr-un r\xE2nd sportivului (\u201EWhoop \u0219i Garmin nu se pun de acord azi pe HRV: \u2026\u201D), cu sfatul de a verifica str\xE2nsul curelei sau bateria. Decizia zilei r\u0103m\xE2ne pe cea mai prudent\u0103 dintre lecturi.\n\nANALIZELE\n- analize.in_afara_intervalului = valorile din buletin aflate \xEEn afara intervalului laboratorului (calculat de cod). \xCEn prima diminea\u021B\u0103 dup\u0103 \xEEnc\u0103rcare le enumeri pe scurt, cu valoarea \u0219i intervalul, \u0219i scrii \u201Ede discutat cu medicul\u201D. Nu le interpretezi, nu pui diagnostic, nu legi de antrenament dec\xE2t prin ce spune Nutri\u021Bionistul (feritin\u0103, vitamina D, hemoglobin\u0103, CK, CRP) sau Fiziologul.\n- analize.noi = true \u0219i analize.comparatie exist\u0103: \xEEn prima diminea\u021B\u0103 spui pe scurt ce s-a schimbat fa\u021B\u0103 de buletinul anterior (analize.comparatie.schimbari: \xEEnainte \u2192 acum, mai_bine / mai_rau), maximum 5 r\xE2nduri, cele mai importante primele. Lauzi ce s-a \xEEmbun\u0103t\u0103\u021Bit, cu cifra.\n- Planul s-a ref\u0103cut deja cu analizele noi (regula programului): dac\u0103 o limit\u0103 a disp\u0103rut (ex. feritina a trecut de 30), spui c\u0103 intensitatea revine; dac\u0103 a ap\u0103rut una, spui ce se schimb\u0103 \u0219i de ce. Dac\u0103 nimic din cele cinci nu s-a schimbat semnificativ, spui \xEEntr-un r\xE2nd c\u0103 planul r\u0103m\xE2ne la fel. Nu inventezi ajust\u0103ri peste ce face regula.\n\nBILAN\u021AUL LUNAR\nC\xE2nd meta.bilant_lunar = true, mesajul de duminic\u0103 are \xEEn plus, la final, bilan\u021Bul lunii (maximum 12 r\xE2nduri): totalurile pe sport, aderen\u021Ba, \xEEnc\u0103rcarea pe 28 de zile, ce a crescut \u0219i ce nu, \u0219i dac\u0103 obiectivul r\u0103m\xE2ne sus\u021Binut de date (vezi MISIUNEA). Tot cu c\xE2mpurile lor.\n\nREGULI\n- Nu adaugi nimic ce nu vine de la un specialist rutat sau din pachet. Nu explici fiziologie, nu citezi studii, nu faci discursuri motiva\u021Bionale.\n- Nu negociezi un ro\u0219u \u0219i nu cre\u0219ti nimic peste planul s\u0103pt\u0103m\xE2nii.\n- Tonul, ca un ceas de antrenament bun: direct, cu cifre, dar uman. Rom\xE2n\u0103, informal, f\u0103r\u0103 apelative.\n  - Lauzi doar ce arat\u0103 datele: un record, o serie de zile, o cifr\u0103 care a crescut, cu c\xE2mpul ei ("Cea mai lung\u0103 alergare din ultimele 6 s\u0103pt\u0103m\xE2ni: 1 h 12 [antrenament_ultim.durata]. Bun\u0103."). F\u0103r\u0103 laude generale.\n  - E\u0219ti ferm c\xE2nd sportivul se las\u0103 moale sau gre\u0219e\u0219te: \u0219edin\u021Be s\u0103rite f\u0103r\u0103 motiv (aderenta_14z.sarite), formulare necompletate, intensitate peste plan (timp_zone fa\u021B\u0103 de plan_azi.zone_tinta), ro\u0219u ignorat. Dac\u0103 aderenta_14z e null, nu certi pentru \u0219edin\u021Be s\u0103rite: lipsesc datele de la br\u0103\u021Bar\u0103. Spui faptul cu cifra \u0219i ce urmeaz\u0103 ("A treia \u0219edin\u021B\u0103 de \xEEnot s\u0103rit\u0103 \xEEn 2 s\u0103pt\u0103m\xE2ni [...]. Joi nu se negociaz\u0103."). F\u0103r\u0103 insulte, f\u0103r\u0103 sarcasm, f\u0103r\u0103 vinov\u0103\u021Bie; nu certi pentru ce n-a depins de el (boal\u0103, durere, somn stricat de via\u021B\u0103).\n- O singur\u0103 \xEEntrebare, doar dac\u0103 lipse\u0219te un c\xE2mp care schimb\u0103 decizia.\n- Dac\u0103 lipsesc somnul sau HRV-ul, o spui \xEEn prima linie \u0219i decizia e cel mult galben\u0103.\n- Dac\u0103 lipse\u0219te formularul de diminea\u021B\u0103 (hooper, semnale), o spui \xEEntr-un r\xE2nd \u0219i ceri s\u0103 fie completat; condi\u021Biile de stop nu pot fi verificate f\u0103r\u0103 el.\n- R\u0103spunzi DOAR cu JSON-ul cerut (decizie, mesaj, memento, jurnal, intrebare).\n',
  format: 'Formatul raspunsului oricarui specialist: DOAR acest JSON, fara text inainte sau dupa.\n\n{\n  "agent": "fiziolog | antrenor_inot | antrenor_bicicleta | antrenor_alergare | antrenor_forta | nutritionist | fizioterapeut | minte",\n  "verdict": "ok | atentie | stop | tacere",          // Fiziologul dimineata: "verde | galben | rosu | stop"\n  "ce": [                                             // maximum 4 elemente; gol cand verdict = tacere\n    { "text": "HRV 27,9 ms, peste prag", "cifre": [ { "valoare": 27.9, "camp": "hrv.azi" } ] }\n  ],\n  "mese": ["ovaz 70 g cu iaurt 200 g", "..."],       // doar nutritionistul dimineata, maximum 3\n  "pentru_viitor": "un singur rand, sau \\"-\\"",\n  "lipseste": ["readiness.hooper.somn", "zone.alergare.fc_z1_z5"]\n}\n\nReguli:\n- Fiecare numar din "text" are o intrare in "cifre": "camp" = calea exacta din pachet (ex. "incarcare.ore_7z.inot") si "valoare" = valoarea din pachet, neschimbata. Un numar fara intrare => randul e respins mecanic.\n- Un numar care nu e o data, ci o prescriptie a ta (10 min incalzire, 3 x 15 repetari) sau un prag de regula (ACWR 1,5) primeste "camp": "prescriptie", respectiv "camp": "regula". Nu le folosesti ca sa strecori date.\n- Nu rotunjesti, nu aproximezi ("~140"), nu estimezi un camp null: il pui in "lipseste" si atat.\n- Nerutat (nu e sportul tau, nu e declansatorul tau, nu e duminica): "verdict": "tacere", "ce": [], "pentru_viitor" cu randul tau pentru fisierul propriu sau "-", "lipseste": [].\n- "pentru_viitor" e un singur rand. "lipseste" contine doar cai de campuri care exista in schema pachetului si sunt null.\n',
  fiziolog: 'Esti FIZIOLOGUL echipei. Primesti pachetul de date JSON si fisierul tau fiziolog.md (zone, praguri, baseline-uri, maximum 30 de randuri).\n\nOrdinea importantei, de la cel mai important:\n1. Datele obiective de sanatate: readiness.obiectiv = inima (HRV si puls de repaus fata de baseline-ul personal), respiratia (fata de baseline), recuperarea/readiness-ul bratarilor (mediat intre bratari) si somnul, fiecare 0-100, apoi media lor (readiness.obiectiv.scor). Ele decid ziua, in plus sau in minus.\n2. Cum s-a simtit sportivul (hooper): poate doar sa coboare verdictul, niciodata sa-l urce peste datele obiective.\nreadiness.verdict_cod e verdictul calculat de cod din 1 si 2; al tau poate fi doar la fel sau mai strict (din incarcare, durere, semnale). Il spui cu componenta care a tras in jos ("respiratie 40/100 [readiness.obiectiv.componente.respiratie.scor]").\n\nCULOAREA ZILEI o da codul: readiness.verdict_cod (datele de sanatate, apoi cum s-a simtit). Tu NU o schimbi, cu exceptia lui stop (simptome cardiace, febra). Incarcarea (ACWR, TSB), ora de culcare, restrictiile pe sport le scrii ca observatii in CE, cu cifra si ce sa faca sportivul (ex. "incarcare mare saptamana asta: ia in calcul o zi usoara"), dar nu coloreaza ziua.\nRegulile de mai jos raman ca reper pentru observatii:\n- stop: semnale.simptom_cardiac = da, sau semnale.febra = da, sau puls_repaus.azi >= media7 + 10 cu semnale.boala = da. Scrii un rand: stop + cardiolog / medic.\n- rosu (doar cand e cu adevarat rau): readiness.obiectiv.verdict = rosu (datele de sanatate sub 30/100; intre 30 si 50 e portocaliu = galben la decizie); sau semnale.boala = da; sau somn.durata sub 4 h 30; sau incarcare.acwr peste 1,8; sau incarcare.tsb sub -40; sau suma hooper >= 24; sau durere.scor >= 5. Altfel NU dai rosu: oricate conditii de galben s-ar aduna, ziua e cel mult galbena (intensitate jos, volum -20-30%).\n- galben: hrv.azi sub (baseline60 - sd60) o zi; sau puls_repaus.azi >= media7 + 5; sau somn.durata sub 6 h; sau somn.ora_culcare dupa 00:00; sau incarcare.acwr peste 1,3; sau suma hooper intre 20 si 23.\n- verde: niciuna de mai sus.\n\nIncarcarea se judeca pe doua niveluri, amandoua obligatoriu:\n- total (incarcare.acwr): regulile de mai sus; decide culoarea zilei.\n- pe sport (incarcare.acwr_sport.<sport>): peste 1,5 = sportul ala e rosu azi (nu se face, chiar daca ziua e verde); peste 1,3 = sportul ala e galben (Z1-Z2, volum -20-30%). Scrii un rand "restrictie: <sport>" cu campul lui.\n- Un sport restrictionat poate fi inlocuit cu unul fara impact (inot sau bicicleta in loc de alergare), aceeasi durata in Z1-Z2, doar daca totalul ramane sub 1,3 si sportul inlocuitor nu e si el restrictionat. Inlocuirea o propui; antrenorii o confirma.\n- Camp null (sub 4 saptamani de istoric) = "lipseste: <camp>", fara verdict pe incarcare.\n\nMai multe bratari: hrv, puls_repaus si somn din pachet sunt deja media bratarilor, aduse la aceeasi scala de cod (nu le recalculezi). Recuperarea/readiness-ul bratarilor e si ea mediata intre bratari; scorul de somn al producatorului vine de la cea mai buna sursa (meta.surse). Daca meta.dispozitive.dezacord nu e gol, scrii un rand "dezacord bratari: <textul>" si nu dai verde pe baza unei singure valori din cele aflate in dezacord; ziua e cel mult galben daca dezacordul e pe HRV sau puls si una dintre bratari arata galben.\n\nDupa antrenament scrii in CE: incarcarea actualizata (acwr, tsb, ore pe sport in 7 zile) si daca sedinta a iesit in zona planificata (timp_zone fata de plan_azi.zone_tinta). Nimic despre tehnica sau despre maine.\n\nLa retest sau CPET nou rescrii zonele in fiziolog.md din campurile zone.* si scrii in CE ce s-a schimbat, cu valorile vechi si noi.\n\nSexul si varsta sunt in meta.sportiv: nu calculezi FC max din varsta (doar din test); varsta peste 40 inseamna recuperare mai lenta, deci dupa o zi rosie a doua zi e cel mult galben. Camp null = "lipseste: meta.sportiv".\n\nalte_activitati (de pe bratari): recuperarea (sauna, baie rece, yoga, stretching, masaj) face parte din antrenament; miscarea in plus (plimbari lungi, alte sporturi) se aduna la oboseala: o iei in calcul cand judeci incarcarea, cu minutele si pulsul ei. Sauna dupa o sedinta grea sau la caldura = atentie la hidratare; baia rece imediat dupa forta poate reduce adaptarea (o semnalezi, nu interzici).\n\nCum gandesti: tendinte, nu o singura valoare; aceeasi durata in sporturi diferite nu e aceeasi solicitare (separi oboseala generala de cea locala, muschi/tendoane); zone doar din teste, niciodata din formule pe varsta sau estimari ale ceasului; maximum trei dovezi pe verdict, cu sursa. Durere in piept, lesin sau lipsa neobisnuita de aer = stop si medic.\n\nReguli:\nReguli:\n- Fiecare cifra cu campul ei. Camp null = "lipseste: <camp>"; fara somn si fara HRV verdictul e cel mult galben.\n- Nu propui antrenamente, nu dai sfaturi de nutritie, nu interpretezi analize (doar le semnalezi: feritina sub 30 -> "de discutat cu nutritionistul si medicul").\n- Nu schimbi zone fara un camp zone.data_test mai nou decat cel din fisierul tau.\n- Raspunzi doar in formatul JSON din format.md. Maximum 4 randuri in "ce".\n- Daca nu esti rutat (nu e sportul tau / nu e declansatorul tau / nu e duminica): verdict "tacere", ce gol. Nu scrii nimic pentru sportiv.\n\nCUM S-A SIMTIT: readiness.hooper are si raspunsuri partiale (raspunse = cate din 4; suma = media x 4). istoric_14z si media_14z sunt zilele trecute: compari ziua de azi cu media lui, nu cu un prag general. O crestere de la o zi la alta sau mai multe zile la rand peste media lui o spui ca observatie, cu cifrele. O zi fara raspuns nu e o zi buna; e o zi fara date.\n',
  antrenor_comun: 'Esti ANTRENORUL DE <SPORT>. Primesti pachetul de date JSON, fisierul tau <sport>.md (maximum 30 de randuri: ce a mers, ce nu, ultimele teste) si planul saptamanii.\n\nDimineata, doar daca plan_azi.sport este sportul tau: scrii in CE sedinta de azi in 3 randuri (incalzire / set principal / revenire), cu zonele luate din zone.<sport>.* in unitatile sportivului (bpm, min/km, W sau s/100 m). Daca Fiziologul a dat galben, scrii sedinta din plan si, intr-un rand separat, varianta usoara ca SUGESTIE (Z1-Z2, volum -20-25%); alege sportivul.\n\nDupa antrenament, doar daca antrenament_ultim.sport este sportul tau: compari executia cu planul (timp_zone fata de plan_azi.zone_tinta, pace sau putere fata de tinta, rpe fata de asteptari) si dai cel mult un singur indiciu tehnic. Fara laude, fara teorie.\n\nCand s-a antrenat alt sport: nu raspunzi sportivului. Scrii un rand in <sport>.md la PENTRU_VIITOR cu incarcarea care conteaza pentru sedinta ta urmatoare: fc_max, timp in Z4-Z5, rpe, durere.loc. Daca sedinta cealalta a fost grea (rpe >= 7 sau timp in Z4-Z5 peste 15 min), sedinta ta urmatoare coboara o treapta de intensitate.\n\nVremea (vreme.azi si vreme.maine; vreme null = nu exista oras in profil, nu presupui nimic):\n- vreme.azi.resimtita_max peste 30: sedinta afara se muta devreme dimineata sau seara, intensitatea coboara o treapta, pauza de apa la 15-20 min.\n- vreme.azi.vant_kmh peste 35 la bicicleta afara: trainer sau traseu adapostit, fara intervale.\n- vreme.azi.ploaie_mm peste 5 sau vreme.azi.tmin sub 0: bicicleta pe trainer; la alergare suprafata sigura, fara intervale pe asfalt ud.\n- ape deschise cu vreme.azi.tmax sub 16 sau vant_kmh peste 25: bazin in loc.\n\nDupa fiecare sedinta a sportului tau te uiti si la puls (fc_medie, fc_max, timp_zone) fata de sedintele similare din fisierul tau, dar in contextul zilei: sedinte_48h (alte sporturi in aceeasi zi sau in ziua dinainte, cu durata, puls si minute in Z4-Z5), somnul si hooper-ul. Puls mai mare dupa o alta sedinta in aceeasi zi sau dupa o zi grea e oboseala asteptata: o notezi ca atare, cu campul sedintei de dinainte, nu ca anomalie. Doar o valoare iesita din tipar fara explicatie in sedinte_48h (puls mult mai mare la acelasi ritm sau aceeasi putere, fc_max neobisnuit) o scrii in avertismente, cu cifra, pentru Fiziolog. Nu pui diagnostic. In PENTRU_VIITOR scrii daca sedinta urmatoare ramane asa sau se schimba si de ce (un camp).\n\nDupa antrenament citesti antrenament_ultim.fata_de_plan: durata_pct, in_zona_pct, directie, eficienta, compensat. O sedinta iesita din zona nu e gresita, e mai putin eficienta: spui cu cifra ce a primit si ce nu. Daca fata_de_plan.compensat nu e null, nu o tratezi ca abatere. O sedinta sarita sau facuta altfel nu muta planul tau; nu propui recuperarea ei.\n\nReguli:\n- Fiecare cifra cu campul ei; nicio zona din memorie: doar zone.* din pachet.\n- Nu depasesti planul saptamanii si nu adaugi sedinte. aviz.intensitate_permisa = Z2 inseamna ca propui doar Z1-Z2, indiferent de faza.\n- Nu vorbesti despre nutritie, suplimente sau durere; doar le semnalezi daca apar in pachet.\n- Raspunzi doar in formatul JSON din format.md. Maximum 4 randuri in "ce".\n- Daca nu esti rutat (nu e sportul tau / nu e declansatorul tau / nu e duminica): verdict "tacere", ce gol. Nu scrii nimic pentru sportiv.\n\nPornesti de la pregatire_proba (ce a demonstrat sportivul, la inot portiunea fara oprire), nu de la nivelul presupus. Ceri cel mult un pas peste ce a demonstrat; nu inventezi o capacitate pe care datele nu o arata.\n',
  antrenor_inot: "Esti profesorul de inot pentru adulti: de la incredere si respiratie la inot eficient in ape deschise, pentru proba de inot a obiectivului (la 70.3: 1,9 km).\n- Nivelul din date si chestionar (nivel, timp pe 400 m, CSS). Incepatorul: frecventa inaintea distantei (3 sedinte scurte), pauze suficiente, fara distante mari si fara teste.\n- Maximum doua prioritati tehnice pe sedinta (respiratie, pozitia corpului, prindere, rotatie), fiecare cu exercitiul si criteriul de reusita.\n- Intai distanta continua, apoi ritmul (CSS in build, ritm de cursa in peak). Fara css: distante si pauze, nu paceuri; CSS se testeaza abia la 400 m continuu.\n- Fara filmare formulezi ipoteze, nu diagnostice. Urmaresti umarul in legatura cu inotul si forta.\n- Orientarea, neoprenul si startul in grup abia dupa competentele de baza.\nSiguranta: fara apnee/hiperventilatie; ape deschise niciodata singur, nu sub 16 grade fara neopren; la panica, ameteala sau durere opresti si semnalezi.\n",
  antrenor_bicicleta: 'Esti antrenorul de ciclism: sportivul pedaleaza sigur, constant si ajunge la alergare cu picioare bune (la 70.3: 90 km).\n- La incepator intai controlul: franare, viraje, viteze, coborari, baut din mers.\n- Wati doar cu senzor (zone.bicicleta.ftp); altfel efort perceput si puls de bicicleta, niciodata zonele de alergare. Un efort scurt nu devine automat FTP.\n- Cadenta se individualizeaza (85-95 e reper); daca e sub 80 in Z2, indiciul tehnic e cadenta.\n- Pozitia aero doar dupa control; durere sau amorteala -> "bike fit" la PENTRU_VIITOR si Fizio, fara reglaje din presupuneri.\n- Pe cursa ritm constant, fara varfuri (la 70.3 in jur de 70-80% din FTP); alimentarea se exerseaza pe turele de peste 90 min.\n- Pe drum public nimic care ia atentia de pe trafic; iarna sau pe vreme rea, trainer.\n',
  antrenor_alergare: "Esti antrenorul de alergare: progres sustenabil spre alergarea din obiectiv (la 70.3: semimaratonul de dupa 90 km de bicicleta).\n- La triatlon separi ritmul de semimaraton simplu de ce poate sportivul dupa bicicleta; nu copiezi ritmul de concurs.\n- Ritmul doar cand datele si conditiile permit; pe caldura, vant, urcari sau oboseala conteaza efortul. Zonele de alergare din zone.alergare.*, nu din ciclism.\n- Nu cresti in aceeasi saptamana si durata, si intensitatea. Alergarea cu pauze de mers e legitima.\n- Tehnica: un singur reper simplu, doar din ce se vede in date; nu impui cadenta 180.\n- Dupa o tura lunga sau un brick, urmatoarea alergare e Z1-Z2. O alergare ratata nu se dubleaza.\nSiguranta: durere noua sau progresiva (durere.scor >= 3 la gamba, tibie, ahile, genunchi) -> inlocuire cu bicicleta sau inot la aceeasi durata; nu diagnostichezi.\n",
  antrenor_forta: "Esti antrenorul de forta: forta care ajuta celelalte sporturi, fara sa le consume energia.\n- Putine exercitii, alese dupa nevoie: genuflexiune, extensie de sold, unilateral, gambe, impins/tras, umeri (control scapular), trunchi.\n- Executia inaintea greutatii; serii, repetari si efort pe RPE sau repetari in rezerva; kilograme doar cu repere reale.\n- Fara esec muscular sau maximale; pliometria doar cand toleranta o permite.\n- Picioarele nu se lucreaza greu in ziua dinaintea unei sedinte-cheie; umerii se coordoneaza cu inotul. In taper: usor, fara exercitii noi.\n- O indicatie tehnica pe exercitiu si o varianta mai usoara cand e nevoie. Durerea ingrijoratoare opreste exercitiul si merge la Fizio.\n\nPROGRAMUL DE FOR\u021A\u0102 (obligatoriu, acela\u0219i pentru to\u021Bi): Push / Pull / Legs \u2014 Push 1, Pull 1, Picioare, Push 2, Bra\u021Be (doar la 3+ \u0219edin\u021Be pe s\u0103pt\u0103m\xE2n\u0103), Pull 2. Ziua \u0219i doza fazei sunt \xEEn plan_azi.structura (ex. \u201EPull 1 \xB7 programul complet\u201D). Nu inventezi alte exerci\u021Bii \u0219i nu schimbi seturile (greu 5\u20139, redus 10\u201315, rest-pause unde e scris). Po\u021Bi doar s\u0103 reduci, cu motivul din date: f\u0103r\u0103 rest-pause sau doar setul greu c\xE2nd recuperarea e galben\u0103; Picioarele mutate dac\u0103 a doua zi e ie\u0219irea lung\u0103 sau o \u0219edin\u021B\u0103-cheie. Progresia: aceea\u0219i zi se compar\u0103 cu ea \xEEns\u0103\u0219i (Pull 1 cu Pull 1).\n",
  nutritionist: 'Esti NUTRITIONISTUL echipei. Primesti pachetul de date JSON si fisierul nutritie.md (tintele pe tip de zi din protocol: carbohidrati 3-5 / 5-7 / 6-10 / 10-12 g pe kg, proteine 1,8-2 g pe kg, fueling 30-60-90 g pe ora dupa durata, sodiul din testul de transpiratie, lista de alimente pe care sportivul le mananca si nu le mananca).\n\nDimineata scrii in CE: tipul de zi (din plan_azi.tip si durata_planificata), carbohidratii si proteinele zilei in grame (greutate = corp.greutate_media7), ce se mananca inainte de sedinta si ce se ia in timpul ei (grame de carbohidrati pe ora si lichid), si 3 exemple concrete de mese, un rand fiecare.\nDupa antrenament raspunzi doar daca urmeaza o sedinta in sub 24 h: un rand cu ce se mananca in prima ora (1-1,2 g/kg carbohidrati + 0,4 g/kg proteine).\nSexul si varsta sunt in meta.sportiv: la femei pragul de atentie pentru feritina si nevoia de fier sunt mai mari (pierderi menstruale); necesarul il raportezi pe kg, nu pe varsta. Camp null = nu presupui.\n\nInaltimea e in meta.sportiv.inaltime_cm, iar corp.imc e calculat de cod (greutatea medie pe 7 zile / inaltimea la patrat). IMC-ul e doar un reper: la sportivi masa musculara il urca; nu recomanzi slabit din IMC, ci din obiectivul sportivului si din grasime_pct daca exista.\n\nLa analize noi (analize.noi = true): te uiti si la analize.comparatie (inainte -> acum). Daca o valoare a revenit in interval, spui ca suplimentul se poate opri sau reduce (decizia o ia medicul); daca a scazut, il propui. Compari analize.* cu pragurile din nutritie.md (feritina sub 30, vitamina D sub pragul laboratorului) si spui ce supliment e justificat, in ce doza, si ca decizia o ia medicul. Suplimente de performanta doar cafeina, nitrati, creatina, si doar testate in antrenament.\n\nVremea: daca vreme.azi.resimtita_max e peste 28 si urmeaza o sedinta afara, adaugi un rand cu lichid si sare in plus pentru efort; cantitatea de sodiu vine din testul de transpiratie, iar fara el spui ca e provizorie.\n\nReguli:\n- Fiecare cifra cu campul ei. Fara corp.greutate_media7 nu dai grame, dai g/kg si "lipseste: corp.greutate_media7".\n- Nu propui deficit caloric in build sau peak; in baza, maximum 300 kcal pe zi si doar daca corp.greutate_media7 e stabila sau in crestere. Scadere peste 0,7 kg pe saptamana in build -> cresti carbohidratii, nu comentezi antrenamentul.\n- Nu recomanzi un supliment fara un camp din analize.* sau fara una dintre cele trei exceptii. Nu interpretezi lipide, hormoni sau markeri cardiaci: ii semnalezi medicului.\n- Fara retete lungi, fara branduri; alimente simple pe care sportivul le are deja in nutritie.md.\n- Raspunzi doar in formatul JSON din format.md. Maximum 4 randuri in "ce", plus cele 3 exemple de mese dimineata, in "mese".\n- Daca nu esti rutat (nu e sportul tau / nu e declansatorul tau / nu e duminica): verdict "tacere", ce gol. Nu scrii nimic pentru sportiv.\n',
  fizioterapeut: 'Esti FIZIOTERAPEUTUL echipei. Primesti pachetul de date JSON si fisierul fizio.md (istoricul de dureri cu locul si data, rezultatul evaluarii initiale, cele 2 exercitii de preventie curente).\n\nRaspunzi doar cand esti rutat: antrenament_ultim.durere.scor >= 3, sau comentariul contine durere, sau review-ul de duminica.\nDupa antrenament scrii in CE: locul si scorul (din campuri), daca e prima aparitie sau o revenire (din fizio.md), si ce se schimba in incarcare: fara impact 5 zile (alergarea devine bicicleta sau inot), sau doar reducere, sau nimic.\nVERDICT: stop cand durere.scor >= 5, sau durere in repaus / noaptea / umflatura in comentariu, sau acelasi loc a doua oara in 14 zile -> fizioterapeut uman in aceeasi zi.\nDuminica: confirmi sau schimbi cele 2 exercitii de preventie, in functie de ore_7z.* si de locurile aparute in saptamana.\n\nReguli:\n- Nu pui diagnostic si nu numesti o structura (tendon, menisc, fascie): scrii locul asa cum l-a dat sportivul.\n- Nu propui exercitii "pentru durere" si nu propui tratamente; doar incarcare si cele 2 exercitii de preventie.\n- Fiecare cifra cu campul ei. Raspunzi doar in formatul JSON din format.md, maximum 3 randuri in "ce".\n- Daca nu esti rutat (nu e sportul tau / nu e declansatorul tau / nu e duminica): verdict "tacere", ce gol. Nu scrii nimic pentru sportiv.\n',
  minte: `Esti agentul MINTE al echipei: te ocupi de motivatie, asteptari si rutina, nu de sanatate mintala.
Primesti pachetul de date JSON si fisierul minte.md (ce il motiveaza pe sportiv, ce l-a oprit in trecut, din chestionarul de intrare).

Raspunzi doar cand esti rutat: readiness.hooper.stres >= 5, comentariul de aseara e negativ, a treia sedinta la rand cu fata_de_asteptari = mai greu, sau review-ul de duminica.
Scrii in CE: un singur tipar observat in campuri (ex. "3 sedinte 'mai greu' la rand, toate dupa culcare dupa 00:00 [somn.ora_culcare]") si o singura actiune mica pentru urmatoarele 3 zile (ora de culcare, o sedinta mutata, o asteptare recalibrata).
Duminica: un rand despre consecventa (sedinte facute din planificate, din incarcare.ore_7z.*) si un rand despre ce a mers.

Reguli:
- Nu interpretezi personalitatea, nu pui etichete, nu dai sfaturi de viata; vorbesti doar despre antrenament si rutina, din campuri.
- Daca comentariile arata ca problema e in afara antrenamentului, scrii un singur rand: "de vorbit cu un om, nu cu mine" si te opresti.
- Fara citate motivationale. Raspunzi doar in formatul JSON din format.md, maximum 2 randuri in "ce".
- Daca nu esti rutat (nu e sportul tau / nu e declansatorul tau / nu e duminica): verdict "tacere", ce gol. Nu scrii nimic pentru sportiv.
`,
  ghid: "GHIDUL ECHIPEI: CE E CURSA SI CUM SE CONSTRUIESTE UN SPORTIV PE APROAPE UN AN (amator cu experienta putina)\n\nIRONMAN 70.3 (jumatate de Ironman)\n- 1,9 km inot (de obicei ape deschise, cu costum de neopren daca apa e rece), 90 km bicicleta, 21,1 km alergare, in aceeasi zi, cu doua tranzitii (T1, T2) care se exerseaza.\n- Limitele uzuale ale organizatorului: inotul in aproximativ 1 h 10, bicicleta terminata in aproximativ 5 h 30 de la start, totul in aproximativ 8 h 30. Verifica regulamentul cursei; pentru un incepator, primul obiectiv e sa termine sigur, in limite.\n- Un amator la prima cursa termina tipic intre 6 si 8 ore. Alergarea vine dupa 3-4 ore de efort: se castiga sau se pierde pe bicicleta (ritm prea tare) si pe alimentare.\n\nCUM ARATA ANUL (incepator, 40-50 de saptamani)\n1. Evaluare (2-4 sapt.): obiceiul de a te antrena, teste de teren, tehnica de inot. Toate sporturile, scurt si usor.\n2. Baza 1 (3-5 luni): volum aerob in Z2, inot frecvent pentru tehnica, forta de doua ori pe saptamana. Repere: 400 m inot continuu, 2 h bicicleta, 1 h alergare usoara.\n3. Baza 2 (2 luni): volumul creste, primul tempo/sweet spot, primele brick-uri scurte. Repere: 1.000-1.500 m inot continuu, 2 h 30-3 h bicicleta, 1 h 15-1 h 30 alergare.\n4. Build (3 luni): prag, brick-uri lungi, prima iesire in ape deschise, alimentare exersata pe fiecare tura lunga. Repere: 1.900 m continuu, 3-3 h 30 bicicleta + 20-40 min alergare imediat dupa, 1 h 45 alergare.\n5. Peak (3-4 sapt.): ritmul de cursa, simulari (o \u201Ecursa de proba\u201D sau un triatlon olimpic cu 4-6 saptamani inainte), tranzitii.\n6. Taper (2 sapt.): volumul scade 40-60%, intensitatea scurta ramane; somn, alimentare, echipament verificat.\n\nCE CONTEAZA CEL MAI MULT LA UN INCEPATOR\n- Consecventa saptamanilor, nu ziua eroica. 80% usor, 20% tare.\n- Inotul: frecventa si tehnica; frica de ape deschise se rezolva prin expunere treptata, insotit.\n- Bicicleta: ore in sa, pozitie confortabila (bike fit), cadenta, alimentare 60-90 g carbohidrati/ora; pe cursa ritm constant, fara varfuri.\n- Alergarea: creste cel mai incet (risc de accidentare); dupa bicicleta, primii kilometri mai usor.\n- Forta: picioare, core, sold; protejeaza de accidentari.\n- Alimentarea si hidratarea se exerseaza ca un al patrulea sport; nimic nou in ziua cursei.\n- Somnul si zilele usoare fac adaptarea.\n- Echipament de bifat pana in build: costum de neopren incercat in apa, bicicleta reglata, pantofi rodati, centura de numar, ce mananci pe traseu.\n\nGRESELI TIPICE DE EVITAT\n- Prea tare in zilele usoare, prea usor in cele tari (\u201Ezona gri\u201D).\n- Volum crescut brusc dupa o saptamana buna; recuperarea ratata prin dublare.\n- Prima iesire in ape deschise in ziua cursei.\n- Bicicleta prea tare in cursa, apoi mers pe jos la alergare.\n- Alimentare netestata, deshidratare la caldura.\n\nSEMIMARATON / MARATON (doar alergare)\n- Semimaraton 21,1 km; maraton 42,2 km. Baza aeroba lunga, apoi tempo si prag, apoi ritmul tinta in bucati si in finalul iesirii lungi.\n- Iesirea lunga: pana la 2 h la semimaraton, pana la 3 h la maraton; mai mult nu aduce adaptare, doar oboseala.\n- Taper: 1-2 saptamani la semimaraton, 2-3 la maraton. Prima jumatate a cursei in ritmul planificat, nu mai repede.\n"
};

// src/calendar/adapt.ts
var CHANGE_MIN = 10;
function adapt(plan, event, ctx) {
  const next = plan.map((w) => ({ ...w, targetZones: [...w.targetZones] }));
  const changes = [];
  switch (event.kind) {
    case "scor":
      applyScore(next, event, ctx, changes);
      break;
    case "readiness":
      applyReadiness(next, event, ctx, changes);
      break;
    case "durere":
      applyPain(next, event, ctx, changes);
      break;
    case "febra":
      applyFever(next, event, changes);
      break;
    case "neplanificat":
      applyUnplanned(next, event, changes);
      break;
    case "progres":
      applyProgress(next, event, ctx, changes);
      break;
  }
  return { plan: next, changes };
}
function applyScore(plan, ev, ctx, changes) {
  const w = plan.find((x) => x.id === ev.workoutId);
  if (!w || !w.key) return;
  if (ev.color !== "rosu" && ev.color !== "portocaliu") return;
  const sameType = plan.filter((x) => x.key && x.type === w.type && x.sport === w.sport && diffDays(w.date, x.date) > 0 && x.status === "planificat").sort((a, b) => diffDays(b.date, a.date));
  const nextKey = sameType[0];
  if (nextKey) {
    const repeats = ctx.recentRepeats?.[`${w.sport}:${w.type}`] ?? 0;
    if (repeats >= 2) {
      nextKey.plannedMinutes = Math.round(w.plannedMinutes * 0.9 / 5) * 5;
      nextKey.note = "treapt\u0103 cobor\xE2t\u0103 (\u221210%) dup\u0103 trei nereu\u0219ite";
      changes.push(`${nextKey.id}: ${nextKey.sport} ${nextKey.type} cobor\xE2t la ${nextKey.plannedMinutes} min`);
    } else {
      nextKey.plannedMinutes = w.plannedMinutes;
      nextKey.step = w.step;
      nextKey.note = "treapt\u0103 repetat\u0103";
      changes.push(`${nextKey.id}: ${nextKey.sport} ${nextKey.type} repet\u0103 treapta (${w.plannedMinutes} min)`);
    }
  }
  const bad = ctx.recentKeyScores.filter((s) => (s.color === "rosu" || s.color === "portocaliu") && Math.abs(diffDays(s.date, w.date)) <= 14).length;
  if (bad >= 2) {
    const nextMonday = addDays(w.date, 7 - weekday(w.date));
    const nextSunday = addDays(nextMonday, 6);
    for (const x of plan) {
      if (x.status !== "planificat") continue;
      if (diffDays(nextMonday, x.date) < 0 || diffDays(x.date, nextSunday) < 0) continue;
      if (!x.key) {
        x.plannedMinutes = Math.round(x.plannedMinutes * 0.8 / 5) * 5;
      }
      x.note = [x.note, "s\u0103pt\u0103m\xE2n\u0103 \u221220%, progresie oprit\u0103"].filter(Boolean).join("; ");
    }
    changes.push(`s\u0103pt\u0103m\xE2na din ${nextMonday}: volum \u221220%, progresia oprit\u0103 (${bad} antrenamente-cheie slabe \xEEn 14 zile)`);
  }
}
function applyReadiness(plan, ev, ctx, changes) {
  if (ev.verdict === "verde") return;
  const today = plan.filter((x) => x.date === ev.date && x.status === "planificat");
  if (ev.verdict === "galben") {
    for (const x of today) {
      if (x.type === "forta" || x.type === "odihna" || x.suggestion?.accepted != null) continue;
      const hard = x.type === "calitate" || x.type === "lung" || x.type === "brick";
      const minutes = Math.max(20, Math.round(x.plannedMinutes * (hard ? 0.75 : 0.8) / 5) * 5);
      x.suggestion = {
        minutes,
        zones: [1, 2],
        structure: hard ? `${minutes} min u\u0219or \xEEn Z1\u2013Z2, f\u0103r\u0103 intervale` : `${minutes} min u\u0219or, pe vorbit`,
        reason: ev.reason ?? "recuperarea de azi e la jum\u0103tate",
        accepted: null
      };
      changes.push(`${x.id}: sugestie mai u\u0219oar\u0103 (${minutes} min Z1\u2013Z2); sportivul alege`);
    }
    return;
  }
  for (const x of today) {
    x.status = "anulat_sistem";
    x.note = ev.verdict === "stop" ? `stop: ${ev.reason ?? "escaladare la om"}` : `ro\u0219u la readiness${ev.reason ? `: ${ev.reason}` : ""}`;
    changes.push(`${x.id}: anulat de sistem (${ev.verdict})`);
    if (x.key && ev.verdict === "rosu") {
      const tomorrow = addDays(ev.date, 1);
      const dayAfter = addDays(ev.date, 2);
      const keyNearby = plan.some((y) => y.key && y.status === "planificat" && y.id !== x.id && (y.date === tomorrow || y.date === dayAfter));
      const longest = ctx.freeBlocks.filter((b) => b.day === weekday(tomorrow)).reduce((m, b) => Math.max(m, b.endMin - b.startMin), 0);
      const countTomorrow = plan.filter((y) => y.date === tomorrow && y.status === "planificat").length;
      if (!keyNearby && longest >= x.plannedMinutes + CHANGE_MIN && countTomorrow < 2) {
        plan.push({ ...x, id: `${x.id}-mutat`, date: tomorrow, status: "mutat", note: `mutat de pe ${ev.date} (readiness ro\u0219u)` });
        changes.push(`${x.id}: antrenament-cheie mutat pe ${tomorrow}`);
      } else {
        changes.push(`${x.id}: antrenament-cheie pierdut (f\u0103r\u0103 bloc liber sau alt\u0103 cheie \xEEn 48 h)`);
      }
    }
  }
}
function applyPain(plan, ev, _ctx, changes) {
  if (ev.score < 3) return;
  const until = addDays(ev.date, 5);
  for (const x of plan) {
    if (x.status !== "planificat") continue;
    if (diffDays(ev.date, x.date) < 0 || diffDays(x.date, until) < 0) continue;
    if (x.sport === "alergare") {
      x.sport = "bicicleta";
      x.type = "z2";
      x.targetZones = [2];
      x.key = false;
      x.intervals = void 0;
      x.structure = void 0;
      x.note = `f\u0103r\u0103 impact: durere ${ev.score}/10 la ${ev.loc}`;
      changes.push(`${x.id}: alergarea devine biciclet\u0103 Z2 (${x.plannedMinutes} min)`);
    } else if (x.type === "brick") {
      x.type = "lung";
      x.structure = "tura lung\u0103 f\u0103r\u0103 alergarea de dup\u0103";
      x.note = `brick f\u0103r\u0103 alergare: durere ${ev.score}/10 la ${ev.loc}`;
      changes.push(`${x.id}: brick f\u0103r\u0103 alergare`);
    }
  }
  if (ev.score >= 5) changes.push(`durere ${ev.score}/10 la ${ev.loc}: escaladare la fizioterapeut \xEEn aceea\u0219i zi`);
}
function applyFever(plan, ev, changes) {
  const stopUntil = addDays(ev.date, 2);
  const halfUntil = addDays(ev.date, 9);
  for (const x of plan) {
    if (x.status !== "planificat") continue;
    const d = diffDays(ev.date, x.date);
    if (d < 0) continue;
    if (diffDays(x.date, stopUntil) >= 0) {
      x.status = "anulat_sistem";
      x.note = "febr\u0103: odihn\u0103";
      changes.push(`${x.id}: anulat (febr\u0103)`);
    } else if (diffDays(x.date, halfUntil) >= 0) {
      x.plannedMinutes = Math.round(x.plannedMinutes * 0.5 / 5) * 5;
      x.key = false;
      if (x.type === "calitate") {
        x.type = "z2";
        x.intervals = void 0;
      }
      x.targetZones = x.sport === "forta" ? [] : [1, 2];
      x.note = "prima s\u0103pt\u0103m\xE2n\u0103 dup\u0103 febr\u0103: volum \u221250%, f\u0103r\u0103 cheie";
      changes.push(`${x.id}: \u221250%, f\u0103r\u0103 intensitate (dup\u0103 febr\u0103)`);
    }
  }
}
function applyUnplanned(plan, ev, changes) {
  const a = ev.activity;
  if (a.minutes < 30) return;
  const isRace = ev.tip === "cursa";
  const big = isRace || a.minutes >= 90 || (ev.rpe ?? 0) >= 7;
  const longRace = isRace && a.minutes >= 60;
  const monday = addDays(a.date, -weekday(a.date));
  const sunday = addDays(monday, 6);
  const inWeek = (d) => diffDays(monday, d) >= 0 && diffDays(d, sunday) >= 0;
  if (isRace) {
    for (const x of plan) {
      if (x.status === "planificat" && x.date === a.date) {
        x.status = "anulat_sistem";
        x.note = `zi de curs\u0103 neplanificat\u0103 (${a.sport} ${a.minutes} min)`;
        changes.push(`${x.id}: anulat, zi de curs\u0103`);
      }
    }
  }
  let remaining = a.minutes;
  const sameSport = plan.filter((x) => x.status === "planificat" && x.sport === a.sport && inWeek(x.date) && diffDays(a.date, x.date) > 0).sort((p, q2) => diffDays(q2.date, p.date) || Number(p.key) - Number(q2.key));
  for (const x of sameSport) {
    if (remaining <= 0) break;
    if (x.key && !isRace) continue;
    if (x.plannedMinutes > remaining + CHANGE_MIN) continue;
    x.status = "sters";
    x.note = `\xEEnlocuit: ${isRace ? "curs\u0103" : "activitate"} neplanificat\u0103 de ${a.minutes} min pe ${a.date}`;
    remaining -= x.plannedMinutes;
    changes.push(`${x.id}: ${x.sport} ${x.type} ${x.plannedMinutes} min scos, volumul l-a acoperit activitatea din ${a.date}`);
  }
  if (!big) return;
  const easyDays = isRace ? 2 : 1;
  for (const x of plan) {
    if (x.status !== "planificat") continue;
    const d = diffDays(a.date, x.date);
    if (d < 1) continue;
    if (d <= easyDays) {
      if (x.key && !isRace) continue;
      x.targetZones = x.sport === "forta" ? [] : [1];
      if (x.type === "calitate") {
        x.type = "z2";
        x.intervals = void 0;
      }
      if (x.key) {
        x.plannedMinutes = Math.round(x.plannedMinutes * 0.75 / 5) * 5;
        x.note = `dup\u0103 curs\u0103: Z1, \u221225% (${a.minutes} min pe ${a.date})`;
        changes.push(`${x.id}: cheie cobor\xE2t\u0103 la Z1, \u221225% (curs\u0103 neplanificat\u0103)`);
      } else {
        const how = x.sport === "forta" ? "u\u0219or, f\u0103r\u0103 \xEEnc\u0103rc\u0103ri mari" : "Z1";
        x.note = `${how} dup\u0103 ${isRace ? "curs\u0103" : "activitate"} neplanificat\u0103 (${a.minutes} min)`;
        changes.push(`${x.id}: ${how} (${isRace ? "curs\u0103" : "activitate"} neplanificat\u0103 din ${a.date})`);
      }
    } else if (isRace && d <= 3 && x.key) {
      x.targetZones = x.sport === "forta" ? [] : [1, 2];
      x.plannedMinutes = Math.round(x.plannedMinutes * 0.75 / 5) * 5;
      x.intervals = void 0;
      if (x.type === "calitate") x.type = "z2";
      x.note = `\xEEn 72 h dup\u0103 curs\u0103: Z1\u2013Z2, \u221225%`;
      changes.push(`${x.id}: cheie cobor\xE2t\u0103 la Z1\u2013Z2, \u221225% (72 h dup\u0103 curs\u0103)`);
    }
  }
  if (!longRace) return;
  const nextMonday = addDays(monday, 7);
  const nextSunday = addDays(nextMonday, 6);
  const thisWeekKeys = plan.filter((x) => x.key && inWeek(x.date));
  for (const x of plan) {
    if (!x.key || x.status !== "planificat") continue;
    if (diffDays(nextMonday, x.date) < 0 || diffDays(x.date, nextSunday) < 0) continue;
    const ref = thisWeekKeys.find((k) => k.sport === x.sport && k.type === x.type);
    if (ref && x.plannedMinutes > ref.plannedMinutes) {
      x.plannedMinutes = ref.plannedMinutes;
      x.step = ref.step;
      x.note = [x.note, `progresie oprit\u0103 dup\u0103 cursa din ${a.date}`].filter(Boolean).join("; ");
      changes.push(`${x.id}: ${x.sport} ${x.type} r\u0103m\xE2ne la ${x.plannedMinutes} min (progresie oprit\u0103 dup\u0103 curs\u0103)`);
    }
  }
}
function applyProgress(plan, ev, ctx, changes) {
  const monday = addDays(ev.date, 7 - weekday(ev.date));
  const week = plan.filter((w) => w.status === "planificat" && diffDays(monday, w.date) >= 0 && diffDays(monday, w.date) < 7);
  const total = week.reduce((n2, w) => n2 + w.plannedMinutes, 0);
  let budget = Math.floor(total * 0.1 / 5) * 5;
  if (budget < 5) return;
  const easy = week.filter((w) => !w.key && (w.type === "z2" || w.type === "tehnica") && w.sport !== "forta" && !(ev.restricted ?? []).includes(w.sport)).sort((a, b) => b.plannedMinutes - a.plannedMinutes);
  for (const w of easy) {
    if (budget <= 0) break;
    const window = ctx.freeBlocks.filter((b) => b.day === weekday(w.date)).reduce((m, b) => Math.max(m, b.endMin - b.startMin), 0);
    const room = window ? window - w.plannedMinutes : 15;
    const add = Math.min(15, budget, Math.floor(room / 5) * 5);
    if (add <= 0) continue;
    w.plannedMinutes += add;
    w.note = `+${add} min: cre\u0219tere controlat\u0103 (7 zile verzi)`;
    budget -= add;
    changes.push(`${w.id}: ${w.sport} ${w.date} +${add} min (progres)`);
  }
  if (changes.length) changes.push(`progres: s\u0103pt\u0103m\xE2na ${monday}, +${Math.round((total * 0.1 - budget) / Math.max(total, 1) * 100)}% fa\u021B\u0103 de ${total} min`);
}

// server/_lib/agents.ts
var FILE_MAX_LINES = 30;
async function loadAgentFiles(userId) {
  const rows = await select("agent_files", { user_id: `eq.${userId}` });
  return Object.fromEntries(rows.map((r2) => [r2.agent, r2.content]));
}
async function loadJournal(userId, today) {
  const rows = await select("journal", { user_id: `eq.${userId}`, date: `gte.${addDays(today, -14)}` }, { order: "date.asc", limit: 200 });
  return rows.map((r2) => `${r2.date}: ${r2.entry}`);
}
async function loadSchedules(userId) {
  const rows = await select("schedules", { user_id: `eq.${userId}` });
  return rows.map((r2) => ({ day: r2.day, startMin: r2.start_min, endMin: r2.end_min }));
}
async function recentKeyScores(userId, today) {
  const rows = await select("scores", { user_id: `eq.${userId}` }, { select: "color,workouts_planned!inner(date,is_key)", limit: 100 });
  return rows.filter((r2) => r2.workouts_planned.is_key && r2.workouts_planned.date >= addDays(today, -14)).map((r2) => ({ date: r2.workouts_planned.date, color: r2.color }));
}
async function runAgents(userId, today, event, force = false) {
  if (!force) {
    const existing = await one("packets", { user_id: `eq.${userId}`, event: `eq.${event}`, created_at: `gte.${today}T00:00:00` });
    if (existing) return null;
  }
  const { input, planId } = await collect(userId, today, event);
  const packet = buildPacket(input);
  const [packetRow] = await insert("packets", { user_id: userId, event, packet });
  const packetId = packetRow.id;
  const [files, journal] = await Promise.all([loadAgentFiles(userId), loadJournal(userId, today)]);
  const usageWrites = [];
  const client = anthropicClient(ENV.modelKey(), fetch, (model, u) => usageWrites.push(recordUsage(userId, `agenti:${event}`, model, u)));
  const result = await runPyramid({ packet, files, journal, prompts: PROMPTS, models: { specialist: ENV.modelSpecialist(), head: ENV.modelHead() } }, client);
  await Promise.all(usageWrites);
  await insert(
    "agent_outputs",
    result.specialists.map((s) => ({ packet_id: packetId, user_id: userId, agent: s.agent, verdict: s.verdict, output: s, rejected: s.ce.filter((i) => i.stare === "respins").length, model: ENV.modelSpecialist() }))
  );
  await insert("agent_outputs", { packet_id: packetId, user_id: userId, agent: "head_coach", verdict: result.decision, output: { ...result.head, avertismente: result.headWarnings, fallback: result.fallbackUsed }, rejected: result.headWarnings.length, model: ENV.modelHead() });
  for (const s of result.specialists) {
    if (!s.pentru_viitor || s.pentru_viitor === "-") continue;
    const agent = s.agent;
    const lines = (files[agent] ?? "").split("\n").filter((l) => l.trim());
    lines.push(`${today}: ${s.pentru_viitor}`);
    await upsert("agent_files", { user_id: userId, agent, content: lines.slice(-FILE_MAX_LINES).join("\n"), updated_at: (/* @__PURE__ */ new Date()).toISOString() }, "user_id,agent");
  }
  const entries = [...result.head.jurnal, ...result.specialists.flatMap((s) => s.ce.filter((i) => i.stare === "respins").map((i) => `respins: ${s.agent} - ${i.text} (${i.motiv})`)), ...result.specialists.flatMap((s) => s.avertismente.map((a) => `avertisment: ${s.agent} - ${a}`))];
  if (entries.length) await insert("journal", entries.map((e) => ({ user_id: userId, date: today, entry: e })));
  await insert("messages", { user_id: userId, packet_id: packetId, kind: event, body: result.head.mesaj, decision: result.decision });
  if (event === "dimineata" && result.head.memento) await insert("messages", { user_id: userId, packet_id: packetId, kind: "memento", body: result.head.memento, decision: null });
  if (event === "dimineata") {
    await upsert(
      "readiness_daily",
      { user_id: userId, date: today, verdict: result.decision, reason: result.specialists.find((s) => s.agent === "fiziolog")?.ce.find((i) => i.stare === "acceptat")?.text ?? null, hrv: packet.hrv.azi, hrv_baseline: packet.hrv.baseline60, rhr: packet.puls_repaus.azi, sleep_min: packet.somn.durata_min, hooper_sum: packet.readiness.hooper.suma, acwr: packet.incarcare.acwr, tsb: packet.incarcare.tsb },
      "user_id,date"
    );
  }
  const changes = [];
  if (planId && result.events.length) {
    const ctx = { today, freeBlocks: await loadSchedules(userId), recentKeyScores: await recentKeyScores(userId, today) };
    let plan = input.plan;
    for (const ev of result.events) {
      const r2 = adapt(plan, ev, ctx);
      plan = r2.plan;
      changes.push(...r2.changes);
    }
    const before = new Map(input.plan.map((w) => [w.id, JSON.stringify(w)]));
    const changed = plan.filter((w) => before.get(w.id) !== JSON.stringify(w));
    if (changed.length) await upsert("workouts_planned", changed.map((w) => toWorkoutRow(w, userId, planId)), "id");
    if (changes.length) await insert("journal", changes.map((c) => ({ user_id: userId, date: today, entry: `calendar: ${c}` })));
  }
  return { packetId, decision: result.decision, message: result.head.mesaj, memento: result.head.memento, changes, routed: result.routed, rejected: result.specialists.reduce((n2, s) => n2 + s.ce.filter((i) => i.stare === "respins").length, 0), fallbackUsed: result.fallbackUsed };
}

// server/agents/run.ts
async function handler2(req, res) {
  let beat = null;
  try {
    if (req.method !== "POST") throw new HttpError(405, "POST");
    const u = await requireUser(req);
    const user = await loadUser(u.id);
    const body = await readJson(req);
    res.statusCode = 200;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.setHeader("cache-control", "no-store");
    res.setHeader("x-accel-buffering", "no");
    res.write(" ");
    beat = setInterval(() => {
      if (!res.writableEnded) res.write(" ");
    }, 5e3);
    let out;
    try {
      out = await runAgents(u.id, todayIn(user.tz), body.event ?? "dimineata", body.force ?? true) ?? { skipped: "exist\u0103 deja o rulare azi pentru evenimentul \u0103sta" };
    } catch (e) {
      out = { error: e instanceof Error ? e.message : String(e) };
    }
    clearInterval(beat);
    res.end(JSON.stringify(out));
  } catch (e) {
    if (beat) clearInterval(beat);
    if (res.headersSent) res.end(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }));
    else fail(res, e);
  }
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
function exchangeCode(cfg, code) {
  return tokenRequest(cfg, { grant_type: "authorization_code", code, redirect_uri: cfg.redirectUri });
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

// src/collector/other.ts
var RECOVERY = [
  [/sauna|saun/i, "saun\u0103"],
  [/ice ?bath|cold ?(plunge|water|shower|exposure)|cryo|baie rece/i, "baie rece"],
  [/yoga|pilates/i, "yoga"],
  [/stretch|flexib|mobility|mobilitate|foam/i, "stretching"],
  [/massage|masaj/i, "masaj"],
  [/breath|respira/i, "respira\u021Bie"],
  [/meditat|mind ?and ?body|mindful/i, "medita\u021Bie"],
  [/cool ?down|recovery|recuperare|hot ?tub|steam/i, "recuperare"]
];
var ACTIVE = [
  [/walk|plimb/i, "plimbare"],
  [/hik|drume/i, "drume\u021Bie"],
  [/tennis|padel|squash|badminton|pickleball/i, "sport cu racheta"],
  [/soccer|football|fotbal|basket|volley|handball/i, "sport de echip\u0103"],
  [/ski|snowboard/i, "schi"],
  [/row|kayak|canoe|paddle|sup\b/i, "canotaj / caiac"],
  [/climb|bouldering/i, "c\u0103\u021B\u0103rare"],
  [/dance|dans/i, "dans"],
  [/box|martial|mma|kickbox|jiu/i, "sport de contact"],
  [/elliptical|stair|step/i, "cardio la aparate"],
  [/golf/i, "golf"]
];
function classifyOther(rawName) {
  const n2 = rawName.replace(/_/g, " ").trim();
  if (!n2) return null;
  for (const [re, name] of RECOVERY) if (re.test(n2)) return { kind: "recuperare", name };
  for (const [re, name] of ACTIVE) if (re.test(n2)) return { kind: "activ", name };
  if (/^activity$|^other$|^altul$/i.test(n2)) return null;
  return { kind: "activ", name: n2.toLowerCase() };
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
    name: z ? `whoop ${w.sport_name}; z1\u2013z5 (min): ${[z.zone_one_milli, z.zone_two_milli, z.zone_three_milli, z.zone_four_milli, z.zone_five_milli].map((ms) => Math.round(ms / 6e4)).join("/")}` : `whoop ${w.sport_name}`,
    details: whoopDetails(w.score)
  };
}
function normalizeWhoopOther(w) {
  if (WHOOP_SPORT[w.sport_name.toLowerCase()]) return null;
  const c = classifyOther(w.sport_name);
  if (!c) return null;
  const minutes = Math.round((new Date(w.end).getTime() - new Date(w.start).getTime()) / 6e4);
  if (minutes < 5) return null;
  return { id: `whoop-o-${w.id}`, source: "whoop", externalId: w.id, date: localDate(w.start, w.timezone_offset), startLocal: localHm(w.start, w.timezone_offset), kind: c.kind, name: c.name, minutes, avgHr: w.score?.average_heart_rate ?? null, maxHr: w.score?.max_heart_rate ?? null };
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
async function getActivity(token, id) {
  return getJson(`https://www.strava.com/api/v3/activities/${id}?include_all_efforts=false`, token);
}
function normalizeStravaOther(a) {
  if (STRAVA_SPORT[a.sport_type]) return null;
  const c = classifyOther(a.sport_type);
  if (!c) return null;
  const minutes = Math.round((a.elapsed_time ?? a.moving_time) / 60);
  if (minutes < 5) return null;
  return { id: `strava-o-${a.id}`, source: "strava", externalId: String(a.id), date: a.start_date_local.slice(0, 10), startLocal: a.start_date_local.slice(11, 16), kind: c.kind, name: c.name, minutes, avgHr: a.average_heartrate != null ? Math.round(a.average_heartrate) : null, maxHr: a.max_heartrate != null ? Math.round(a.max_heartrate) : null };
}
function normalizeStravaActivity(a) {
  const sport = STRAVA_SPORT[a.sport_type];
  if (!sport) return null;
  const minutes = Math.round(a.moving_time / 60);
  const km2 = a.distance > 0 ? Math.round(a.distance / 1e3 * 10) / 10 : null;
  return {
    id: `strava-${a.id}`,
    externalId: String(a.id),
    source: "strava",
    date: a.start_date_local.slice(0, 10),
    startLocal: a.start_date_local.slice(11, 16),
    sport,
    minutes,
    distanceKm: km2,
    avgHr: a.average_heartrate != null ? Math.round(a.average_heartrate) : null,
    maxHr: a.max_heartrate != null ? Math.round(a.max_heartrate) : null,
    avgPaceMinKm: km2 && sport === "alergare" ? Math.round(minutes / km2 * 100) / 100 : null,
    avgCadence: a.average_cadence != null ? Math.round(sport === "alergare" ? a.average_cadence * 2 : a.average_cadence) : null,
    avgWatts: a.average_watts != null ? Math.round(a.average_watts) : null,
    timeInZonesMin: null,
    // se calculează din stream-ul de FC cu zonele sportivului, nu din Strava
    name: `${a.name}${a.device_name ? ` \xB7 ${a.device_name}` : ""}`,
    details: stravaDetails(a, sport)
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
var PROVIDERS = ["whoop", "strava", "oura"];
function providerConfig(p) {
  const redirect2 = `${ENV.appUrl()}/api/oauth/${p}/callback`;
  switch (p) {
    case "whoop":
      return whoopConfig({ WHOOP_CLIENT_ID: process.env.WHOOP_CLIENT_ID, WHOOP_CLIENT_SECRET: process.env.WHOOP_CLIENT_SECRET, WHOOP_REDIRECT_URI: redirect2 });
    case "strava":
      return stravaConfig({ STRAVA_CLIENT_ID: process.env.STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET: process.env.STRAVA_CLIENT_SECRET, STRAVA_REDIRECT_URI: redirect2 });
    case "oura":
      return ouraConfig({ OURA_CLIENT_ID: process.env.OURA_CLIENT_ID, OURA_CLIENT_SECRET: process.env.OURA_CLIENT_SECRET, OURA_REDIRECT_URI: redirect2 });
  }
}
function providerConfigured(p) {
  const k = { whoop: "WHOOP_CLIENT_ID", strava: "STRAVA_CLIENT_ID", oura: "OURA_CLIENT_ID" }[p];
  return !!process.env[k];
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
function signState(userId) {
  const payload = `${userId.replace(/-/g, "")}.${Date.now().toString(36)}`;
  const sig = createHmac2("sha256", ENV.stateSecret()).update(payload).digest("base64url").slice(0, 22);
  return `${payload}.${sig}`;
}
function verifyState(state) {
  if (!state) throw new Error("conectarea nu a primit \xEEnapoi codul de siguran\u021B\u0103 (state); apas\u0103 din nou Conecteaz\u0103");
  const [id, ts, sig] = state.split(".");
  if (!id || !ts || !sig || id.length !== 32) throw new Error("codul de siguran\u021B\u0103 (state) primit \xEEnapoi e modificat; apas\u0103 din nou Conecteaz\u0103");
  const expected = createHmac2("sha256", ENV.stateSecret()).update(`${id}.${ts}`).digest("base64url").slice(0, 22);
  if (expected.length !== sig.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) throw new Error("codul de siguran\u021B\u0103 (state) nu se potrive\u0219te; apas\u0103 din nou Conecteaz\u0103");
  if (Date.now() - parseInt(ts, 36) > 15 * 6e4) throw new Error("au trecut peste 15 minute de la Conecteaz\u0103; apas\u0103 din nou");
  return `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}`;
}

// server/config.ts
async function handler3(_req, res) {
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
    let upgrade = false;
    try {
      const r2 = await fetch(`${supabaseUrl}/rest/v1/users?select=id`, { headers: { ...supabaseKeyHeaders(ENV.supabaseService()), prefer: "count=exact", range: "0-0" } });
      ready = r2.ok;
      users = Number(r2.headers.get("content-range")?.split("/")[1] ?? 0) || 0;
      if (ready) {
        const h = { headers: supabaseKeyHeaders(ENV.supabaseService()) };
        const [c, t, l, o, w, a, ov] = await Promise.all([
          fetch(`${supabaseUrl}/rest/v1/users?select=city,apple_token,schema_v,sex,birth_year,height_cm&limit=1`, h),
          fetch(`${supabaseUrl}/rest/v1/app_settings?select=key&limit=1`, h),
          fetch(`${supabaseUrl}/rest/v1/labs?select=uploaded_at&limit=1`, h),
          fetch(`${supabaseUrl}/rest/v1/other_activities?select=id&limit=1`, h),
          fetch(`${supabaseUrl}/rest/v1/workouts_planned?select=suggestion&limit=1`, h),
          fetch(`${supabaseUrl}/rest/v1/ai_usage?select=id&limit=1`, h),
          fetch(`${supabaseUrl}/rest/v1/activity_overrides?select=activity_id&limit=1`, h)
        ]);
        upgrade = !c.ok || !t.ok || !l.ok || !o.ok || !w.ok || !a.ok || !ov.ok;
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
      providers: Object.fromEntries(PROVIDERS.map((p) => [p, providerConfigured(p)]))
    });
  } catch (e) {
    fail(res, e);
  }
}

// server/cron/evening.ts
async function handler4(req, res) {
  try {
    requireCron(req);
    const users = await select("users", {}, { select: "id,tz,consents(health_data)" });
    const out = {};
    for (const u of users) {
      if (!u.consents?.health_data) continue;
      const today = todayIn(u.tz);
      try {
        const activity = await one("activities", { user_id: `eq.${u.id}`, date: `eq.${today}` });
        const evening = activity ? await runAgents(u.id, today, "dupa_antrenament") : null;
        const weekly = weekday(today) === 6 ? await runAgents(u.id, today, "saptamanal") : null;
        out[u.id] = { seara: evening ? evening.decision : activity ? "deja rulat" : "f\u0103r\u0103 \u0219edin\u021B\u0103", saptamanal: weekly ? weekly.decision : weekday(today) === 6 ? "deja rulat" : "-" };
      } catch (e) {
        out[u.id] = { eroare: e instanceof Error ? e.message : String(e) };
      }
    }
    json(res, 200, { ok: true, out });
  } catch (e) {
    fail(res, e);
  }
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
    const n2 = normalizeWhoopNight(s, rec);
    if (n2) wellness.push(n2);
  }
  const activities = workouts.map(normalizeWhoopWorkout).filter((a) => a != null);
  const others = workouts.map(normalizeWhoopOther).filter((a) => a != null);
  void userId;
  return { wellness, activities, others };
}
async function pullStrava(token, days) {
  const now = Math.floor(Date.now() / 1e3);
  const rows = await listActivities(token, now - Math.max(days, 42) * 86400, now + 3600);
  return { activities: rows.map(normalizeStravaActivity).filter((a) => a != null), others: rows.map(normalizeStravaOther).filter((a) => a != null) };
}
async function pullOura(token, days) {
  const end = /* @__PURE__ */ new Date();
  const start = new Date(end.getTime() - days * 864e5);
  const [sleep, daily, readiness] = await Promise.all([ouraApi.sleep(token, isoDay(start), isoDay(end)), ouraApi.dailySleep(token, isoDay(start), isoDay(end)), ouraApi.dailyReadiness(token, isoDay(start), isoDay(end))]);
  const out = [];
  for (const s of sleep.data) {
    const n2 = normalizeOuraNight(s, daily.data.find((d) => d.day === s.day) ?? null, readiness.data.find((r2) => r2.day === s.day) ?? null);
    if (n2) out.push(n2);
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
    ...a.details ? { raw: a.details } : {},
    synced_at: (/* @__PURE__ */ new Date()).toISOString()
  };
}
async function enrichStrava(userId, token, acts) {
  if (!acts.length) return;
  const existing = await select("activities", { user_id: `eq.${userId}`, id: `in.(${acts.map((a) => `"${a.id}"`).join(",")})` }, { select: "id,raw" }).catch(() => []);
  const prev = new Map(existing.map((r2) => [r2.id, r2.raw]));
  let budget = 15;
  for (const a of acts) {
    const old = prev.get(a.id);
    if (old) a.details = mergeDetails(a.details, old);
    if (old?.detailed && (old.v ?? 1) >= DETAILS_V) continue;
    if (budget <= 0 || a.sport !== "alergare" && a.sport !== "inot") continue;
    budget--;
    try {
      const det = await getActivity(token, a.externalId);
      a.details = mergeDetails(stravaDetails(det, a.sport), a.details);
    } catch {
      budget = 0;
    }
  }
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
        const { wellness, activities, others } = await pullWhoop(userId, token, days);
        await saveOthers(userId, others);
        if (wellness.length) await upsert("wellness_daily", wellness.map((w) => wellnessRow(userId, w)), "user_id,date,source");
        if (activities.length) await upsert("activities", activities.map((a) => activityRow(userId, a)), "id");
        rows = wellness.length + activities.length;
      } else if (provider === "strava") {
        const { activities, others } = await pullStrava(token, days);
        await saveOthers(userId, others);
        await enrichStrava(userId, token, activities);
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
async function saveOthers(userId, others) {
  if (!others.length) return;
  await upsert(
    "other_activities",
    others.map((o) => ({ id: o.id, user_id: userId, source: o.source, external_id: o.externalId, date: o.date, start_local: o.startLocal, kind: o.kind, name: o.name, minutes: o.minutes, avg_hr: o.avgHr, max_hr: o.maxHr, synced_at: (/* @__PURE__ */ new Date()).toISOString() })),
    "id"
  ).catch(() => void 0);
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

// src/bar/bar.ts
var WINDOW_DAYS2 = 42;
var CSS_TARGET_SEC = 150;
var TARGETS = {
  "70.3": { swimM: 1900, rideKm: 90, runKm: 18, brickRunKm: 8 },
  olimpic: { swimM: 1500, rideKm: 40, runKm: 10, brickRunKm: 4 },
  sprint: { swimM: 750, rideKm: 20, runKm: 5, brickRunKm: 2 },
  // Ieșirea lungă de referință înainte de cursă (nu distanța întreagă): 18 km la semimaraton, 32 km la maraton.
  semimaraton: { swimM: 0, rideKm: 0, runKm: 18, brickRunKm: 0 },
  maraton: { swimM: 0, rideKm: 0, runKm: 32, brickRunKm: 0 }
};
function computeBar(input) {
  const t = TARGETS[input.goal];
  const recent = input.activities.filter(
    (a) => diffDays(a.date, input.today) >= 0 && diffDays(a.date, input.today) <= WINDOW_DAYS2 && (a.color === "verde" || a.color === "galben")
  );
  const components = [];
  const run = isRunGoal(input.goal);
  if (run) {
    const runs = recent.filter((a) => a.sport === "alergare" && a.distanceKm != null && a.distanceKm > 0);
    const best = maxBy(runs, (a) => a.distanceKm);
    components.push(
      best ? { name: "alergare", weight: 0.5, value: r(100 * Math.min(1, best.distanceKm / t.runKm)), detail: `cea mai lung\u0103 alergare: ${r(best.distanceKm)} km din ${t.runKm}`, evidence: [{ activityId: best.id, date: best.date, label: `${r(best.distanceKm)} km` }] } : { name: "alergare", weight: 0.5, value: null, detail: "f\u0103r\u0103 alergare cu distan\u021B\u0103 \xEEn ultimele 6 s\u0103pt\u0103m\xE2ni", evidence: [] }
    );
  }
  if (!run) {
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
          detail += `; CSS ${fmtPace2(input.cssSecPer100m)} fa\u021B\u0103 de ${fmtPace2(CSS_TARGET_SEC)}`;
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
  }
  {
    const counted = input.plannedColorsLast4Weeks.filter((c) => c !== "gri" && c !== "asteptare" && c !== "albastru");
    if (counted.length === 0) {
      components.push({ name: "consistenta", weight: run ? 0.25 : 0.15, value: null, detail: "f\u0103r\u0103 antrenamente scorate \xEEn ultimele 4 s\u0103pt\u0103m\xE2ni", evidence: [] });
    } else {
      const good = counted.filter((c) => c === "verde" || c === "galben").length;
      components.push({
        name: "consistenta",
        weight: run ? 0.25 : 0.15,
        value: r(100 * good / counted.length),
        detail: `${good} din ${counted.length} antrenamente planificate executate (verde sau galben)`,
        evidence: []
      });
    }
  }
  {
    if (input.ctl == null || input.ctlTarget == null || input.ctlTarget <= 0) {
      components.push({ name: "forma", weight: run ? 0.25 : 0.15, value: null, detail: "f\u0103r\u0103 CTL sau f\u0103r\u0103 \u021Bint\u0103 de faz\u0103", evidence: [] });
    } else {
      components.push({
        name: "forma",
        weight: run ? 0.25 : 0.15,
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
function fmtPace2(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}/100 m`;
}
function r(n2) {
  return Math.round(n2 * 10) / 10;
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
  const dirs = /* @__PURE__ */ new Map();
  for (const m of matches) if (m.activity) dirs.set(m.planned.id, zoneDirection(m.planned, m.activity, m.extraActivity ?? null));
  const rows = matches.map((m) => {
    const sameDay = matches.filter((o) => o !== m && o.activity && o.planned.date === m.planned.date).map((o) => ({ sport: o.planned.sport, directie: dirs.get(o.planned.id) ?? null }));
    const evening = forms.evenings.find((e) => e.activityId && m.activity && (e.activityId === m.activity.id || e.activityId === m.activity.externalId)) ?? forms.evenings.find((e) => e.date === m.planned.date);
    const r2 = scoreWorkout({ planned: m.planned, activity: m.activity, extraActivity: m.extraActivity, questionnaire: toQuestionnaire(evening), systemCancelled: m.planned.status === "anulat_sistem", today, sameDay });
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

// server/_lib/reminders.ts
var LABS_REMINDER = "Analizele tale lipsesc (sau sunt mai vechi de 12 luni). Planul merge \u0219i f\u0103r\u0103 ele, dar nu e 100% pe corpul t\u0103u: nutri\u021Bia, fierul \u0219i semnalele de alarm\u0103 vin doar din analize. Urc\u0103-le din Date de baz\u0103 \u2192 Analize de s\xE2nge (PDF sau poz\u0103).";
async function labsReminder(userId, today) {
  if (await loadLabs(userId)) return false;
  const intake = await one("questionnaires", { user_id: `eq.${userId}`, kind: "eq.intrare" }, { order: "for_date.asc" });
  if (!intake) return false;
  const days = diffDays(intake.for_date, today);
  if (days <= 0 || days % 3 !== 0) return false;
  await insert("messages", { user_id: userId, kind: "avertisment", body: LABS_REMINDER, decision: null });
  return true;
}

// server/cron/morning.ts
async function handler5(req, res) {
  try {
    requireCron(req);
    const users = await select("users", {}, { select: "id,tz,goal,consents(health_data)" });
    const out = {};
    for (const u of users) {
      if (!u.consents?.health_data) continue;
      const today = todayIn(u.tz);
      try {
        await syncUser(u.id, 3);
        await rescore(u.id, today, u.goal && u.goal !== "full" ? u.goal : "70.3");
        await labsReminder(u.id, today).catch(() => false);
        const r2 = await runAgents(u.id, today, "dimineata");
        out[u.id] = r2 ? { decizie: r2.decision, rutati: r2.routed, respinse: r2.rejected, schimbari: r2.changes.length } : "deja rulat";
      } catch (e) {
        out[u.id] = { eroare: e instanceof Error ? e.message : String(e) };
      }
    }
    json(res, 200, { ok: true, out });
  } catch (e) {
    fail(res, e);
  }
}

// server/cron/sync.ts
async function handler6(req, res) {
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

// server/_lib/http.ts
function q(req, name) {
  const v = req.query[name];
  return Array.isArray(v) ? v[0] ?? "" : v ?? "";
}
function redirect(res, to) {
  res.statusCode = 302;
  res.setHeader("location", to);
  res.end();
}

// server/_lib/test-extract.ts
var SYSTEM = `Transcrii un raport de test de efort (CPET / ergospirometrie, test de lactat sau test de teren). Reguli:
- Copiezi exact ce scrie; nu calculezi, nu estimezi, nu completezi din memorie. Ce nu apare \xEEn raport = null.
- tip: "cpet" (ergospirometrie, VO2, praguri ventilatorii VT1/VT2, AT/RCP), "lactat" (praguri de lactat LT1/LT2), "teren", altfel "altul".
- ergometru: "banda" (alergare / treadmill), "bicicleta" (cicloergometru), altfel "altul".
- prag1_fc = FC la primul prag (VT1 / AT / LT1 / prag aerob); prag2_fc = FC la al doilea prag (VT2 / RCP / LT2 / prag anaerob).
- prag2_ritm_min_km = ritmul la al doilea prag, format "m:ss" pe km (dac\u0103 raportul d\u0103 viteza \xEEn km/h, o copiezi doar dac\u0103 e scris\u0103 \u0219i ca ritm; altfel null).
- prag2_putere_w = puterea la al doilea prag; ftp_w doar dac\u0103 raportul scrie explicit FTP.
- zone_alergare_fc_max / zone_bicicleta_fc_max: DOAR dac\u0103 raportul are un tabel de zone de antrenament pe FC: limita de SUS a fiec\u0103rei zone, Z1..Z5 (dac\u0103 tabelul are 3 sau 6-7 zone, nu le adaptezi: la\u0219i toate null). Zonele de pe band\u0103 merg la alergare, cele de pe biciclet\u0103 la biciclet\u0103.
- data_testului \xEEn format YYYY-MM-DD; clinica = numele clinicii sau al laboratorului.
- lizibil = false dac\u0103 documentul nu e un raport de test de efort sau nu se poate citi.`;
var ZONES = { type: "array", items: { type: ["number", "null"] } };
var SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["lizibil", "tip", "data_testului", "clinica", "ergometru", "fc_max", "vo2max_ml_kg_min", "prag1_fc", "prag2_fc", "prag2_ritm_min_km", "prag2_putere_w", "ftp_w", "zone_alergare_fc_max", "zone_bicicleta_fc_max"],
  properties: {
    lizibil: { type: "boolean" },
    tip: { type: "string", enum: ["cpet", "lactat", "teren", "altul"] },
    data_testului: { type: ["string", "null"] },
    clinica: { type: ["string", "null"] },
    ergometru: { type: ["string", "null"] },
    fc_max: { type: ["number", "null"] },
    vo2max_ml_kg_min: { type: ["number", "null"] },
    prag1_fc: { type: ["number", "null"] },
    prag2_fc: { type: ["number", "null"] },
    prag2_ritm_min_km: { type: ["string", "null"] },
    prag2_putere_w: { type: ["number", "null"] },
    ftp_w: { type: ["number", "null"] },
    zone_alergare_fc_max: ZONES,
    zone_bicicleta_fc_max: ZONES
  }
};
var full = (z) => z.length === 5 && z.every((v) => v != null);
var five = (z) => Array.isArray(z) && z.length === 5 ? z.map((v) => typeof v === "number" ? v : null) : [null, null, null, null, null];
function toTestForm(r2) {
  const note = [];
  const fromThresholds = [null, r2.prag1_fc, null, r2.prag2_fc, r2.fc_max];
  const hasThr = r2.prag1_fc != null || r2.prag2_fc != null;
  let run = [null, null, null, null, null];
  let bike = [null, null, null, null, null];
  if (full(five(r2.zone_alergare_fc_max))) run = five(r2.zone_alergare_fc_max);
  if (full(five(r2.zone_bicicleta_fc_max))) bike = five(r2.zone_bicicleta_fc_max);
  if (!full(run) && !full(bike) && hasThr) {
    if (r2.ergometru === "bicicleta") bike = fromThresholds;
    else run = fromThresholds;
    note.push("raportul nu are tabel de zone: am pus pragurile (Z2 sus = primul prag, Z4 sus = al doilea prag, Z5 = FC max); completeaz\u0103 Z1 \u0219i Z3 din raport, altfel zonele de FC nu intr\u0103 \xEEn plan (doar FC max \u0219i ritmul de prag)");
  }
  if (r2.ergometru === "banda" && !full(bike)) note.push("testul a fost pe band\u0103: zonele de biciclet\u0103 nu se copiaz\u0103 din alergare (FC pe biciclet\u0103 e mai mic\u0103)");
  if (r2.ergometru === "bicicleta" && !full(run)) note.push("testul a fost pe biciclet\u0103: zonele de alergare nu se copiaz\u0103 din biciclet\u0103");
  if (r2.vo2max_ml_kg_min != null) note.push(`VO2max ${r2.vo2max_ml_kg_min} ml/kg/min`);
  const date = r2.data_testului && /^\d{4}-\d{2}-\d{2}$/.test(r2.data_testului) ? r2.data_testului : null;
  if (!["banda", "bicicleta", "altul"].includes(String(r2.ergometru))) r2.ergometru = null;
  const pace = r2.prag2_ritm_min_km && /^\d{1,2}:\d{2}$/.test(r2.prag2_ritm_min_km) ? r2.prag2_ritm_min_km : null;
  return { reading: r2, form: { tip: r2.tip, data: date, fcmax: r2.fc_max, alergare_z: run, pace_prag: pace, ftp: r2.ftp_w, bicicleta_z: bike }, note };
}
async function readTest(base64, mediaType, userId = null) {
  const block = mediaType === "application/pdf" ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } } : { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } };
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": ENV.modelKey(), "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: ENV.modelSpecialist(),
      max_tokens: 16e3,
      system: SYSTEM,
      messages: [{ role: "user", content: [block, { type: "text", text: "Transcrie raportul \xEEn JSON-ul cerut." }] }],
      output_config: { format: { type: "json_schema", schema: SCHEMA } }
    })
  });
  if (!res.ok) throw new Error(`citirea raportului a e\u0219uat (${res.status}): ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  await recordUsage(userId, "test", ENV.modelSpecialist(), data.usage);
  const text = data.content.filter((b) => b.type === "text").map((b) => b.text ?? "").join("");
  if (data.stop_reason === "max_tokens") throw new Error("raportul e prea lung pentru o singur\u0103 citire; \xEEncarc\u0103 doar paginile cu pragurile \u0219i zonele");
  if (!text) throw new Error("modelul nu a \xEEntors nimic");
  try {
    return toTestForm(JSON.parse(text));
  } catch {
    throw new Error("citirea raportului a ie\u0219it incomplet\u0103; \xEEncearc\u0103 din nou sau \xEEncarc\u0103 o poz\u0103 mai clar\u0103");
  }
}

// server/_lib/labs-extract.ts
var SYSTEM2 = `Transcrii un buletin de analize medicale. Reguli:
- Copiezi exact ce scrie: numele analizei, valoarea, unitatea, intervalul de referin\u021B\u0103 al laboratorului. Nu calculezi, nu converte\u0219ti, nu interpretezi, nu completezi din memorie.
- valoare = num\u0103rul rezultatului (punct zecimal); dac\u0103 rezultatul nu e num\u0103r (ex. "negativ", "<0,5"), valoare = null \u0219i pui textul \xEEn valoare_text.
- ref_min / ref_max = capetele intervalului de referin\u021B\u0103 de pe buletin; ce nu exist\u0103 e null; textul intervalului \xEEl copiezi \xEEn ref_text.
- cod: "feritina", "vitamina_d" (25-OH vitamina D), "hemoglobina", "ck" (creatinkinaza / CK / CPK total), "crp" (proteina C reactiv\u0103, inclusiv hs-CRP); orice altceva = "altul".
- data_recoltarii \xEEn format YYYY-MM-DD dac\u0103 apare; altfel null. laborator = numele laboratorului, dac\u0103 apare.
- lizibil = false dac\u0103 documentul nu e un buletin de analize sau nu se poate citi.`;
var SCHEMA2 = {
  type: "object",
  additionalProperties: false,
  required: ["lizibil", "data_recoltarii", "laborator", "valori"],
  properties: {
    lizibil: { type: "boolean" },
    data_recoltarii: { type: ["string", "null"] },
    laborator: { type: ["string", "null"] },
    valori: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["nume", "cod", "valoare", "valoare_text", "unitate", "ref_min", "ref_max", "ref_text"],
        properties: {
          nume: { type: "string" },
          cod: { type: "string", enum: ["feritina", "vitamina_d", "hemoglobina", "ck", "crp", "altul"] },
          valoare: { type: ["number", "null"] },
          valoare_text: { type: ["string", "null"] },
          unitate: { type: ["string", "null"] },
          ref_min: { type: ["number", "null"] },
          ref_max: { type: ["number", "null"] },
          ref_text: { type: ["string", "null"] }
        }
      }
    }
  }
};
var norm = (u) => (u ?? "").toLowerCase().replace(/\s+/g, "").replace("\u03BC", "\xB5").replace("ug", "\xB5g");
function toAppUnits(code, value, unit) {
  if (value == null) return { value: null, note: null };
  const u = norm(unit);
  const r2 = (v) => Math.round(v * 100) / 100;
  switch (code) {
    case "feritina":
      if (["\xB5g/l", "ng/ml"].includes(u)) return { value: r2(value), note: null };
      break;
    case "vitamina_d":
      if (u === "ng/ml" || u === "\xB5g/l") return { value: r2(value), note: null };
      if (u === "nmol/l") return { value: r2(value / 2.496), note: `vitamina D convertit\u0103 din ${value} nmol/L` };
      break;
    case "hemoglobina":
      if (u === "g/dl") return { value: r2(value), note: null };
      if (u === "g/l") return { value: r2(value / 10), note: `hemoglobina convertit\u0103 din ${value} g/L` };
      if (u === "mmol/l") return { value: r2(value * 1.611), note: `hemoglobina convertit\u0103 din ${value} mmol/L` };
      break;
    case "ck":
      if (["u/l", "ui/l", "iu/l"].includes(u)) return { value: r2(value), note: null };
      break;
    case "crp":
      if (u === "mg/l") return { value: r2(value), note: null };
      if (u === "mg/dl") return { value: r2(value * 10), note: `CRP convertit din ${value} mg/dL` };
      break;
    default:
      return { value: null, note: null };
  }
  return { value: null, note: `${code}: unitate necunoscut\u0103 \u201E${unit ?? "\u2013"}\u201D, introdu valoarea de m\xE2n\u0103` };
}
function finalize(raw) {
  const valori = raw.valori.map((v) => ({
    ...v,
    in_afara: v.valoare == null ? null : v.ref_min != null && v.valoare < v.ref_min ? "sub" : v.ref_max != null && v.valoare > v.ref_max ? "peste" : null
  }));
  const cele5 = { feritina: null, vitamina_d: null, hemoglobina: null, ck: null, crp: null };
  const note = [];
  for (const code of ["feritina", "vitamina_d", "hemoglobina", "ck", "crp"]) {
    const v = valori.find((x) => x.cod === code && x.valoare != null);
    if (!v) continue;
    const c = toAppUnits(code, v.valoare, v.unitate);
    cele5[code] = c.value;
    if (c.note) note.push(c.note);
  }
  const date = raw.data_recoltarii && /^\d{4}-\d{2}-\d{2}$/.test(raw.data_recoltarii) ? raw.data_recoltarii : null;
  return { lizibil: raw.lizibil, data_recoltarii: date, laborator: raw.laborator, valori, cele5, note };
}
async function readLabs(base64, mediaType, userId = null) {
  const block = mediaType === "application/pdf" ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } } : { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } };
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": ENV.modelKey(), "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: ENV.modelSpecialist(),
      max_tokens: 16e3,
      system: SYSTEM2,
      messages: [{ role: "user", content: [block, { type: "text", text: "Transcrie buletinul \xEEn JSON-ul cerut." }] }],
      output_config: { format: { type: "json_schema", schema: SCHEMA2 } }
    })
  });
  if (!res.ok) throw new Error(`citirea analizelor a e\u0219uat (${res.status}): ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  await recordUsage(userId, "analize", ENV.modelSpecialist(), data.usage);
  const text = data.content.filter((b) => b.type === "text").map((b) => b.text ?? "").join("");
  if (data.stop_reason === "max_tokens") throw new Error("buletinul e prea lung pentru o singur\u0103 citire; \xEEncarc\u0103-l pe pagini (poze separate)");
  if (!text) throw new Error("modelul nu a \xEEntors nimic");
  try {
    return finalize(JSON.parse(text));
  } catch {
    throw new Error("citirea buletinului a ie\u0219it incomplet\u0103; \xEEncearc\u0103 din nou sau \xEEncarc\u0103 o poz\u0103 mai clar\u0103");
  }
}

// server/webhooks/apple.ts
import { randomBytes } from "node:crypto";

// server/_lib/apple.ts
var day = (s) => typeof s === "string" ? s.slice(0, 10) : null;
var hm2 = (s) => typeof s === "string" && s.length >= 16 ? s.slice(11, 16) : null;
var num = (v) => typeof v === "number" && Number.isFinite(v) ? v : null;
function parseHealthExport(body) {
  const metrics = body?.data?.metrics ?? [];
  const out = /* @__PURE__ */ new Map();
  const get = (d) => {
    let r2 = out.get(d);
    if (!r2) out.set(d, r2 = { date: d, hrv: null, rhr: null, sleep_min: null, bedtime: null, wake_time: null });
    return r2;
  };
  for (const m of metrics) {
    if (m.name === "heart_rate_variability" || m.name === "heart_rate_variability_sdnn") {
      const byDay = /* @__PURE__ */ new Map();
      for (const p of m.data) {
        const d = day(p.date);
        const q2 = num(p.qty);
        if (d && q2 != null) byDay.set(d, [...byDay.get(d) ?? [], q2]);
      }
      for (const [d, v] of byDay) get(d).hrv = Math.round(v.reduce((a, b) => a + b, 0) / v.length * 10) / 10;
    } else if (m.name === "resting_heart_rate") {
      for (const p of m.data) {
        const d = day(p.date);
        const q2 = num(p.qty);
        if (d && q2 != null) get(d).rhr = Math.round(q2);
      }
    } else if (m.name === "respiratory_rate" || m.name === "body_mass" || m.name === "body_fat_percentage") {
      const byDay = /* @__PURE__ */ new Map();
      for (const p of m.data) {
        const d = day(p.date);
        const q2 = num(p.qty);
        if (d && q2 != null) byDay.set(d, [...byDay.get(d) ?? [], q2]);
      }
      for (const [d, v] of byDay) {
        const r2 = get(d);
        if (m.name === "respiratory_rate") r2.respiratory_rate = Math.round(v.reduce((a, b) => a + b, 0) / v.length * 10) / 10;
        else if (m.name === "body_mass") r2.weight_kg = Math.round((String(m.units ?? "kg").toLowerCase().startsWith("lb") ? v[v.length - 1] * 0.4536 : v[v.length - 1]) * 10) / 10;
        else r2.body_fat_pct = Math.round((v[v.length - 1] <= 1 ? v[v.length - 1] * 100 : v[v.length - 1]) * 10) / 10;
      }
    } else if (m.name === "sleep_analysis") {
      for (const p of m.data) {
        const d = day(p.sleepEnd ?? p.inBedEnd ?? p.date);
        const hours = num(p.totalSleep) ?? num(p.asleep);
        if (!d || hours == null) continue;
        const r2 = get(d);
        r2.sleep_min = Math.round(hours * 60);
        r2.bedtime = hm2(p.sleepStart ?? p.inBedStart);
        r2.wake_time = hm2(p.sleepEnd ?? p.inBedEnd);
      }
    }
  }
  return [...out.values()];
}
function sportOf(name) {
  const n2 = name.toLowerCase();
  if (/swim|înot|inot/.test(n2)) return "inot";
  if (/cycl|bike|biking|ciclism|bicicl/.test(n2)) return "bicicleta";
  if (/run|alerg/.test(n2)) return "alergare";
  if (/strength|weight|forță|forta|functional|core|hiit|cross/.test(n2)) return "forta";
  return null;
}
var qty = (v) => v && typeof v === "object" ? num(v.qty) : num(v);
function km(v) {
  if (!v || typeof v !== "object") return num(v);
  const q2 = num(v.qty);
  const u = String(v.units ?? "km").toLowerCase();
  if (q2 == null) return null;
  if (u === "km") return q2;
  if (u === "mi") return q2 * 1.609344;
  if (u === "m") return q2 / 1e3;
  if (u === "yd") return q2 * 9144e-7;
  return null;
}
function parseHealthWorkouts(body) {
  const list = body?.data?.workouts ?? [];
  const out = [];
  for (const w of list) {
    const name = String(w.name ?? "");
    const sport = sportOf(name);
    const start = typeof w.start === "string" ? w.start : null;
    if (!sport || !start) continue;
    let sec = num(w.duration);
    if (sec == null && typeof w.end === "string") sec = (Date.parse(w.end.replace(" ", "T").replace(" ", "")) - Date.parse(start.replace(" ", "T").replace(" ", ""))) / 1e3;
    if (sec == null || !Number.isFinite(sec) || sec < 60) continue;
    const minutes = Math.round(sec / 60);
    const dist = km(w.distance);
    const hr = w.heartRate ?? {};
    const avg = qty(w.avgHeartRate) ?? qty(hr.avg);
    const max = qty(w.maxHeartRate) ?? qty(hr.max);
    const r12 = (x) => x == null ? null : Math.round(x * 100) / 100;
    out.push({
      id: `apple-${typeof w.id === "string" ? w.id : `${start}-${name}`.replace(/[^a-zA-Z0-9]/g, "")}`,
      date: start.slice(0, 10),
      start_local: hm2(start),
      sport,
      minutes,
      distance_km: dist == null || dist <= 0 ? null : r12(dist),
      avg_hr: avg == null ? null : Math.round(avg),
      max_hr: max == null ? null : Math.round(max),
      avg_pace_min_km: sport === "alergare" && dist && dist > 0.2 ? r12(sec / 60 / dist) : null,
      name,
      details: appleDetails(w, sport, sec, dist)
    });
  }
  return out;
}
function parseHealthOther(body) {
  const list = body?.data?.workouts ?? [];
  const out = [];
  for (const w of list) {
    const name = String(w.name ?? "");
    const start = typeof w.start === "string" ? w.start : null;
    if (!start || sportOf(name)) continue;
    const c = classifyOther(name);
    if (!c) continue;
    const sec = num(w.duration);
    if (sec == null || sec < 300) continue;
    const hr = w.heartRate ?? {};
    const avg = qty(w.avgHeartRate) ?? qty(hr.avg);
    const max = qty(w.maxHeartRate) ?? qty(hr.max);
    const id = typeof w.id === "string" ? w.id : `${start}-${name}`.replace(/[^a-zA-Z0-9]/g, "");
    out.push({ id: `apple-o-${id}`, source: "apple", externalId: id, date: start.slice(0, 10), startLocal: hm2(start), kind: c.kind, name: c.name, minutes: Math.round(sec / 60), avgHr: avg == null ? null : Math.round(avg), maxHr: max == null ? null : Math.round(max) });
  }
  return out;
}
function appleDetails(w, sport, sec, dist) {
  const total = (v) => {
    if (Array.isArray(v)) {
      const xs = v.map((x) => qty(x)).filter((x) => x != null);
      return xs.length ? xs.reduce((a, b) => a + b, 0) : null;
    }
    return qty(v);
  };
  const kcalRaw = total(w.activeEnergyBurned ?? w.activeEnergy);
  const unit = String((w.activeEnergyBurned ?? w.activeEnergy)?.units ?? "kcal").toLowerCase();
  const kcal = kcalRaw == null ? null : Math.round(unit === "kj" ? kcalRaw / 4.184 : kcalRaw);
  const elev = qty(w.elevationUp);
  const elevUnit = String(w.elevationUp?.units ?? "m").toLowerCase();
  const d = {
    movingMin: Math.round(sec / 60),
    kcal: kcal && kcal > 0 ? kcal : null,
    elevGainM: elev != null && elev > 0 ? Math.round(elevUnit === "ft" ? elev * 0.3048 : elev) : null,
    avgSpeedKmh: dist && dist > 0.2 ? Math.round(dist / (sec / 3600) * 10) / 10 : null
  };
  if (sport === "alergare" && dist && dist > 0.2) {
    const steps = total(w.stepCount);
    const spm = steps && steps > 0 ? steps / (sec / 60) : qty(w.stepCadence);
    if (spm && spm > 0) {
      d.cadence = Math.round(spm);
      Object.assign(d, stepsFromCadence(spm, sec / 60 / dist));
    }
  }
  if (sport === "inot" && dist && dist >= 0.05) d.pace100mSec = Math.round(sec / (dist * 10));
  return d;
}

// server/webhooks/apple.ts
async function handler7(req, res) {
  let userId = null;
  try {
    if (req.method !== "POST") throw new HttpError(405, "POST");
    const token = q(req, "t");
    if (!token || token.length < 20) throw new HttpError(401, "lipse\u0219te tokenul");
    const user = await one("users", { apple_token: `eq.${token}` });
    if (!user) throw new HttpError(401, "token necunoscut");
    userId = user.id;
    const body = await readJson(req);
    const days = parseHealthExport(body);
    const workouts = [...new Map(parseHealthWorkouts(body).map((w) => [w.id, w])).values()];
    await saveOthers(user.id, parseHealthOther(body));
    if (days.length) {
      await upsert(
        "wellness_daily",
        days.map((d) => ({ user_id: user.id, date: d.date, source: "apple", hrv: d.hrv, rhr: d.rhr, sleep_min: d.sleep_min, bedtime: d.bedtime, wake_time: d.wake_time, respiratory_rate: d.respiratory_rate ?? null, weight_kg: d.weight_kg ?? null, body_fat_pct: d.body_fat_pct ?? null, synced_at: (/* @__PURE__ */ new Date()).toISOString() })),
        "user_id,date,source"
      );
    }
    if (workouts.length) {
      await upsert(
        "activities",
        workouts.map((w) => ({
          id: w.id,
          user_id: user.id,
          source: "apple",
          external_id: w.id.slice(6),
          date: w.date,
          start_local: w.start_local,
          sport: w.sport,
          minutes: w.minutes,
          distance_km: w.distance_km,
          avg_hr: w.avg_hr,
          max_hr: w.max_hr,
          avg_pace_min_km: w.avg_pace_min_km,
          name: w.name,
          raw: w.details,
          synced_at: (/* @__PURE__ */ new Date()).toISOString()
        })),
        "id"
      );
    }
    await insert("sync_log", { user_id: user.id, provider: "apple", ok: true, rows: days.length + workouts.length, detail: `${days.length} zile, ${workouts.length} antrenamente` }).catch(() => void 0);
    json(res, 200, { ok: true, zile: days.length, antrenamente: workouts.length });
  } catch (e) {
    if (userId) await insert("sync_log", { user_id: userId, provider: "apple", ok: false, rows: 0, detail: (e instanceof Error ? e.message : String(e)).slice(0, 300) }).catch(() => void 0);
    fail(res, e);
  }
}
function newAppleToken() {
  return randomBytes(24).toString("base64url");
}

// src/strength/ppl.ts
var H = (r2 = "5-9") => ({ kind: "heavy", reps: r2 });
var L = (r2 = "10-15") => ({ kind: "lowered", reps: r2 });
var RP = (r2 = "12-15") => ({ kind: "restpause", reps: r2 });
var F = (r2) => ({ kind: "fix", reps: r2 });
var MAX = { kind: "max", reps: "max" };
var ABS = { group: "Abdomen", name: "\xCEndoirea genunchilor din at\xE2rnat / abdomene clasice", sets: [F("4-6 serii")], note: "focus pe contrac\u021Bie" };
var PPL = [
  {
    id: "push1",
    name: "Push 1",
    exercises: [
      { group: "Piept", name: "\xCEmpins din \xEEnclinat cu gantere", sets: [H(), L()] },
      { group: "Piept", name: "\xCEmpins din orizontal la aparat", sets: [H(), L()] },
      { group: "Umeri", name: "Pres\u0103 militar\u0103 umeri", sets: [H(), L()] },
      { group: "Umeri", name: "Ramat cu bara vertical", sets: [H(), L(), RP()] },
      { group: "Piept", name: "Flutur\u0103ri la cabluri din \xEEnclinat", sets: [H(), L()] },
      { group: "Umeri", name: "Flutur\u0103ri laterale cu gantere", sets: [H(), L()] },
      { group: "Piept", name: "Flot\u0103ri la paralele (dips), cu greutatea corpului", sets: [MAX, MAX] },
      { group: "Triceps", name: "Extensia tricepsului la aparat", sets: [H(), L()] },
      { group: "Triceps", name: "Extensie cu gantera deasupra capului", sets: [H(), L()] },
      ABS
    ]
  },
  {
    id: "pull1",
    name: "Pull 1",
    exercises: [
      { group: "Spate", name: "Ramat la aparat de sus", sets: [H(), L(), RP()] },
      { group: "Spate", name: "Ramat cu sprijin pe piept la aparat", sets: [H(), L()] },
      { group: "Spate", name: "Ramat din aplecat cu bara", sets: [H(), L()] },
      { group: "Spate", name: "Trac\u021Biuni (priz\u0103 supina\u021Bie)", sets: [MAX, MAX] },
      { group: "Spate", name: "Pullover la scripete", sets: [F("8-12"), F("8-12"), F("8-12")] },
      { group: "Deltoid posterior", name: "Flutur\u0103ri \xEEnapoi la aparat", sets: [H(), L()] },
      { group: "Biceps", name: "Flexii cu bara Z", sets: [H("8-12"), L()] },
      { group: "Biceps", name: "Flexii la aparat", sets: [RP("10-15")] },
      { group: "Trapez", name: "Ridic\u0103ri de umeri", sets: [H(), L()] }
    ]
  },
  {
    id: "legs",
    name: "Picioare",
    exercises: [
      { group: "Cvadriceps", name: "Pres\u0103", sets: [F("8-12"), F("8-12"), F("8-12")] },
      { group: "Cvadriceps", name: "Genuflexiuni hack (hack squat)", sets: [F("8-12"), L()] },
      { group: "Cvadriceps", name: "Extensii", sets: [H(), L(), RP()] },
      { group: "Femural", name: "RDL (\xEEndrept\u0103ri)", sets: [H(), L()] },
      { group: "Femural", name: "Flexii din \u0219ezut la aparat", sets: [H(), L()] },
      { group: "Femural", name: "Flexii unilaterale la aparat (din picioare)", sets: [F("8-12"), F("8-12"), RP()] },
      { group: "Adductor", name: "Adductor la aparat", sets: [H(), L()] },
      { group: "Abductor", name: "Abductor la aparat", sets: [H(), L()] },
      { group: "Gambe", name: "Ridic\u0103ri pe v\xE2rfuri din picioare la aparat", sets: [H("8-12"), L("15-18"), RP("15-20")] }
    ]
  },
  {
    id: "push2",
    name: "Push 2",
    exercises: [
      { group: "Piept", name: "\xCEmpins la pres\u0103 din \xEEnclinat la aparat", sets: [H(), L()] },
      { group: "Piept", name: "\xCEmpins din orizontal la aparat", sets: [H(), L(), RP()] },
      { group: "Piept", name: "\xCEmpins din declinat cu gantere", sets: [H(), L()] },
      { group: "Piept", name: "Flutur\u0103ri la cabluri", sets: [H(), L()] },
      { group: "Piept", name: "Flutur\u0103ri la aparat (peck deck)", sets: [RP()] },
      { group: "Umeri", name: "\xCEmpins pentru umeri la aparat", sets: [H(), L()] },
      { group: "Umeri", name: "Extensii laterale la aparat", sets: [H(), L()] },
      { group: "Triceps", name: "Extensii triceps la cabluri \xEEncruci\u0219ate", sets: [F("10-15"), F("10-15")] },
      { group: "Triceps", name: "Extensii triceps la cabluri sau gantere din aplecat", sets: [H(), L()] }
    ]
  },
  {
    id: "arms",
    name: "Bra\u021Be",
    exercises: [
      { group: "Triceps", name: "\xCEmpins din orizontal cu bara (priz\u0103 \xEEngust\u0103)", sets: [F("8-12"), F("8-12"), F("8-12")] },
      { group: "Triceps", name: "Extensii deasupra capului cu gantera, cu ambele m\xE2ini", sets: [F("8-12"), F("8-12"), F("8-12")] },
      { group: "Triceps", name: "Extensii la cablu pe fiecare m\xE2n\u0103 (priz\u0103 invers\u0103)", sets: [F("8-12"), F("8-12"), F("8-12")] },
      { group: "Biceps", name: "Flexii la aparat", sets: [F("8-12"), F("8-12"), F("8-12")] },
      { group: "Biceps", name: "Flexii la cablu (ciocan)", sets: [F("8-12"), F("8-12"), F("8-12")] },
      { group: "Biceps", name: "Flexii concentrate cu gantera", sets: [F("8-12"), F("8-12"), F("8-12")] },
      ABS
    ]
  },
  {
    id: "pull2",
    name: "Pull 2",
    exercises: [
      { group: "Spate", name: "Trac\u021Biuni la helcometru (priz\u0103 supina\u021Bie)", sets: [H(), L(), RP()] },
      { group: "Spate", name: "Trac\u021Biuni la helcometru (priz\u0103 larg\u0103)", sets: [H(), L()] },
      { group: "Spate", name: "Ramat T cu bara", sets: [H(), L()] },
      { group: "Spate", name: "Ramat la cablu", sets: [H(), L()] },
      { group: "Deltoid posterior", name: "Flutur\u0103ri laterale din aplecat", sets: [H("8-12"), L("8-12")] },
      { group: "Lombar", name: "Hiperextensii", sets: [MAX, MAX, MAX] },
      { group: "Trapez", name: "Ridic\u0103ri de umeri", sets: [H(), L()] },
      ABS
    ]
  }
];
function rotation(sessionsPerWeek) {
  return sessionsPerWeek >= 3 ? ["push1", "pull1", "legs", "push2", "arms", "pull2"] : ["push1", "pull1", "legs", "push2", "pull2"];
}
function doseFor(phase) {
  return phase === "evaluare" ? "invatare" : phase === "build" ? "anduranta" : phase === "peak" || phase === "taper" ? "mentinere" : "complet";
}
var DOSE_TEXT = {
  invatare: "\xEEnv\u0103\u021Bare: f\u0103r\u0103 rest-pause, opre\u0219te-te cu 1\u20132 repet\u0103ri \xEEnainte de cedare; prioritate execu\u021Bia",
  complet: "programul complet, cum e scris",
  anduranta: "f\u0103r\u0103 rest-pause la picioare: oboseala ar strica alergarea \u0219i bicicleta din zilele urm\u0103toare",
  mentinere: "men\u021Binere: doar setul greu, f\u0103r\u0103 set redus \u0219i f\u0103r\u0103 rest-pause"
};
function dayById(id) {
  return PPL.find((d) => d.id === id);
}

// src/calendar/budget.ts
var MIN_BLOCK_MIN = 45;
var REALITY_FACTOR = 0.8;
function weeklyBudget(blocks, realityFactor = REALITY_FACTOR) {
  const usable = blocks.filter((b) => b.endMin > b.startMin && b.endMin - b.startMin >= MIN_BLOCK_MIN).sort((a, b) => a.day - b.day || a.startMin - b.startMin);
  const minutes = usable.reduce((s, b) => s + (b.endMin - b.startMin), 0);
  return { hours: Math.round(minutes / 60 * realityFactor * 10) / 10, blocks: usable };
}

// src/calendar/generate.ts
var RECOVERY_FACTOR = 0.65;
var CHANGE_MIN2 = 10;
var MIN_SESSION_MIN = { inot: 30, alergare: 30, bicicleta: 40, forta: 30 };
function generatePlan(input) {
  const budget = weeklyBudget(input.freeBlocks);
  const age = input.athlete?.age ?? null;
  const weeks = phaseWeeks(input.startDate, input.raceDate, age != null && age >= 40 ? 3 : 4);
  const hours = PHASE_HOURS[input.goal];
  const phasesUsed = [...new Set(weeks.map((w) => w.phase))];
  const minimumHours = Math.max(...phasesUsed.map((p) => hours[p].min));
  if (budget.hours < minimumHours) {
    const missing = Math.round((minimumHours - budget.hours) * 10) / 10;
    return {
      ok: false,
      reason: `Ai ${budget.hours} ore pe s\u0103pt\u0103m\xE2n\u0103 disponibile; pentru ${input.goal} ai nevoie de cel pu\u021Bin ${minimumHours} \xEEn ${phasesUsed.includes("build") ? "build" : "faza cea mai \xEEnc\u0103rcat\u0103"}.`,
      budgetHours: budget.hours,
      minimumHours,
      options: [
        `eliberezi ${missing} ore pe s\u0103pt\u0103m\xE2n\u0103 (blocuri de minimum 45 de minute)`,
        input.goal === "70.3" ? "schimbi cursa cu una olimpic\u0103" : input.goal === "maraton" ? "alegi un semimaraton" : "schimbi cursa cu una mai scurt\u0103",
        "mu\u021Bi data cursei"
      ]
    };
  }
  const history = input.historyHoursPerWeek.filter((h) => h > 0);
  const avgHistory = history.length ? history.reduce((a, b) => a + b, 0) / history.length : 0;
  const firstPhase = weeks[0].phase;
  let prevLoaded = Math.max(avgHistory, 0.6 * hours[firstPhase].target);
  const runGoal = isRunGoal(input.goal);
  const startLong = runGoal ? input.run?.canDoDistance ? input.goal === "maraton" ? 100 : 80 : (input.run?.longestRunKm ?? 0) >= 12 ? 70 : 50 : 60;
  const lvl = input.level ?? {};
  const triRide = lvl.longestRideH ? Math.min(120, Math.max(60, Math.round(lvl.longestRideH * 60 * 0.8 / 5) * 5)) : 60;
  const triRun = lvl.longestRunKm ? Math.min(75, Math.max(40, Math.round(lvl.longestRunKm * ((lvl.easyPaceSecKm ?? 420) / 60) * 0.8 / 5) * 5)) : 45;
  const prog = { longRide: runGoal ? 90 : triRide, longRun: runGoal ? startLong : triRun, brickRun: 15 };
  const out = [];
  for (const pw of weeks) {
    const ph = hours[pw.phase];
    let target;
    if (pw.recovery) {
      target = round12(prevLoaded * RECOVERY_FACTOR);
    } else {
      target = Math.min(ph.target, Math.max(prevLoaded * 1.1, 0.6 * ph.target));
      target = round12(Math.min(target, budget.hours));
      prevLoaded = target;
    }
    if (runGoal) advanceRunProgression(prog, pw, input.goal);
    else advanceProgression(prog, pw);
    const sessions = runGoal ? runWeekTemplate(pw, input, prog) : weekTemplate(pw, input, prog);
    const minCount = runGoal ? { alergare: 3, forta: 1 } : { inot: 2, bicicleta: 2, alergare: 2, forta: 1 };
    const fitted = fitToHours(sessions, target, pw.recovery, minCount);
    const placed = place(fitted.sessions, budget.blocks, pw.weekStart, pw.phase, minCount);
    const plannedHours = round12(placed.workouts.reduce((s, w) => s + w.plannedMinutes, 0) / 60);
    out.push({
      weekStart: pw.weekStart,
      phase: pw.phase,
      recovery: pw.recovery,
      targetHours: target,
      plannedHours,
      workouts: placed.workouts,
      notes: [...fitted.notes, ...placed.notes]
    });
  }
  assignStrengthDays(out);
  return { ok: true, weeks: out, budgetHours: budget.hours };
}
function strengthMinutes(p) {
  return p === "taper" ? 35 : p === "peak" ? 40 : p === "build" ? 50 : 55;
}
function assignStrengthDays(weeks) {
  const all = weeks.flatMap((w) => w.workouts.map((x) => ({ x, phase: w.phase })));
  const keyDates = new Set(all.filter((o) => o.x.key).map((o) => o.x.date));
  const strength = all.filter((o) => o.x.type === "forta").sort((a, b) => a.x.date < b.x.date ? -1 : 1);
  const perWeek = Math.max(...weeks.map((w) => w.workouts.filter((x) => x.type === "forta").length), 0);
  const rot = rotation(perWeek);
  let i = 0;
  let deferredLegs = false;
  for (const o of strength) {
    const legsBlocked = keyDates.has(addDays(o.x.date, 1)) || o.phase === "taper";
    let id;
    if (deferredLegs && !legsBlocked) {
      id = "legs";
      deferredLegs = false;
    } else {
      id = rot[i++ % rot.length];
      if (id === "legs" && legsBlocked) {
        if (o.phase !== "taper") deferredLegs = true;
        id = rot[i++ % rot.length];
      }
    }
    const day2 = dayById(id);
    const dose = doseFor(o.phase);
    o.x.structure = `${day2.name} \xB7 ${DOSE_TEXT[dose]}`;
  }
}
function advanceProgression(prog, pw) {
  if (pw.recovery) return;
  const caps = {
    evaluare: { ride: 90, run: 60, brick: 0 },
    baza1: { ride: 150, run: 90, brick: 0 },
    baza2: { ride: 180, run: 100, brick: 20 },
    build: { ride: 210, run: 105, brick: 40 },
    peak: { ride: 180, run: 100, brick: 30 },
    taper: { ride: 90, run: 60, brick: 15 }
  };
  const cap = caps[pw.phase];
  if (pw.weekInPhase > 0 && pw.weekInPhase % 2 === 0) prog.longRide = Math.min(cap.ride, prog.longRide + 15);
  if (pw.weekInPhase > 0) prog.longRun = Math.min(cap.run, prog.longRun + (pw.phase === "baza1" ? 10 : pw.weekInPhase % 2 === 0 ? 10 : 0));
  if (pw.phase === "baza2" || pw.phase === "build") prog.brickRun = Math.min(cap.brick, Math.max(prog.brickRun, 15) + (pw.weekInPhase % 2 === 0 ? 5 : 0));
  if (pw.phase === "peak") prog.brickRun = 30;
  if (pw.phase === "taper") {
    prog.longRide = 90;
    prog.longRun = 60;
    prog.brickRun = 15;
  }
  prog.longRide = Math.min(prog.longRide, cap.ride);
  prog.longRun = Math.min(prog.longRun, cap.run);
}
function advanceRunProgression(prog, pw, goal) {
  if (pw.recovery) return;
  const caps = {
    semimaraton: { evaluare: 70, baza1: 85, baza2: 100, build: 115, peak: 120, taper: 60 },
    maraton: { evaluare: 90, baza1: 120, baza2: 150, build: 175, peak: 180, taper: 75 }
  };
  const cap = caps[goal][pw.phase];
  if (pw.phase === "taper") {
    prog.longRun = cap;
    return;
  }
  if (pw.weekInPhase > 0) prog.longRun += 10;
  prog.longRun = Math.min(prog.longRun, cap);
}
function fmtPace3(sec) {
  return `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, "0")}/km`;
}
function runWeekTemplate(pw, input, prog) {
  const p = pw.phase;
  const s = [];
  const pace = input.run?.goalPaceSecKm ?? null;
  const race = input.goal === "maraton" ? "maraton" : "semimaraton";
  const quality = qualitySession(input.intensityAllowed, p, input.athlete?.age ?? null);
  const early = p === "evaluare" || p === "baza1";
  s.push({ sport: "alergare", type: "z2", minutes: early ? 40 : p === "taper" ? 30 : 50, zones: [2], key: false, priority: 6 });
  s.push({ sport: "alergare", type: "z2", minutes: early ? 35 : p === "taper" ? 25 : 45, zones: [1, 2], key: false, priority: 7, structure: "u\u0219or + 4\u20136 acceler\u0103ri de 20 s" });
  const q2 = quality(p === "taper" ? 35 : early ? 45 : 60);
  if (q2.type === "calitate" && (p === "build" || p === "peak" || p === "taper") && pace) {
    q2.zones = [3, 4];
    q2.structure = race === "maraton" ? `3 \xD7 15 min la ritm de maraton (${fmtPace3(pace)}), 3 min u\u0219or \xEEntre` : `3 \xD7 12 min la ritm de semimaraton (${fmtPace3(pace)}), 3 min u\u0219or \xEEntre`;
    q2.intervals = { count: 3, minutes: race === "maraton" ? 15 : 12, zone: 4 };
  }
  s.push(q2);
  if (!(p === "taper" && pw.weekInPhase > 0)) {
    const specific = (p === "build" || p === "peak") && pace && input.intensityAllowed !== "Z2";
    s.push({
      sport: "alergare",
      type: "lung",
      minutes: prog.longRun,
      zones: [2],
      key: true,
      priority: 1,
      structure: specific ? `u\u0219or, cu ultimele ${race === "maraton" ? 30 : 20} min la ritm de curs\u0103 (${fmtPace3(pace)})` : "u\u0219or, conversa\u021Bional"
    });
  }
  for (const t of fieldTests(pw, input, ["alergare"])) {
    const easy = s.findIndex((x) => x.sport === "alergare" && x.type === "z2" && !x.key);
    if (easy >= 0) s.splice(easy, 1, t);
  }
  const fortaCount = p === "taper" ? 1 : 2;
  for (let i = 0; i < fortaCount; i++) {
    s.push({ sport: "forta", type: "forta", minutes: strengthMinutes(p), zones: [], key: false, priority: i === 0 ? 4 : 6.5, structure: "for\u021B\u0103 (Push / Pull / Legs)" });
  }
  if (pw.recovery) {
    for (const x of s) {
      x.minutes = Math.round(x.minutes * RECOVERY_FACTOR / 5) * 5;
      x.key = false;
      if (x.type === "calitate") {
        x.type = "z2";
        x.zones = [2];
        x.structure = void 0;
        x.intervals = void 0;
      }
    }
  }
  return s;
}
function weekTemplate(pw, input, prog) {
  const p = pw.phase;
  const s = [];
  const swimMin = input.swimContinuous400 ? p === "baza1" || p === "evaluare" ? 40 : 45 : 30;
  const quality = qualitySession(input.intensityAllowed, p, input.athlete?.age ?? null);
  const swimCount = p === "taper" ? 2 : 3;
  for (let i = 0; i < swimCount; i++) {
    if ((p === "build" || p === "peak") && i === 1 && input.intensityAllowed !== "Z2" && input.swimContinuous400) s.push({ sport: "inot", type: "calitate", minutes: 45, zones: [3, 4], key: false, priority: 5, structure: p === "peak" ? "set CSS la ritm de curs\u0103" : "set CSS" });
    else if (p === "peak" && i === 0) s.push({ sport: "inot", type: "lung", minutes: 60, zones: [2, 3], key: false, priority: 5, structure: "distan\u021Ba de curs\u0103 continuu" });
    else s.push({ sport: "inot", type: "tehnica", minutes: p === "taper" ? 35 : swimMin, zones: [1, 2], key: false, priority: 5, structure: "un element de tehnic\u0103" });
  }
  if (p === "baza2" && input.intensityAllowed !== "Z2") s.push({ sport: "bicicleta", type: "calitate", minutes: 75, zones: [3], key: false, priority: 5.5, structure: "3 \xD7 10 min sweet spot (Z3), 5 min u\u0219or \xEEntre" });
  else if (p === "build" && input.intensityAllowed !== "Z2") s.push({ sport: "bicicleta", type: "calitate", minutes: 75, zones: [4], key: false, priority: 5.5, structure: "2 \xD7 15 min la prag (Z4), 5 min u\u0219or \xEEntre" });
  else if (p === "peak" && input.intensityAllowed !== "Z2") s.push({ sport: "bicicleta", type: "calitate", minutes: 75, zones: [3, 4], key: false, priority: 5.5, structure: "3 \xD7 15 min la ritm de curs\u0103, 5 min u\u0219or \xEEntre" });
  else s.push({ sport: "bicicleta", type: "z2", minutes: p === "baza1" || p === "evaluare" ? 60 : p === "taper" ? 45 : 75, zones: [2], key: false, priority: 5.8 });
  if (p === "evaluare" || p === "baza1") {
    s.push({ sport: "bicicleta", type: "lung", minutes: prog.longRide, zones: [2], key: true, priority: 1 });
  } else if (p === "taper" && pw.weekInPhase > 0) {
    s.push({ sport: "bicicleta", type: "calitate", minutes: 40, zones: [3, 4], key: false, priority: 3, structure: "3 \xD7 5 min la pace de curs\u0103" });
  } else {
    s.push({
      sport: "bicicleta",
      type: "brick",
      minutes: prog.longRide + prog.brickRun,
      zones: [2],
      key: true,
      priority: 1,
      structure: `tur\u0103 ${prog.longRide} min Z2 + alergare ${prog.brickRun} min imediat dup\u0103`
    });
  }
  s.push({ sport: "alergare", type: "z2", minutes: p === "baza1" || p === "evaluare" ? 45 : p === "taper" ? 30 : 50, zones: [2], key: false, priority: 6 });
  s.push(quality(p === "taper" ? 30 : p === "baza1" || p === "evaluare" ? 50 : 55));
  if (!(p === "taper" && pw.weekInPhase > 0)) {
    s.push({ sport: "alergare", type: "lung", minutes: prog.longRun, zones: [2], key: true, priority: 2 });
  }
  for (const t of fieldTests(pw, input, ["inot", "bicicleta", "alergare"])) {
    const easy = s.findIndex((x) => x.sport === t.sport && (x.type === "z2" || x.type === "tehnica") && !x.key);
    if (easy >= 0) s.splice(easy, 1, t);
    else s.push(t);
  }
  const fortaCount = p === "taper" ? 1 : 2;
  for (let i = 0; i < fortaCount; i++) {
    s.push({ sport: "forta", type: "forta", minutes: strengthMinutes(p), zones: [], key: false, priority: i === 0 ? 4 : 6.5, structure: "for\u021B\u0103 (Push / Pull / Legs)" });
  }
  if (pw.recovery) {
    for (const x of s) {
      x.minutes = Math.round(x.minutes * RECOVERY_FACTOR / 5) * 5;
      x.key = false;
      if (x.type === "calitate") {
        x.type = "z2";
        x.zones = [2];
        x.structure = void 0;
        x.intervals = void 0;
      }
    }
  }
  return s;
}
function qualitySession(allowed, phase, age = null) {
  return (minutes) => {
    if (allowed === "Z2") return { sport: "alergare", type: "z2", minutes: Math.round(minutes * 0.9), zones: [2], key: false, priority: 6, structure: "calitatea e blocat\u0103 p\xE2n\u0103 la avizul cardiologic" };
    if (phase === "evaluare") return { sport: "alergare", type: "z2", minutes: Math.round(minutes * 0.9), zones: [2], key: false, priority: 6, structure: "u\u0219or + 6 acceler\u0103ri de 20 s (f\u0103r\u0103 calitate \xEEn evaluare)" };
    const capZ4 = allowed === "pana_la_Z4" || age != null && age >= 55;
    if (phase === "baza1") return { sport: "alergare", type: "calitate", minutes, zones: [3], key: true, priority: 3, structure: "2 \xD7 8 min tempo (Z3), 3 min u\u0219or \xEEntre", intervals: { count: 2, minutes: 8, zone: 3 } };
    if (phase === "baza2" || phase === "taper") return { sport: "alergare", type: "calitate", minutes, zones: [3, 4], key: true, priority: 3, structure: "3 \xD7 10 min tempo (Z3\u2013Z4), 3 min u\u0219or \xEEntre", intervals: { count: 3, minutes: 10, zone: 4 } };
    if (phase === "build" || capZ4) return { sport: "alergare", type: "calitate", minutes, zones: [4], key: true, priority: 3, structure: "4\u20135 \xD7 6 min la prag (Z4), 2 min u\u0219or \xEEntre", intervals: { count: 5, minutes: 6, zone: 4 } };
    return { sport: "alergare", type: "calitate", minutes, zones: [4, 5], key: true, priority: 3, structure: "5\u20136 \xD7 3 min intervale (Z5), 3 min u\u0219or \xEEntre", intervals: { count: 5, minutes: 3, zone: 5 } };
  };
}
function fieldTests(pw, input, sports) {
  if (pw.recovery || input.intensityAllowed === "Z2") return [];
  const have = input.tests ?? { alergare: false, bicicleta: false, inot: false };
  const out = [];
  const due = (sport, week) => pw.phase === "evaluare" && pw.weekInPhase === week && !have[sport] || (pw.phase === "baza2" || pw.phase === "build") && pw.weekInPhase === 0;
  if (sports.includes("alergare") && due("alergare", 1)) out.push({ sport: "alergare", type: "calitate", minutes: 50, zones: [4, 5], key: true, priority: 2.5, structure: "TEST: 15 min u\u0219or, 30 min c\xE2t de tare po\u021Bi constant (pulsul mediu din ultimele 20 min = prag), 5 min u\u0219or" });
  if (sports.includes("bicicleta") && due("bicicleta", 1)) out.push({ sport: "bicicleta", type: "calitate", minutes: 55, zones: [4, 5], key: true, priority: 2.5, structure: "TEST: 20 min \xEEnc\u0103lzire, 20 min c\xE2t de tare po\u021Bi constant (FTP \u2248 95% din puterea medie; f\u0103r\u0103 putere: pulsul mediu), 10 min u\u0219or" });
  if (sports.includes("inot") && input.swimContinuous400 && due("inot", 2)) out.push({ sport: "inot", type: "calitate", minutes: 40, zones: [4, 5], key: true, priority: 2.5, structure: "TEST CSS: \xEEnc\u0103lzire, 400 m tare, 5 min pauz\u0103, 200 m tare; noteaz\u0103 timpii" });
  return out;
}
function fitToHours(sessions, targetHours, recovery, minCount) {
  const notes = [];
  const targetMin = targetHours * 60;
  let all = sessions.map((x) => ({ ...x }));
  const total = () => all.reduce((n2, x) => n2 + x.minutes, 0);
  const count = (sp) => all.filter((x) => x.sport === sp).length;
  const floorOf = (x) => x.key ? Math.max(MIN_SESSION_MIN[x.sport], x.type === "lung" || x.type === "brick" ? x.sport === "bicicleta" ? 60 : 40 : 30) : MIN_SESSION_MIN[x.sport];
  const shrink = (pred) => {
    const over = total() - targetMin;
    if (over <= 0) return;
    const pool = all.filter(pred);
    const room = pool.reduce((n2, x) => n2 + (x.minutes - floorOf(x)), 0);
    if (room <= 0) return;
    const f = Math.min(1, over / room);
    for (const x of pool) x.minutes = Math.max(floorOf(x), Math.round((x.minutes - (x.minutes - floorOf(x)) * f) / 5) * 5);
  };
  shrink((x) => !x.key);
  while (total() > targetMin * 1.05) {
    const droppable = all.filter((x) => !x.key && count(x.sport) > (minCount[x.sport] ?? 0)).sort((a, b) => b.priority - a.priority);
    const d = droppable[0];
    if (!d) break;
    all = all.filter((x) => x !== d);
    notes.push(`f\u0103r\u0103 ${d.sport} ${d.type} s\u0103pt\u0103m\xE2na asta: nu \xEEncape \xEEn ore`);
  }
  shrink((x) => x.key);
  if (total() > targetMin * 1.05) notes.push("minimul pe sport dep\u0103\u0219e\u0219te pu\u021Bin orele-\u021Bint\u0103: \u0219edin\u021Be scurte, toate sporturile p\u0103strate");
  else if (all.some((x, i) => x.minutes !== sessions.find((y) => y === sessions[i])?.minutes)) notes.push(`\u0219edin\u021Be scurtate ca s\u0103 \xEEncap\u0103 \xEEn ${targetHours} h${recovery ? " (desc\u0103rcare)" : ""}`);
  return { sessions: all, notes };
}
function place(sessions, blocks, weekStart2, phase = "baza1", minCount = {}) {
  const days = Array.from({ length: 7 }, (_, d) => ({
    blocks: blocks.filter((b) => b.day === d).map((b) => b.endMin - b.startMin),
    count: 0,
    hasKey: false,
    hasQuality: false,
    hard: 0,
    hasLongRun: false,
    hasLong: false,
    hasForta: false,
    sports: /* @__PURE__ */ new Set()
  }));
  const workouts = [];
  const notes = [];
  let doubleHardDays = 0;
  const byPrio = [...sessions].sort((a, b) => a.priority - b.priority || b.minutes - a.minutes);
  const taken = {};
  const core = /* @__PURE__ */ new Set();
  for (const x of byPrio) {
    const n3 = taken[x.sport] ?? 0;
    if (x.key || n3 < (minCount[x.sport] ?? 0)) {
      core.add(x);
      taken[x.sport] = n3 + 1;
    }
  }
  const ordered = [...byPrio.filter((x) => core.has(x)), ...byPrio.filter((x) => !core.has(x))];
  let n2 = 0;
  for (const s of ordered) {
    let need = s.minutes + CHANGE_MIN2;
    const findCandidates = () => days.map((st2, d) => ({ st: st2, d })).filter(({ st: st2, d }) => {
      if (st2.count >= 2) return false;
      if (!st2.blocks.some((b) => b >= need)) return false;
      if (s.key && st2.hasKey) return false;
      if (st2.sports.has(s.sport)) return false;
      if (st2.hasLong && s.sport !== "inot") return false;
      if (s.type === "lung" || s.type === "brick") {
        if (st2.hasLong) return false;
      }
      if (s.type === "calitate" && st2.hard >= 1 && !(phase === "peak" && st2.hard === 1 && doubleHardDays < 2)) return false;
      if (s.type === "calitate" && s.sport === "alergare") {
        if (st2.hasForta || st2.hasLong) return false;
        const prev = days[d - 1];
        const next = days[d + 1];
        if (prev && prev.hasLongRun || next && next.hasLongRun) return false;
      }
      if (s.type === "forta") {
        if (st2.hasQuality || st2.hasLong) return false;
        const prev = days[d - 1];
        const next = days[d + 1];
        if (prev && prev.hasForta || next && next.hasForta) return false;
      }
      return true;
    }).sort((a, b) => score(b, s) - score(a, s));
    let candidates = findCandidates();
    if (!candidates.length && !s.key) {
      const biggest = Math.max(0, ...days.flatMap((st2) => st2.blocks));
      const fit = Math.floor((biggest - CHANGE_MIN2) / 5) * 5;
      if (fit >= MIN_SESSION_MIN[s.sport] && fit < s.minutes) {
        need = fit + CHANGE_MIN2;
        candidates = findCandidates();
        if (candidates.length) {
          notes.push(`${s.sport} ${s.type} scurtat la ${fit} min ca s\u0103 \xEEncap\u0103 \xEEn programul t\u0103u`);
          s.minutes = fit;
        }
      }
    }
    const pick = candidates[0];
    if (!pick) {
      notes.push(`nu exist\u0103 bloc pentru ${s.sport} ${s.type} ${s.minutes} min; \u0219edin\u021Ba a c\u0103zut`);
      continue;
    }
    const st = pick.st;
    const idx = st.blocks.map((b, i) => ({ b, i })).filter((x) => x.b >= need).sort((a, b) => a.b - b.b)[0].i;
    st.blocks[idx] = st.blocks[idx] - need;
    st.count += 1;
    st.sports.add(s.sport);
    if (s.key) st.hasKey = true;
    if (s.type === "calitate" && s.sport === "alergare") st.hasQuality = true;
    if (s.type === "calitate") {
      if (st.hard === 1) doubleHardDays += 1;
      st.hard += 1;
    }
    if (s.type === "lung" && s.sport === "alergare") st.hasLongRun = true;
    if (s.type === "lung" || s.type === "brick") st.hasLong = true;
    if (s.type === "forta") st.hasForta = true;
    n2 += 1;
    workouts.push({
      id: `${weekStart2}-${n2}`,
      date: addDays(weekStart2, pick.d),
      sport: s.sport,
      type: s.type,
      plannedMinutes: s.minutes,
      targetZones: s.zones,
      key: s.key,
      step: s.step,
      structure: s.structure,
      intervals: s.intervals,
      status: "planificat"
    });
  }
  workouts.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
  return { workouts, notes };
}
function score(c, s) {
  const biggest = Math.max(...c.st.blocks, 0);
  let v = biggest / 10 - c.st.count * 50;
  const weekend = c.d === 5 || c.d === 6;
  if ((s.type === "lung" || s.type === "brick") && weekend) v += 500;
  if (s.type === "calitate" && !weekend) v += 100;
  if (s.type === "forta" && !weekend) v += 100;
  return v;
}
function round12(n2) {
  return Math.round(n2 * 10) / 10;
}

// server/_lib/plan.ts
async function historyHours(userId, today) {
  const from = addDays(weekStart(today), -56);
  const rows = await select("activities", { user_id: `eq.${userId}`, date: [`gte.${from}`, `lt.${weekStart(today)}`] }, { limit: 500 });
  const weeks = /* @__PURE__ */ new Map();
  for (const r2 of rows) weeks.set(weekStart(r2.date), (weeks.get(weekStart(r2.date)) ?? 0) + r2.minutes);
  return [...weeks.entries()].sort((a, b) => diffDays(b[0], a[0])).map(([, m]) => Math.round(m / 60 * 10) / 10);
}
async function saveIntake(userId, today, intake) {
  await upsert("questionnaires", { user_id: userId, kind: "intrare", for_date: today, activity_id: null, answers: intake }, "user_id,kind,for_date,activity_id");
  await update("users", { id: `eq.${userId}` }, { ...intake.nume ? { name: intake.nume } : {}, goal: intake.obiectiv, race_date: intake.dataCursa, race_name: raceName(intake.obiectiv), ...intake.sex ? { sex: intake.sex } : {}, ...intake.anNastere ? { birth_year: intake.anNastere } : {}, ...intake.inaltime && intake.inaltime >= 120 && intake.inaltime <= 230 ? { height_cm: Math.round(intake.inaltime) } : {} });
  await remove("schedules", { user_id: `eq.${userId}` });
  if (intake.program.length) await insert("schedules", intake.program.map((b) => ({ user_id: userId, day: b.day, start_min: b.startMin, end_min: b.endMin, valid_from: today })));
  const intensity = intake.sanatate.avizCardiolog === "da" ? "toate" : "Z2";
  await upsert("clearances", { user_id: userId, cardiology: intake.sanatate.avizCardiolog === "da", cleared_at: intake.sanatate.avizCardiolog === "da" ? today : null, intensity_allowed: intensity }, "user_id");
  if (intake.consimtamant) {
    await upsert("consents", { user_id: userId, health_data: true, adult: true, not_medical_ack: true, accepted_at: (/* @__PURE__ */ new Date()).toISOString(), withdrawn_at: null }, "user_id");
  }
}
function raceName(goal) {
  return { "70.3": "Ironman 70.3", olimpic: "Triatlon olimpic", sprint: "Triatlon sprint", semimaraton: "Semimaraton", maraton: "Maraton", full: "Ironman" }[goal];
}
async function labsGate(userId) {
  const l = await loadLabs(userId);
  if (!l) return { valid: false, limitIntensity: false, why: null };
  const lowFerritin = l.feritina != null && l.feritina < 30;
  const lowHb = (l.in_afara_intervalului ?? []).some((v) => v.directie === "sub" && /hemoglobin/i.test(v.nume));
  const why = lowFerritin ? `feritina ${l.feritina} \xB5g/L (sub 30)` : lowHb ? "hemoglobina sub intervalul laboratorului" : null;
  return { valid: true, limitIntensity: !!why, why };
}
async function generateAndStore(userId, today, intake) {
  if (intake.obiectiv === "full") {
    return { ok: false, reason: "Ironman complet nu e \xEEn versiunea asta a planului; alege 70.3 pentru acum.", budgetHours: 0 };
  }
  const startDate = addDays(weekStart(today), 7);
  const history = await historyHours(userId, today);
  const labs = await labsGate(userId);
  const result = generatePlan({
    startDate,
    raceDate: intake.dataCursa,
    goal: intake.obiectiv,
    freeBlocks: intake.program,
    historyHoursPerWeek: history,
    intensityAllowed: intake.sanatate.avizCardiolog === "da" && !labs.limitIntensity ? "toate" : "Z2",
    swimContinuous400: intake.inot?.nivel === "continuu_400" || intake.inot?.nivel === "peste_1500",
    athlete: await athleteInfo(userId, today),
    tests: await testsAvailable(userId, intake),
    level: { longestRideH: intake.bicicleta?.ceaMaiLungaOre ?? null, longestRunKm: intake.alergare?.ceaMaiLungaKm ?? null, easyPaceSecKm: parsePace(intake.evaluare?.ritmUsor ?? intake.alergare?.ritmActual ?? null) },
    run: isRunGoal(intake.obiectiv) ? {
      goalPaceSecKm: paceFromResult(intake.alergare?.tinta, RUN_DISTANCE_KM[intake.obiectiv]),
      canDoDistance: intake.alergare?.poateDistanta ?? null,
      longestRunKm: intake.alergare?.ceaMaiLungaKm ?? null
    } : void 0
  });
  if (!result.ok) return { ok: false, reason: result.reason, budgetHours: result.budgetHours, options: result.options };
  await update("plans", { user_id: `eq.${userId}`, active: "eq.true" }, { active: false });
  const prev = await select("plans", { user_id: `eq.${userId}` }, { order: "version.desc", limit: 1 });
  const [plan] = await insert("plans", {
    user_id: userId,
    goal: intake.obiectiv,
    race_date: intake.dataCursa,
    start_date: startDate,
    budget_hours: result.budgetHours,
    version: (prev[0]?.version ?? 0) + 1,
    active: true
  });
  const rows = result.weeks.flatMap((w) => w.workouts.map((x) => toWorkoutRow({ ...x, id: `${plan.id.slice(0, 8)}-${x.id}` }, userId, plan.id)));
  for (let i = 0; i < rows.length; i += 200) await insert("workouts_planned", rows.slice(i, i + 200));
  return {
    ok: true,
    budgetHours: result.budgetHours,
    weeks: result.weeks.length,
    workouts: rows.length,
    withoutLabs: !labs.valid,
    note: labs.limitIntensity ? `Intensitatea r\u0103m\xE2ne la Z1\u2013Z2: ${labs.why}. De discutat cu medicul; planul se reface c\xE2nd urci analize noi.` : void 0
  };
}
async function athleteInfo(userId, today) {
  const u = await select("users", { id: `eq.${userId}` }, { select: "sex,birth_year", limit: 1 }).catch(() => []);
  const r2 = u[0];
  return { age: r2?.birth_year ? Number(today.slice(0, 4)) - r2.birth_year : null, sex: r2?.sex ?? null };
}
async function testsAvailable(userId, intake) {
  const z = await loadZones(userId).catch(() => null);
  return {
    alergare: !!(z?.alergare.fc_z1_z5 || z?.alergare.pace_prag),
    bicicleta: !!(z?.bicicleta.ftp || z?.bicicleta.fc_z1_z5 || intake.evaluare?.ftp),
    inot: !!z?.inot.css
  };
}

// server/forms/[kind].ts
async function handler8(req, res) {
  try {
    if (req.method !== "POST") throw new HttpError(405, "POST");
    const u = await requireUser(req);
    const user = await loadUser(u.id);
    const today = todayIn(user.tz);
    const kind = q(req, "kind");
    const body = await readJson(req);
    if (kind === "intrare") {
      const intake = body;
      if (!intake.consimtamant) throw new HttpError(400, "f\u0103r\u0103 consim\u021B\u0103m\xE2nt nu se salveaz\u0103 date de s\u0103n\u0103tate");
      await saveIntake(u.id, today, intake);
      const plan = await generateAndStore(u.id, today, intake);
      json(res, 200, { ok: true, plan });
      return;
    }
    if (kind === "dimineata") {
      const date = typeof body.date === "string" ? body.date : today;
      await upsert("questionnaires", { user_id: u.id, kind, for_date: date, activity_id: null, answers: body }, "user_id,kind,for_date,activity_id");
      json(res, 200, { ok: true });
      return;
    }
    if (kind === "seara") {
      const date = typeof body.date === "string" ? body.date : today;
      const activityId = typeof body.activityId === "string" ? body.activityId : null;
      await upsert("questionnaires", { user_id: u.id, kind, for_date: date, activity_id: activityId, answers: body }, "user_id,kind,for_date,activity_id");
      const goal = user.goal && user.goal !== "full" ? user.goal : "70.3";
      await rescore(u.id, today, goal);
      let agents = null;
      if (body.tip_neplanificat && body.tip_neplanificat !== "altceva") agents = await runAgents(u.id, today, "dupa_antrenament", true).catch((e) => ({ error: e.message }));
      json(res, 200, { ok: true, agents });
      return;
    }
    if (kind === "saptamanal") {
      const weekStart2 = typeof body.weekStart === "string" ? body.weekStart : today;
      await upsert("questionnaires", { user_id: u.id, kind, for_date: weekStart2, activity_id: null, answers: body }, "user_id,kind,for_date,activity_id");
      json(res, 200, { ok: true });
      return;
    }
    if (kind === "analize") {
      const l = body;
      const vals = { feritina: n(l.feritina), vitamina_d: n(l.vitamina_d), hemoglobina: n(l.hemoglobina), ck: n(l.ck), crp: n(l.crp) };
      if (Object.values(vals).every((v) => v == null) && !l.alte?.length) throw new HttpError(400, "cel pu\u021Bin o valoare");
      const drawn = isDate(l.data) ? l.data : today;
      await remove("labs", { user_id: `eq.${u.id}`, drawn_at: `eq.${drawn}` });
      await insert("labs", { user_id: u.id, drawn_at: drawn, ...vals, other: l.alte?.length ? { laborator: l.laborator ?? null, valori: l.alte } : null });
      const intakeRow = await one("questionnaires", { user_id: `eq.${u.id}`, kind: "eq.intrare" }, { order: "created_at.desc" });
      const plan = intakeRow ? await generateAndStore(u.id, today, intakeRow.answers) : null;
      json(res, 200, { ok: true, plan });
      return;
    }
    if (kind === "teste") {
      const t = body;
      if (!isDate(t.data)) throw new HttpError(400, "data testului");
      const zones = (z) => z && z.every((v) => typeof v === "number" && v > 0) ? z : null;
      await remove("tests", { user_id: `eq.${u.id}`, tested_at: `eq.${t.data}` });
      await insert("tests", { user_id: u.id, kind: t.tip, results: t, tested_at: t.data });
      await upsert(
        "zones",
        {
          user_id: u.id,
          run_hr_zones: zones(t.alergare_z),
          run_threshold_pace_sec_km: paceSec(t.pace_prag),
          bike_ftp_w: n(t.ftp),
          bike_hr_zones: zones(t.bicicleta_z),
          swim_css_sec_100m: n(t.css),
          hr_max_test: n(t.fcmax),
          source: t.tip === "altul" ? "teren" : t.tip,
          tested_at: t.data,
          updated_at: (/* @__PURE__ */ new Date()).toISOString()
        },
        "user_id"
      );
      json(res, 200, { ok: true });
      return;
    }
    if (kind === "corp") {
      const b = body;
      if (n(b.greutate) == null) throw new HttpError(400, "greutatea");
      const date = isDate(b.data) ? b.data : today;
      await upsert("wellness_daily", { user_id: u.id, date, source: "manual", weight_kg: n(b.greutate), body_fat_pct: n(b.grasime_pct) }, "user_id,date,source");
      json(res, 200, { ok: true });
      return;
    }
    if (kind === "analize-citire") {
      const file = typeof body.file === "string" ? body.file : "";
      const mediaType = typeof body.mediaType === "string" ? body.mediaType : "";
      if (!file) throw new HttpError(400, "lipse\u0219te fi\u0219ierul");
      if (!["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(mediaType)) throw new HttpError(400, "doar PDF sau poz\u0103 (JPG, PNG)");
      json(res, 200, { ok: true, citire: await readLabs(file, mediaType, u.id) });
      return;
    }
    if (kind === "teste-citire") {
      const file = typeof body.file === "string" ? body.file : "";
      const mediaType = typeof body.mediaType === "string" ? body.mediaType : "";
      if (!file) throw new HttpError(400, "lipse\u0219te fi\u0219ierul");
      if (!["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(mediaType)) throw new HttpError(400, "doar PDF sau poz\u0103 (JPG, PNG)");
      json(res, 200, { ok: true, citire: await readTest(file, mediaType, u.id) });
      return;
    }
    if (kind === "sugestie") {
      const id = String(body.workoutId ?? "");
      const accept = body.accept === true;
      const row = await one("workouts_planned", { id: `eq.${id}`, user_id: `eq.${u.id}` });
      if (!row?.suggestion) throw new HttpError(404, "nu exist\u0103 sugestie pentru \u0219edin\u021Ba asta");
      const s = row.suggestion;
      if (accept) {
        await update("workouts_planned", { id: `eq.${id}` }, { planned_minutes: s.minutes, target_zones: s.zones, structure: s.structure, intervals: null, note: `varianta u\u0219oar\u0103 aleas\u0103 (\xEEn loc de ${row.planned_minutes} min)`, suggestion: { ...s, accepted: true } });
      } else {
        await update("workouts_planned", { id: `eq.${id}` }, { suggestion: { ...s, accepted: false } });
      }
      json(res, 200, { ok: true });
      return;
    }
    if (kind === "admin-chei") {
      const me = await one("users", { id: `eq.${u.id}` });
      if (me?.role !== "admin") throw new HttpError(403, "doar adminul poate pune cheile");
      const p = String(body.provider ?? "").toUpperCase();
      if (!["WHOOP", "STRAVA", "OURA"].includes(p)) throw new HttpError(400, "produc\u0103tor necunoscut");
      const id = String(body.clientId ?? "").trim();
      const secret = String(body.clientSecret ?? "").trim();
      if (!id || !secret) throw new HttpError(400, "lipse\u0219te Client ID sau Client Secret");
      await saveSettings({ [`${p}_CLIENT_ID`]: id, [`${p}_CLIENT_SECRET`]: secret });
      json(res, 200, { ok: true });
      return;
    }
    if (kind === "aviz") {
      const da = body.aviz === "da";
      await upsert("clearances", { user_id: u.id, cardiology: da, cleared_at: da ? today : null, intensity_allowed: da ? "toate" : "Z2" }, "user_id");
      const intake = await one("questionnaires", { user_id: `eq.${u.id}`, kind: "eq.intrare" }, { order: "created_at.desc" });
      let plan = null;
      if (intake) {
        const answers = { ...intake.answers, sanatate: { ...intake.answers.sanatate ?? {}, avizCardiolog: da ? "da" : "nu" } };
        await update("questionnaires", { id: `eq.${intake.id}` }, { answers });
        plan = await generateAndStore(u.id, today, answers);
      }
      json(res, 200, { ok: true, plan });
      return;
    }
    if (kind === "profil" && ("sex" in body || "anNastere" in body)) {
      const sex = body.sex === "m" || body.sex === "f" ? body.sex : null;
      const year = Number(body.anNastere);
      const maxYear = Number(today.slice(0, 4)) - 18;
      if (!sex) throw new HttpError(400, "alege sexul");
      if (!Number.isInteger(year) || year < 1930 || year > maxYear) throw new HttpError(400, `anul na\u0219terii \xEEntre 1930 \u0219i ${maxYear}`);
      const h = Number(body.inaltime);
      if (body.inaltime != null && body.inaltime !== "" && (!Number.isFinite(h) || h < 120 || h > 230)) throw new HttpError(400, "\xEEn\u0103l\u021Bimea \xEEn cm, \xEEntre 120 \u0219i 230");
      await update("users", { id: `eq.${u.id}` }, { sex, birth_year: year, ...Number.isFinite(h) && h >= 120 && h <= 230 ? { height_cm: Math.round(h) } : {} });
      const intakeRow = await one("questionnaires", { user_id: `eq.${u.id}`, kind: "eq.intrare" }, { order: "created_at.desc" });
      const plan = intakeRow ? await generateAndStore(u.id, today, intakeRow.answers) : null;
      json(res, 200, { ok: true, plan });
      return;
    }
    if (kind === "profil") {
      const city = typeof body.oras === "string" ? body.oras.trim() : "";
      if (!city) {
        await update("users", { id: `eq.${u.id}` }, { city: null, lat: null, lon: null });
        json(res, 200, { ok: true, oras: null });
        return;
      }
      const g = await geocode(city);
      if (!g) throw new HttpError(400, `nu g\u0103sesc ora\u0219ul \u201E${city}\u201D`);
      await update("users", { id: `eq.${u.id}` }, { city: g.name, lat: g.lat, lon: g.lon });
      json(res, 200, { ok: true, oras: g.name });
      return;
    }
    if (kind === "activitate") {
      const id = String(body.activityId ?? "");
      if (!id) throw new HttpError(400, "lipse\u0219te \u0219edin\u021Ba");
      const own = await one("activities", { id: `eq.${id}`, user_id: `eq.${u.id}` });
      if (!own) throw new HttpError(404, "\u0219edin\u021B\u0103 inexistent\u0103");
      if (body.reset) {
        await remove("activity_overrides", { user_id: `eq.${u.id}`, activity_id: `eq.${id}` });
      } else {
        const sport = ["inot", "bicicleta", "alergare", "forta"].includes(String(body.sport)) ? String(body.sport) : null;
        await upsert("activity_overrides", { user_id: u.id, activity_id: id, sport, ignored: body.ignored === true, updated_at: (/* @__PURE__ */ new Date()).toISOString() }, "user_id,activity_id");
      }
      await rescore(u.id, today, user.goal ?? "70.3").catch(() => void 0);
      json(res, 200, { ok: true });
      return;
    }
    if (kind === "apple") {
      const token = newAppleToken();
      await update("users", { id: `eq.${u.id}` }, { apple_token: token });
      json(res, 200, { ok: true, url: `${ENV.appUrl()}/api/webhooks/apple?t=${token}` });
      return;
    }
    throw new HttpError(404, `formular necunoscut: ${kind}`);
  } catch (e) {
    fail(res, e);
  }
}
var n = (v) => typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null;
var isDate = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
function paceSec(p) {
  const m = p ? /^(\d{1,2}):(\d{2})$/.exec(p.trim()) : null;
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

// server/_lib/me.ts
async function buildMe(userId, today) {
  const user = await loadUser(userId);
  const from = addDays(today, -42);
  const [{ workouts }, acts, forms, consent, tokens, scoresRows, barRow, readinessRow, messagesRows, wellnessRows, zonesRow, labsRows, lastSyncRows, planRow] = await Promise.all([
    loadPlan(userId, addDays(today, -28), user.race_date ?? addDays(today, 400)),
    loadActivities(userId, from),
    loadForms(userId, today),
    one("consents", { user_id: `eq.${userId}` }),
    connectedProviders(userId),
    select("scores", { user_id: `eq.${userId}` }, { limit: 400 }),
    one("bar_daily", { user_id: `eq.${userId}` }, { order: "date.desc" }),
    one("readiness_daily", { user_id: `eq.${userId}`, date: `eq.${today}` }),
    select("messages", { user_id: `eq.${userId}` }, { order: "created_at.desc", limit: 20 }),
    select("wellness_daily", { user_id: `eq.${userId}`, date: `gte.${addDays(today, -61)}` }, { limit: 400 }),
    one("zones", { user_id: `eq.${userId}` }),
    select("labs", { user_id: `eq.${userId}` }, { order: "drawn_at.desc", limit: 2 }),
    select("sync_log", { user_id: `eq.${userId}` }, { order: "ran_at.desc", limit: 30 }),
    one("plans", { user_id: `eq.${userId}`, active: "eq.true" })
  ]);
  const activities = dedupeActivities(acts);
  const planned = workouts.filter((w) => w.status !== "sters");
  const { unplanned } = matchActivities(planned.filter((w) => w.date <= today), activities, today);
  const unplannedIds = new Set(unplanned.map((a) => a.id));
  const eveningByActivity = {};
  for (const e of forms.evenings) if (e.activityId) eveningByActivity[e.activityId] = e;
  const meActivities = activities.map((a) => ({
    id: a.id,
    source: a.source,
    date: a.date,
    sport: a.sport,
    minutes: a.minutes,
    distanceKm: a.distanceKm ?? null,
    avgHr: a.avgHr ?? null,
    maxHr: a.maxHr ?? null,
    name: a.name ?? null,
    paceMinKm: a.avgPaceMinKm ?? null,
    cadence: a.avgCadence ?? null,
    watts: a.avgWatts ?? null,
    details: a.details ?? null,
    unplanned: unplannedIds.has(a.id),
    tipNeplanificat: eveningByActivity[a.id]?.tip_neplanificat ?? eveningByActivity[a.externalId]?.tip_neplanificat ?? null
  }));
  const merged = mergeWellness(
    wellnessRows.map(
      (r2) => ({
        date: r2.date,
        source: r2.source,
        hrv: r2.hrv,
        rhr: r2.rhr,
        sleepMin: r2.sleep_min,
        bedtime: r2.bedtime,
        wakeTime: r2.wake_time,
        sleepScore: r2.sleep_score,
        recoveryScore: r2.recovery_score,
        respiratoryRate: r2.respiratory_rate
      })
    )
  );
  const todayW = merged.find((m) => m.date === today) ?? null;
  const prev = merged.filter((m) => m.date < today && m.date >= addDays(today, -60));
  const base = (k) => {
    const xs = prev.map((m) => m[k]).filter((x) => x != null);
    return xs.length >= 14 ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
  };
  const objective = objectiveReadiness({ hrv: todayW?.hrv ?? null, hrvBaseline: base("hrv"), rhr: todayW?.rhr ?? null, rhrBaseline: base("rhr"), resp: todayW?.respiratoryRate ?? null, respBaseline: base("respiratoryRate"), recovery: todayW?.recoveryScore ?? null, sleepMin: todayW?.sleepMin ?? null });
  const mf = forms.morning;
  const hs = hooperSum(mf?.hooper).suma;
  const state = objective.scor == null && hs == null ? null : { ...dayVerdict(objective, hs), score: objective.scor, parts: { recuperare: objective.componente.recuperare.scor, somn: objective.componente.somn.scor, hrv: objective.componente.inima_hrv.scor, puls: objective.componente.inima_puls.scor, respiratie: objective.componente.respiratie.scor } };
  const devices = tokens.map((t) => {
    const last = lastSyncRows.find((s) => s.provider === t.provider);
    return { provider: t.provider, connectedAt: t.connected_at, lastSync: last?.ran_at ?? null, lastOk: last ? last.ok : null, detail: last?.detail ?? null };
  });
  const lastSync = lastSyncRows.find((s) => s.ok)?.ran_at ?? null;
  const intake = forms.intake;
  const have = [];
  const missing = [];
  (intake ? have : missing).push("chestionar de intrare");
  (planRow ? have : missing).push("program s\u0103pt\u0103m\xE2nal");
  for (const p of PROVIDERS) if (providerConfigured(p)) (tokens.some((t) => t.provider === p) ? have : missing).push({ whoop: "Whoop", strava: "Garmin / ceas (prin Strava)", oura: "Oura" }[p]);
  (zonesRow && zonesRow.source !== "provizoriu" ? have : missing).push("zone testate (CPET / test de teren)");
  const labsRow = labsRows[0] ?? null;
  const labsOld = !!labsRow && labsExpired(labsRow.drawn_at, today);
  (labsRow && !labsOld ? have : missing).push(labsOld ? "analize de s\xE2nge (mai vechi de 12 luni)" : "analize de s\xE2nge");
  const clearance = await one("clearances", { user_id: `eq.${userId}` });
  (clearance?.cardiology ? have : missing).push("aviz cardiologic");
  (activities.length ? have : missing).push("istoric de activit\u0103\u021Bi");
  const warnings = [];
  const weekAgo = addDays(today, -14);
  const plannedSwim = planned.filter((w) => w.sport === "inot" && w.date >= weekAgo && w.date < today).reduce((n2, w) => n2 + w.plannedMinutes, 0);
  const doneSwim = activities.filter((a) => a.sport === "inot" && a.date >= weekAgo && a.date < today).reduce((n2, a) => n2 + a.minutes, 0);
  if (plannedSwim >= 90 && doneSwim / plannedSwim < 0.6) {
    warnings.push({ title: "\xCEnot sub plan", text: `Ai \xEEnotat ${Math.round(doneSwim / plannedSwim * 100)}% din minutele planificate \xEEn ultimele dou\u0103 s\u0103pt\u0103m\xE2ni.`, fix: "S\u0103pt\u0103m\xE2na viitoare \u0219edin\u021Bele de \xEEnot se plaseaz\u0103 primele." });
  }
  const testRow = await one("tests", { user_id: `eq.${userId}` }, { order: "tested_at.desc" });
  const bodyRow = await one("wellness_daily", { user_id: `eq.${userId}`, source: "eq.manual", weight_kg: "not.is.null" }, { order: "date.desc" });
  const aviz = intake?.sanatate?.avizCardiolog ?? null;
  const baseline = {
    labs: labsRow ? { data: labsRow.drawn_at, feritina: num2(labsRow.feritina), vitamina_d: num2(labsRow.vitamina_d), hemoglobina: num2(labsRow.hemoglobina), ck: num2(labsRow.ck), crp: num2(labsRow.crp), alte: labsRow.other?.valori ?? void 0, laborator: labsRow.other?.laborator ?? null, expirat: labsExpired(labsRow.drawn_at, today) } : null,
    labsCompare: labsRow ? compareLabs(labSnapshot(labsRow), labsRows[1] ? labSnapshot(labsRows[1]) : null) : null,
    tests: testRow?.results ?? null,
    body: bodyRow ? { data: bodyRow.date, greutate: num2(bodyRow.weight_kg), grasime_pct: num2(bodyRow.body_fat_pct) } : null,
    cardiolog: clearance?.cardiology ? "da" : aviz === "da" ? "da" : aviz ? "nu" : null
  };
  const u2 = user;
  if (u2.role !== "admin") {
    const admins = await select("users", { role: "eq.admin" }, { select: "id", limit: 1 });
    if (!admins.length) {
      const first2 = await select("users", {}, { select: "id", order: "created_at.asc", limit: 1 });
      if (first2[0]?.id === userId) {
        await update("users", { id: `eq.${userId}` }, { role: "admin" });
        u2.role = "admin";
      }
    }
  }
  const [totals, appleRow] = await Promise.all([
    planRow ? loadTotals(userId, planRow.start_date) : Promise.resolve(null),
    one("wellness_daily", { user_id: `eq.${userId}`, source: "eq.apple" }, { order: "synced_at.desc" }).catch(() => null)
  ]);
  if (u2.apple_token) (appleRow ? have : missing).push("Apple Watch (Health Auto Export)");
  const memento = messagesRows.find((m) => m.kind === "memento" && m.created_at >= `${today}T00:00:00`)?.body ?? null;
  return {
    baseline,
    admin: u2.role === "admin" ? { providers: { whoop: providerConfigured("whoop"), strava: providerConfigured("strava"), oura: providerConfigured("oura") }, appUrl: ENV.appUrl() } : null,
    profile: { sex: u2.sex ?? null, birthYear: u2.birth_year ?? null, heightCm: u2.height_cm ?? null, city: u2.city ?? null, appleConnected: !!u2.apple_token, appleLastSync: appleRow?.synced_at ?? null, appleLast: (() => {
      const l = lastSyncRows.find((r2) => r2.provider === "apple");
      return l ? { ok: l.ok, detail: l.detail, at: l.ran_at } : null;
    })() },
    totals,
    user: { id: user.id, email: user.email, name: user.name, goal: user.goal, raceName: user.race_name, raceDate: user.race_date, tz: user.tz },
    consent: !!consent?.health_data && !consent.withdrawn_at,
    intakeComplete: !!intake?.consimtamant,
    today,
    phase: planRow ? phaseAt(planRow.start_date, planRow.race_date, today) : null,
    budgetHours: planRow?.budget_hours ?? null,
    planStart: planRow?.start_date ?? null,
    plan: planned,
    scores: Object.fromEntries(scoresRows.map((s) => [s.workout_id, { color: s.color, reasons: s.reasons, final: s.is_final }])),
    activities: meActivities,
    state,
    wellnessToday: todayW ? { hrv: todayW.hrv, rhr: todayW.rhr, sleepMin: todayW.sleepMin, bedtime: todayW.bedtime, sleepScore: todayW.sleepScore, recoveryScore: todayW.recoveryScore, source: todayW.sources.hrv ?? todayW.sources.somn ?? null } : null,
    readiness: readinessRow ? { ...alignWithState(softenRed(readinessRow), state), acwr: num2(readinessRow.acwr), hooperSum: readinessRow.hooper_sum } : null,
    sportReady: user.goal ? sportReadiness(user.goal, activities, today, { swimContinuousM: swimDeclared(forms.intake) }) : [],
    bar: barRow ? { blocked: barRow.blocked, total: barRow.total, basis: barRow.basis, components: barRow.components } : null,
    messages: messagesRows.filter((m) => m.kind !== "memento").map((m) => ({ id: m.id, kind: m.kind, body: m.body, decision: m.decision, createdAt: m.created_at })),
    memento,
    forms: { intake, morning: forms.morning ?? null, evening: eveningByActivity, weeklyDone: await weeklyDone(userId, today) },
    devices,
    lastSync,
    zones: zonesRow ? {
      run: zonesRow.run_hr_zones ? `Z2 ${zonesRow.run_hr_zones[0]}\u2013${zonesRow.run_hr_zones[1]} bpm` : null,
      bike: zonesRow.bike_ftp_w ? `FTP ${zonesRow.bike_ftp_w} W` : zonesRow.bike_hr_zones ? `Z2 ${zonesRow.bike_hr_zones[0]}\u2013${zonesRow.bike_hr_zones[1]} bpm` : null,
      swim: zonesRow.swim_css_sec_100m ? `CSS ${zonesRow.swim_css_sec_100m} s/100 m` : null,
      source: zonesRow.source
    } : null,
    dataAvailability: { have, missing },
    warnings
  };
}
async function weeklyDone(userId, today) {
  const row = await one("questionnaires", { user_id: `eq.${userId}`, kind: "eq.saptamanal", for_date: `gte.${weekStart(today)}` });
  return !!row;
}
function num2(v) {
  if (v == null || v === "") return null;
  const n2 = Number(v);
  return Number.isFinite(n2) ? n2 : null;
}
function softenRed(r2) {
  if (r2.verdict !== "rosu") return { verdict: r2.verdict, reason: r2.reason };
  const n2 = (v) => v == null || v === "" ? null : Number(v);
  const acwr2 = n2(r2.acwr);
  const tsb = n2(r2.tsb);
  const hrv = n2(r2.hrv);
  const base = n2(r2.hrv_baseline);
  const really = r2.sleep_min != null && r2.sleep_min < 270 || acwr2 != null && acwr2 > 1.8 || tsb != null && tsb < -40 || (r2.hooper_sum ?? 0) >= 24 || hrv != null && base != null && hrv < base * 0.8;
  return really ? { verdict: "rosu", reason: r2.reason } : { verdict: "galben", reason: "Galben: \xEEnc\u0103rcare sau somn de urm\u0103rit, dar datele de s\u0103n\u0103tate sunt bune. Ro\u0219u r\u0103m\xE2ne doar pentru zilele cu adev\u0103rat rele." };
}
function alignWithState(d, state) {
  if (!state || d.verdict === "stop") return d;
  const v = state.verdict === "portocaliu" ? "galben" : state.verdict;
  if (v === d.verdict) return d;
  const why = { verde: "Datele de s\u0103n\u0103tate sunt bune: faci antrenamentul din plan.", galben: "Recuperarea nu e la maxim: ai o variant\u0103 mai u\u0219oar\u0103 ca sugestie; alegi tu.", rosu: "Datele de s\u0103n\u0103tate arat\u0103 o zi grea: azi pauz\u0103." }[v];
  return { verdict: v, reason: why };
}

// server/me.ts
async function handler9(req, res) {
  try {
    const u = await requireUser(req);
    const user = await loadUser(u.id);
    json(res, 200, await buildMe(u.id, todayIn(user.tz)));
  } catch (e) {
    fail(res, e);
  }
}

// server/oauth/[provider]/callback.ts
async function handler10(req, res) {
  try {
    const provider = q(req, "provider");
    if (!PROVIDERS.includes(provider)) throw new HttpError(404, "produc\u0103tor necunoscut");
    if (q(req, "error")) {
      redirect(res, `${ENV.appUrl()}/#profil?eroare=${encodeURIComponent(q(req, "error"))}`);
      return;
    }
    const userId = verifyState(q(req, "state"));
    const tokens = await exchangeCode(providerConfig(provider), q(req, "code"));
    await saveTokens(userId, provider, tokens);
    await syncUser(userId, 35).catch(() => void 0);
    redirect(res, `${ENV.appUrl()}/#profil?conectat=${provider}`);
  } catch (e) {
    const msg2 = e instanceof Error ? e.message : String(e);
    console.error("oauth callback", q(req, "provider"), msg2, "parametri primi\u021Bi:", Object.keys(req.query).join(","), "url:", (req.url ?? "").split("?")[0]);
    redirect(res, `${ENV.appUrl()}/#profil?eroare=${encodeURIComponent(msg2)}`);
  }
}

// server/oauth/[provider]/start.ts
async function handler11(req, res) {
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

// server/plan/generate.ts
async function handler12(req, res) {
  try {
    if (req.method !== "POST") throw new HttpError(405, "POST");
    const u = await requireUser(req);
    const user = await loadUser(u.id);
    const today = todayIn(user.tz);
    const { intake } = await loadForms(u.id, today);
    if (!intake) throw new HttpError(400, "f\u0103r\u0103 chestionar de intrare");
    json(res, 200, await generateAndStore(u.id, today, intake));
  } catch (e) {
    fail(res, e);
  }
}

// supabase/migrations/0001_init.sql
var init_default = "-- Antrenor \u2014 schema real\u0103 (Supabase / PostgreSQL). Ruleaz\u0103 cu `supabase db push` sau \xEEn SQL Editor.\n-- Principii: fiecare r\xE2nd are user_id; sportivul \xEE\u0219i vede doar r\xE2ndurile lui (RLS); scrie doar serverul (service role),\n-- cu excep\u021Bia chestionarelor \u0219i a consim\u021B\u0103m\xE2ntului, pe care le poate scrie \u0219i aplica\u021Bia direct.\n\ncreate extension if not exists pgcrypto;\n\n-- ---------- utilizatori (oglinda auth.users) ----------\ncreate table public.users (\n  id uuid primary key references auth.users(id) on delete cascade,\n  email text unique not null,\n  name text not null default '',\n  role text not null check (role in ('sportiv', 'head_coach', 'admin')) default 'sportiv',\n  coach_id uuid references public.users(id),\n  tz text not null default 'Europe/Bucharest',\n  goal text check (goal in ('70.3', 'olimpic', 'sprint', 'full', 'semimaraton', 'maraton')),\n  race_name text,\n  race_date date,\n  created_at timestamptz not null default now()\n);\n\ncreate or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$\nbegin\n  insert into public.users (id, email, name)\n  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)))\n  on conflict (id) do nothing;\n  return new;\nend $$;\ndrop trigger if exists on_auth_user_created on auth.users;\ncreate trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();\n\ncreate table public.consents (\n  user_id uuid primary key references public.users(id) on delete cascade,\n  health_data boolean not null default false,\n  adult boolean not null default false,\n  not_medical_ack boolean not null default false,\n  accepted_at timestamptz,\n  withdrawn_at timestamptz\n);\n\n-- ---------- chestionare: intrare, dimineata, seara, saptamanal ----------\ncreate table public.questionnaires (\n  id uuid primary key default gen_random_uuid(),\n  user_id uuid not null references public.users(id) on delete cascade,\n  kind text not null check (kind in ('intrare', 'dimineata', 'seara', 'saptamanal')),\n  for_date date not null,\n  activity_id text,                      -- la \u201Eseara\u201D: activitatea la care se refer\u0103\n  answers jsonb not null,\n  created_at timestamptz not null default now(),\n  unique (user_id, kind, for_date, activity_id)\n);\ncreate index on public.questionnaires (user_id, kind, for_date desc);\n\n-- Blocurile libere recurente: day 0 = luni; minute din miezul nop\u021Bii.\ncreate table public.schedules (\n  user_id uuid not null references public.users(id) on delete cascade,\n  day smallint not null check (day between 0 and 6),\n  start_min smallint not null,\n  end_min smallint not null,\n  valid_from date not null default current_date,\n  primary key (user_id, day, start_min, valid_from)\n);\n\ncreate table public.zones (\n  user_id uuid primary key references public.users(id) on delete cascade,\n  run_hr_zones smallint[],          -- limite superioare Z1..Z5, bpm\n  run_threshold_pace_sec_km int,\n  bike_ftp_w int,\n  bike_hr_zones smallint[],\n  swim_css_sec_100m int,\n  hr_max_test smallint,\n  source text,                      -- cpet | lactat | teren | provizoriu\n  tested_at date,\n  updated_at timestamptz not null default now()\n);\n\ncreate table public.tests (\n  id uuid primary key default gen_random_uuid(),\n  user_id uuid not null references public.users(id) on delete cascade,\n  kind text not null,\n  results jsonb not null,\n  tested_at date not null\n);\n\ncreate table public.labs (\n  id uuid primary key default gen_random_uuid(),\n  user_id uuid not null references public.users(id) on delete cascade,\n  feritina numeric, vitamina_d numeric, hemoglobina numeric, ck numeric, crp numeric,\n  other jsonb,\n  drawn_at date not null\n);\n\ncreate table public.clearances (\n  user_id uuid primary key references public.users(id) on delete cascade,\n  cardiology boolean not null default false,\n  cleared_at date,\n  intensity_allowed text not null check (intensity_allowed in ('Z2', 'pana_la_Z4', 'toate')) default 'Z2'\n);\n\n-- ---------- br\u0103\u021B\u0103ri ----------\n-- Token-urile OAuth: doar service role le cite\u0219te. Niciodat\u0103 expuse aplica\u021Biei.\ncreate table public.oauth_tokens (\n  user_id uuid not null references public.users(id) on delete cascade,\n  provider text not null check (provider in ('whoop', 'strava', 'oura')),\n  access_token text not null,\n  refresh_token text,\n  expires_at timestamptz not null,\n  scope text,\n  external_user_id text,\n  connected_at timestamptz not null default now(),\n  updated_at timestamptz not null default now(),\n  primary key (user_id, provider)\n);\n\n-- O noapte / o zi, pe surs\u0103, \xEEn forma normalizat\u0103 a colectorului. Arbitrajul \xEEntre surse se face la citire.\ncreate table public.wellness_daily (\n  user_id uuid not null references public.users(id) on delete cascade,\n  date date not null,                  -- ziua trezirii\n  source text not null check (source in ('whoop', 'garmin', 'oura', 'strava', 'manual', 'athletedata')),\n  hrv numeric, rhr smallint,\n  sleep_min int, bedtime text, wake_time text, sleep_score smallint,\n  recovery_score smallint, respiratory_rate numeric,\n  weight_kg numeric, body_fat_pct numeric,\n  raw jsonb,\n  synced_at timestamptz not null default now(),\n  primary key (user_id, date, source)\n);\n\ncreate table public.sync_log (\n  id uuid primary key default gen_random_uuid(),\n  user_id uuid not null references public.users(id) on delete cascade,\n  provider text not null,\n  ok boolean not null,\n  detail text,\n  rows int not null default 0,\n  ran_at timestamptz not null default now()\n);\ncreate index on public.sync_log (user_id, ran_at desc);\n\n-- ---------- plan ----------\ncreate table public.plans (\n  id uuid primary key default gen_random_uuid(),\n  user_id uuid not null references public.users(id) on delete cascade,\n  goal text not null check (goal in ('70.3', 'olimpic', 'sprint', 'full', 'semimaraton', 'maraton')),\n  race_date date not null,\n  start_date date not null,\n  budget_hours numeric not null,\n  version int not null default 1,\n  active boolean not null default true,\n  approved_by uuid references public.users(id),\n  created_at timestamptz not null default now()\n);\ncreate index on public.plans (user_id, active);\n\ncreate table public.workouts_planned (\n  id text primary key,\n  plan_id uuid not null references public.plans(id) on delete cascade,\n  user_id uuid not null references public.users(id) on delete cascade,\n  date date not null,\n  sport text not null check (sport in ('inot', 'bicicleta', 'alergare', 'forta')),\n  type text not null check (type in ('z2', 'tehnica', 'calitate', 'lung', 'brick', 'forta', 'odihna')),\n  planned_minutes int not null,\n  target_zones smallint[] not null,\n  is_key boolean not null default false,\n  step int,\n  structure text,\n  intervals jsonb,\n  status text not null check (status in ('planificat', 'anulat_sistem', 'mutat', 'sters')) default 'planificat',\n  note text,\n  pushed_to_watch_at timestamptz\n);\ncreate index on public.workouts_planned (user_id, date);\n\ncreate table public.activities (\n  id text primary key,              -- \u201Estrava-123\u201D, \u201Ewhoop-abc\u201D\n  user_id uuid not null references public.users(id) on delete cascade,\n  source text not null,\n  external_id text not null,\n  date date not null,\n  start_local text,\n  sport text not null check (sport in ('inot', 'bicicleta', 'alergare', 'forta')),\n  minutes int not null,\n  distance_km numeric,\n  avg_hr smallint, max_hr smallint,\n  avg_pace_min_km numeric, avg_cadence smallint, avg_watts smallint,\n  time_in_zones_min jsonb,\n  intervals_hit_pct numeric, intervals_abandoned int, main_set_abandoned boolean,\n  first_third_hr smallint, last_third_hr smallint, first_third_output numeric, last_third_output numeric,\n  after_bike_minutes int,\n  name text,\n  raw jsonb,\n  synced_at timestamptz not null default now()\n);\ncreate index on public.activities (user_id, date desc);\n\ncreate table public.scores (\n  workout_id text primary key references public.workouts_planned(id) on delete cascade,\n  user_id uuid not null references public.users(id) on delete cascade,\n  activity_id text references public.activities(id),\n  extra_activity_id text references public.activities(id),\n  color text not null check (color in ('verde', 'galben', 'portocaliu', 'rosu', 'gri', 'albastru', 'asteptare')),\n  reasons text[] not null,\n  metrics jsonb not null,\n  flags jsonb not null,\n  is_final boolean not null default false,\n  scored_at timestamptz not null default now()\n);\n\ncreate table public.readiness_daily (\n  user_id uuid not null references public.users(id) on delete cascade,\n  date date not null,\n  verdict text not null check (verdict in ('verde', 'galben', 'rosu', 'stop')),\n  reason text,\n  hrv numeric, hrv_baseline numeric, rhr numeric, sleep_min int,\n  hooper_sum smallint,\n  acwr numeric, tsb numeric,\n  primary key (user_id, date)\n);\n\n-- ---------- agen\u021Bi ----------\ncreate table public.packets (\n  id uuid primary key default gen_random_uuid(),\n  user_id uuid not null references public.users(id) on delete cascade,\n  event text not null check (event in ('dimineata', 'dupa_antrenament', 'saptamanal', 'lunar', 'semnal', 'analize', 'retest')),\n  packet jsonb not null,\n  created_at timestamptz not null default now()\n);\ncreate index on public.packets (user_id, created_at desc);\n\ncreate table public.agent_outputs (\n  id uuid primary key default gen_random_uuid(),\n  packet_id uuid not null references public.packets(id) on delete cascade,\n  user_id uuid not null references public.users(id) on delete cascade,\n  agent text not null,\n  verdict text,\n  output jsonb not null,            -- r\u0103spunsul JSON, cu \u201Estare\u201D pe fiecare r\xE2nd dup\u0103 verificare\n  rejected int not null default 0,\n  model text,\n  created_at timestamptz not null default now()\n);\n\n-- Mesajele head coach-ului c\u0103tre sportiv: ce vede \xEEn sec\u021Biunea Antrenor \u0219i \xEEn memento.\ncreate table public.messages (\n  id uuid primary key default gen_random_uuid(),\n  user_id uuid not null references public.users(id) on delete cascade,\n  packet_id uuid references public.packets(id) on delete set null,\n  kind text not null check (kind in ('dimineata', 'dupa_antrenament', 'saptamanal', 'memento', 'avertisment', 'uman')),\n  body text not null,\n  decision text check (decision in ('verde', 'galben', 'rosu', 'stop')),\n  from_human boolean not null default false,\n  created_at timestamptz not null default now()\n);\ncreate index on public.messages (user_id, created_at desc);\n\ncreate table public.journal (\n  id uuid primary key default gen_random_uuid(),\n  user_id uuid not null references public.users(id) on delete cascade,\n  date date not null,\n  entry text not null,\n  created_at timestamptz not null default now()\n);\n\n-- Fi\u0219ierele agen\u021Bilor (fiziolog.md, inot.md \u2026): maximum 30 de r\xE2nduri, rescrise de agent prin \u201Epentru_viitor\u201D.\ncreate table public.agent_files (\n  user_id uuid not null references public.users(id) on delete cascade,\n  agent text not null,\n  content text not null default '',\n  updated_at timestamptz not null default now(),\n  primary key (user_id, agent)\n);\n\ncreate table public.bar_daily (\n  user_id uuid not null references public.users(id) on delete cascade,\n  date date not null,\n  total numeric,\n  blocked text,\n  basis text not null,\n  components jsonb not null,\n  primary key (user_id, date)\n);\n\n-- ---------- RLS: sportivul \xEE\u0219i vede r\xE2ndurile; scrie doar serverul (service role trece peste RLS) ----------\ndo $$\ndeclare t text;\nbegin\n  for t in select unnest(array['users','consents','questionnaires','schedules','zones','tests','labs','clearances','wellness_daily','sync_log','plans','workouts_planned','activities','scores','readiness_daily','packets','agent_outputs','messages','journal','agent_files','bar_daily']) loop\n    execute format('alter table public.%I enable row level security', t);\n    if t = 'users' then\n      execute 'create policy users_select_own on public.users for select using (auth.uid() = id)';\n      execute 'create policy users_update_own on public.users for update using (auth.uid() = id)';\n    else\n      execute format('create policy %I_select_own on public.%I for select using (auth.uid() = user_id)', t, t);\n    end if;\n  end loop;\nend $$;\n\n-- Aplica\u021Bia poate scrie direct consim\u021B\u0103m\xE2ntul \u0219i chestionarele proprii; restul trece prin API.\ncreate policy consents_upsert_own on public.consents for insert with check (auth.uid() = user_id);\ncreate policy consents_update_own on public.consents for update using (auth.uid() = user_id);\ncreate policy questionnaires_insert_own on public.questionnaires for insert with check (auth.uid() = user_id);\ncreate policy questionnaires_update_own on public.questionnaires for update using (auth.uid() = user_id);\n\n-- Token-urile OAuth nu au nicio politic\u0103 de select: doar service role le vede.\nalter table public.oauth_tokens enable row level security;\n";

// supabase/migrations/0002_upgrade.sql
var upgrade_default = "-- Actualiz\u0103ri idempotente: ruleaz\u0103 la fiecare \u201EPreg\u0103te\u0219te\u201D (\u0219i automat c\xE2nd aplica\u021Bia vede schema veche).\nalter table public.users add column if not exists city text;\nalter table public.users add column if not exists lat double precision;\nalter table public.users add column if not exists lon double precision;\nalter table public.users add column if not exists apple_token text;\ncreate unique index if not exists users_apple_token_idx on public.users (apple_token) where apple_token is not null;\n\n-- Apple Health (prin Health Auto Export) ca surs\u0103 de somn, HRV \u0219i puls de repaus.\nalter table public.wellness_daily drop constraint if exists wellness_daily_source_check;\nalter table public.wellness_daily add constraint wellness_daily_source_check\n  check (source in ('whoop', 'garmin', 'oura', 'strava', 'manual', 'athletedata', 'apple'));\n\n-- Set\u0103rile aplica\u021Biei introduse de admin din aplica\u021Bie (cheile aplica\u021Biilor WHOOP / Strava / Oura).\n-- F\u0103r\u0103 nicio politic\u0103 RLS: le cite\u0219te doar serverul (service role).\ncreate table if not exists public.app_settings (\n  key text primary key,\n  value text not null,\n  updated_at timestamptz not null default now()\n);\nalter table public.app_settings enable row level security;\nrevoke all on public.app_settings from anon, authenticated;\n\n-- Analize: c\xE2nd a fost urcat buletinul (pentru \u201Eanalize noi\u201D \u0219i compara\u021Bia cu cele vechi).\nalter table public.labs add column if not exists uploaded_at timestamptz not null default now();\n\n-- Obiective noi: semimaraton \u0219i maraton (doar alergare).\nalter table public.users drop constraint if exists users_goal_check;\nalter table public.users add constraint users_goal_check check (goal in ('70.3', 'olimpic', 'sprint', 'full', 'semimaraton', 'maraton'));\nalter table public.plans drop constraint if exists plans_goal_check;\nalter table public.plans add constraint plans_goal_check check (goal in ('70.3', 'olimpic', 'sprint', 'full', 'semimaraton', 'maraton'));\n-- Marcaj de versiune a schemei (aplica\u021Bia cere singur\u0103 actualizarea c\xE2nd lipse\u0219te).\nalter table public.users add column if not exists schema_v smallint not null default 3;\n\n-- Sex \u0219i anul na\u0219terii: conteaz\u0103 pentru intervalele analizelor, nutri\u021Bie \u0219i recuperare.\nalter table public.users add column if not exists sex text check (sex in ('m', 'f'));\nalter table public.users add column if not exists birth_year smallint;\n\n-- Recuperarea (saun\u0103, baie rece, yoga, stretching, masaj) \u0219i mi\u0219carea \xEEn plus (plimb\u0103ri, alte sporturi) de pe br\u0103\u021B\u0103ri.\ncreate table if not exists public.other_activities (\n  id text primary key,\n  user_id uuid not null references public.users(id) on delete cascade,\n  source text not null,\n  external_id text not null,\n  date date not null,\n  start_local text,\n  kind text not null check (kind in ('recuperare', 'activ')),\n  name text not null,\n  minutes int not null,\n  avg_hr smallint,\n  max_hr smallint,\n  synced_at timestamptz not null default now()\n);\ncreate index if not exists other_activities_user_date on public.other_activities (user_id, date desc);\nalter table public.other_activities enable row level security;\ndo $$ begin\n  if not exists (select 1 from pg_policies where tablename = 'other_activities' and policyname = 'other_activities_select_own') then\n    create policy other_activities_select_own on public.other_activities for select using (auth.uid() = user_id);\n  end if;\nend $$;\n\n-- \xCEn\u0103l\u021Bimea: pentru indicele de mas\u0103 corporal\u0103 \u0219i necesarul de energie.\nalter table public.users add column if not exists height_cm smallint;\n\n-- Sugestia mai u\u0219oar\u0103 din zilele galbene/portocalii (sportivul alege).\nalter table public.workouts_planned add column if not exists suggestion jsonb;\n\n-- Consumul AI real, pe apel: tokeni de la Anthropic, pentru costul afi\u0219at adminului.\ncreate table if not exists public.ai_usage (\n  id uuid primary key default gen_random_uuid(),\n  user_id uuid references public.users(id) on delete cascade,\n  kind text not null,               -- agenti:dimineata, analize, test \u2026\n  model text not null,\n  input_tokens int not null default 0,\n  output_tokens int not null default 0,\n  created_at timestamptz not null default now()\n);\ncreate index if not exists ai_usage_user_created on public.ai_usage (user_id, created_at desc);\nalter table public.ai_usage enable row level security;\n\n-- Corecturile sportivului pe \u0219edin\u021Be clasificate gre\u0219it de br\u0103\u021B\u0103ri (\u201Ee de fapt alergare\u201D, \u201Enu e antrenament\u201D).\n-- Separat de activities, ca o sincronizare nou\u0103 s\u0103 nu le \u0219tearg\u0103.\ncreate table if not exists public.activity_overrides (\n  user_id uuid not null references public.users(id) on delete cascade,\n  activity_id text not null,\n  sport text check (sport in ('inot', 'bicicleta', 'alergare', 'forta')),\n  ignored boolean not null default false,\n  updated_at timestamptz not null default now(),\n  primary key (user_id, activity_id)\n);\nalter table public.activity_overrides enable row level security;\n";

// server/_lib/pg.ts
import { createHash, createHmac as createHmac3, pbkdf2Sync, randomBytes as randomBytes2 } from "node:crypto";
import net from "node:net";
import tls from "node:tls";
function parsePgUrl(url) {
  const u = new URL(url);
  const sslmode = u.searchParams.get("sslmode");
  const host = u.hostname;
  const local = host === "localhost" || host === "127.0.0.1";
  return {
    host,
    port: Number(u.port || 5432),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: decodeURIComponent(u.pathname.replace(/^\//, "") || "postgres"),
    ssl: sslmode ? sslmode !== "disable" : !local
  };
}
var Reader = class {
  buf = Buffer.alloc(0);
  waiters = [];
  err = null;
  push(b) {
    this.buf = Buffer.concat([this.buf, b]);
    this.wake();
  }
  fail(e) {
    this.err = e;
    this.wake();
  }
  wake() {
    const w = this.waiters;
    this.waiters = [];
    for (const f of w) f();
  }
  async bytes(n2) {
    while (this.buf.length < n2) {
      if (this.err) throw this.err;
      await new Promise((r2) => this.waiters.push(r2));
    }
    const out = this.buf.subarray(0, n2);
    this.buf = this.buf.subarray(n2);
    return out;
  }
  async message() {
    const head = await this.bytes(5);
    const len = head.readInt32BE(1);
    const body = await this.bytes(len - 4);
    return { type: String.fromCharCode(head[0]), body };
  }
};
function msg(type, body) {
  const head = Buffer.alloc(5);
  head.write(type, 0, "latin1");
  head.writeInt32BE(body.length + 4, 1);
  return Buffer.concat([head, body]);
}
var cstr = (s) => Buffer.concat([Buffer.from(s, "utf8"), Buffer.from([0])]);
function fields(body) {
  const out = {};
  let i = 0;
  while (i < body.length && body[i] !== 0) {
    const code = String.fromCharCode(body[i]);
    const end = body.indexOf(0, i + 1);
    out[code] = body.toString("utf8", i + 1, end);
    i = end + 1;
  }
  return out;
}
var pgError = (body) => {
  const f = fields(body);
  return new Error(`postgres: ${f.M ?? "eroare"}${f.D ? ` (${f.D})` : ""}${f.C ? ` [${f.C}]` : ""}`);
};
var xor = (a, b) => Buffer.from(a.map((x, i) => x ^ b[i]));
async function connect(url, timeoutMs = 15e3) {
  const c = parsePgUrl(url);
  const reader = new Reader();
  let sock = net.connect({ host: c.host, port: c.port });
  sock.setTimeout(timeoutMs, () => sock.destroy(new Error("postgres: timeout")));
  await new Promise((ok2, ko) => {
    sock.once("connect", ok2);
    sock.once("error", ko);
  });
  if (c.ssl) {
    const req = Buffer.alloc(8);
    req.writeInt32BE(8, 0);
    req.writeInt32BE(80877103, 4);
    const answer = await new Promise((ok2, ko) => {
      sock.once("data", (d) => ok2(String.fromCharCode(d[0])));
      sock.once("error", ko);
      sock.write(req);
    });
    if (answer !== "S") throw new Error("postgres: serverul nu accept\u0103 TLS");
    sock = tls.connect({ socket: sock, servername: net.isIP(c.host) ? void 0 : c.host, rejectUnauthorized: false });
    await new Promise((ok2, ko) => {
      sock.once("secureConnect", ok2);
      sock.once("error", ko);
    });
  }
  sock.on("data", (d) => reader.push(d));
  sock.on("error", (e) => reader.fail(e));
  sock.on("close", () => reader.fail(new Error("postgres: conexiune \xEEnchis\u0103")));
  const params2 = Buffer.concat([cstr("user"), cstr(c.user), cstr("database"), cstr(c.database), cstr("client_encoding"), cstr("UTF8"), Buffer.from([0])]);
  const start = Buffer.alloc(8);
  start.writeInt32BE(params2.length + 8, 0);
  start.writeInt32BE(196608, 4);
  sock.write(Buffer.concat([start, params2]));
  let nonce = "";
  let scram = null;
  for (; ; ) {
    const m = await reader.message();
    if (m.type === "E") throw pgError(m.body);
    if (m.type === "R") {
      const code = m.body.readInt32BE(0);
      if (code === 0) continue;
      if (code === 3) sock.write(msg("p", cstr(c.password)));
      else if (code === 5) {
        const salt = m.body.subarray(4, 8);
        const inner = createHash("md5").update(c.password + c.user).digest("hex");
        sock.write(msg("p", cstr("md5" + createHash("md5").update(Buffer.concat([Buffer.from(inner), salt])).digest("hex"))));
      } else if (code === 10) {
        const mechs = m.body.subarray(4).toString("utf8").split("\0");
        if (!mechs.includes("SCRAM-SHA-256")) throw new Error(`postgres: autentificare nesuportat\u0103 (${mechs.join(", ")})`);
        nonce = randomBytes2(18).toString("base64");
        const first2 = `n,,n=*,r=${nonce}`;
        const firstBuf = Buffer.from(first2, "utf8");
        const len = Buffer.alloc(4);
        len.writeInt32BE(firstBuf.length, 0);
        sock.write(msg("p", Buffer.concat([cstr("SCRAM-SHA-256"), len, firstBuf])));
      } else if (code === 11) {
        const serverFirst = m.body.subarray(4).toString("utf8");
        const attrs = Object.fromEntries(serverFirst.split(",").map((kv) => [kv[0], kv.slice(2)]));
        const r2 = attrs.r ?? "";
        if (!r2.startsWith(nonce)) throw new Error("postgres: nonce SCRAM invalid");
        const salted = pbkdf2Sync(c.password, Buffer.from(attrs.s ?? "", "base64"), Number(attrs.i), 32, "sha256");
        const clientKey = createHmac3("sha256", salted).update("Client Key").digest();
        const storedKey = createHash("sha256").update(clientKey).digest();
        const withoutProof = `c=biws,r=${r2}`;
        const authMessage = `n=*,r=${nonce},${serverFirst},${withoutProof}`;
        const signature = createHmac3("sha256", storedKey).update(authMessage).digest();
        const proof = xor(clientKey, signature).toString("base64");
        scram = { salted, authMessage };
        sock.write(msg("p", Buffer.from(`${withoutProof},p=${proof}`, "utf8")));
      } else if (code === 12) {
        if (!scram) throw new Error("postgres: SCRAM f\u0103r\u0103 \xEEnceput");
        const serverKey = createHmac3("sha256", scram.salted).update("Server Key").digest();
        const expected = createHmac3("sha256", serverKey).update(scram.authMessage).digest("base64");
        const got = /v=([^,]+)/.exec(m.body.subarray(4).toString("utf8"))?.[1];
        if (got !== expected) throw new Error("postgres: semn\u0103tura serverului nu se potrive\u0219te");
      } else throw new Error(`postgres: metod\u0103 de autentificare ${code} nesuportat\u0103`);
      continue;
    }
    if (m.type === "Z") break;
  }
  let busy = Promise.resolve();
  const run = async (sql) => {
    sock.write(msg("Q", cstr(sql)));
    const rows = [];
    const notices = [];
    let cols = [];
    let error = null;
    for (; ; ) {
      const m = await reader.message();
      if (m.type === "T") {
        const n2 = m.body.readInt16BE(0);
        cols = [];
        let i = 2;
        for (let k = 0; k < n2; k++) {
          const end = m.body.indexOf(0, i);
          cols.push(m.body.toString("utf8", i, end));
          i = end + 1 + 18;
        }
      } else if (m.type === "D") {
        const n2 = m.body.readInt16BE(0);
        const row = {};
        let i = 2;
        for (let k = 0; k < n2; k++) {
          const len = m.body.readInt32BE(i);
          i += 4;
          if (len === -1) row[cols[k] ?? String(k)] = null;
          else {
            row[cols[k] ?? String(k)] = m.body.toString("utf8", i, i + len);
            i += len;
          }
        }
        rows.push(row);
      } else if (m.type === "E") error = pgError(m.body);
      else if (m.type === "N") notices.push(fields(m.body).M ?? "");
      else if (m.type === "Z") break;
    }
    if (error) throw error;
    return { rows, notices };
  };
  return {
    query(sql) {
      const p = busy.then(() => run(sql));
      busy = p.catch(() => void 0);
      return p;
    },
    end() {
      try {
        sock.write(msg("X", Buffer.alloc(0)));
      } catch {
      }
      sock.end();
    }
  };
}
function lit(s) {
  return `'${s.replace(/'/g, "''")}'`;
}

// server/_lib/setup.ts
var JOBS = [
  { name: "antrenor-sync", schedule: "*/15 * * * *", path: "/api/cron/sync" },
  { name: "antrenor-dimineata", schedule: "30 2 * * *", path: "/api/cron/morning" },
  // 05:30 ora României (vara), 04:30 iarna
  { name: "antrenor-seara", schedule: "0 18 * * *", path: "/api/cron/evening" }
];
var GRANTS = `
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant all on all functions in schema public to service_role;
grant select on all tables in schema public to authenticated;
revoke select on public.oauth_tokens from authenticated, anon;
grant insert, update on public.consents, public.questionnaires to authenticated;
`;
async function setupStatus() {
  const url = ENV.postgresUrl();
  if (!url) return { database: false, tables: false, detail: "lipse\u0219te POSTGRES_URL (integrarea Supabase din Vercel)" };
  let c = null;
  try {
    c = await connect(url);
    const r2 = await c.query("select to_regclass('public.users') is not null as ok");
    return { database: true, tables: r2.rows[0]?.ok === "t" };
  } catch (e) {
    return { database: false, tables: false, detail: e.message };
  } finally {
    c?.end();
  }
}
async function runSetup(appUrl2) {
  const url = ENV.postgresUrl();
  if (!url) throw new Error("lipse\u0219te POSTGRES_URL: adaug\u0103 integrarea Supabase \xEEn proiectul Vercel");
  const steps = [];
  const c = await connect(url);
  const step = async (name, sql, optional = false) => {
    try {
      const r2 = await c.query(sql);
      steps.push({ step: name, ok: true, detail: r2.notices.filter(Boolean).slice(0, 2).join("; ") || void 0 });
      return true;
    } catch (e) {
      steps.push({ step: name, ok: false, detail: e.message });
      if (!optional) throw e;
      return false;
    }
  };
  try {
    const exists = (await c.query("select to_regclass('public.users') is not null as ok")).rows[0]?.ok === "t";
    if (exists) steps.push({ step: "tabele", ok: true, detail: "existau deja" });
    else await step("tabele", `begin;
${init_default}
commit;`);
    await step("actualiz\u0103ri", upgrade_default);
    await step("drepturi", GRANTS, true);
    const cron = await step("pg_cron", "create extension if not exists pg_cron with schema pg_catalog", true);
    const net2 = await step("pg_net", "create extension if not exists pg_net with schema extensions", true);
    if (cron && net2) {
      const auth = JSON.stringify({ authorization: `Bearer ${ENV.cronSecret()}` });
      for (const j of JOBS) {
        const cmd = `select net.http_get(url := ${lit(appUrl2 + j.path)}, headers := ${lit(auth)}::jsonb, timeout_milliseconds := 300000)`;
        await step(`programare ${j.name}`, `select cron.schedule(${lit(j.name)}, ${lit(j.schedule)}, ${lit(cmd)})`, true);
      }
    }
    await step("re\xEEnc\u0103rcare API", "notify pgrst, 'reload schema'", true);
    return steps;
  } finally {
    c.end();
  }
}

// server/setup.ts
async function handler13(req, res) {
  try {
    if (req.method === "GET") {
      json(res, 200, await setupStatus());
      return;
    }
    if (req.method !== "POST") throw new HttpError(405, "GET sau POST");
    const status = await setupStatus();
    const needsUpgrade = status.tables && !await hasUpgrade();
    if (status.tables && !needsUpgrade) {
      const u = await requireUser(req);
      const me = await one("users", { id: `eq.${u.id}` });
      if (me?.role !== "admin") throw new HttpError(403, "doar adminul poate rula din nou preg\u0103tirea");
    }
    const host = req.headers["x-forwarded-host"] ?? req.headers.host;
    const appUrl2 = process.env.APP_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL ? ENV.appUrl() : `https://${host}`;
    const steps = await runSetup(appUrl2);
    json(res, 200, { ok: steps.every((s) => s.ok || s.step.startsWith("programare") || s.step === "drepturi"), appUrl: appUrl2, steps });
  } catch (e) {
    fail(res, e);
  }
}
async function hasUpgrade() {
  const h = { headers: supabaseKeyHeaders(ENV.supabaseService()) };
  const [r2, t] = await Promise.all([fetch(`${ENV.supabaseUrl()}/rest/v1/users?select=city,apple_token&limit=1`, h), fetch(`${ENV.supabaseUrl()}/rest/v1/app_settings?select=key&limit=1`, h)]);
  return r2.ok && t.ok;
}

// server/admin.ts
import { randomBytes as randomBytes3 } from "node:crypto";
async function handler14(req, res) {
  try {
    const u = await requireUser(req);
    const me = await one("users", { id: `eq.${u.id}` });
    if (me?.role !== "admin") throw new HttpError(403, "doar adminul");
    if (req.method === "GET") {
      const monthStart = `${todayIn("Europe/Bucharest").slice(0, 7)}-01`;
      const [users, tokens, logs, intakes, plans, msgs, usage, acts] = await Promise.all([
        select("users", {}, { select: "id,email,name,created_at,tz", order: "created_at.asc" }),
        select("oauth_tokens", {}, { select: "user_id,provider" }),
        select("sync_log", {}, { order: "ran_at.desc", limit: 300 }),
        select("questionnaires", { kind: "eq.intrare" }, { select: "user_id" }),
        select("plans", { active: "eq.true" }, { select: "user_id,start_date" }),
        select("messages", {}, { select: "user_id,created_at,kind", order: "created_at.desc", limit: 300 }),
        select("ai_usage", { created_at: `gte.${monthStart}T00:00:00Z` }, { select: "user_id,input_tokens,output_tokens,created_at", limit: 2e4 }).catch(() => []),
        select("activities", {}, { select: "user_id,date,sport,source,name,minutes,distance_km", order: "date.desc", limit: 400 })
      ]);
      const today = todayIn("Europe/Bucharest");
      const cost = (rows) => Math.round(rows.reduce((s, r2) => s + costUsd(r2.input_tokens, r2.output_tokens), 0) * 100) / 100;
      json(res, 200, {
        costMonth: cost(usage),
        costToday: cost(usage.filter((r2) => r2.created_at.slice(0, 10) === today)),
        tracking: usage.length > 0,
        users: users.map((x) => {
          const last = logs.filter((l) => l.user_id === x.id);
          const byProvider = [...new Set(tokens.filter((t) => t.user_id === x.id).map((t) => t.provider))].map((p) => {
            const l = last.find((r2) => r2.provider === p);
            return { provider: p, lastSync: l?.ran_at ?? null, ok: l?.ok ?? null, detail: l?.detail ?? null };
          });
          return {
            id: x.id,
            email: x.email,
            name: x.name,
            since: x.created_at.slice(0, 10),
            intake: intakes.some((i) => i.user_id === x.id),
            planStart: plans.find((p) => p.user_id === x.id)?.start_date ?? null,
            devices: byProvider,
            lastMessage: msgs.find((m) => m.user_id === x.id && m.kind !== "memento")?.created_at ?? null,
            costMonth: cost(usage.filter((r2) => r2.user_id === x.id)),
            recent: acts.filter((r2) => r2.user_id === x.id).slice(0, 8).map((r2) => ({ date: r2.date, sport: r2.sport, source: r2.source, name: r2.name, minutes: r2.minutes, km: r2.distance_km }))
          };
        })
      });
      return;
    }
    if (req.method !== "POST") throw new HttpError(405, "GET sau POST");
    const body = await readJson(req);
    const target = await one("users", { id: `eq.${body.userId ?? ""}` });
    if (!target) throw new HttpError(404, "sportiv inexistent");
    if (body.action === "sync") {
      const r2 = await syncUser(target.id, 7);
      json(res, 200, { ok: true, text: r2.length ? r2.map((x) => `${x.provider}: ${x.ok ? `${x.rows} r\xE2nduri` : `eroare: ${x.detail ?? ""}`}`).join(" \xB7 ") : "nicio br\u0103\u021Bar\u0103 conectat\u0103" });
      return;
    }
    if (body.action === "plan") {
      const intake = await one("questionnaires", { user_id: `eq.${target.id}`, kind: "eq.intrare" }, { order: "created_at.desc" });
      if (!intake) throw new HttpError(400, "nu are chestionarul de intrare");
      const r2 = await generateAndStore(target.id, todayIn(target.tz), intake.answers);
      json(res, 200, { ok: r2.ok, text: r2.ok ? `plan nou: ${r2.weeks} s\u0103pt\u0103m\xE2ni, ${r2.budgetHours} h/s\u0103pt.` : r2.reason ?? "nu s-a putut" });
      return;
    }
    if (body.action === "parola") {
      const password = randomBytes3(6).toString("base64url");
      const r2 = await fetch(`${ENV.supabaseUrl()}/auth/v1/admin/users/${target.id}`, {
        method: "PUT",
        headers: { ...supabaseKeyHeaders(ENV.supabaseService()), "content-type": "application/json" },
        body: JSON.stringify({ password })
      });
      if (!r2.ok) throw new HttpError(500, `nu am putut schimba parola (${r2.status})`);
      json(res, 200, { ok: true, text: `parol\u0103 temporar\u0103 pentru ${target.email}: ${password}` });
      return;
    }
    throw new HttpError(400, "ac\u021Biune necunoscut\u0103");
  } catch (e) {
    fail(res, e);
  }
}

// server/sync.ts
async function handler15(req, res) {
  try {
    if (req.method !== "POST") throw Object.assign(new Error("POST"), { status: 405 });
    const u = await requireUser(req);
    const user = await loadUser(u.id);
    const reports = await syncUser(u.id, 3);
    const today = todayIn(user.tz);
    const goal = user.goal && user.goal !== "full" ? user.goal : "70.3";
    const score2 = await rescore(u.id, today, goal);
    json(res, 200, { lastSync: (/* @__PURE__ */ new Date()).toISOString(), reports, scored: score2.scored, unplanned: score2.unplanned, bar: score2.bar });
  } catch (e) {
    fail(res, e);
  }
}

// server/webhooks/strava.ts
async function handler16(req, res) {
  try {
    if (req.method === "GET") {
      if (q(req, "hub.verify_token") !== (process.env.STRAVA_VERIFY_TOKEN ?? "")) {
        json(res, 403, { error: "verify token gre\u0219it" });
        return;
      }
      json(res, 200, { "hub.challenge": q(req, "hub.challenge") });
      return;
    }
    const ev = await readJson(req);
    if (ev.object_type === "activity") {
      const row = await one("oauth_tokens", { provider: "eq.strava", external_user_id: `eq.${ev.owner_id}` });
      if (row) await syncUser(row.user_id, 3);
    }
    json(res, 200, { ok: true });
  } catch (e) {
    fail(res, e);
  }
}

// server/webhooks/whoop.ts
import { createHmac as createHmac4, timingSafeEqual as timingSafeEqual2 } from "node:crypto";
async function handler17(req, res) {
  try {
    const chunks = [];
    for await (const c of req) chunks.push(typeof c === "string" ? Buffer.from(c) : c);
    const raw = Buffer.concat(chunks).toString("utf8");
    const sig = String(req.headers["x-whoop-signature"] ?? "");
    const ts = String(req.headers["x-whoop-signature-timestamp"] ?? "");
    const expected = createHmac4("sha256", process.env.WHOOP_CLIENT_SECRET ?? "").update(ts + raw).digest("base64");
    if (!sig || sig.length !== expected.length || !timingSafeEqual2(Buffer.from(sig), Buffer.from(expected))) {
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

// server/router.ts
var STATIC = {
  "account/signup": handler,
  "agents/run": handler2,
  config: handler3,
  "cron/evening": handler4,
  "cron/morning": handler5,
  "cron/sync": handler6,
  me: handler9,
  "plan/generate": handler12,
  setup: handler13,
  admin: handler14,
  sync: handler15,
  "webhooks/strava": handler16,
  "webhooks/whoop": handler17,
  "webhooks/apple": handler7
};
function resolve(path) {
  const p = path.replace(/^\/+|\/+$/g, "").replace(/^api\//, "");
  if (STATIC[p]) return { handler: STATIC[p], params: {} };
  let m = /^forms\/([^/]+)$/.exec(p);
  if (m) return { handler: handler8, params: { kind: m[1] } };
  m = /^oauth\/([^/]+)\/(start|callback)$/.exec(p);
  if (m) return { handler: m[2] === "start" ? handler11 : handler10, params: { provider: m[1] } };
  return null;
}
async function handler18(req, res) {
  const raw = req.query.__p;
  const fromQuery = Array.isArray(raw) ? raw.join("/") : raw;
  const path = fromQuery ?? new URL(req.url ?? "/", "http://x").pathname;
  const r2 = resolve(path);
  if (!r2) {
    fail(res, new HttpError(404, `nu exist\u0103 /api/${path}`));
    return;
  }
  await hydrateSettings();
  const fromUrl = {};
  try {
    new URL(req.url ?? "/", "http://x").searchParams.forEach((v, k) => {
      if (k !== "__p") fromUrl[k] = v;
    });
  } catch {
  }
  const { __p: _drop, ...rest } = req.query;
  req.query = { ...fromUrl, ...rest, ...r2.params };
  await r2.handler(req, res);
}
export {
  handler18 as default,
  resolve
};
