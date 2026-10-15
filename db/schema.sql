-- Schema PostgreSQL pentru Antrenor v1. Fiecare rând are user_id; nimic nu e partajat între sportivi.
-- Datele de sănătate cer consimțământ explicit (consents) înainte de orice sincronizare.

create extension if not exists pgcrypto;

create table users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  name text not null,
  role text not null check (role in ('sportiv', 'head_coach', 'admin')) default 'sportiv',
  coach_id uuid references users(id),
  tz text not null default 'Europe/Bucharest',
  created_at timestamptz not null default now()
);

create table consents (
  user_id uuid primary key references users(id) on delete cascade,
  health_data boolean not null default false,
  adult boolean not null default false,
  not_medical_ack boolean not null default false,
  accepted_at timestamptz,
  withdrawn_at timestamptz
);

create table questionnaires (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  kind text not null check (kind in ('intrare', 'dimineata', 'seara', 'saptamanal')),
  answers jsonb not null,
  for_date date not null,
  created_at timestamptz not null default now()
);
create index on questionnaires (user_id, kind, for_date desc);

-- Blocurile libere recurente: day 0 = luni; minute din miezul nopții.
create table schedules (
  user_id uuid not null references users(id) on delete cascade,
  day smallint not null check (day between 0 and 6),
  start_min smallint not null,
  end_min smallint not null,
  valid_from date not null default current_date,
  primary key (user_id, day, start_min, valid_from)
);

create table zones (
  user_id uuid primary key references users(id) on delete cascade,
  run_hr_zones smallint[],          -- limite superioare Z1..Z5, bpm
  run_threshold_pace_sec_km int,
  bike_ftp_w int,
  bike_hr_zones smallint[],
  swim_css_sec_100m int,
  hr_max_test smallint,
  source text,                      -- cpet | lactat | teren | provizoriu
  tested_at date,
  updated_at timestamptz not null default now()
);

create table tests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  kind text not null,               -- cpet | lactat | css | ftp | prag_alergare | dexa | bia | transpiratie
  results jsonb not null,
  tested_at date not null
);

-- Doar câmpurile extrase din analize, nu PDF-ul.
create table labs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  feritina numeric, vitamina_d numeric, hemoglobina numeric, ck numeric, crp numeric,
  other jsonb,
  drawn_at date not null
);

create table clearances (
  user_id uuid primary key references users(id) on delete cascade,
  cardiology boolean not null default false,
  cleared_at date,
  intensity_allowed text not null check (intensity_allowed in ('Z2', 'pana_la_Z4', 'toate')) default 'Z2'
);

create table plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  goal text not null check (goal in ('70.3', 'olimpic', 'sprint')),
  race_date date not null,
  start_date date not null,
  budget_hours numeric not null,
  version int not null default 1,
  approved_by uuid references users(id),
  created_at timestamptz not null default now()
);

create table workouts_planned (
  id text primary key,
  plan_id uuid not null references plans(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  date date not null,
  sport text not null check (sport in ('inot', 'bicicleta', 'alergare', 'forta')),
  type text not null check (type in ('z2', 'tehnica', 'calitate', 'lung', 'brick', 'forta', 'odihna')),
  planned_minutes int not null,
  target_zones smallint[] not null,
  is_key boolean not null default false,
  step int,
  structure text,
  intervals jsonb,
  status text not null check (status in ('planificat', 'anulat_sistem', 'mutat', 'sters')) default 'planificat',
  note text,
  pushed_to_watch_at timestamptz
);
create index on workouts_planned (user_id, date);

create table activities (
  id text primary key,              -- id-ul sursei (Strava/Garmin), prefixat cu sursa
  user_id uuid not null references users(id) on delete cascade,
  source text not null,
  date date not null,
  sport text not null,
  minutes int not null,
  distance_km numeric,
  avg_hr smallint, max_hr smallint,
  time_in_zones_min jsonb,          -- {"1": 5, "2": 40, ...} cu zonele sportivului la momentul activității
  intervals_hit_pct numeric,
  intervals_abandoned int,
  main_set_abandoned boolean,
  first_third_hr smallint, last_third_hr smallint,
  first_third_output numeric, last_third_output numeric,
  after_bike_minutes int,
  raw jsonb,
  synced_at timestamptz not null default now()
);
create index on activities (user_id, date desc);

create table scores (
  workout_id text primary key references workouts_planned(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  activity_id text references activities(id),
  extra_activity_id text references activities(id),
  color text not null check (color in ('verde', 'galben', 'portocaliu', 'rosu', 'gri', 'albastru', 'asteptare')),
  reasons text[] not null,
  metrics jsonb not null,
  flags jsonb not null,
  is_final boolean not null default false,
  scored_at timestamptz not null default now()
);

create table readiness_daily (
  user_id uuid not null references users(id) on delete cascade,
  date date not null,
  verdict text not null check (verdict in ('verde', 'galben', 'rosu', 'stop')),
  reason text,
  hrv numeric, hrv_baseline numeric, rhr numeric, sleep_min int,
  hooper_sum smallint,
  acwr numeric, tsb numeric,
  primary key (user_id, date)
);

-- Pachetul de date trimis agenților, exact cum l-au primit: orice decizie se poate reconstrui.
create table packets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  event text not null check (event in ('dimineata', 'dupa_antrenament', 'saptamanal', 'lunar', 'semnal', 'analize', 'retest')),
  packet jsonb not null,
  created_at timestamptz not null default now()
);

create table agent_outputs (
  id uuid primary key default gen_random_uuid(),
  packet_id uuid not null references packets(id) on delete cascade,
  agent text not null,              -- head_coach | fiziolog | inot | bicicleta | alergare | nutritie | fizio | minte
  verdict text,
  output text not null,
  rejected_claims text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table journal (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  date date not null,
  entry text not null,
  created_at timestamptz not null default now()
);

create table bar_daily (
  user_id uuid not null references users(id) on delete cascade,
  date date not null,
  total numeric,                    -- null = blocată sau fără date
  blocked text,
  basis text not null,
  components jsonb not null,
  primary key (user_id, date)
);
