-- Folosirea aplicației (cererea proprietarului, 20.10.2026: „când a fost ultima dată pe aplicație, tendința de a căuta
-- informații, cât le place”). Schema 12. Idempotent: rulează la fiecare „Pregătește”, după 0003.
--  - app_usage_daily: UN rând pe sportiv și zi, doar numărători (sesiuni, secunde în față, ecrane deschise, detalii
--    deschise). Fără conținut, fără texte, fără date de sănătate: ce ecran, nu ce scria pe el.
--  - app_feedback: nota 1–5 („Cât de mult îți place AIRON?”), cel mult o dată pe zi; nota scrisă e opțională.
create table if not exists public.app_usage_daily (
  user_id uuid not null references public.users(id) on delete cascade,
  date date not null,
  sessions int not null default 0,
  seconds int not null default 0,
  details int not null default 0,
  screens jsonb not null default '{}'::jsonb,
  last_at timestamptz not null default now(),
  primary key (user_id, date)
);
alter table public.app_usage_daily enable row level security;

create table if not exists public.app_feedback (
  user_id uuid not null references public.users(id) on delete cascade,
  date date not null,
  score smallint not null check (score between 1 and 5),
  note text,
  created_at timestamptz not null default now(),
  primary key (user_id, date)
);
alter table public.app_feedback enable row level security;

-- Adunarea atomică (două trimiteri simultane nu se suprascriu): numărătorile se adună, ecranele se adună pe cheie.
create or replace function public.track_usage(p_user uuid, p_date date, p_sessions int, p_seconds int, p_details int, p_screens jsonb)
returns void language plpgsql as $$
begin
  insert into public.app_usage_daily (user_id, date, sessions, seconds, details, screens, last_at)
  values (p_user, p_date, greatest(0, p_sessions), greatest(0, p_seconds), greatest(0, p_details), coalesce(p_screens, '{}'::jsonb), now())
  on conflict (user_id, date) do update set
    sessions = public.app_usage_daily.sessions + excluded.sessions,
    seconds = public.app_usage_daily.seconds + excluded.seconds,
    details = public.app_usage_daily.details + excluded.details,
    screens = (
      select coalesce(jsonb_object_agg(k, n), '{}'::jsonb) from (
        select k, sum(v)::int as n from (
          select key as k, value::text::int as v from jsonb_each(public.app_usage_daily.screens)
          union all
          select key, value::text::int from jsonb_each(excluded.screens)
        ) s group by k
      ) t
    ),
    last_at = now();
end $$;
revoke execute on function public.track_usage(uuid, date, int, int, int, jsonb) from public, anon, authenticated;
grant execute on function public.track_usage(uuid, date, int, int, int, jsonb) to service_role;

insert into public.schema_meta (key, value) values ('version', 12)
  on conflict (key) do update set value = greatest(public.schema_meta.value, excluded.value), updated_at = now();
