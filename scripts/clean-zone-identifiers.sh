#!/bin/bash
set -e

BASE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

find "$BASE" -name "*Zone.Identifier" -type f -delete -print | while read -r f; do
    echo "Deleted: $f"
done

echo "Done cleaning Zone.Identifier files."