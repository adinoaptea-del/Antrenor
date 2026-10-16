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

-- Înălțimea: pentru indicele de masă corporală și necesarul de energie.
alter table public.users add column if not exists height_cm smallint;

-- Sugestia mai ușoară din zilele galbene/portocalii (sportivul alege).
alter table public.workouts_planned add column if not exists suggestion jsonb;

-- Consumul AI real, pe apel: tokeni de la Anthropic, pentru costul afișat adminului.
create table if not exists public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade,
  kind text not null,               -- agenti:dimineata, analize, test …
  model text not null,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists ai_usage_user_created on public.ai_usage (user_id, created_at desc);
alter table public.ai_usage enable row level security;

-- Corecturile sportivului pe ședințe clasificate greșit de brățări („e de fapt alergare”, „nu e antrenament”).
-- Separat de activities, ca o sincronizare nouă să nu le șteargă.
create table if not exists public.activity_overrides (
  user_id uuid not null references public.users(id) on delete cascade,
  activity_id text not null,
  sport text check (sport in ('inot', 'bicicleta', 'alergare', 'forta')),
  ignored boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, activity_id)
);
alter table public.activity_overrides enable row level security;

-- ---------- Audit 17.10.2026: drepturi, izolarea conturilor, evenimente idempotente ----------

-- 1. Aplicația nu scrie niciodată direct în bază (totul trece prin server, cu service role). Un sportiv logat nu
--    poate modifica niciun rând, nici propriul rol: fără politica de update pe users și fără drept de scriere.
drop policy if exists users_update_own on public.users;
drop policy if exists consents_upsert_own on public.consents;
drop policy if exists consents_update_own on public.consents;
drop policy if exists questionnaires_insert_own on public.questionnaires;
drop policy if exists questionnaires_update_own on public.questionnaires;
revoke insert, update, delete, truncate on all tables in schema public from anon, authenticated;
alter default privileges in schema public revoke insert, update, delete, truncate on tables from anon, authenticated;
-- Rolul se schimbă doar din server (service role); orice altă sesiune primește eroare, chiar dacă un drept ar reapărea.
create or replace function public.guard_user_role() returns trigger language plpgsql as $$
begin
  if new.role is distinct from old.role and coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', 'service_role') not in ('service_role') then
    raise exception 'rolul se schimbă doar din server';
  end if;
  return new;
end $$;
drop trigger if exists users_guard_role on public.users;
create trigger users_guard_role before update on public.users for each row execute function public.guard_user_role();

-- 2. Un import nu poate muta o activitate de la un sportiv la altul.
create or replace function public.guard_owner() returns trigger language plpgsql as $$
begin
  if new.user_id is distinct from old.user_id then
    raise exception 'activitatea % aparține altui cont', old.id;
  end if;
  return new;
end $$;
drop trigger if exists activities_guard_owner on public.activities;
create trigger activities_guard_owner before update on public.activities for each row execute function public.guard_owner();
drop trigger if exists other_activities_guard_owner on public.other_activities;
create trigger other_activities_guard_owner before update on public.other_activities for each row execute function public.guard_owner();

-- 3. ID-urile Apple includ contul (apple-<user>-<id extern>). Rândurile vechi se redenumesc o singură dată;
--    scorurile, corecturile și chestionarele care le citează se mută odată cu ele.
do $$
declare r record;
begin
  if exists (select 1 from public.activities where source = 'apple' and id not like 'apple-' || user_id::text || '-%') then
    for r in select conname from pg_constraint where conrelid = 'public.scores'::regclass and contype = 'f' and confrelid = 'public.activities'::regclass loop
      execute format('alter table public.scores drop constraint %I', r.conname);
    end loop;
    alter table public.scores add constraint scores_activity_id_fkey foreign key (activity_id) references public.activities(id) on update cascade;
    alter table public.scores add constraint scores_extra_activity_id_fkey foreign key (extra_activity_id) references public.activities(id) on update cascade;
    update public.activity_overrides o set activity_id = 'apple-' || o.user_id::text || '-' || substr(o.activity_id, 7)
      where o.activity_id like 'apple-%' and o.activity_id not like 'apple-' || o.user_id::text || '-%'
        and exists (select 1 from public.activities a where a.id = o.activity_id and a.user_id = o.user_id);
    update public.questionnaires q set activity_id = 'apple-' || q.user_id::text || '-' || substr(q.activity_id, 7)
      where q.activity_id like 'apple-%' and q.activity_id not like 'apple-' || q.user_id::text || '-%'
        and exists (select 1 from public.activities a where a.id = q.activity_id and a.user_id = q.user_id);
    update public.activities set id = 'apple-' || user_id::text || '-' || substr(id, 7)
      where source = 'apple' and id not like 'apple-' || user_id::text || '-%';
  end if;
  if exists (select 1 from public.other_activities where source = 'apple' and id not like 'apple-o-' || user_id::text || '-%') then
    update public.other_activities set id = 'apple-o-' || user_id::text || '-' || external_id
      where source = 'apple' and id not like 'apple-o-' || user_id::text || '-%';
  end if;
exception when others then
  -- Nu oprește actualizarea: rândurile vechi rămân; cele noi vin cu ID-ul pe cont, iar dublura se recunoaște la citire.
  raise notice 'redenumire apple: %', sqlerrm;
end $$;

-- 4. Evenimentele calendarului (febră, stop, durere, progres…) se aplică o singură dată fiecare.
create table if not exists public.agent_events (
  user_id uuid not null references public.users(id) on delete cascade,
  event_key text not null,
  applied_at timestamptz not null default now(),
  primary key (user_id, event_key)
);
alter table public.agent_events enable row level security;

-- 5. Un singur chestionar de dimineață pe zi: în SQL două valori NULL nu sunt „egale”, deci unicitatea veche
--    nu oprea dublurile cu activity_id NULL. Păstrăm cel mai recent și facem NULL-urile egale (PostgreSQL 15+).
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'questionnaires_one_per_key') then
    delete from public.questionnaires q using public.questionnaires r
      where q.user_id = r.user_id and q.kind = r.kind and q.for_date = r.for_date
        and q.activity_id is not distinct from r.activity_id
        and (q.created_at, q.id) < (r.created_at, r.id);
    alter table public.questionnaires drop constraint if exists questionnaires_user_id_kind_for_date_activity_id_key;
    alter table public.questionnaires add constraint questionnaires_one_per_key unique nulls not distinct (user_id, kind, for_date, activity_id);
  end if;
exception when others then
  -- PostgreSQL mai vechi de 15: rămâne unicitatea veche; serverul evită oricum dublurile la citire.
  raise notice 'questionnaires: %', sqlerrm;
end $$;
