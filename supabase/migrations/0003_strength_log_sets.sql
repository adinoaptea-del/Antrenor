-- Jurnalul de forță pe serie și pe ședință (auditul v93, A57/A58; schema 11). Idempotent: rulează la fiecare „Pregătește”,
-- după 0002_upgrade.sql. Rândurile vechi rămân valabile: workout_id = '' și instance = 0 (ziua + exercițiul, ca înainte).
--  - workout_id + instance: două ședințe în aceeași zi (sau același exercițiu de două ori într-o ședință) nu se mai
--    suprascriu; instance = poziția exercițiului în prescripție.
--  - sets (jsonb) păstrează greutatea și repetările fiecărei serii (piramida 20/15/12/8 cu greutăți diferite) și,
--    opțional, rezerva pe serie.
--  - source: „declarat_conform” = confirmarea prescripției (nu e măsurătoare); „ajustat” = valorile scrise de sportiv;
--    „confirmat” rămâne doar pentru rândurile vechi.
--  - unit / load_convention: cum se citesc kilogramele (total, pe mână, treapta aparatului); necunoscut = null.
alter table public.strength_log add column if not exists workout_id text not null default '';
alter table public.strength_log add column if not exists instance smallint not null default 0;
alter table public.strength_log add column if not exists unit text not null default 'kg';
alter table public.strength_log add column if not exists load_convention text;

alter table public.strength_log drop constraint if exists strength_log_source_check;
alter table public.strength_log add constraint strength_log_source_check
  check (source in ('confirmat', 'declarat_conform', 'ajustat'));
alter table public.strength_log drop constraint if exists strength_log_unit_check;
alter table public.strength_log add constraint strength_log_unit_check check (unit in ('kg'));
alter table public.strength_log drop constraint if exists strength_log_load_convention_check;
alter table public.strength_log add constraint strength_log_load_convention_check
  check (load_convention is null or load_convention in ('total', 'per_mana', 'aparat_treapta'));

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.strength_log'::regclass and contype = 'p' and array_length(conkey, 1) = 5
  ) then
    alter table public.strength_log drop constraint if exists strength_log_pkey;
    alter table public.strength_log add constraint strength_log_pkey primary key (user_id, date, exercise, workout_id, instance);
  end if;
end $$;

insert into public.schema_meta (key, value) values ('version', 11)
  on conflict (key) do update set value = greatest(public.schema_meta.value, excluded.value), updated_at = now();
