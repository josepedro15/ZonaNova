#!/usr/bin/env bash
# =============================================================================
# Postgres local para desenvolvimento e para rodar tests/rls.sql.
#
# Não substitui o Supabase: recria o mínimo que o Supabase fornece (schema
# auth, auth.uid(), os papéis, e as default privileges de `public`) para que as
# migrations e a RLS rodem iguais.
#
#   scripts/db-local.sh up      sobe o cluster
#   scripts/db-local.sh reset   recria a base, aplica migrations e seed
#   scripts/db-local.sh test    reset + tests/rls.sql
#   scripts/db-local.sh psql    abre o psql
#   scripts/db-local.sh down    derruba o cluster
#
# Roda em Linux (como root, com o utilizador `postgres` do sistema) e em macOS
# (como o próprio utilizador, com o Postgres do Homebrew). Em ambos o superuser
# do cluster chama-se `postgres`: a migration 0003 faz `alter default
# privileges FOR ROLE postgres`, e sem esse nome ela rebenta.
# =============================================================================
set -euo pipefail

DB=zonanova
PORT=${PORT:-5433}
RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# --- Onde estão os binários do servidor -------------------------------------
achaBin() {
    local d
    for d in ${PGBIN:-} \
             /opt/homebrew/opt/postgresql@17/bin \
             /usr/local/opt/postgresql@17/bin \
             /usr/lib/postgresql/17/bin \
             /usr/lib/postgresql/16/bin; do
        [ -n "$d" ] && [ -x "$d/postgres" ] && { echo "$d"; return 0; }
    done
    echo "não encontrei o servidor Postgres." >&2
    echo "  macOS: brew install postgresql@17" >&2
    echo "  Debian/Ubuntu: apt install postgresql-17" >&2
    echo "  ou aponte PGBIN para o diretório com o binário 'postgres'." >&2
    return 1
}
PGBIN="$(achaBin)"

ehRoot() { [ "$(id -u)" -eq 0 ]; }

# Como root o initdb recusa correr, então passa-se pelo utilizador do sistema.
# Fora disso corre-se direto — é o caso do macOS, onde não existe `postgres`.
rodaPg() {
    if ehRoot; then su postgres -c "PATH=$PGBIN:\$PATH $1"
    else PATH="$PGBIN:$PATH" bash -c "$1"; fi
}

if ehRoot; then PGDATA=${PGDATA:-/var/lib/postgresql/zn}
else            PGDATA=${PGDATA:-$HOME/.local/share/zonanova/pg}; fi

# Socket dentro do PGDATA: não depende de /var/run/postgresql, que no macOS não
# existe e em Linux exige permissão.
export PGDATA PGHOST="$PGDATA" PGPORT=$PORT PGUSER=postgres
export PATH="$PGBIN:$PATH"

# No macOS o postmaster morre no arranque com "became multithreaded during
# startup" se a locale não estiver resolvida — as libs do sistema criam threads
# ao tentar adivinhá-la, e o Postgres recusa arrancar multithreaded.
export LC_ALL=${LC_ALL:-en_US.UTF-8} LANG=${LANG:-en_US.UTF-8}

up() {
    if rodaPg "pg_ctl -D $PGDATA status" >/dev/null 2>&1; then
        echo "postgres já no ar na porta $PORT"; return
    fi
    if [ ! -f "$PGDATA/PG_VERSION" ]; then
        mkdir -p "$PGDATA"
        ehRoot && { chown postgres:postgres "$PGDATA"; chmod 700 "$PGDATA"; }
        rodaPg "initdb -D $PGDATA -U postgres --auth=trust" >/dev/null
    fi
    rodaPg "pg_ctl -D $PGDATA -l $PGDATA/pg.log -o '-p $PORT -k $PGDATA' start" >/dev/null
    for _ in $(seq 1 20); do
        pg_isready -q && break || sleep 0.5
    done
    echo "postgres no ar na porta $PORT  ($PGDATA)"
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

-- O Supabase não entrega um `public` fechado: o projeto vem com as default
-- privileges abaixo, e por isso TODA tabela criada pelas migrations já nasce
-- com ALL para anon e authenticated. Sem replicar isto, o Postgres local é
-- mais restritivo que a produção e o tests/rls.sql passa por motivo errado —
-- foi assim que o `grant select (…)` que exclui conexoes_whatsapp.instance_token
-- pareceu funcionar durante a Fase 3 e não funcionava no Supabase real.
-- Quem desfaz isto é a migration 0003.
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables    to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
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
    down) rodaPg "pg_ctl -D $PGDATA stop" >/dev/null && echo "postgres parado" ;;
    *) echo "uso: $0 {up|reset|test|psql|down}"; exit 1 ;;
esac
