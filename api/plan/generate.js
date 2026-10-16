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
async function insert(table, rows) {
  return call("POST", table, Array.isArray(rows) ? rows : [rows], { prefer: "return=representation" });
}
async function update(table, filters, patch) {
  const q = params(filters);
  await call("PATCH", `${table}?${q.toString()}`, patch, { prefer: "return=minimal" });
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
async function loadUser(userId) {
  const u = await one("users", { id: `eq.${userId}` });
  if (!u) throw new Error("utilizator inexistent");
  return u;
}
async function loadForms(userId, today) {
  const morningRow = await one("questionnaires", { user_id: `eq.${userId}`, kind: "eq.dimineata", for_date: `eq.${today}` }, { order: "created_at.desc" });
  const eveningRows = await select("questionnaires", { user_id: `eq.${userId}`, kind: "eq.seara", for_date: `gte.${addDays(today, -14)}` }, { order: "created_at.desc", limit: 50 });
  const intakeRow = await one("questionnaires", { user_id: `eq.${userId}`, kind: "eq.intrare" }, { order: "created_at.desc" });
  return { morning: morningRow?.answers ?? null, evenings: eveningRows.map((r) => r.answers), intake: intakeRow?.answers ?? null };
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
var CHANGE_MIN = 10;
var MIN_SESSION_MIN = { inot: 30, alergare: 30, bicicleta: 40, forta: 30 };
function generatePlan(input) {
  const budget = weeklyBudget(input.freeBlocks);
  const weeks = phaseWeeks(input.startDate, input.raceDate);
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
        input.goal === "70.3" ? "schimbi cursa cu una olimpic\u0103" : "schimbi cursa cu una mai scurt\u0103",
        "mu\u021Bi data cursei"
      ]
    };
  }
  const history = input.historyHoursPerWeek.filter((h) => h > 0);
  const avgHistory = history.length ? history.reduce((a, b) => a + b, 0) / history.length : 0;
  const firstPhase = weeks[0].phase;
  let prevLoaded = Math.max(avgHistory, 0.6 * hours[firstPhase].target);
  const prog = { longRide: 90, longRun: 60, brickRun: 15 };
  const out = [];
  for (const pw of weeks) {
    const ph = hours[pw.phase];
    let target;
    if (pw.recovery) {
      target = round1(prevLoaded * RECOVERY_FACTOR);
    } else {
      target = Math.min(ph.target, Math.max(prevLoaded * 1.1, 0.6 * ph.target));
      target = round1(Math.min(target, budget.hours));
      prevLoaded = target;
    }
    advanceProgression(prog, pw);
    const sessions = weekTemplate(pw, input, prog);
    const fitted = fitToHours(sessions, target, pw.recovery);
    const placed = place(fitted.sessions, budget.blocks, pw.weekStart);
    const plannedHours = round1(placed.workouts.reduce((s, w) => s + w.plannedMinutes, 0) / 60);
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
  return { ok: true, weeks: out, budgetHours: budget.hours };
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
function weekTemplate(pw, input, prog) {
  const p = pw.phase;
  const s = [];
  const swimMin = input.swimContinuous400 ? p === "baza1" || p === "evaluare" ? 40 : 45 : 30;
  const quality = qualitySession(input.intensityAllowed, p);
  const swimCount = p === "taper" ? 2 : 3;
  for (let i = 0; i < swimCount; i++) {
    if (p === "build" && i === 0) s.push({ sport: "inot", type: "calitate", minutes: 45, zones: [3, 4], key: false, priority: 5, structure: "set CSS" });
    else if (p === "peak" && i === 0) s.push({ sport: "inot", type: "lung", minutes: 60, zones: [2, 3], key: false, priority: 5, structure: "distan\u021Ba de curs\u0103 continuu" });
    else s.push({ sport: "inot", type: "tehnica", minutes: p === "taper" ? 35 : swimMin, zones: [1, 2], key: false, priority: 5, structure: "un element de tehnic\u0103" });
  }
  s.push({ sport: "bicicleta", type: "z2", minutes: p === "baza1" || p === "evaluare" ? 60 : p === "taper" ? 45 : 75, zones: [2], key: false, priority: 7 });
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
  const fortaCount = p === "taper" ? 1 : 2;
  const fortaMin = p === "baza1" || p === "evaluare" ? 45 : p === "taper" ? 30 : 40;
  for (let i = 0; i < fortaCount; i++) {
    s.push({ sport: "forta", type: "forta", minutes: fortaMin, zones: [], key: false, priority: i === 0 ? 4 : 6.5, structure: p === "taper" ? "u\u0219or, f\u0103r\u0103 \xEEnc\u0103rc\u0103ri noi" : "\xEEnc\u0103rc\u0103ri mari + pliometrie" });
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
function qualitySession(allowed, phase) {
  return (minutes) => {
    if (allowed === "Z2") return { sport: "alergare", type: "z2", minutes: Math.round(minutes * 0.9), zones: [2], key: false, priority: 6, structure: "calitatea e blocat\u0103 p\xE2n\u0103 la avizul cardiologic" };
    if (allowed === "pana_la_Z4" || phase === "evaluare" || phase === "baza1") {
      return { sport: "alergare", type: "calitate", minutes, zones: [3, 4], key: true, priority: 3, structure: "2\u20133 \xD7 8\u201310 min tempo", intervals: { count: 3, minutes: 8, zone: 4 } };
    }
    return { sport: "alergare", type: "calitate", minutes, zones: [4, 5], key: true, priority: 3, structure: "5\u20136 \xD7 3\u20134 min intervale", intervals: { count: 5, minutes: 4, zone: 5 } };
  };
}
function fitToHours(sessions, targetHours, recovery) {
  const notes = [];
  const targetMin = targetHours * 60;
  const keys = sessions.filter((x) => x.key);
  let rest = sessions.filter((x) => !x.key).sort((a, b) => a.priority - b.priority);
  const keyMin = keys.reduce((s, x) => s + x.minutes, 0);
  let restMin = rest.reduce((s, x) => s + x.minutes, 0);
  const available = targetMin - keyMin;
  if (available <= 0) {
    notes.push("orele-\u021Bint\u0103 acoper\u0103 doar antrenamentele-cheie; restul lipse\u0219te s\u0103pt\u0103m\xE2na asta");
    return { sessions: keys, notes };
  }
  while (restMin > 0 && available / restMin < 0.85 && rest.length > 1) {
    const dropped = rest.pop();
    restMin -= dropped.minutes;
    notes.push(`f\u0103r\u0103 ${dropped.sport} ${dropped.type} ${dropped.minutes} min: nu \xEEncape \xEEn ore`);
  }
  const factor = restMin > 0 ? Math.min(1, available / restMin) : 1;
  const scaled = rest.map((x) => ({ ...x, minutes: Math.max(MIN_SESSION_MIN[x.sport], Math.round(x.minutes * factor / 5) * 5) }));
  if (factor < 0.999) notes.push(`\u0219edin\u021Bele u\u0219oare scalate la ${Math.round(factor * 100)}%${recovery ? " (desc\u0103rcare)" : ""}`);
  return { sessions: [...keys, ...scaled], notes };
}
function place(sessions, blocks, weekStart2) {
  const days = Array.from({ length: 7 }, (_, d) => ({
    blocks: blocks.filter((b) => b.day === d).map((b) => b.endMin - b.startMin),
    count: 0,
    hasKey: false,
    hasQuality: false,
    hasLongRun: false,
    hasLong: false,
    hasForta: false,
    sports: /* @__PURE__ */ new Set()
  }));
  const workouts = [];
  const notes = [];
  const ordered = [...sessions].sort((a, b) => a.priority - b.priority || b.minutes - a.minutes);
  let n = 0;
  for (const s of ordered) {
    const need = s.minutes + CHANGE_MIN;
    const candidates = days.map((st2, d) => ({ st: st2, d })).filter(({ st: st2, d }) => {
      if (st2.count >= 2) return false;
      if (!st2.blocks.some((b) => b >= need)) return false;
      if (s.key && st2.hasKey) return false;
      if (st2.sports.has(s.sport)) return false;
      if (st2.hasLong && s.sport !== "inot") return false;
      if (s.type === "lung" || s.type === "brick") {
        if (st2.hasLong) return false;
      }
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
    if (s.type === "lung" && s.sport === "alergare") st.hasLongRun = true;
    if (s.type === "lung" || s.type === "brick") st.hasLong = true;
    if (s.type === "forta") st.hasForta = true;
    n += 1;
    workouts.push({
      id: `${weekStart2}-${n}`,
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
function round1(n) {
  return Math.round(n * 10) / 10;
}

// server/_lib/plan.ts
async function historyHours(userId, today) {
  const from = addDays(weekStart(today), -56);
  const rows = await select("activities", { user_id: `eq.${userId}`, date: [`gte.${from}`, `lt.${weekStart(today)}`] }, { limit: 500 });
  const weeks = /* @__PURE__ */ new Map();
  for (const r of rows) weeks.set(weekStart(r.date), (weeks.get(weekStart(r.date)) ?? 0) + r.minutes);
  return [...weeks.entries()].sort((a, b) => diffDays(b[0], a[0])).map(([, m]) => Math.round(m / 60 * 10) / 10);
}
async function generateAndStore(userId, today, intake) {
  if (intake.obiectiv === "full") {
    return { ok: false, reason: "Ironman complet nu e \xEEn versiunea asta a planului; alege 70.3 pentru acum.", budgetHours: 0 };
  }
  const startDate = addDays(weekStart(today), 7);
  const history = await historyHours(userId, today);
  const result = generatePlan({
    startDate,
    raceDate: intake.dataCursa,
    goal: intake.obiectiv,
    freeBlocks: intake.program,
    historyHoursPerWeek: history,
    intensityAllowed: intake.sanatate.avizCardiolog === "da" ? "toate" : "Z2",
    swimContinuous400: intake.inot.nivel === "continuu_400" || intake.inot.nivel === "peste_1500"
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
  return { ok: true, budgetHours: result.budgetHours, weeks: result.weeks.length, workouts: rows.length };
}

// server/plan/generate.ts
async function handler(req, res) {
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
export {
  handler as default
};
