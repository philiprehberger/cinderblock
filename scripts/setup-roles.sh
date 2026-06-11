#!/usr/bin/env bash
#
# Idempotent role setup. Generates passwords for cb_audit_writer and
# cb_impersonator if they aren't already in .env.local, ALTERs the roles to
# LOGIN, and writes PG_AUDIT_WRITER_URL + PG_IMPERSONATOR_URL into .env.local.
#
# Safe to re-run — existing URLs in .env.local are preserved so server-side
# code with active connections doesn't lose its credentials.
#
# Run after `npx supabase start` finishes booting the local stack.
#
# In production this is called by scripts/postclone.sh during the fork-setup
# flow; the forker is prompted to confirm rotation. Same script, different
# entry point.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$REPO_ROOT/.env.local"

DB_HOST="${SUPABASE_DB_HOST:-127.0.0.1}"
DB_PORT="${SUPABASE_DB_PORT:-54322}"
DB_NAME="${SUPABASE_DB_NAME:-postgres}"
DB_SUPERUSER="${SUPABASE_DB_SUPERUSER:-postgres}"
DB_SUPERPASS="${SUPABASE_DB_SUPERPASS:-postgres}"

touch "$ENV_FILE"

# Read existing URL if present in .env.local. The grep returns empty when
# absent; matched line is `KEY=value` so cut at the first =.
existing_audit_url="$(grep -E '^PG_AUDIT_WRITER_URL=' "$ENV_FILE" | head -1 | cut -d= -f2- || true)"
existing_imp_url="$(grep -E '^PG_IMPERSONATOR_URL=' "$ENV_FILE" | head -1 | cut -d= -f2- || true)"

gen_password() {
  # 32 url-safe base64 chars from /dev/urandom. No `+/` to keep the connection
  # string URL-safe without percent-encoding.
  head -c 24 /dev/urandom | base64 | tr -d '+/=' | head -c 32
}

# psql isn't installed locally on a typical Cinderblock dev box (the host runs
# Docker; psql lives inside the supabase_db container). Detect which path is
# available and use the right one. Production / CI servers with a real psql
# get the direct path; local dev gets the docker-exec path.
SUPABASE_DB_CONTAINER="${SUPABASE_DB_CONTAINER:-supabase_db_cinderblock}"

if command -v psql >/dev/null 2>&1; then
  set_role_password() {
    local role="$1"
    local password="$2"
    PGPASSWORD="$DB_SUPERPASS" psql \
      -h "$DB_HOST" -p "$DB_PORT" -d "$DB_NAME" -U "$DB_SUPERUSER" \
      -v ON_ERROR_STOP=1 \
      -c "alter role $role with login password '$password';" \
      >/dev/null
  }
elif command -v docker >/dev/null 2>&1 && docker ps --format '{{.Names}}' | grep -q "^$SUPABASE_DB_CONTAINER$"; then
  set_role_password() {
    local role="$1"
    local password="$2"
    docker exec -i "$SUPABASE_DB_CONTAINER" psql \
      -U "$DB_SUPERUSER" -d "$DB_NAME" \
      -v ON_ERROR_STOP=1 \
      -c "alter role $role with login password '$password';" \
      >/dev/null
  }
else
  echo "ERROR: neither psql nor a running $SUPABASE_DB_CONTAINER container is available." >&2
  echo "Either install postgresql-client locally or run 'npx supabase start' first." >&2
  exit 1
fi

if [ -n "$existing_audit_url" ]; then
  echo "PG_AUDIT_WRITER_URL already set — skipping cb_audit_writer rotation"
else
  echo "Generating cb_audit_writer password and writing to .env.local..."
  audit_password="$(gen_password)"
  # ALTER ROLE first; only write the env file if it succeeded. Otherwise we'd
  # leave a stale env var pointing at a password the role doesn't accept.
  set_role_password "cb_audit_writer" "$audit_password"
  audit_url="postgresql://cb_audit_writer:${audit_password}@${DB_HOST}:${DB_PORT}/${DB_NAME}"
  printf 'PG_AUDIT_WRITER_URL=%s\n' "$audit_url" >> "$ENV_FILE"
fi

if [ -n "$existing_imp_url" ]; then
  echo "PG_IMPERSONATOR_URL already set — skipping cb_impersonator rotation"
else
  echo "Generating cb_impersonator password and writing to .env.local..."
  imp_password="$(gen_password)"
  set_role_password "cb_impersonator" "$imp_password"
  imp_url="postgresql://cb_impersonator:${imp_password}@${DB_HOST}:${DB_PORT}/${DB_NAME}"
  printf 'PG_IMPERSONATOR_URL=%s\n' "$imp_url" >> "$ENV_FILE"
fi

echo "Role setup complete. Connection strings written to $ENV_FILE."
