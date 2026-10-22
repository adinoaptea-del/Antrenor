#!/usr/bin/env bash
# Proba C2/A2/C5 pe PostgreSQL local, cu date sintetice: ștergerea unei activități cu scor ÎNAINTE de 0005 (schema 12)
# și DUPĂ (schema 13), plus idempotența migrării, completarea stării tipizate din note și tokenul Android.
# Folosire: PSQL="psql -h <socket> -p <port> -U postgres" bash scripts/db-probe/c2-probe.sh
set -uo pipefail
cd "$(dirname "$0")/../.."
Q="$PSQL -v ON_ERROR_STOP=1 -q"
$Q -c "drop database if exists probe_c2" -c "create database probe_c2" >/dev/null
bash scripts/db-probe/apply.sh probe_c2 4 2>&1 | grep -v NOTICE
$Q -d probe_c2 -f scripts/db-probe/c2-seed.sql
echo "schema: $($Q -d probe_c2 -tAc "select value from schema_meta where key='version'")"
echo "--- ÎNAINTE (schema 12): ștergerea activității legate de scor"
$Q -d probe_c2 -c "delete from public.activities where id = 'strava-9001'" 2>&1 | sed -n 1p
echo "activități rămase: $($Q -d probe_c2 -tAc "select count(*) from public.activities")"
echo "--- aplic 0005 (de două ori: trebuie să fie idempotentă)"
$Q -d probe_c2 -f supabase/migrations/0005_audit_consolidat.sql 2>&1 | grep -v NOTICE
$Q -d probe_c2 -f supabase/migrations/0005_audit_consolidat.sql 2>&1 | grep -v NOTICE
echo "schema: $($Q -d probe_c2 -tAc "select value from schema_meta where key='version'")"
echo "--- DUPĂ (schema 13): aceeași ștergere"
$Q -d probe_c2 -c "delete from public.activities where id = 'strava-9001'" 2>&1 | sed -n 1p
echo "activități rămase: $($Q -d probe_c2 -tAc "select count(*) from public.activities")"
echo "scorul ședinței w-run: $($Q -d probe_c2 -tAc "select coalesce(activity_id,'NULL')||' / '||color from public.scores where workout_id='w-run'")"
echo "  (culoarea veche rămâne până la rescore; codul cheamă rescore imediat după ștergere: server/_lib/activity-delete.ts)"
echo "--- A2: starea tipizată completată din notele vechi"
$Q -d probe_c2 -tAc "select id||': '||coalesce(flags->>'origin','(fără)')||' manual='||coalesce(flags->>'manual_override','-')||' slot='||coalesce(flags->>'original_slot','-')||' motiv_vreme='||coalesce(flags->'weather_swap'->>'reason','-') from public.workouts_planned order by id"
echo "--- C5: coloana android_token și unicitatea ei"
$Q -d probe_c2 -tAc "select count(*) from information_schema.columns where table_name='users' and column_name='android_token'"
$Q -d probe_c2 -c "update public.users set android_token='tok-a' where id='00000000-0000-0000-0000-0000000000a1'" && echo "android_token scris; apple_token rămâne: $($Q -d probe_c2 -tAc "select coalesce(apple_token,'NULL') from public.users")"
echo "--- tabele noi (RLS activ)"
$Q -d probe_c2 -tAc "select relname||' rls='||relrowsecurity from pg_class where relname in ('webhook_inbox','athlete_jobs') order by 1"
