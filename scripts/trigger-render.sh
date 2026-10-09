#!/usr/bin/env bash
# Re-render with an explicit instruction, without changing any data, by creating a
# GitHub deployment in the "page-render" environment and marking it successful.
# GitHub then sends the same signed deployment_status webhook a Vercel deploy does.
#
#   scripts/trigger-render.sh "Lead with the pair test; accent teal." [ref]
#
# Needs `gh` authenticated with repo (deployments) write access, and jq.
set -euo pipefail

INSTRUCTION="${1:?usage: scripts/trigger-render.sh \"instruction\" [ref]}"
REF="${2:-main}"
REPO="${REPO:-jessearmand/cybernetics-log}"

body=$(jq -n --arg ref "$REF" --arg i "$INSTRUCTION" \
  '{ref: $ref, environment: "page-render", auto_merge: false, required_contexts: [], transient_environment: true,
    description: "manual page render", payload: {instruction: $i}}')
id=$(gh api "repos/$REPO/deployments" --method POST --input - -q .id <<<"$body")
gh api "repos/$REPO/deployments/$id/statuses" --method POST \
  -f state=success -f description="manual render request" >/dev/null
echo "Created deployment $id (page-render) for $REF; the webhook will start a render."
