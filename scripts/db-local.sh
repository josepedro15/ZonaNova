#!/usr/bin/env bash
# =============================================================================
# Postgres local para desenvolvimento e para rodar tests/rls.sql.
#
# Não substitui o Supabase: recria o mínimo que o Supabase fornece (schema
# auth, auth.uid(), os papéis) para que as migrations e a RLS rodem iguais.
#
#   scripts/db-local.sh up      sobe o cluster
#   scripts/db-local.sh reset   recria a base, aplica migrations e seed
#   scripts/db-local.sh test    reset + tests/rls.sql
#   scripts/db-local.sh psql    abre o psql
#   scripts/db-local.sh down    derruba o cluster
# =============================================================================
set -euo pipefail

PGBIN=${PGBIN:-/usr/lib/postgresql/16/bin}
PGDATA=${PGDATA:-/var/lib/postgresql/zn}
PORT=${PORT:-5433}
DB=zonanova
RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export PGHOST=/var/run/postgresql PGPORT=$PORT PGUSER=postgres

comoPostgres() { su postgres -c "PATH=$PGBIN:\$PATH $1"; }

up() {
    if comoPostgres "pg_ctl -D $PGDATA status" >/dev/null 2>&1; then
        echo "postgres já no ar na porta $PORT"; return
    fi
    if [ ! -f "$PGDATA/PG_VERSION" ]; then
        mkdir -p "$PGDATA"; chown postgres:postgres "$PGDATA"; chmod 700 "$PGDATA"
        comoPostgres "initdb -D $PGDATA --auth=trust" >/dev/null
    fi
    comoPostgres "pg_ctl -D $PGDATA -l $PGDATA/pg.log -o '-p $PORT' start" >/dev/null
    sleep 2; echo "postgres no ar na porta $PORT"
}

# O que o Supabase dá pronto e as migrations assumem que existe.
stubSupabase() {
    psql -d $DB -q <<'SQL'
create schema if not exists auth;
create table if not exists auth.users (
    id uuid primary key default gen_random_uuid(),
    email text unique,
    raw_user_meta_data jsonb default '{}'::jsonb
);
create or replace function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
do $$ begin
  if not exists (select 1 from pg_roles where rolname='authenticated') then
      create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='anon') then
      create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then
      create role service_role nologin bypassrls; end if;
end $$;
grant usage on schema auth to authenticated, anon, service_role;
SQL
}

reset() {
    up
    psql -d postgres -qtAc "drop database if exists $DB;" >/dev/null
    psql -d postgres -qtAc "create database $DB;" >/dev/null
    stubSupabase
    for f in "$RAIZ"/supabase/migrations/*.sql; do
        psql -d $DB -v ON_ERROR_STOP=1 -q -f "$f" 2>&1 | grep -v NOTICE || true
        echo "aplicada  $(basename "$f")"
    done
    psql -d $DB -v ON_ERROR_STOP=1 -q -f "$RAIZ/supabase/seed/dev_seed.sql" 2>&1 | grep -v NOTICE || true
    echo "seed de desenvolvimento carregado"
}

testar() {
    reset >/dev/null
    echo "=== tests/rls.sql ==="
    local saida; saida=$(psql -d $DB -f "$RAIZ/tests/rls.sql" 2>&1)
    echo "$saida" | grep -oE '(PASSOU|FALHOU).*' || true
    local p f; p=$(grep -c PASSOU <<<"$saida" || true); f=$(grep -c FALHOU <<<"$saida" || true)
    echo "---"; echo "$p passaram, $f falharam"
    [ "$f" -eq 0 ] || { echo "RLS COM FALHA — não subir nada assim"; exit 1; }
}

case "${1:-test}" in
    up) up ;;
    reset) reset ;;
    test) testar ;;
    psql) up; psql -d $DB ;;
    down) comoPostgres "pg_ctl -D $PGDATA stop" >/dev/null && echo "postgres parado" ;;
    *) echo "uso: $0 {up|reset|test|psql|down}"; exit 1 ;;
esac
