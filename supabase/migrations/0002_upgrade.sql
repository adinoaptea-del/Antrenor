-- Actualizări idempotente: rulează la fiecare „Pregătește” (și automat când aplicația vede schema veche).
alter table public.users add column if not exists city text;
alter table public.users add column if not exists lat double precision;
alter table public.users add column if not exists lon double precision;
alter table public.users add column if not exists apple_token text;
create unique index if not exists users_apple_token_idx on public.users (apple_token) where apple_token is not null;

-- Apple Health (prin Health Auto Export) ca sursă de somn, HRV și puls de repaus.
alter table public.wellness_daily drop constraint if exists wellness_daily_source_check;
alter table public.wellness_daily add constraint wellness_daily_source_check
  check (source in ('whoop', 'garmin', 'oura', 'strava', 'manual', 'athletedata', 'apple'));

-- Setările aplicației introduse de admin din aplicație (cheile aplicațiilor WHOOP / Strava / Oura).
-- Fără nicio politică RLS: le citește doar serverul (service role).
create table if not exists public.app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
alter table public.app_settings enable row level security;
revoke all on public.app_settings from anon, authenticated;

-- Analize: când a fost urcat buletinul (pentru „analize noi” și comparația cu cele vechi).
alter table public.labs add column if not exists uploaded_at timestamptz not null default now();

-- Obiective noi: semimaraton și maraton (doar alergare).
alter table public.users drop constraint if exists users_goal_check;
alter table public.users add constraint users_goal_check check (goal in ('70.3', 'olimpic', 'sprint', 'full', 'semimaraton', 'maraton'));
alter table public.plans drop constraint if exists plans_goal_check;
alter table public.plans add constraint plans_goal_check check (goal in ('70.3', 'olimpic', 'sprint', 'full', 'semimaraton', 'maraton'));
-- Marcaj de versiune a schemei (aplicația cere singură actualizarea când lipsește).
alter table public.users add column if not exists schema_v smallint not null default 3;

-- Sex și anul nașterii: contează pentru intervalele analizelor, nutriție și recuperare.
alter table public.users add column if not exists sex text check (sex in ('m', 'f'));
alter table public.users add column if not exists birth_year smallint;

-- Recuperarea (saună, baie rece, yoga, stretching, masaj) și mișcarea în plus (plimbări, alte sporturi) de pe brățări.
create table if not exists public.other_activities (
  id text primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  source text not null,
  external_id text not null,
  date date not null,
  start_local text,
  kind text not null check (kind in ('recuperare', 'activ')),
  name text not null,
  minutes int not null,
  avg_hr smallint,
  max_hr smallint,
  synced_at timestamptz not null default now()
);
create index if not exists other_activities_user_date on public.other_activities (user_id, date desc);
alter table public.other_activities enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'other_activities' and policyname = 'other_activities_select_own') then
    create policy other_activities_select_own on public.other_activities for select using (auth.uid() = user_id);
  end if;
end $$;
