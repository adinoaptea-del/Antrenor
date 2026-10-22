-- Auditul consolidat (22.10.2026), etapa 2: datele și persistarea. Idempotentă: rulează la fiecare „Pregătește baza”.
-- Revenire (rollback) manuală, dacă e nevoie: vezi la final.

-- C2: o activitate ștearsă (pe Strava, Oura) se poate șterge și când e legată de o ședință cu scor. Legătura din
-- scor devine NULL, iar codul recalculează scorul imediat după ștergere (server/_lib/activity-delete.ts).
do $$
begin
  alter table public.scores drop constraint if exists scores_activity_id_fkey;
  alter table public.scores drop constraint if exists scores_extra_activity_id_fkey;
  alter table public.scores add constraint scores_activity_id_fkey foreign key (activity_id) references public.activities(id) on update cascade on delete set null;
  alter table public.scores add constraint scores_extra_activity_id_fkey foreign key (extra_activity_id) references public.activities(id) on update cascade on delete set null;
end $$;

-- C5: tokenuri separate pentru Apple Health și Samsung Health / Health Connect. Cine trimitea deja date Android cu
-- tokenul comun îl păstrează ca token Android (adresa lipită în telefon merge în continuare); ceilalți primesc unul
-- la prima apăsare pe „Conectează Samsung Health”.
alter table public.users add column if not exists android_token text;
create unique index if not exists users_android_token_key on public.users (android_token) where android_token is not null;
update public.users u set android_token = u.apple_token
 where u.android_token is null and u.apple_token is not null
   and exists (select 1 from public.sync_log l where l.user_id = u.id and l.provider = 'android');

-- A2: starea schimbării ședinței în câmp tipizat (src/calendar/flags.ts), nu în textul notei.
alter table public.workouts_planned add column if not exists flags jsonb;
-- Rândurile vechi: starea se ia o singură dată din notă (aceeași regulă ca legacyFlags din cod).
update public.workouts_planned w set flags = jsonb_build_object(
    'origin', case
      when w.note ~ '^mutată de tine' then 'mutare'
      when w.note ~ '^pusă înapoi' then 'pus_inapoi'
      when w.note ~ '^făcută în ziua din plan \(vremea' then 'vreme_revenit'
      when w.note ~ '^vremea' then 'vreme'
      when w.note ~ '^plecat' then 'plecat'
      when w.note ~ '^ușurată:' then 'usurare'
      when w.note ~ '^ușoară la cererea ta' then 'usor'
      else 'varianta' end,
    'manual_override', (w.note ~ '^(mutată de tine|pusă înapoi|ușoară la cererea ta|varianta aleasă de tine)'),
    'weather_swap', case when w.note ~ '^vremea' and w.note !~ '^făcută' then jsonb_build_object('reason', split_part(regexp_replace(w.note, '^vremea:\s*', ''), ';', 1)) else null end,
    'original_slot', w.original ->> 'date',
    'change_reason', w.note)
 where w.flags is null
   and w.note ~ '^(mutată de tine|pusă înapoi|făcută în ziua din plan \(vremea|vremea|plecat|ușurată:|ușoară la cererea ta|varianta aleasă de tine)';

-- B3: versiunea contextului trimis AI-ului. O cerere manuală pe același context nu mai cheamă modelul.
alter table public.packets add column if not exists context_hash text;
create index if not exists packets_user_event_hash on public.packets (user_id, event, created_at desc);

-- C1 / E1: coada durabilă a evenimentelor Strava. Webhook-ul confirmă primirea imediat și scrie aici; procesarea
-- (sincronizare, ștergere confirmată prin API) se face după, cu reîncercări. Cheia unică face reîncercările Strava
-- (același eveniment trimis din nou) idempotente.
create table if not exists public.webhook_inbox (
  id bigint generated always as identity primary key,
  provider text not null,
  owner_id text not null,
  object_type text not null,
  object_id text not null,
  aspect text not null,
  event_time bigint not null,
  updates jsonb,
  user_id uuid references public.users(id) on delete cascade,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  attempts int not null default 0,
  next_try_at timestamptz not null default now(),
  last_error text,
  outcome text,
  unique (provider, object_id, aspect, event_time)
);
create index if not exists webhook_inbox_pending on public.webhook_inbox (next_try_at) where processed_at is null;
alter table public.webhook_inbox enable row level security;

-- E1: starea pe sportiv a lucrărilor programate (ultima reușită, ultima eroare, câte încercări, când se reîncearcă).
create table if not exists public.athlete_jobs (
  user_id uuid not null references public.users(id) on delete cascade,
  job text not null,
  last_started_at timestamptz,
  last_ok_at timestamptz,
  last_error text,
  failures int not null default 0,
  next_try_at timestamptz,
  primary key (user_id, job)
);
alter table public.athlete_jobs enable row level security;

insert into public.schema_meta (key, value) values ('version', 13)
  on conflict (key) do update set value = greatest(public.schema_meta.value, excluded.value), updated_at = now();

-- Revenire manuală (nu rulează automat):
--   alter table public.scores drop constraint scores_activity_id_fkey, drop constraint scores_extra_activity_id_fkey;
--   alter table public.scores add constraint scores_activity_id_fkey foreign key (activity_id) references public.activities(id) on update cascade;
--   alter table public.scores add constraint scores_extra_activity_id_fkey foreign key (extra_activity_id) references public.activities(id) on update cascade;
--   coloanele noi (users.android_token, workouts_planned.flags, packets.context_hash) și tabelele webhook_inbox,
--   athlete_jobs pot rămâne: codul vechi nu le citește. Schema_meta coboară cu: update public.schema_meta set value = 12 where key = 'version';
