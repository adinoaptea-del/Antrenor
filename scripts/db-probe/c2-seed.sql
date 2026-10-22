-- Date sintetice (nu reale): un sportiv, un plan, o ședință făcută, legată de o activitate Strava cu scor.
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a1', 'proba-c2@exemplu.invalid');
insert into public.users (id, email) select '00000000-0000-0000-0000-0000000000a1', 'proba-c2@exemplu.invalid'
  where not exists (select 1 from public.users where id = '00000000-0000-0000-0000-0000000000a1');
insert into public.plans (id, user_id, goal, race_date, start_date, budget_hours)
  values ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a1', '70.3', '2027-06-01', '2026-10-19', 8);
insert into public.workouts_planned (id, plan_id, user_id, date, sport, type, planned_minutes, target_zones, status, note, original) values
  ('w-run', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a1', '2026-10-21', 'alergare', 'z2', 45, '{2}', 'planificat', null, null),
  ('w-moved', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a1', '2026-10-23', 'inot', 'tehnica', 45, '{1,2}', 'mutat', 'mutată de tine de miercuri pe vineri', '{"date":"2026-10-21","type":"tehnica","plannedMinutes":45,"targetZones":[1,2],"key":false,"status":"planificat"}'),
  ('w-vreme', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a1', '2026-10-24', 'bicicleta', 'z2', 60, '{2}', 'mutat', 'vremea: ploaie 80% mâine; inversată cu înotul', '{"date":"2026-10-25","type":"z2","plannedMinutes":60,"targetZones":[2],"key":false,"status":"planificat"}'),
  ('w-progres', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a1', '2026-10-26', 'alergare', 'lung', 70, '{2}', 'planificat', '+10 min: creștere controlată (7 zile verzi)', null);
insert into public.activities (id, user_id, source, external_id, date, sport, minutes)
  values ('strava-9001', '00000000-0000-0000-0000-0000000000a1', 'strava', '9001', '2026-10-21', 'alergare', 46);
insert into public.scores (workout_id, user_id, activity_id, color, reasons, metrics, flags, is_final)
  values ('w-run', '00000000-0000-0000-0000-0000000000a1', 'strava-9001', 'verde', '{"făcută"}', '{}'::jsonb, '{}'::jsonb, true);
