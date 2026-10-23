-- Evaluarea după date (decizia proprietarului, 23.10.2026): câte săptămâni de evaluare are planul (0–3). NULL = planurile
-- vechi, cu evaluarea implicită de 3 săptămâni. Fazele se calculează din start, cursă și acest număr, peste tot.
alter table public.plans add column if not exists evaluation_weeks smallint check (evaluation_weeks between 0 and 3);

insert into public.schema_meta (key, value) values ('version', 14)
  on conflict (key) do update set value = greatest(public.schema_meta.value, excluded.value), updated_at = now();
