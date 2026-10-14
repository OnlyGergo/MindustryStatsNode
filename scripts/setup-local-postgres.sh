#!/usr/bin/env bash
# Sets up the local PostgreSQL cluster with TimescaleDB for the tracker.
#
# Idempotent: every step checks what is already in place, so it is safe to re-run.
# Any failure stops the script; there is no fallback install method.
#
#   1. Installs postgresql-$PG_VERSION if missing, and starts the cluster.
#   2. Installs timescaledb-2-postgresql-$PG_VERSION from the official TimescaleDB apt repo.
#   3. Adds timescaledb to shared_preload_libraries (restarts the cluster once if changed).
#   4. Sets the postgres password, creates $DB_NAME and enables the extension.
#   5. Smoke-tests a hypertable and a continuous aggregate, the two features the
#      collector migrations use, then drops the test schema.
#
# Overrides (environment variables):
#   PG_VERSION      PostgreSQL major version              (default 16)
#   PG_CLUSTER      cluster name                          (default main)
#   DB_NAME         database to create                    (default mindustry_stats)
#   DB_PASSWORD     password set for the postgres role    (default postgres)
#
# Usage: scripts/setup-local-postgres.sh
set -euo pipefail

PG_VERSION="${PG_VERSION:-16}"
PG_CLUSTER="${PG_CLUSTER:-main}"
DB_NAME="${DB_NAME:-mindustry_stats}"
DB_PASSWORD="${DB_PASSWORD:-postgres}"

PG_BIN="/usr/lib/postgresql/${PG_VERSION}/bin"
PG_LIB="/usr/lib/postgresql/${PG_VERSION}/lib"
PG_EXT="/usr/share/postgresql/${PG_VERSION}/extension"

log() { printf '\n==> %s\n' "$*"; }
die() { printf 'error: %s\n' "$*" >&2; exit 1; }

SUDO=""
if [ "$(id -u)" -ne 0 ]; then
  command -v sudo >/dev/null || die "run as root or install sudo"
  SUDO="sudo"
fi

# Admin SQL as the postgres OS user (peer auth). SQL is read from stdin so psql
# variables (:'name') are interpolated.
psql_admin() { $SUDO runuser -u postgres -- psql -X -q -v ON_ERROR_STOP=1 "$@"; }

install_postgres() {
  if [ -x "${PG_BIN}/pg_ctl" ]; then
    return
  fi
  log "Installing postgresql-${PG_VERSION}"
  $SUDO apt-get update -qq
  $SUDO apt-get install -y -qq "postgresql-${PG_VERSION}"
}

cluster_online() {
  pg_lsclusters --no-header 2>/dev/null \
    | awk -v v="$PG_VERSION" -v c="$PG_CLUSTER" '$1 == v && $2 == c { print $4 }' \
    | grep -qx online
}

ensure_running() {
  if cluster_online; then
    return
  fi
  log "Starting cluster ${PG_VERSION}/${PG_CLUSTER}"
  $SUDO pg_ctlcluster "$PG_VERSION" "$PG_CLUSTER" start
}

install_timescaledb() {
  # shellcheck disable=SC1091
  . /etc/os-release
  local key=/usr/share/keyrings/timescaledb.gpg
  local list=/etc/apt/sources.list.d/timescaledb.list

  log "Adding the TimescaleDB apt repo and installing timescaledb-2-postgresql-${PG_VERSION}"
  $SUDO apt-get install -y -qq curl gnupg ca-certificates >/dev/null
  $SUDO sh -c "curl -fsSL https://packagecloud.io/timescale/timescaledb/gpgkey | gpg --dearmor -o '$key'"
  echo "deb [signed-by=$key] https://packagecloud.io/timescale/timescaledb/${ID} ${VERSION_CODENAME} main" \
    | $SUDO tee "$list" >/dev/null
  $SUDO apt-get update -qq
  $SUDO apt-get install -y -qq "timescaledb-2-postgresql-${PG_VERSION}"
}

# Adds timescaledb to shared_preload_libraries. Returns 0 when a restart is needed.
configure_preload() {
  local current
  current="$(psql_admin -tA -c 'SHOW shared_preload_libraries')"
  case ",${current}," in
    *,timescaledb,*) return 1 ;;
  esac

  local value="timescaledb"
  if [ -n "$current" ]; then
    value="${current},timescaledb"
  fi
  log "Setting shared_preload_libraries = '${value}'"
  psql_admin -c "ALTER SYSTEM SET shared_preload_libraries = '${value}'"
  return 0
}

configure_database() {
  log "Setting the postgres password and creating database '${DB_NAME}'"
  psql_admin -v pw="$DB_PASSWORD" <<'SQL'
ALTER USER postgres PASSWORD :'pw';
SQL
  psql_admin -v db="$DB_NAME" <<'SQL'
SELECT format('CREATE DATABASE %I', :'db')
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = :'db')
\gexec
SQL

  psql_admin -d "$DB_NAME" -c 'CREATE EXTENSION IF NOT EXISTS timescaledb'

  local installed available
  installed="$(psql_admin -d "$DB_NAME" -tA -c "SELECT extversion FROM pg_extension WHERE extname = 'timescaledb'")"
  available="$(psql_admin -d "$DB_NAME" -tA -c "SELECT default_version FROM pg_available_extensions WHERE name = 'timescaledb'")"
  if [ "$installed" != "$available" ]; then
    log "Upgrading timescaledb extension ${installed} -> ${available}"
    psql_admin -d "$DB_NAME" -c 'ALTER EXTENSION timescaledb UPDATE'
  fi
}

smoke_test() {
  log "Smoke-testing hypertables and continuous aggregates"
  psql_admin -d "$DB_NAME" <<'SQL'
DROP SCHEMA IF EXISTS setup_check CASCADE;
CREATE SCHEMA setup_check;
CREATE TABLE setup_check.samples (ts timestamptz NOT NULL, server_id int NOT NULL, players int NOT NULL);
SELECT create_hypertable('setup_check.samples', 'ts');
INSERT INTO setup_check.samples VALUES (now(), 1, 5), (now(), 1, 9);
CREATE MATERIALIZED VIEW setup_check.samples_1h
  WITH (timescaledb.continuous) AS
  SELECT time_bucket('1 hour', ts) AS bucket, server_id, max(players) AS players
  FROM setup_check.samples
  GROUP BY bucket, server_id
  WITH NO DATA;
CALL refresh_continuous_aggregate('setup_check.samples_1h', NULL, NULL);
SELECT count(*) AS continuous_aggregate_rows FROM setup_check.samples_1h;
DROP SCHEMA setup_check CASCADE;
SQL
}

main() {
  install_postgres

  if [ -f "${PG_LIB}/timescaledb.so" ] && [ -f "${PG_EXT}/timescaledb.control" ]; then
    log "TimescaleDB files already present"
  else
    install_timescaledb
  fi

  ensure_running
  if configure_preload; then
    log "Restarting cluster to load timescaledb"
    $SUDO pg_ctlcluster "$PG_VERSION" "$PG_CLUSTER" restart
  fi

  configure_database
  smoke_test

  local version
  version="$(psql_admin -d "$DB_NAME" -tA -c "SELECT extversion FROM pg_extension WHERE extname = 'timescaledb'")"
  log "TimescaleDB ${version} is ready in database '${DB_NAME}'"
  cat <<EOF
Connection settings for backend/.env and collector/.env:
  DB_HOST=localhost
  DB_PORT=5432
  DB_NAME=${DB_NAME}
  DB_USER=postgres
  DB_PASSWORD=${DB_PASSWORD}
EOF
}

main "$@"
