#!/usr/bin/env bash
# Aplică migrările ca server/_lib/setup.ts (0001 într-o tranzacție, apoi 0002…0005, apoi drepturile) pe un PostgreSQL
# local. Folosire: PSQL="psql -h <socket> -p <port> -U postgres" bash scripts/db-probe/apply.sh <baza> [ultima]
# `ultima` = numărul ultimei migrări aplicate (implicit 5), ca proba să poată arăta comportamentul de dinainte.
set -euo pipefail
DB="$1"; LAST="${2:-5}"
cd "$(dirname "$0")/../.."
P="$PSQL -v ON_ERROR_STOP=1 -q -d $DB"
$P -f scripts/db-probe/supabase-stubs.sql
{ echo 'begin;'; cat supabase/migrations/0001_init.sql; echo; echo 'commit;'; } | $P
for f in supabase/migrations/000[2-9]_*.sql; do
  n=$(basename "$f" | cut -c1-4); [ "$((10#$n))" -le "$LAST" ] || continue
  $P -f "$f"
done
