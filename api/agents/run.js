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
async function requireUser(req) {
  const token = bearer(req);
  if (!token) throw new HttpError(401, "f\u0103r\u0103 token");
  const res = await fetch(`${ENV.supabaseUrl()}/auth/v1/user`, { headers: { apikey: ENV.supabaseAnon(), authorization: `Bearer ${token}` } });
  if (!res.ok) throw new HttpError(401, "token invalid sau expirat");
  const u = await res.json();
  return { id: u.id, email: u.email };
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
function weekday(iso) {
  const js = toUtc(iso).getUTCDay();
  return (js + 6) % 7;
}
function weekStart(iso) {
  return addDays(iso, -weekday(iso));
}

// src/calendar/phases.ts
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
function phaseWeeks(startDate, raceDate) {
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
        recovery: phase !== "taper" && w % 4 === 3
      });
      index += 1;
    }
  }
  return weeks;
}

// server/_lib/collect.ts
function toPlanned(r) {
  return {
    id: r.id,
    date: r.date,
    sport: r.sport,
    type: r.type,
    plannedMinutes: r.planned_minutes,
    targetZones: r.target_zones,
    key: r.is_key,
    step: r.step ?? void 0,
    structure: r.structure ?? void 0,
    intervals: r.intervals ?? void 0,
    status: r.status,
    note: r.note ?? void 0
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
    note: w.note ?? null
  };
}
function toSourceActivity(r) {
  return {
    id: r.id,
    externalId: r.external_id,
    source: r.source,
    date: r.date,
    startLocal: r.start_local,
    sport: r.sport,
    minutes: r.minutes,
    distanceKm: r.distance_km,
    avgHr: r.avg_hr,
    maxHr: r.max_hr,
    avgPaceMinKm: r.avg_pace_min_km,
    avgCadence: r.avg_cadence,
    avgWatts: r.avg_watts,
    timeInZonesMin: r.time_in_zones_min ?? null,
    name: r.name
  };
}
function toSourceDaily(r) {
  return { date: r.date, source: r.source, hrv: r.hrv, rhr: r.rhr, sleepMin: r.sleep_min, bedtime: r.bedtime, wakeTime: r.wake_time, sleepScore: r.sleep_score, recoveryScore: r.recovery_score, respiratoryRate: r.respiratory_rate, weightKg: r.weight_kg, bodyFatPct: r.body_fat_pct };
}
async function loadUser(userId) {
  const u = await one("users", { id: `eq.${userId}` });
  if (!u) throw new Error("utilizator inexistent");
  return u;
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
async function loadWellness(userId, from) {
  const rows = await select("wellness_daily", { user_id: `eq.${userId}`, date: `gte.${from}` }, { order: "date.desc", limit: 500 });
  return rows.map(toSourceDaily);
}
async function loadForms(userId, today) {
  const morningRow = await one("questionnaires", { user_id: `eq.${userId}`, kind: "eq.dimineata", for_date: `eq.${today}` }, { order: "created_at.desc" });
  const eveningRows = await select("questionnaires", { user_id: `eq.${userId}`, kind: "eq.seara", for_date: `gte.${addDays(today, -14)}` }, { order: "created_at.desc", limit: 50 });
  const intakeRow = await one("questionnaires", { user_id: `eq.${userId}`, kind: "eq.intrare" }, { order: "created_at.desc" });
  return { morning: morningRow?.answers ?? null, evenings: eveningRows.map((r) => r.answers), intake: intakeRow?.answers ?? null };
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
async function loadLabs(userId) {
  const l = await one("labs", { user_id: `eq.${userId}` }, { order: "drawn_at.desc" });
  return l ? { feritina: l.feritina, vitamina_d: l.vitamina_d, hemoglobina: l.hemoglobina, ck: l.ck, crp: l.crp, data_analize: l.drawn_at } : null;
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
  const input = {
    today,
    event,
    athlete: { obiectiv: `${user.race_name ?? "curs\u0103"}${user.race_date ? `, ${user.race_date}` : ""}`, raceDate: user.race_date ?? addDays(today, 365), phase },
    wellness,
    activities,
    plan: planRes.workouts,
    zones,
    morning: forms.morning,
    evenings: forms.evenings,
    labs,
    load: null,
    aviz
  };
  return { input, user, planId: planRes.planId };
}

// src/collector/packet.ts
var SPORTS = ["inot", "bicicleta", "alergare", "forta"];
var DAY_NAMES = ["luni", "marti", "miercuri", "joi", "vineri", "sambata", "duminica"];
var PRIORITY = { whoop: 0, oura: 1, garmin: 2, athletedata: 3, manual: 4, strava: 9 };
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
function garminHrvOffset(rows) {
  const byDate = /* @__PURE__ */ new Map();
  for (const r of rows) {
    if (r.hrv == null) continue;
    const e = byDate.get(r.date) ?? {};
    if (r.source === "whoop") e.whoop = r.hrv;
    if (r.source === "garmin") e.garmin = r.hrv;
    byDate.set(r.date, e);
  }
  const diffs = [...byDate.values()].filter((e) => e.whoop != null && e.garmin != null).map((e) => e.whoop - e.garmin);
  return diffs.length >= 7 ? mean(diffs) : null;
}
function mergeWellness(rows) {
  const offset = garminHrvOffset(rows);
  const byDate = /* @__PURE__ */ new Map();
  for (const r of rows) byDate.set(r.date, [...byDate.get(r.date) ?? [], r]);
  const out = [];
  for (const [date, list] of byDate) {
    const sorted = [...list].sort((a, b) => (PRIORITY[a.source] ?? 5) - (PRIORITY[b.source] ?? 5));
    const pick = (k, transform) => {
      for (const r of sorted) {
        const v = transform ? transform(r) : r[k];
        if (v != null) return { v, src: r.source };
      }
      return { v: null, src: null };
    };
    const hrv = pick("hrv", (r) => r.hrv == null ? null : r.source === "garmin" && offset != null ? r.hrv + offset : r.hrv);
    const rhr = pick("rhr");
    const sleeps = sorted.filter((r) => r.sleepMin != null).map((r) => r.sleepMin);
    const sleepSources = sorted.filter((r) => r.sleepMin != null).map((r) => r.source);
    const bedtime = sorted.find((r) => r.bedtime)?.bedtime ?? null;
    const sleepScore = pick("sleepScore");
    const recovery = pick("recoveryScore");
    const weight = pick("weightKg");
    const fat = pick("bodyFatPct");
    out.push({
      date,
      hrv: round(hrv.v, 1),
      rhr: rhr.v == null ? null : Math.round(rhr.v),
      sleepMin: sleeps.length ? Math.round(mean(sleeps)) : null,
      bedtime,
      sleepScore: sleepScore.v,
      recoveryScore: recovery.v,
      weightKg: weight.v,
      bodyFatPct: fat.v,
      sources: { hrv: hrv.src, puls_repaus: rhr.src, somn: sleepSources.length ? sleepSources.join("+") : null, recuperare: recovery.src }
    });
  }
  return out.sort((a, b) => diffDays(a.date, b.date));
}
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
  const todayRow = merged.find((r) => r.date === today) ?? null;
  const last = (n, from = 1) => merged.filter((r) => diffDays(r.date, today) >= from && diffDays(r.date, today) <= from + n - 1);
  const prev7 = last(7);
  const prev60 = last(60);
  const hrv7 = prev7.map((r) => r.hrv).filter((x) => x != null);
  const hrv60 = prev60.map((r) => r.hrv).filter((x) => x != null);
  const rhr7 = prev7.map((r) => r.rhr).filter((x) => x != null);
  const rhr60 = prev60.map((r) => r.rhr).filter((x) => x != null);
  const sleep7 = prev7.map((r) => r.sleepMin).filter((x) => x != null);
  const baseline60 = hrv60.length >= 14 ? round(mean(hrv60), 1) : null;
  const sd60 = hrv60.length >= 14 ? round(sd(hrv60), 2) : null;
  let zileSubPrag = 0;
  if (baseline60 != null && sd60 != null) {
    const prag = baseline60 - sd60;
    for (const r of [todayRow, ...prev7].filter((x) => x != null)) {
      if (r.hrv != null && r.hrv < prag) zileSubPrag += 1;
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
  const weights = merged.filter((r) => r.weightKg != null && diffDays(r.date, today) >= 0 && diffDays(r.date, today) <= 6);
  const lastWeight = merged.find((r) => r.weightKg != null) ?? null;
  const nutYesterday = input.nutrition?.find((n) => n.date === yesterday) ?? null;
  return {
    meta: {
      data: today,
      zi_saptamana: DAY_NAMES[weekday(today)],
      eveniment: input.event,
      faza: input.athlete.phase,
      obiectiv: input.athlete.obiectiv,
      zile_pana_la_cursa: diffDays(today, input.athlete.raceDate),
      surse: { ...todayRow?.sources ?? { hrv: null, puls_repaus: null, somn: null, recuperare: null }, activitati: [...new Set(acts.map((a) => a.source))].join("+") || null, incarcare: input.load?.source ?? null }
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
      scor_producator: todayRow?.recoveryScore ?? null,
      hooper: {
        somn: input.morning?.hooper.somn ?? null,
        oboseala: input.morning?.hooper.oboseala ?? null,
        stres: input.morning?.hooper.stres ?? null,
        dureri: input.morning?.hooper.dureri ?? null,
        suma: input.morning && [input.morning.hooper.somn, input.morning.hooper.oboseala, input.morning.hooper.stres, input.morning.hooper.dureri].every((x) => x != null) ? input.morning.hooper.somn + input.morning.hooper.oboseala + input.morning.hooper.stres + input.morning.hooper.dureri : null
      }
    },
    incarcare: {
      acwr: acwr(acts, today),
      acwr_sport: { inot: acwr(acts, today, "inot"), bicicleta: acwr(acts, today, "bicicleta"), alergare: acwr(acts, today, "alergare"), forta: acwr(acts, today, "forta") },
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
      tip_neplanificat: inPlan ? null : evening?.tip_neplanificat ?? null
    } : null,
    plan_azi: planToday ? { sport: planToday.sport, tip: planToday.type === "z2" ? "Z2" : planToday.type, durata_planificata: planToday.plannedMinutes, zone_tinta: planToday.targetZones, structura: planToday.structure ?? null, cheie: planToday.key } : null,
    plan_maine: planTomorrow ? { sport: planTomorrow.sport, tip: planTomorrow.type === "z2" ? "Z2" : planTomorrow.type, durata_planificata: planTomorrow.plannedMinutes, cheie: planTomorrow.key } : null,
    plan_saptamana: { interval: `${monday} \u2013 ${addDays(monday, 6)}${input.athlete.weekLabel ? `, ${input.athlete.weekLabel}` : ""}`, zile },
    verdict_fiziolog: null,
    zone: input.zones,
    corp: {
      greutate_azi: todayRow?.weightKg ?? null,
      greutate_media7: weights.length ? round(mean(weights.map((r) => r.weightKg)), 1) : null,
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

// src/agents/schema.ts
var SPECIALIST_SCHEMA = {
  type: "object",
  properties: {
    agent: { type: "string", enum: ["fiziolog", "antrenor_inot", "antrenor_bicicleta", "antrenor_alergare", "nutritionist", "fizioterapeut", "minte"] },
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
var AGENTS = ["fiziolog", "antrenor_inot", "antrenor_bicicleta", "antrenor_alergare", "nutritionist", "fizioterapeut", "minte"];
var VERDICTS = ["ok", "atentie", "stop", "tacere", "verde", "galben", "rosu"];
var MAX_CE = { fiziolog: 4, antrenor_inot: 4, antrenor_bicicleta: 4, antrenor_alergare: 4, nutritionist: 4, fizioterapeut: 3, minte: 2 };
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
    for (const n of numbersIn(item.text)) {
      const idx = coveredValues.findIndex((v) => Math.abs(v - n) < 0.051);
      if (idx >= 0) coveredValues.splice(idx, 1);
      else reasons.push(`num\u0103r f\u0103r\u0103 c\xE2mp: ${n}`);
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
function anthropicClient(apiKey, fetchImpl = fetch) {
  return {
    async json(req) {
      const res = await fetchImpl("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({
          model: req.model,
          max_tokens: req.maxTokens ?? 1500,
          system: req.system,
          messages: [{ role: "user", content: req.user }],
          output_config: { format: { type: "json_schema", schema: req.schema } }
        })
      });
      if (!res.ok) throw new Error(`model ${res.status}: ${await res.text()}`);
      const data = await res.json();
      const text = data.content.find((b) => b.type === "text")?.text;
      if (!text) throw new Error("model: r\u0103spuns f\u0103r\u0103 text");
      return JSON.parse(text);
    }
  };
}
var COACH_OF = { inot: "antrenor_inot", bicicleta: "antrenor_bicicleta", alergare: "antrenor_alergare", forta: null };
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
    const SPORT = { inot: "\xCENOT", bicicleta: "BICICLET\u0102", alergare: "ALERGARE" }[sport] ?? sport.toUpperCase();
    const common = prompts.antrenor_comun.replace(/<SPORT>/g, SPORT).replace(/<sport>/g, sport);
    const own = prompts[agent];
    return `${common}
${own}

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
    else for (const n of numbersIn(obj)) out.push(n);
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
  for (const n of numbersIn(text)) {
    if (!allowed.some((v) => Math.abs(v - n) < 0.051)) problems.push(`num\u0103r f\u0103r\u0103 surs\u0103 \xEEn pachet sau la speciali\u0219ti: ${n}`);
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
  return ev;
}
var RANK = { verde: 0, galben: 1, rosu: 2, stop: 3 };
function physVerdict(v, p) {
  const missingBasics = p.somn.durata_min == null || p.hrv.azi == null;
  let out = "galben";
  if (v && (v.verdict === "verde" || v.verdict === "galben" || v.verdict === "rosu" || v.verdict === "stop")) out = v.verdict;
  else if (v?.verdict === "ok") out = "verde";
  else if (v?.verdict === "atentie") out = "galben";
  if (missingBasics && RANK[out] < RANK.galben) out = "galben";
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
  let head = await client.json({ model: models.head, system: prompts.head_coach, user: headUser(packetWithVerdict, specialists, input.journal), schema: HEAD_SCHEMA, maxTokens: 2e3 });
  let headWarnings = [...verifyHeadText(head.mesaj, packetWithVerdict, specialists), ...verifyHeadText(head.memento, packetWithVerdict, specialists)];
  if (RANK[head.decizie] < RANK[decision]) headWarnings.push(`decizia head coach-ului (${head.decizie}) e mai permisiv\u0103 dec\xE2t a Fiziologului (${decision}); se p\u0103streaz\u0103 ${decision}`);
  let fallbackUsed = false;
  if (headWarnings.length) {
    const retry = await client.json({
      model: models.head,
      system: prompts.head_coach,
      user: `${headUser(packetWithVerdict, specialists, input.journal)}

=== VERIFICAREA PRIMEI VARIANTE A RESPINS ===
${headWarnings.join("\n")}
Rescrie f\u0103r\u0103 aceste cifre sau cu c\xE2mpul lor corect. Decizia nu poate fi mai permisiv\u0103 dec\xE2t ${decision}.`,
      schema: HEAD_SCHEMA,
      maxTokens: 2e3
    });
    const again = [...verifyHeadText(retry.mesaj, packetWithVerdict, specialists), ...verifyHeadText(retry.memento, packetWithVerdict, specialists)];
    if (again.length === 0 && RANK[retry.decizie] >= RANK[decision]) {
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
  if (RANK[head.decizie] > RANK[decision]) decision = head.decizie;
  head = { ...head, decizie: decision };
  return { routed, specialists, head, headWarnings, events: eventsFrom(packetWithVerdict, decision), decision, fallbackUsed };
}

// src/prompts/bundle.ts
var PROMPTS = {
  head_coach: 'E\u0219ti HEAD COACH-ul, coordonatorul preg\u0103tirii individuale pentru triatlon. Obiectivul \u0219i data sunt \xEEn pachet (meta.obiectiv, meta.zile_pana_la_cursa); pentru Ironman 70.3 asta \xEEnseamn\u0103 \xEEnot 1,9 km, biciclet\u0103 90 km \u0219i alergare 21,1 km.\n\nMISIUNEA TA\nConstruie\u0219ti \u0219i adaptezi un plan realist pentru obiectivul sportivului, folosind datele disponibile \u0219i rapoartele agen\u021Bilor specializa\u021Bi. Urm\u0103re\u0219ti progresul sus\u021Binut, recuperarea \u0219i compatibilitatea cu via\u021Ba sportivului.\nPlanul trebuie s\u0103 fie suficient de solicitant pentru progres \u0219i suficient de adaptabil ca s\u0103 poat\u0103 fi urmat. Nu maximizezi confortul, volumul sau scorurile de pe br\u0103\u021B\u0103ri. Nu promi\u021Bi finalizarea cursei \u0219i nu ascunzi c\xE2nd obiectivul e insuficient sus\u021Binut de date: c\xE2nd bara de preg\u0103tire sau istoricul nu sus\u021Bin cursa la data ei, o spui o dat\u0103, cu cifrele, \u0219i propui ce se m\u0103soar\u0103 mai departe.\nTu comunici concluzia principal\u0103 sportivului. Agen\u021Bii furnizeaz\u0103 expertiz\u0103 \u0219i propuneri; nu modific\u0103 independent calendarul. Calendarul se schimb\u0103 prin regulile programului (readiness, durere, febr\u0103, activitate \xEEn afara planului), pe baza verdictelor pe care le confirmi tu.\n\nECHIPA TA\n1. Fiziolog: capacitate de efort, teste, zone, \xEEnc\u0103rcare \u0219i recuperare. D\u0103 verdictul zilei: verde / galben / ro\u0219u / stop.\n2. Antrenor de \xEEnot: nivel, tehnic\u0103, rezisten\u021B\u0103, bazin \u0219i ape deschise.\n3. Antrenor de biciclet\u0103: nivel, putere, rezisten\u021B\u0103, pozi\u021Bie \u0219i efort specific.\n4. Antrenor de alergare: nivel, ritm, toleran\u021B\u0103 la impact \u0219i progresie.\n5. Nutri\u021Bionist: mese, alimentare \xEEn efort, hidratare, toleran\u021B\u0103 digestiv\u0103, suplimente doar din analize.\n6. Fizioterapeut: dureri, \xEEnc\u0103rcare f\u0103r\u0103 impact, cele dou\u0103 exerci\u021Bii de preven\u021Bie; escaladare la om.\n7. Minte: motiva\u021Bie, a\u0219tept\u0103ri \u0219i rutin\u0103; nu s\u0103n\u0103tate mintal\u0103.\n\nCE PRIME\u0218TI\n(1) Pachetul de date JSON al evenimentului (diminea\u021Ba / dup\u0103 antrenament / s\u0103pt\u0103m\xE2nal). Orice cifr\u0103 pe care o spui vine de aici sau dintr-un r\xE2nd acceptat al unui specialist.\n(2) R\u0103spunsurile speciali\u0219tilor ruta\u021Bi, \xEEn JSON, deja trecute prin verificarea mecanic\u0103: fiecare r\xE2nd din "ce" are "stare": "acceptat" sau "respins" cu motivul. Folose\u0219ti doar r\xE2ndurile acceptate.\n(3) jurnal.md: deciziile ultimelor 14 zile \u0219i respingerile.\n\nCE FACI, \xCEN ORDINEA ASTA\n1. Dac\u0103 vreun specialist a dat "stop", mesajul t\u0103u con\u021Bine doar oprirea \u0219i cu cine vorbe\u0219te sportivul azi (cardiolog / fizioterapeut / medic). Nimic altceva.\n2. Decizia zilei = verdictul Fiziologului; o po\u021Bi face doar mai strict\u0103, niciodat\u0103 mai permisiv\u0103. Ro\u0219u \xEEnseamn\u0103 f\u0103r\u0103 antrenament azi, oricare ar fi p\u0103rerea antrenorilor. Galben \xEEnseamn\u0103 aceea\u0219i durat\u0103 cu intensitate cobor\xE2t\u0103 la Z1\u2013Z2, sau volum \u221220\u201330%.\n3. Conflict \xEEntre speciali\u0219ti: c\xE2\u0219tig\u0103 ordinea siguran\u021B\u0103 > recuperare > performan\u021B\u0103 > nutri\u021Bie > longevitate. Notezi conflictul \xEEn jurnal \xEEntr-un r\xE2nd.\n4. Scrii un singur mesaj, \xEEn formatul evenimentului:\n   - diminea\u021Ba: Decizia / Azi / M\xE2ncare / De urm\u0103rit \u2014 maximum 12 r\xE2nduri;\n   - dup\u0103 antrenament: Ce a fost / Ce \xEEnseamn\u0103 / M\xE2ine / M\u0103n\xE2nc\u0103 acum \u2014 maximum 5 r\xE2nduri;\n   - duminica: ce a mers, ce nu, s\u0103pt\u0103m\xE2na urm\u0103toare \u2014 maximum 20 de r\xE2nduri.\n   Cifrele r\u0103m\xE2n cu c\xE2mpul lor, \xEEn paranteze p\u0103trate: "HRV 27,9 ms [hrv.azi]".\n5. Scrii un memento: un singur r\xE2nd cu un fapt adev\u0103rat din datele sportivului (cea mai lung\u0103 \u0219edin\u021B\u0103, o serie de zile, o cifr\u0103 care a crescut), cu c\xE2mpul lui. F\u0103r\u0103 citate, f\u0103r\u0103 \xEEndemnuri. Dac\u0103 nu exist\u0103 niciun fapt nou, mementoul e ziua din plan: "Ziua N din M".\n6. Scrii decizia zilei \xEEn jurnal: data, verdictul, ce s-a schimbat fa\u021B\u0103 de plan, de ce (un c\xE2mp). Plus "respins: <agent> - <text> (<motiv>)" pentru fiecare r\xE2nd respins.\n\nREGULI\n- Nu adaugi nimic ce nu vine de la un specialist rutat sau din pachet. Nu explici fiziologie, nu citezi studii, nu motivezi.\n- Nu negociezi un ro\u0219u \u0219i nu cre\u0219ti nimic peste planul s\u0103pt\u0103m\xE2nii.\n- Rom\xE2n\u0103, direct, informal, f\u0103r\u0103 apelative, f\u0103r\u0103 laude. O singur\u0103 \xEEntrebare, doar dac\u0103 lipse\u0219te un c\xE2mp care schimb\u0103 decizia.\n- Dac\u0103 lipsesc somnul sau HRV-ul, o spui \xEEn prima linie \u0219i decizia e cel mult galben\u0103.\n- Dac\u0103 lipse\u0219te formularul de diminea\u021B\u0103 (hooper, semnale), o spui \xEEntr-un r\xE2nd \u0219i ceri s\u0103 fie completat; condi\u021Biile de stop nu pot fi verificate f\u0103r\u0103 el.\n- R\u0103spunzi DOAR cu JSON-ul cerut (decizie, mesaj, memento, jurnal, intrebare).\n',
  format: 'Formatul raspunsului oricarui specialist: DOAR acest JSON, fara text inainte sau dupa.\n\n{\n  "agent": "fiziolog | antrenor_inot | antrenor_bicicleta | antrenor_alergare | nutritionist | fizioterapeut | minte",\n  "verdict": "ok | atentie | stop | tacere",          // Fiziologul dimineata: "verde | galben | rosu | stop"\n  "ce": [                                             // maximum 4 elemente; gol cand verdict = tacere\n    { "text": "HRV 27,9 ms, peste prag", "cifre": [ { "valoare": 27.9, "camp": "hrv.azi" } ] }\n  ],\n  "mese": ["ovaz 70 g cu iaurt 200 g", "..."],       // doar nutritionistul dimineata, maximum 3\n  "pentru_viitor": "un singur rand, sau \\"-\\"",\n  "lipseste": ["readiness.hooper.somn", "zone.alergare.fc_z1_z5"]\n}\n\nReguli:\n- Fiecare numar din "text" are o intrare in "cifre": "camp" = calea exacta din pachet (ex. "incarcare.ore_7z.inot") si "valoare" = valoarea din pachet, neschimbata. Un numar fara intrare => randul e respins mecanic.\n- Un numar care nu e o data, ci o prescriptie a ta (10 min incalzire, 3 x 15 repetari) sau un prag de regula (ACWR 1,5) primeste "camp": "prescriptie", respectiv "camp": "regula". Nu le folosesti ca sa strecori date.\n- Nu rotunjesti, nu aproximezi ("~140"), nu estimezi un camp null: il pui in "lipseste" si atat.\n- Nerutat (nu e sportul tau, nu e declansatorul tau, nu e duminica): "verdict": "tacere", "ce": [], "pentru_viitor" cu randul tau pentru fisierul propriu sau "-", "lipseste": [].\n- "pentru_viitor" e un singur rand. "lipseste" contine doar cai de campuri care exista in schema pachetului si sunt null.\n',
  fiziolog: 'Esti FIZIOLOGUL echipei. Primesti pachetul de date JSON si fisierul tau fiziolog.md (zone, praguri, baseline-uri, maximum 30 de randuri).\n\nDimineata dai VERDICT pentru azi, dupa regulile astea, in ordine:\n- stop: semnale.simptom_cardiac = da, sau semnale.febra = da, sau puls_repaus.azi >= media7 + 10 cu semnale.boala = da. Scrii un rand: stop + cardiolog / medic.\n- rosu: hrv.azi sub (baseline60 - sd60) a doua zi la rand; sau somn.durata sub 5 h; sau incarcare.acwr peste 1,5; sau incarcare.tsb sub -30; sau suma hooper >= 24; sau doua conditii de galben in acelasi timp.\n- galben: hrv.azi sub (baseline60 - sd60) o zi; sau puls_repaus.azi >= media7 + 5; sau somn.durata sub 6 h; sau somn.ora_culcare dupa 00:00; sau incarcare.acwr peste 1,3; sau suma hooper intre 20 si 23.\n- verde: niciuna de mai sus.\n\nDupa antrenament scrii in CE: incarcarea actualizata (acwr, tsb, ore pe sport in 7 zile) si daca sedinta a iesit in zona planificata (timp_zone fata de plan_azi.zone_tinta). Nimic despre tehnica sau despre maine.\n\nLa retest sau CPET nou rescrii zonele in fiziolog.md din campurile zone.* si scrii in CE ce s-a schimbat, cu valorile vechi si noi.\n\nReguli:\n- Fiecare cifra cu campul ei. Camp null = "lipseste: <camp>"; fara somn si fara HRV verdictul e cel mult galben.\n- Nu propui antrenamente, nu dai sfaturi de nutritie, nu interpretezi analize (doar le semnalezi: feritina sub 30 -> "de discutat cu nutritionistul si medicul").\n- Nu schimbi zone fara un camp zone.data_test mai nou decat cel din fisierul tau.\n- Raspunzi doar in formatul JSON din format.md. Maximum 4 randuri in "ce".\n- Daca nu esti rutat (nu e sportul tau / nu e declansatorul tau / nu e duminica): verdict "tacere", ce gol. Nu scrii nimic pentru sportiv.\n',
  antrenor_comun: 'Esti ANTRENORUL DE <SPORT>. Primesti pachetul de date JSON, fisierul tau <sport>.md (maximum 30 de randuri: ce a mers, ce nu, ultimele teste) si planul saptamanii.\n\nDimineata, doar daca plan_azi.sport este sportul tau: scrii in CE sedinta de azi in 3 randuri (incalzire / set principal / revenire), cu zonele luate din zone.<sport>.* in unitatile sportivului (bpm, min/km, W sau s/100 m). Daca Fiziologul a dat galben, scrii direct versiunea redusa.\n\nDupa antrenament, doar daca antrenament_ultim.sport este sportul tau: compari executia cu planul (timp_zone fata de plan_azi.zone_tinta, pace sau putere fata de tinta, rpe fata de asteptari) si dai cel mult un singur indiciu tehnic. Fara laude, fara teorie.\n\nCand s-a antrenat alt sport: nu raspunzi sportivului. Scrii un rand in <sport>.md la PENTRU_VIITOR cu incarcarea care conteaza pentru sedinta ta urmatoare: fc_max, timp in Z4-Z5, rpe, durere.loc. Daca sedinta cealalta a fost grea (rpe >= 7 sau timp in Z4-Z5 peste 15 min), sedinta ta urmatoare coboara o treapta de intensitate.\n\nReguli:\n- Fiecare cifra cu campul ei; nicio zona din memorie: doar zone.* din pachet.\n- Nu depasesti planul saptamanii si nu adaugi sedinte. aviz.intensitate_permisa = Z2 inseamna ca propui doar Z1-Z2, indiferent de faza.\n- Nu vorbesti despre nutritie, suplimente sau durere; doar le semnalezi daca apar in pachet.\n- Raspunzi doar in formatul JSON din format.md. Maximum 4 randuri in "ce".\n- Daca nu esti rutat (nu e sportul tau / nu e declansatorul tau / nu e duminica): verdict "tacere", ce gol. Nu scrii nimic pentru sportiv.\n',
  antrenor_inot: "Sportivul e incepator: tehnica inainte de volum. 3 sedinte pe saptamana de maximum 45 min: 200 m incalzire, 400-600 m exercitii de tehnica (un singur element pe sedinta), set principal scurt, 100 m revenire.\nPana cand zone.inot.css este null, nu dai paceuri: dai distante si pauze. CSS se testeaza abia cand sportivul a inotat 400 m continuu (noteaza in inot.md cand s-a intamplat).\nApe deschise: niciodata singur, cu geamandura, primele iesiri cu antrenorul de inot uman; nu propui ape deschise sub 16 grade fara wetsuit.\nIndiciul tehnic de dupa antrenament e unul singur si se repeta pana apare in date (cadenta de brat, distanta pe brat) sau pana il confirma antrenorul uman.\n",
  antrenor_bicicleta: 'Zonele pe putere (zone.bicicleta.ftp) daca exista senzor, altfel pe fc de bicicleta (zone.bicicleta.fc_z1_z5), niciodata pe fc de alergare.\nIarna pe trainer; tura lunga creste cu 15-20 min la doua saptamani, pana la 3-3,5 h in build; brick de 15 min alergare dupa tura lunga din baza 2.\nCadenta tinta 85-95; daca cadenta medie e sub 80 in Z2, indiciul tehnic e cadenta, nu puterea.\nDurere de genunchi sau spate pe bicicleta (durere.loc) -> semnalezi "bike fit" la PENTRU_VIITOR si Fizio, nu propui tu reglaje.\n',
  antrenor_alergare: 'Zonele din zone.alergare.* (CPET sau test de teren), nu din estimarile ceasului. O singura sedinta de calitate pe saptamana in baza; a doua doar in build si doar cu aviz.intensitate_permisa = toate.\nAlergarea lunga creste cu maximum 10 min pe saptamana si nu depaseste 1 h 45.\ndurere.scor >= 3 la gamba, tibie, tendon sau genunchi: propui inlocuirea cu bicicleta sau inot la aceeasi durata; nu propui alergare "usoara" peste durere.\nDupa o tura lunga de bicicleta sau un brick, sedinta de alergare urmatoare e Z1-Z2, oricat de bine arata readiness-ul.\n',
  nutritionist: 'Esti NUTRITIONISTUL echipei. Primesti pachetul de date JSON si fisierul nutritie.md (tintele pe tip de zi din protocol: carbohidrati 3-5 / 5-7 / 6-10 / 10-12 g pe kg, proteine 1,8-2 g pe kg, fueling 30-60-90 g pe ora dupa durata, sodiul din testul de transpiratie, lista de alimente pe care sportivul le mananca si nu le mananca).\n\nDimineata scrii in CE: tipul de zi (din plan_azi.tip si durata_planificata), carbohidratii si proteinele zilei in grame (greutate = corp.greutate_media7), ce se mananca inainte de sedinta si ce se ia in timpul ei (grame de carbohidrati pe ora si lichid), si 3 exemple concrete de mese, un rand fiecare.\nDupa antrenament raspunzi doar daca urmeaza o sedinta in sub 24 h: un rand cu ce se mananca in prima ora (1-1,2 g/kg carbohidrati + 0,4 g/kg proteine).\nLa analize noi: compari analize.* cu pragurile din nutritie.md (feritina sub 30, vitamina D sub pragul laboratorului) si spui ce supliment e justificat, in ce doza, si ca decizia o ia medicul. Suplimente de performanta doar cafeina, nitrati, creatina, si doar testate in antrenament.\n\nReguli:\n- Fiecare cifra cu campul ei. Fara corp.greutate_media7 nu dai grame, dai g/kg si "lipseste: corp.greutate_media7".\n- Nu propui deficit caloric in build sau peak; in baza, maximum 300 kcal pe zi si doar daca corp.greutate_media7 e stabila sau in crestere. Scadere peste 0,7 kg pe saptamana in build -> cresti carbohidratii, nu comentezi antrenamentul.\n- Nu recomanzi un supliment fara un camp din analize.* sau fara una dintre cele trei exceptii. Nu interpretezi lipide, hormoni sau markeri cardiaci: ii semnalezi medicului.\n- Fara retete lungi, fara branduri; alimente simple pe care sportivul le are deja in nutritie.md.\n- Raspunzi doar in formatul JSON din format.md. Maximum 4 randuri in "ce", plus cele 3 exemple de mese dimineata, in "mese".\n- Daca nu esti rutat (nu e sportul tau / nu e declansatorul tau / nu e duminica): verdict "tacere", ce gol. Nu scrii nimic pentru sportiv.\n',
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
`
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
      if (x.type === "calitate" || x.type === "lung" || x.type === "brick") {
        x.targetZones = [1, 2];
        x.plannedMinutes = Math.round(x.plannedMinutes * 0.75 / 5) * 5;
        x.intervals = void 0;
        x.note = "galben: Z1\u2013Z2, volum \u221225%";
        changes.push(`${x.id}: redus (galben)`);
      }
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
  const sameSport = plan.filter((x) => x.status === "planificat" && x.sport === a.sport && inWeek(x.date) && diffDays(a.date, x.date) > 0).sort((p, q) => diffDays(q.date, p.date) || Number(p.key) - Number(q.key));
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

// server/_lib/agents.ts
var FILE_MAX_LINES = 30;
async function loadAgentFiles(userId) {
  const rows = await select("agent_files", { user_id: `eq.${userId}` });
  return Object.fromEntries(rows.map((r) => [r.agent, r.content]));
}
async function loadJournal(userId, today) {
  const rows = await select("journal", { user_id: `eq.${userId}`, date: `gte.${addDays(today, -14)}` }, { order: "date.asc", limit: 200 });
  return rows.map((r) => `${r.date}: ${r.entry}`);
}
async function loadSchedules(userId) {
  const rows = await select("schedules", { user_id: `eq.${userId}` });
  return rows.map((r) => ({ day: r.day, startMin: r.start_min, endMin: r.end_min }));
}
async function recentKeyScores(userId, today) {
  const rows = await select("scores", { user_id: `eq.${userId}` }, { select: "color,workouts_planned!inner(date,is_key)", limit: 100 });
  return rows.filter((r) => r.workouts_planned.is_key && r.workouts_planned.date >= addDays(today, -14)).map((r) => ({ date: r.workouts_planned.date, color: r.color }));
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
  const client = anthropicClient(ENV.modelKey());
  const result = await runPyramid({ packet, files, journal, prompts: PROMPTS, models: { specialist: ENV.modelSpecialist(), head: ENV.modelHead() } }, client);
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
      const r = adapt(plan, ev, ctx);
      plan = r.plan;
      changes.push(...r.changes);
    }
    const before = new Map(input.plan.map((w) => [w.id, JSON.stringify(w)]));
    const changed = plan.filter((w) => before.get(w.id) !== JSON.stringify(w));
    if (changed.length) await upsert("workouts_planned", changed.map((w) => toWorkoutRow(w, userId, planId)), "id");
    if (changes.length) await insert("journal", changes.map((c) => ({ user_id: userId, date: today, entry: `calendar: ${c}` })));
  }
  return { packetId, decision: result.decision, message: result.head.mesaj, memento: result.head.memento, changes, routed: result.routed, rejected: result.specialists.reduce((n, s) => n + s.ce.filter((i) => i.stare === "respins").length, 0), fallbackUsed: result.fallbackUsed };
}

// server/agents/run.ts
async function handler(req, res) {
  try {
    if (req.method !== "POST") throw new HttpError(405, "POST");
    const u = await requireUser(req);
    const user = await loadUser(u.id);
    const body = await readJson(req);
    const out = await runAgents(u.id, todayIn(user.tz), body.event ?? "dimineata", body.force ?? true);
    json(res, 200, out ?? { skipped: "exist\u0103 deja o rulare azi pentru evenimentul \u0103sta" });
  } catch (e) {
    fail(res, e);
  }
}
export {
  handler as default
};
