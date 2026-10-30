// The box-side round 7 scorer, run on a minimal fixture in a temp folder (no model is called).
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { parseCsv } from "./csv.ts";

const repo = fileURLToPath(new URL("..", import.meta.url));

test("score_r7x.py: a model with only an error record for a post leaves its p_applied cell blank", () => {
  const root = mkdtempSync(join(tmpdir(), "score7x-"));
  const raw = join(root, "round7", "raw");
  const out = join(root, "out");
  mkdirSync(raw, { recursive: true });
  mkdirSync(out);
  const post = { id: "1", username: "a", created_at: "2026-10-20T00:00:00Z", url: "https://x.com/a/status/1", queries: ["q"], seeker_label: "commentary", text: "We changed our agent's rules." };
  writeFileSync(join(root, "round7", "posts_r7.jsonl"), JSON.stringify(post) + "\n");
  const use = { type: "choice", choice: "applied", probabilities: { applied: 0.7, commentary: 0.2, academic: 0.1 } };
  writeFileSync(join(raw, "use_baseten_joey-1.jsonl"), JSON.stringify({ id: "1", username: "a", model: "baseten/joey-1", group: "use", answers: { use }, usage: { inputTokens: 10 }, cost: "0", latency_s: 1, attempts: 1 }) + "\n");
  writeFileSync(join(raw, "use_liquid_d1-ultra.jsonl"), JSON.stringify({ id: "1", username: "a", model: "liquid/d1-ultra", group: "use", error: "timeout after 120s" }) + "\n");
  const r = spawnSync("python3", [join(repo, "scripts", "round7", "score_r7x.py"), out], { env: { ...process.env, R7_SRC: root }, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(existsSync(join(out, "run_r7_x.csv")), "run_r7_x.csv is written");
  const [cand] = parseCsv(readFileSync(join(out, "applied_candidates_r7_x.csv"), "utf8"));
  assert.equal(cand!.models, "baseten/joey-1");
  assert.equal(cand!.joey_p_applied, "0.7");
  assert.equal(cand!.d1_p_applied, "", "no answer, no probability");
  const run = parseCsv(readFileSync(join(out, "run_r7_x.csv"), "utf8"));
  const d1 = run.find((x) => x.model === "liquid/d1-ultra" && x.question === "use")!;
  assert.deepEqual([d1.answered, d1.errors], ["0", "1"]);
});
