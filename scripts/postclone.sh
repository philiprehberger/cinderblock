#!/usr/bin/env bash
#
# One-shot fork setup. Runs after `git clone` + `npm install` and gets a
# brand-new fork to "green pgtap" with no human intervention beyond the
# initial Supabase project URL prompt.
#
# Steps:
#   1. Verify prerequisites (node, npm, docker, supabase CLI)
#   2. Boot the local Supabase stack
#   3. Apply all migrations
#   4. Generate cb_audit_writer + cb_impersonator passwords
#   5. Generate EDGE_INTERNAL_SECRET + INVITE_SIGNING_KEY
#   6. Run pgtap; exit non-zero if anything's red
#   7. Print next-steps

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
red() { printf '\033[31m%s\033[0m\n' "$*"; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }

# 1. Prereqs
bold "1/6 — Verifying prerequisites"
for cmd in node npm docker npx; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    red "Missing: $cmd"
    exit 1
  fi
done
green "  node + npm + docker + npx all present"

if ! docker info >/dev/null 2>&1; then
  red "Docker daemon isn't running. Start Docker Desktop / the docker service and rerun."
  exit 1
fi
green "  docker daemon is up"

# 2. Boot Supabase
bold "2/6 — Booting local Supabase stack (cold cache: 10-15 min)"
if ! npx supabase status >/dev/null 2>&1; then
  npx supabase start
fi
green "  Supabase local stack is running"

# 3. Apply migrations (db reset is the idempotent path)
bold "3/6 — Applying migrations"
npx supabase db reset --local >/dev/null
green "  Migrations applied"

# 4. Roles
bold "4/6 — Generating Postgres role passwords"
./scripts/setup-roles.sh --rotate >/dev/null
green "  cb_audit_writer + cb_impersonator URLs written to .env.local"

# 5. Edge Function secrets
bold "5/6 — Generating Edge Function secrets"
gen32() { head -c 24 /dev/urandom | base64 | tr -d '+/=' | head -c 32; }
ENV_FILE="$REPO_ROOT/.env.local"
touch "$ENV_FILE"
add_if_missing() {
  local key="$1"
  local val="$2"
  if ! grep -q "^${key}=" "$ENV_FILE"; then
    printf '%s=%s\n' "$key" "$val" >> "$ENV_FILE"
    echo "  $key written"
  else
    echo "  $key already set, skipping"
  fi
}
add_if_missing "EDGE_INTERNAL_SECRET" "$(gen32)"
add_if_missing "INVITE_SIGNING_KEY" "$(gen32)"
add_if_missing "EDGE_ALLOWED_ORIGINS" "http://localhost:3000,http://127.0.0.1:3000"
add_if_missing "NEXT_PUBLIC_SITE_URL" "http://localhost:3000"

# Pull SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY /
# SUPABASE_JWT_SECRET from the running local stack.
if ! grep -q '^NEXT_PUBLIC_SUPABASE_URL=' "$ENV_FILE"; then
  bold "  Pulling local stack URLs + keys"
  npx supabase status -o env 2>/dev/null | awk -F= '
    $1 == "API_URL"          { gsub(/"/, "", $2); print "NEXT_PUBLIC_SUPABASE_URL=" $2 }
    $1 == "ANON_KEY"         { gsub(/"/, "", $2); print "NEXT_PUBLIC_SUPABASE_ANON_KEY=" $2 }
    $1 == "SERVICE_ROLE_KEY" { gsub(/"/, "", $2); print "SUPABASE_SERVICE_ROLE_KEY=" $2 }
    $1 == "JWT_SECRET"       { gsub(/"/, "", $2); print "SUPABASE_JWT_SECRET=" $2 }
  ' >> "$ENV_FILE"
fi
green "  .env.local populated"

# 6. pgtap
bold "6/6 — Running pgtap suite"
if npx supabase test db; then
  green ""
  green "  ✓ All tests green."
else
  red ""
  red "  ✗ pgtap reported failures. Check the output above; do not"
  red "    ship without fixing them."
  exit 1
fi

echo ""
bold "Next steps:"
echo "  npm run dev               # starts Next.js on :3000"
echo "  http://127.0.0.1:54324    # Mailpit (sign-in emails land here)"
echo "  http://127.0.0.1:54323    # Supabase Studio"
echo ""
echo "  See /docs/getting-started for the deploy flow."
