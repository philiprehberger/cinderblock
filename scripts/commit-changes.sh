#!/usr/bin/env bash
#
# Stage everything and create a commit with an auto-generated message
# based on which top-level areas of the repo changed.
#
# Usage:
#   ./commit-changes.sh                              # Stage + commit
#   ./commit-changes.sh --dryrun                     # Show what would be committed
#   ./commit-changes.sh --message "Custom message"   # Override message
#

set -euo pipefail

BASE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$BASE_DIR"

bash scripts/clean-zone-identifiers.sh

DRYRUN=false
CUSTOM_MSG=""

PREV_ARG=""
for arg in "$@"; do
    case "$arg" in
        --dryrun|--dry-run)
            DRYRUN=true
            ;;
        --message=*)
            CUSTOM_MSG="${arg#--message=}"
            ;;
        --message)
            : # value picked up on next iteration
            ;;
        *)
            if [ "$PREV_ARG" = "--message" ]; then
                CUSTOM_MSG="$arg"
            fi
            ;;
    esac
    PREV_ARG="$arg"
done

GREEN='\033[0;32m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# ── Gather changes ───────────────────────────────────────────────────

CHANGED=()

while IFS= read -r -d '' entry; do
    [ -z "$entry" ] && continue
    path="${entry:3}"
    path="${path%/}"
    CHANGED+=("$path")
done < <(git status -z --untracked-files=all)

if [ ${#CHANGED[@]} -eq 0 ]; then
    printf "${GREEN}Nothing to commit — working tree clean.${NC}\n"
    exit 0
fi

# ── Display changes ──────────────────────────────────────────────────

echo ""
printf "${BOLD}Changes detected (%d):${NC}\n" "${#CHANGED[@]}"
for f in "${CHANGED[@]}"; do
    printf "  %s\n" "$f"
done
echo ""

# ── Generate commit message ──────────────────────────────────────────

generate_message() {
    declare -A buckets=()
    local has_other=false

    for f in "${CHANGED[@]}"; do
        case "$f" in
            supabase/migrations/*|supabase/migrations)       buckets[migrations]=1 ;;
            supabase/tests/*|supabase/tests)                 buckets[pgtap]=1 ;;
            supabase/functions/*|supabase/functions)         buckets[functions]=1 ;;
            supabase/*|supabase)                             buckets[supabase]=1 ;;
            src/app/*|src/app)                               buckets[app]=1 ;;
            src/lib/supabase/*|src/lib/supabase)             buckets[supabase-clients]=1 ;;
            src/lib/audit/*|src/lib/audit)                   buckets[audit]=1 ;;
            src/lib/*|src/lib)                               buckets[lib]=1 ;;
            src/*|src)                                       buckets[src]=1 ;;
            e2e/*|e2e)                                       buckets[e2e]=1 ;;
            tests/*|tests)                                   buckets[tests]=1 ;;
            docs/*|docs)                                     buckets[docs]=1 ;;
            infra/apache/*|infra/apache)                     buckets[apache]=1 ;;
            infra/*|infra)                                   buckets[infra]=1 ;;
            scripts/*|scripts)                               buckets[scripts]=1 ;;
            .github/*|.github)                               buckets[ci]=1 ;;
            .claude/*|.claude)                               buckets[claude]=1 ;;
            public/*|public)                                 buckets[public]=1 ;;
            package.json|package-lock.json)                  buckets[deps]=1 ;;
            tsconfig.json|tsconfig.tsbuildinfo|next.config.ts|next-env.d.ts|\
            eslint.config.mjs|postcss.config.mjs|\
            playwright.config.ts|vitest.config.ts|\
            .editorconfig|.gitignore|.env.example)           buckets[config]=1 ;;
            README.md|CHANGELOG.md|CONTRIBUTING.md|\
            CLAUDE.md|AGENTS.md|LICENSE)                     buckets[meta]=1 ;;
            *)                                               has_other=true ;;
        esac
    done

    local descs=()
    # Stable order — schema + policy tests first, then app code, then infra/meta.
    for k in migrations pgtap functions supabase \
             supabase-clients audit lib app src \
             e2e tests \
             apache infra scripts ci claude \
             public deps config docs meta; do
        [ -n "${buckets[$k]:-}" ] && descs+=("$k")
    done
    $has_other && descs+=("files")

    if [ ${#descs[@]} -eq 0 ]; then
        echo "update repository"
        return
    fi

    local msg="update ${descs[0]}"
    for ((i=1; i<${#descs[@]}; i++)); do
        msg="$msg, ${descs[$i]}"
    done
    echo "$msg"
}

if [ -n "$CUSTOM_MSG" ]; then
    COMMIT_MSG="$CUSTOM_MSG"
else
    COMMIT_MSG=$(generate_message)
fi

echo "─────────────────────────────────────────"
printf "${BOLD}Commit message:${NC}\n"
printf "  %s\n" "$COMMIT_MSG"
echo "─────────────────────────────────────────"
echo ""

# ── Commit ───────────────────────────────────────────────────────────

if [ "$DRYRUN" = true ]; then
    printf "${CYAN}Dry run — remove --dryrun to stage and commit.${NC}\n"
    exit 0
fi

git add -A
git commit -m "$COMMIT_MSG"

printf "\n${GREEN}Committed.${NC}\n"
git log --oneline -1
