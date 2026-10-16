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
