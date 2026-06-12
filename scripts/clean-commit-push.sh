#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

bash "$SCRIPT_DIR/clean-zone-identifiers.sh"
bash "$SCRIPT_DIR/commit-changes.sh"
git push
