#!/usr/bin/env bash
# Round 7 X set: run one model on the 79 on-topic posts for the stance4 and use questions, then retry errors once.
# usage: run_r7x.sh <model>   (needs AI_GATEWAY_API_KEY in the environment; nothing here prints it)
# Layout: posts_r7.jsonl (built from Seeker's posts_labeled.jsonl, keeping the 79 posts labelled applied/commentary/academic), questions_r7.json (a copy of data/questions_r7.json) and raw/ sit next to this script.
set -euo pipefail
cd "$(dirname "$0")"
m=$1; s=${m//\//_}
for g in stance4 use; do
  f=raw/${g}_$s.jsonl
  python3 run_r7x.py $g "$m" posts_r7.jsonl "$f"
  if grep -q '"error"' "$f"; then
    grep '"error"' "$f" >> "$f.errors"
    # grep -v exits 1 when every line is an error; under set -e that would end the run before the retry.
    { grep -v '"error"' "$f" || true; } > "$f.tmp"; mv "$f.tmp" "$f"
    python3 run_r7x.py $g "$m" posts_r7.jsonl "$f"
  fi
done
