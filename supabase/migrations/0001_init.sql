-- Antrenor — schema reală (Supabase / PostgreSQL). Rulează cu `supabase db push` sau în SQL Editor.
-- Principii: fiecare rând are user_id; sportivul își vede doar rândurile lui (RLS); scrie doar serverul (service role),
-- cu excepția chestionarelor și a consimțământului, pe care le poate scrie și aplicația direct.

create extension if not exists pgcrypto;

-- ---------- utilizatori (oglinda auth.users) ----------
create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  name text not null default '',
  role text not null check (role in ('sportiv', 'head_coach', 'admin')) default 'sportiv',
  coach_id uuid references public.users(id),
  tz text not null default 'Europe/Bucharest',
  goal text check (goal in ('70.3', 'olimpic', 'sprint', 'full')),
  race_name text,
  race_date date,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.users (id, email, name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create table public.consents (
  user_id uuid primary key references public.users(id) on delete cascade,
  health_data boolean not null default false,
  adult boolean not null default false,
  not_medical_ack boolean not null default false,
  accepted_at timestamptz,
  withdrawn_at timestamptz
);

-- ---------- chestionare: intrare, dimineata, seara, saptamanal ----------
create table public.questionnaires (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  kind text not null check (kind in ('intrare', 'dimineata', 'seara', 'saptamanal')),
  for_date date not null,
  activity_id text,                      -- la „seara”: activitatea la care se referă
  answers jsonb not null,
  created_at timestamptz not null default now(),
  unique (user_id, kind, for_date, activity_id)
);
create index on public.questionnaires (user_id, kind, for_date desc);

-- Blocurile libere recurente: day 0 = luni; minute din miezul nopții.
create table public.schedules (
  user_id uuid not null references public.users(id) on delete cascade,
  day smallint not null check (day between 0 and 6),
  start_min smallint not null,
  end_min smallint not null,
  valid_from date not null default current_date,
  primary key (user_id, day, start_min, valid_from)
);

create table public.zones (
  user_id uuid primary key references public.users(id) on delete cascade,
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

create table public.tests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  kind text not null,
  results jsonb not null,
  tested_at date not null
);

create table public.labs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  feritina numeric, vitamina_d numeric, hemoglobina numeric, ck numeric, crp numeric,
  other jsonb,
  drawn_at date not null
);

create table public.clearances (
  user_id uuid primary key references public.users(id) on delete cascade,
  cardiology boolean not null default false,
  cleared_at date,
  intensity_allowed text not null check (intensity_allowed in ('Z2', 'pana_la_Z4', 'toate')) default 'Z2'
);

-- ---------- brățări ----------
-- Token-urile OAuth: doar service role le citește. Niciodată expuse aplicației.
create table public.oauth_tokens (
  user_id uuid not null references public.users(id) on delete cascade,
  provider text not null check (provider in ('whoop', 'strava', 'oura')),
  access_token text not null,
  refresh_token text,
  expires_at timestamptz not null,
  scope text,
  external_user_id text,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, provider)
);

-- O noapte / o zi, pe sursă, în forma normalizată a colectorului. Arbitrajul între surse se face la citire.
create table public.wellness_daily (
  user_id uuid not null references public.users(id) on delete cascade,
  date date not null,                  -- ziua trezirii
  source text not null check (source in ('whoop', 'garmin', 'oura', 'strava', 'manual', 'athletedata')),
  hrv numeric, rhr smallint,
  sleep_min int, bedtime text, wake_time text, sleep_score smallint,
  recovery_score smallint, respiratory_rate numeric,
  weight_kg numeric, body_fat_pct numeric,
  raw jsonb,
  synced_at timestamptz not null default now(),
  primary key (user_id, date, source)
);

create table public.sync_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  provider text not null,
  ok boolean not null,
  detail text,
  rows int not null default 0,
  ran_at timestamptz not null default now()
);
create index on public.sync_log (user_id, ran_at desc);

-- ---------- plan ----------
create table public.plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  goal text not null check (goal in ('70.3', 'olimpic', 'sprint', 'full')),
  race_date date not null,
  start_date date not null,
  budget_hours numeric not null,
  version int not null default 1,
  active boolean not null default true,
  approved_by uuid references public.users(id),
  created_at timestamptz not null default now()
);
create index on public.plans (user_id, active);

create table public.workouts_planned (
  id text primary key,
  plan_id uuid not null references public.plans(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
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
create index on public.workouts_planned (user_id, date);

create table public.activities (
  id text primary key,              -- „strava-123”, „whoop-abc”
  user_id uuid not null references public.users(id) on delete cascade,
  source text not null,
  external_id text not null,
  date date not null,
  start_local text,
  sport text not null check (sport in ('inot', 'bicicleta', 'alergare', 'forta')),
  minutes int not null,
  distance_km numeric,
  avg_hr smallint, max_hr smallint,
  avg_pace_min_km numeric, avg_cadence smallint, avg_watts smallint,
  time_in_zones_min jsonb,
  intervals_hit_pct numeric, intervals_abandoned int, main_set_abandoned boolean,
  first_third_hr smallint, last_third_hr smallint, first_third_output numeric, last_third_output numeric,
  after_bike_minutes int,
  name text,
  raw jsonb,
  synced_at timestamptz not null default now()
);
create index on public.activities (user_id, date desc);

create table public.scores (
  workout_id text primary key references public.workouts_planned(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  activity_id text references public.activities(id),
  extra_activity_id text references public.activities(id),
  color text not null check (color in ('verde', 'galben', 'portocaliu', 'rosu', 'gri', 'albastru', 'asteptare')),
  reasons text[] not null,
  metrics jsonb not null,
  flags jsonb not null,
  is_final boolean not null default false,
  scored_at timestamptz not null default now()
);

create table public.readiness_daily (
  user_id uuid not null references public.users(id) on delete cascade,
  date date not null,
  verdict text not null check (verdict in ('verde', 'galben', 'rosu', 'stop')),
  reason text,
  hrv numeric, hrv_baseline numeric, rhr numeric, sleep_min int,
  hooper_sum smallint,
  acwr numeric, tsb numeric,
  primary key (user_id, date)
);

-- ---------- agenți ----------
create table public.packets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  event text not null check (event in ('dimineata', 'dupa_antrenament', 'saptamanal', 'lunar', 'semnal', 'analize', 'retest')),
  packet jsonb not null,
  created_at timestamptz not null default now()
);
create index on public.packets (user_id, created_at desc);

create table public.agent_outputs (
  id uuid primary key default gen_random_uuid(),
  packet_id uuid not null references public.packets(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  agent text not null,
  verdict text,
  output jsonb not null,            -- răspunsul JSON, cu „stare” pe fiecare rând după verificare
  rejected int not null default 0,
  model text,
  created_at timestamptz not null default now()
);

-- Mesajele head coach-ului către sportiv: ce vede în secțiunea Antrenor și în memento.
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  packet_id uuid references public.packets(id) on delete set null,
  kind text not null check (kind in ('dimineata', 'dupa_antrenament', 'saptamanal', 'memento', 'avertisment', 'uman')),
  body text not null,
  decision text check (decision in ('verde', 'galben', 'rosu', 'stop')),
  from_human boolean not null default false,
  created_at timestamptz not null default now()
);
create index on public.messages (user_id, created_at desc);

create table public.journal (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  date date not null,
  entry text not null,
  created_at timestamptz not null default now()
);

-- Fișierele agenților (fiziolog.md, inot.md …): maximum 30 de rânduri, rescrise de agent prin „pentru_viitor”.
create table public.agent_files (
  user_id uuid not null references public.users(id) on delete cascade,
  agent text not null,
  content text not null default '',
  updated_at timestamptz not null default now(),
  primary key (user_id, agent)
);

create table public.bar_daily (
  user_id uuid not null references public.users(id) on delete cascade,
  date date not null,
  total numeric,
  blocked text,
  basis text not null,
  components jsonb not null,
  primary key (user_id, date)
);

-- ---------- RLS: sportivul își vede rândurile; scrie doar serverul (service role trece peste RLS) ----------
do $$
declare t text;
begin
  for t in select unnest(array['users','consents','questionnaires','schedules','zones','tests','labs','clearances','wellness_daily','sync_log','plans','workouts_planned','activities','scores','readiness_daily','packets','agent_outputs','messages','journal','agent_files','bar_daily']) loop
    execute format('alter table public.%I enable row level security', t);
    if t = 'users' then
      execute 'create policy users_select_own on public.users for select using (auth.uid() = id)';
      execute 'create policy users_update_own on public.users for update using (auth.uid() = id)';
    else
      execute format('create policy %I_select_own on public.%I for select using (auth.uid() = user_id)', t, t);
    end if;
  end loop;
end $$;

-- Aplicația poate scrie direct consimțământul și chestionarele proprii; restul trece prin API.
create policy consents_upsert_own on public.consents for insert with check (auth.uid() = user_id);
create policy consents_update_own on public.consents for update using (auth.uid() = user_id);
create policy questionnaires_insert_own on public.questionnaires for insert with check (auth.uid() = user_id);
create policy questionnaires_update_own on public.questionnaires for update using (auth.uid() = user_id);

-- Token-urile OAuth nu au nicio politică de select: doar service role le vede.
alter table public.oauth_tokens enable row level security;
