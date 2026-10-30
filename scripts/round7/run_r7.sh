#!/usr/bin/env bash
# Round 7 models on the same 69 round-5/6 posts, same question groups and args as d1-ultra, Decider and GPT-6 Luna.
# usage: run_r7.sh <model> [stance4-only]
# Layout: run from a scratch tree with round5/{run_r5.py,questions_r5.json,posts_r5.jsonl,raw/} and round6/{run_r6.py,questions_r6.json,raw/},
# with this script in round7/. The question files and posts are data/questions_r5.json, data/questions_r6.json and data/posts_r5.jsonl.
# Needs AI_GATEWAY_API_KEY in the environment; nothing here prints it.
set -euo pipefail
cd "$(dirname "$0")/../round5"
m=$1; s=${m//\//_}
if [ "${2:-}" != "stance4-only" ]; then
  for g in core framing attribution; do python3 run_r5.py $g "$m" posts_r5.jsonl raw/${g}_$s.jsonl; done
fi
python3 ../round6/run_r6.py stance4 "$m" posts_r5.jsonl ../round6/raw/stance4_$s.jsonl
# Retry pass for errors (the runner skips ids that already have answers): keep error lines aside, rerun.
for f in raw/{core,framing,attribution}_$s.jsonl ../round6/raw/stance4_$s.jsonl; do
  [ -f "$f" ] || continue
  if grep -q '"error"' "$f"; then
    grep '"error"' "$f" >> "$f.errors"
    # grep -v exits 1 when every line is an error; under set -e that would end the run before the retry.
    { grep -v '"error"' "$f" || true; } > "$f.tmp"; mv "$f.tmp" "$f"
    g=$(basename "$f" | cut -d_ -f1)
    if [ "$g" = stance4 ]; then python3 ../round6/run_r6.py stance4 "$m" posts_r5.jsonl "$f"; else python3 run_r5.py $g "$m" posts_r5.jsonl "$f"; fi
  fi
done
