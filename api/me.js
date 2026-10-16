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
async function loadForms(userId, today) {
  const morningRow = await one("questionnaires", { user_id: `eq.${userId}`, kind: "eq.dimineata", for_date: `eq.${today}` }, { order: "created_at.desc" });
  const eveningRows = await select("questionnaires", { user_id: `eq.${userId}`, kind: "eq.seara", for_date: `gte.${addDays(today, -14)}` }, { order: "created_at.desc", limit: 50 });
  const intakeRow = await one("questionnaires", { user_id: `eq.${userId}`, kind: "eq.intrare" }, { order: "created_at.desc" });
  return { morning: morningRow?.answers ?? null, evenings: eveningRows.map((r) => r.answers), intake: intakeRow?.answers ?? null };
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

// server/_lib/tokens.ts
var PROVIDERS = ["whoop", "strava", "oura"];
function providerConfigured(p) {
  const k = { whoop: "WHOOP_CLIENT_ID", strava: "STRAVA_CLIENT_ID", oura: "OURA_CLIENT_ID" }[p];
  return !!process.env[k];
}
async function connectedProviders(userId) {
  return select("oauth_tokens", { user_id: `eq.${userId}` });
}

// src/collector/packet.ts
var PRIORITY = { whoop: 0, oura: 1, garmin: 2, athletedata: 3, manual: 4, strava: 9 };
function mean(xs) {
  if (xs.length === 0) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
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

// server/_lib/me.ts
async function buildMe(userId, today) {
  const user = await loadUser(userId);
  const from = addDays(today, -42);
  const [{ workouts }, acts, forms, consent, tokens, scoresRows, barRow, readinessRow, messagesRows, wellnessRows, zonesRow, labsRow, lastSyncRows, planRow] = await Promise.all([
    loadPlan(userId, addDays(today, -28), addDays(today, 56)),
    loadActivities(userId, from),
    loadForms(userId, today),
    one("consents", { user_id: `eq.${userId}` }),
    connectedProviders(userId),
    select("scores", { user_id: `eq.${userId}` }, { limit: 400 }),
    one("bar_daily", { user_id: `eq.${userId}` }, { order: "date.desc" }),
    one("readiness_daily", { user_id: `eq.${userId}`, date: `eq.${today}` }),
    select("messages", { user_id: `eq.${userId}` }, { order: "created_at.desc", limit: 20 }),
    select("wellness_daily", { user_id: `eq.${userId}`, date: `gte.${addDays(today, -2)}` }, { limit: 20 }),
    one("zones", { user_id: `eq.${userId}` }),
    one("labs", { user_id: `eq.${userId}` }, { order: "drawn_at.desc" }),
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
    unplanned: unplannedIds.has(a.id),
    tipNeplanificat: eveningByActivity[a.id]?.tip_neplanificat ?? eveningByActivity[a.externalId]?.tip_neplanificat ?? null
  }));
  const merged = mergeWellness(
    wellnessRows.map(
      (r) => ({
        date: r.date,
        source: r.source,
        hrv: r.hrv,
        rhr: r.rhr,
        sleepMin: r.sleep_min,
        bedtime: r.bedtime,
        wakeTime: r.wake_time,
        sleepScore: r.sleep_score,
        recoveryScore: r.recovery_score
      })
    )
  );
  const todayW = merged.find((m) => m.date === today) ?? null;
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
  (labsRow ? have : missing).push("analize de s\xE2nge");
  const clearance = await one("clearances", { user_id: `eq.${userId}` });
  (clearance?.cardiology ? have : missing).push("aviz cardiologic");
  (activities.length ? have : missing).push("istoric de activit\u0103\u021Bi");
  const warnings = [];
  const weekAgo = addDays(today, -14);
  const plannedSwim = planned.filter((w) => w.sport === "inot" && w.date >= weekAgo && w.date < today).reduce((n, w) => n + w.plannedMinutes, 0);
  const doneSwim = activities.filter((a) => a.sport === "inot" && a.date >= weekAgo && a.date < today).reduce((n, a) => n + a.minutes, 0);
  if (plannedSwim >= 90 && doneSwim / plannedSwim < 0.6) {
    warnings.push({ title: "\xCEnot sub plan", text: `Ai \xEEnotat ${Math.round(doneSwim / plannedSwim * 100)}% din minutele planificate \xEEn ultimele dou\u0103 s\u0103pt\u0103m\xE2ni.`, fix: "S\u0103pt\u0103m\xE2na viitoare \u0219edin\u021Bele de \xEEnot se plaseaz\u0103 primele." });
  }
  const testRow = await one("tests", { user_id: `eq.${userId}` }, { order: "tested_at.desc" });
  const bodyRow = await one("wellness_daily", { user_id: `eq.${userId}`, source: "eq.manual", weight_kg: "not.is.null" }, { order: "date.desc" });
  const aviz = intake?.sanatate?.avizCardiolog ?? null;
  const baseline = {
    labs: labsRow ? { data: labsRow.drawn_at, feritina: num(labsRow.feritina), vitamina_d: num(labsRow.vitamina_d), hemoglobina: num(labsRow.hemoglobina), ck: num(labsRow.ck), crp: num(labsRow.crp) } : null,
    tests: testRow?.results ?? null,
    body: bodyRow ? { data: bodyRow.date, greutate: num(bodyRow.weight_kg), grasime_pct: num(bodyRow.body_fat_pct) } : null,
    cardiolog: clearance?.cardiology ? "da" : aviz
  };
  const memento = messagesRows.find((m) => m.kind === "memento" && m.created_at >= `${today}T00:00:00`)?.body ?? null;
  return {
    baseline,
    user: { id: user.id, email: user.email, name: user.name, goal: user.goal, raceName: user.race_name, raceDate: user.race_date, tz: user.tz },
    consent: !!consent?.health_data && !consent.withdrawn_at,
    intakeComplete: !!intake?.consimtamant,
    today,
    phase: planRow ? phaseAt(planRow.start_date, planRow.race_date, today) : null,
    budgetHours: planRow?.budget_hours ?? null,
    plan: planned,
    scores: Object.fromEntries(scoresRows.map((s) => [s.workout_id, { color: s.color, reasons: s.reasons, final: s.is_final }])),
    activities: meActivities,
    wellnessToday: todayW ? { hrv: todayW.hrv, rhr: todayW.rhr, sleepMin: todayW.sleepMin, bedtime: todayW.bedtime, sleepScore: todayW.sleepScore, recoveryScore: todayW.recoveryScore, source: todayW.sources.hrv ?? todayW.sources.somn ?? null } : null,
    readiness: readinessRow ? { verdict: readinessRow.verdict, reason: readinessRow.reason } : null,
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
function num(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// server/me.ts
async function handler(req, res) {
  try {
    const u = await requireUser(req);
    const user = await loadUser(u.id);
    json(res, 200, await buildMe(u.id, todayIn(user.tz)));
  } catch (e) {
    fail(res, e);
  }
}
export {
  handler as default
};
