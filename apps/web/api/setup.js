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

// supabase/migrations/0001_init.sql
var init_default = "-- Antrenor \u2014 schema real\u0103 (Supabase / PostgreSQL). Ruleaz\u0103 cu `supabase db push` sau \xEEn SQL Editor.\n-- Principii: fiecare r\xE2nd are user_id; sportivul \xEE\u0219i vede doar r\xE2ndurile lui (RLS); scrie doar serverul (service role),\n-- cu excep\u021Bia chestionarelor \u0219i a consim\u021B\u0103m\xE2ntului, pe care le poate scrie \u0219i aplica\u021Bia direct.\n\ncreate extension if not exists pgcrypto;\n\n-- ---------- utilizatori (oglinda auth.users) ----------\ncreate table public.users (\n  id uuid primary key references auth.users(id) on delete cascade,\n  email text unique not null,\n  name text not null default '',\n  role text not null check (role in ('sportiv', 'head_coach', 'admin')) default 'sportiv',\n  coach_id uuid references public.users(id),\n  tz text not null default 'Europe/Bucharest',\n  goal text check (goal in ('70.3', 'olimpic', 'sprint', 'full')),\n  race_name text,\n  race_date date,\n  created_at timestamptz not null default now()\n);\n\ncreate or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$\nbegin\n  insert into public.users (id, email, name)\n  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)))\n  on conflict (id) do nothing;\n  return new;\nend $$;\ndrop trigger if exists on_auth_user_created on auth.users;\ncreate trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();\n\ncreate table public.consents (\n  user_id uuid primary key references public.users(id) on delete cascade,\n  health_data boolean not null default false,\n  adult boolean not null default false,\n  not_medical_ack boolean not null default false,\n  accepted_at timestamptz,\n  withdrawn_at timestamptz\n);\n\n-- ---------- chestionare: intrare, dimineata, seara, saptamanal ----------\ncreate table public.questionnaires (\n  id uuid primary key default gen_random_uuid(),\n  user_id uuid not null references public.users(id) on delete cascade,\n  kind text not null check (kind in ('intrare', 'dimineata', 'seara', 'saptamanal')),\n  for_date date not null,\n  activity_id text,                      -- la \u201Eseara\u201D: activitatea la care se refer\u0103\n  answers jsonb not null,\n  created_at timestamptz not null default now(),\n  unique (user_id, kind, for_date, activity_id)\n);\ncreate index on public.questionnaires (user_id, kind, for_date desc);\n\n-- Blocurile libere recurente: day 0 = luni; minute din miezul nop\u021Bii.\ncreate table public.schedules (\n  user_id uuid not null references public.users(id) on delete cascade,\n  day smallint not null check (day between 0 and 6),\n  start_min smallint not null,\n  end_min smallint not null,\n  valid_from date not null default current_date,\n  primary key (user_id, day, start_min, valid_from)\n);\n\ncreate table public.zones (\n  user_id uuid primary key references public.users(id) on delete cascade,\n  run_hr_zones smallint[],          -- limite superioare Z1..Z5, bpm\n  run_threshold_pace_sec_km int,\n  bike_ftp_w int,\n  bike_hr_zones smallint[],\n  swim_css_sec_100m int,\n  hr_max_test smallint,\n  source text,                      -- cpet | lactat | teren | provizoriu\n  tested_at date,\n  updated_at timestamptz not null default now()\n);\n\ncreate table public.tests (\n  id uuid primary key default gen_random_uuid(),\n  user_id uuid not null references public.users(id) on delete cascade,\n  kind text not null,\n  results jsonb not null,\n  tested_at date not null\n);\n\ncreate table public.labs (\n  id uuid primary key default gen_random_uuid(),\n  user_id uuid not null references public.users(id) on delete cascade,\n  feritina numeric, vitamina_d numeric, hemoglobina numeric, ck numeric, crp numeric,\n  other jsonb,\n  drawn_at date not null\n);\n\ncreate table public.clearances (\n  user_id uuid primary key references public.users(id) on delete cascade,\n  cardiology boolean not null default false,\n  cleared_at date,\n  intensity_allowed text not null check (intensity_allowed in ('Z2', 'pana_la_Z4', 'toate')) default 'Z2'\n);\n\n-- ---------- br\u0103\u021B\u0103ri ----------\n-- Token-urile OAuth: doar service role le cite\u0219te. Niciodat\u0103 expuse aplica\u021Biei.\ncreate table public.oauth_tokens (\n  user_id uuid not null references public.users(id) on delete cascade,\n  provider text not null check (provider in ('whoop', 'strava', 'oura')),\n  access_token text not null,\n  refresh_token text,\n  expires_at timestamptz not null,\n  scope text,\n  external_user_id text,\n  connected_at timestamptz not null default now(),\n  updated_at timestamptz not null default now(),\n  primary key (user_id, provider)\n);\n\n-- O noapte / o zi, pe surs\u0103, \xEEn forma normalizat\u0103 a colectorului. Arbitrajul \xEEntre surse se face la citire.\ncreate table public.wellness_daily (\n  user_id uuid not null references public.users(id) on delete cascade,\n  date date not null,                  -- ziua trezirii\n  source text not null check (source in ('whoop', 'garmin', 'oura', 'strava', 'manual', 'athletedata')),\n  hrv numeric, rhr smallint,\n  sleep_min int, bedtime text, wake_time text, sleep_score smallint,\n  recovery_score smallint, respiratory_rate numeric,\n  weight_kg numeric, body_fat_pct numeric,\n  raw jsonb,\n  synced_at timestamptz not null default now(),\n  primary key (user_id, date, source)\n);\n\ncreate table public.sync_log (\n  id uuid primary key default gen_random_uuid(),\n  user_id uuid not null references public.users(id) on delete cascade,\n  provider text not null,\n  ok boolean not null,\n  detail text,\n  rows int not null default 0,\n  ran_at timestamptz not null default now()\n);\ncreate index on public.sync_log (user_id, ran_at desc);\n\n-- ---------- plan ----------\ncreate table public.plans (\n  id uuid primary key default gen_random_uuid(),\n  user_id uuid not null references public.users(id) on delete cascade,\n  goal text not null check (goal in ('70.3', 'olimpic', 'sprint', 'full')),\n  race_date date not null,\n  start_date date not null,\n  budget_hours numeric not null,\n  version int not null default 1,\n  active boolean not null default true,\n  approved_by uuid references public.users(id),\n  created_at timestamptz not null default now()\n);\ncreate index on public.plans (user_id, active);\n\ncreate table public.workouts_planned (\n  id text primary key,\n  plan_id uuid not null references public.plans(id) on delete cascade,\n  user_id uuid not null references public.users(id) on delete cascade,\n  date date not null,\n  sport text not null check (sport in ('inot', 'bicicleta', 'alergare', 'forta')),\n  type text not null check (type in ('z2', 'tehnica', 'calitate', 'lung', 'brick', 'forta', 'odihna')),\n  planned_minutes int not null,\n  target_zones smallint[] not null,\n  is_key boolean not null default false,\n  step int,\n  structure text,\n  intervals jsonb,\n  status text not null check (status in ('planificat', 'anulat_sistem', 'mutat', 'sters')) default 'planificat',\n  note text,\n  pushed_to_watch_at timestamptz\n);\ncreate index on public.workouts_planned (user_id, date);\n\ncreate table public.activities (\n  id text primary key,              -- \u201Estrava-123\u201D, \u201Ewhoop-abc\u201D\n  user_id uuid not null references public.users(id) on delete cascade,\n  source text not null,\n  external_id text not null,\n  date date not null,\n  start_local text,\n  sport text not null check (sport in ('inot', 'bicicleta', 'alergare', 'forta')),\n  minutes int not null,\n  distance_km numeric,\n  avg_hr smallint, max_hr smallint,\n  avg_pace_min_km numeric, avg_cadence smallint, avg_watts smallint,\n  time_in_zones_min jsonb,\n  intervals_hit_pct numeric, intervals_abandoned int, main_set_abandoned boolean,\n  first_third_hr smallint, last_third_hr smallint, first_third_output numeric, last_third_output numeric,\n  after_bike_minutes int,\n  name text,\n  raw jsonb,\n  synced_at timestamptz not null default now()\n);\ncreate index on public.activities (user_id, date desc);\n\ncreate table public.scores (\n  workout_id text primary key references public.workouts_planned(id) on delete cascade,\n  user_id uuid not null references public.users(id) on delete cascade,\n  activity_id text references public.activities(id),\n  extra_activity_id text references public.activities(id),\n  color text not null check (color in ('verde', 'galben', 'portocaliu', 'rosu', 'gri', 'albastru', 'asteptare')),\n  reasons text[] not null,\n  metrics jsonb not null,\n  flags jsonb not null,\n  is_final boolean not null default false,\n  scored_at timestamptz not null default now()\n);\n\ncreate table public.readiness_daily (\n  user_id uuid not null references public.users(id) on delete cascade,\n  date date not null,\n  verdict text not null check (verdict in ('verde', 'galben', 'rosu', 'stop')),\n  reason text,\n  hrv numeric, hrv_baseline numeric, rhr numeric, sleep_min int,\n  hooper_sum smallint,\n  acwr numeric, tsb numeric,\n  primary key (user_id, date)\n);\n\n-- ---------- agen\u021Bi ----------\ncreate table public.packets (\n  id uuid primary key default gen_random_uuid(),\n  user_id uuid not null references public.users(id) on delete cascade,\n  event text not null check (event in ('dimineata', 'dupa_antrenament', 'saptamanal', 'lunar', 'semnal', 'analize', 'retest')),\n  packet jsonb not null,\n  created_at timestamptz not null default now()\n);\ncreate index on public.packets (user_id, created_at desc);\n\ncreate table public.agent_outputs (\n  id uuid primary key default gen_random_uuid(),\n  packet_id uuid not null references public.packets(id) on delete cascade,\n  user_id uuid not null references public.users(id) on delete cascade,\n  agent text not null,\n  verdict text,\n  output jsonb not null,            -- r\u0103spunsul JSON, cu \u201Estare\u201D pe fiecare r\xE2nd dup\u0103 verificare\n  rejected int not null default 0,\n  model text,\n  created_at timestamptz not null default now()\n);\n\n-- Mesajele head coach-ului c\u0103tre sportiv: ce vede \xEEn sec\u021Biunea Antrenor \u0219i \xEEn memento.\ncreate table public.messages (\n  id uuid primary key default gen_random_uuid(),\n  user_id uuid not null references public.users(id) on delete cascade,\n  packet_id uuid references public.packets(id) on delete set null,\n  kind text not null check (kind in ('dimineata', 'dupa_antrenament', 'saptamanal', 'memento', 'avertisment', 'uman')),\n  body text not null,\n  decision text check (decision in ('verde', 'galben', 'rosu', 'stop')),\n  from_human boolean not null default false,\n  created_at timestamptz not null default now()\n);\ncreate index on public.messages (user_id, created_at desc);\n\ncreate table public.journal (\n  id uuid primary key default gen_random_uuid(),\n  user_id uuid not null references public.users(id) on delete cascade,\n  date date not null,\n  entry text not null,\n  created_at timestamptz not null default now()\n);\n\n-- Fi\u0219ierele agen\u021Bilor (fiziolog.md, inot.md \u2026): maximum 30 de r\xE2nduri, rescrise de agent prin \u201Epentru_viitor\u201D.\ncreate table public.agent_files (\n  user_id uuid not null references public.users(id) on delete cascade,\n  agent text not null,\n  content text not null default '',\n  updated_at timestamptz not null default now(),\n  primary key (user_id, agent)\n);\n\ncreate table public.bar_daily (\n  user_id uuid not null references public.users(id) on delete cascade,\n  date date not null,\n  total numeric,\n  blocked text,\n  basis text not null,\n  components jsonb not null,\n  primary key (user_id, date)\n);\n\n-- ---------- RLS: sportivul \xEE\u0219i vede r\xE2ndurile; scrie doar serverul (service role trece peste RLS) ----------\ndo $$\ndeclare t text;\nbegin\n  for t in select unnest(array['users','consents','questionnaires','schedules','zones','tests','labs','clearances','wellness_daily','sync_log','plans','workouts_planned','activities','scores','readiness_daily','packets','agent_outputs','messages','journal','agent_files','bar_daily']) loop\n    execute format('alter table public.%I enable row level security', t);\n    if t = 'users' then\n      execute 'create policy users_select_own on public.users for select using (auth.uid() = id)';\n      execute 'create policy users_update_own on public.users for update using (auth.uid() = id)';\n    else\n      execute format('create policy %I_select_own on public.%I for select using (auth.uid() = user_id)', t, t);\n    end if;\n  end loop;\nend $$;\n\n-- Aplica\u021Bia poate scrie direct consim\u021B\u0103m\xE2ntul \u0219i chestionarele proprii; restul trece prin API.\ncreate policy consents_upsert_own on public.consents for insert with check (auth.uid() = user_id);\ncreate policy consents_update_own on public.consents for update using (auth.uid() = user_id);\ncreate policy questionnaires_insert_own on public.questionnaires for insert with check (auth.uid() = user_id);\ncreate policy questionnaires_update_own on public.questionnaires for update using (auth.uid() = user_id);\n\n-- Token-urile OAuth nu au nicio politic\u0103 de select: doar service role le vede.\nalter table public.oauth_tokens enable row level security;\n";

// server/_lib/pg.ts
import { createHash, createHmac as createHmac2, pbkdf2Sync, randomBytes } from "node:crypto";
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
  async bytes(n) {
    while (this.buf.length < n) {
      if (this.err) throw this.err;
      await new Promise((r) => this.waiters.push(r));
    }
    const out = this.buf.subarray(0, n);
    this.buf = this.buf.subarray(n);
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
  await new Promise((ok, ko) => {
    sock.once("connect", ok);
    sock.once("error", ko);
  });
  if (c.ssl) {
    const req = Buffer.alloc(8);
    req.writeInt32BE(8, 0);
    req.writeInt32BE(80877103, 4);
    const answer = await new Promise((ok, ko) => {
      sock.once("data", (d) => ok(String.fromCharCode(d[0])));
      sock.once("error", ko);
      sock.write(req);
    });
    if (answer !== "S") throw new Error("postgres: serverul nu accept\u0103 TLS");
    sock = tls.connect({ socket: sock, servername: net.isIP(c.host) ? void 0 : c.host, rejectUnauthorized: false });
    await new Promise((ok, ko) => {
      sock.once("secureConnect", ok);
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
        nonce = randomBytes(18).toString("base64");
        const first2 = `n,,n=*,r=${nonce}`;
        const firstBuf = Buffer.from(first2, "utf8");
        const len = Buffer.alloc(4);
        len.writeInt32BE(firstBuf.length, 0);
        sock.write(msg("p", Buffer.concat([cstr("SCRAM-SHA-256"), len, firstBuf])));
      } else if (code === 11) {
        const serverFirst = m.body.subarray(4).toString("utf8");
        const attrs = Object.fromEntries(serverFirst.split(",").map((kv) => [kv[0], kv.slice(2)]));
        const r = attrs.r ?? "";
        if (!r.startsWith(nonce)) throw new Error("postgres: nonce SCRAM invalid");
        const salted = pbkdf2Sync(c.password, Buffer.from(attrs.s ?? "", "base64"), Number(attrs.i), 32, "sha256");
        const clientKey = createHmac2("sha256", salted).update("Client Key").digest();
        const storedKey = createHash("sha256").update(clientKey).digest();
        const withoutProof = `c=biws,r=${r}`;
        const authMessage = `n=*,r=${nonce},${serverFirst},${withoutProof}`;
        const signature = createHmac2("sha256", storedKey).update(authMessage).digest();
        const proof = xor(clientKey, signature).toString("base64");
        scram = { salted, authMessage };
        sock.write(msg("p", Buffer.from(`${withoutProof},p=${proof}`, "utf8")));
      } else if (code === 12) {
        if (!scram) throw new Error("postgres: SCRAM f\u0103r\u0103 \xEEnceput");
        const serverKey = createHmac2("sha256", scram.salted).update("Server Key").digest();
        const expected = createHmac2("sha256", serverKey).update(scram.authMessage).digest("base64");
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
        const n = m.body.readInt16BE(0);
        cols = [];
        let i = 2;
        for (let k = 0; k < n; k++) {
          const end = m.body.indexOf(0, i);
          cols.push(m.body.toString("utf8", i, end));
          i = end + 1 + 18;
        }
      } else if (m.type === "D") {
        const n = m.body.readInt16BE(0);
        const row = {};
        let i = 2;
        for (let k = 0; k < n; k++) {
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
    const r = await c.query("select to_regclass('public.users') is not null as ok");
    return { database: true, tables: r.rows[0]?.ok === "t" };
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
      const r = await c.query(sql);
      steps.push({ step: name, ok: true, detail: r.notices.filter(Boolean).slice(0, 2).join("; ") || void 0 });
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
async function handler(req, res) {
  try {
    if (req.method === "GET") {
      json(res, 200, await setupStatus());
      return;
    }
    if (req.method !== "POST") throw new HttpError(405, "GET sau POST");
    const status = await setupStatus();
    if (status.tables) {
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
export {
  handler as default
};
