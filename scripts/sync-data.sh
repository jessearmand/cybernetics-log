#!/usr/bin/env bash
# Regenerate the committed data from the analysis workspace on the box, verify it,
# commit, and push. Pushing to main makes Vercel deploy to production; when that
# GitHub deployment succeeds, the webhook starts the agent and the page re-renders.
#
#   scripts/sync-data.sh [SOURCE_DIR]        # default /workspace/consciousness
#   PUSH=0 scripts/sync-data.sh              # commit only
#   BRANCH=data-refresh scripts/sync-data.sh # commit on a branch (Preview deploys don't re-render)
set -euo pipefail

SRC="${1:-/workspace/consciousness}"
cd "$(dirname "$0")/.."

if [[ -n "${BRANCH:-}" ]]; then git switch -C "$BRANCH"; fi

python3 scripts/build_discourse.py "$SRC"
node scripts/sync-default-instruction.mjs
npm run --silent check

git add data/ agent/lib/default-instruction.ts
if git diff --cached --quiet; then
  echo "No data changes; nothing to commit."
  exit 0
fi
git commit -m "data: regenerate discourse data from ${SRC}"
if [[ "${PUSH:-1}" == "1" ]]; then
  git push -u origin "$(git branch --show-current)"
  echo "Pushed. A successful Production deployment will trigger a re-render."
fi
