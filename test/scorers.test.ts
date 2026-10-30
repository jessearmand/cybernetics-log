// The box-side round 7 scorer, run on a minimal fixture in a temp folder (no model is called).
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import discourse from "../data/discourse.json" with { type: "json" };
import { PLACEHOLDER_EDITORIAL, renderPage } from "../agent/lib/render.ts";
import { parseCsv } from "./csv.ts";

const meta = { renderedAt: "2026-10-09T00:00:00Z", model: "deepseek/deepseek-v4.1-flash", dataSource: "bundled" };

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

const CAND_HEADER = "id,username,seeker_label,n_models,models,d1_p_applied,pplx_p_applied,oa_p_applied,joey_p_applied,elephant_p_applied,mammoth_p_applied,msd1_p_applied,url,text";

/** One post, one model (joey-1) answering `use` with `choice`, scored by the real score_r7x.py into `out`. */
function scoreOnce(root: string, out: string, choice: string) {
  const raw = join(root, "round7", "raw");
  mkdirSync(raw, { recursive: true });
  const post = { id: "1", username: "a", created_at: "2026-10-20T00:00:00Z", url: "https://x.com/a/status/1", queries: ["q"], seeker_label: "commentary", text: "We changed our agent's rules." };
  writeFileSync(join(root, "round7", "posts_r7.jsonl"), JSON.stringify(post) + "\n");
  const probabilities = { applied: 0.1, commentary: 0.1, academic: 0.1, [choice]: 0.8 };
  writeFileSync(join(raw, "use_baseten_joey-1.jsonl"), JSON.stringify({ id: "1", username: "a", model: "baseten/joey-1", group: "use", answers: { use: { type: "choice", choice, probabilities } }, latency_s: 1 }) + "\n");
  const r = spawnSync("python3", [join(repo, "scripts", "round7", "score_r7x.py"), out], { env: { ...process.env, R7_SRC: root }, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
}

test("score_r7x.py: a rescore with no applied candidates replaces the old candidates file with a header-only one", () => {
  const root = mkdtempSync(join(tmpdir(), "score7x-"));
  const out = join(root, "out");
  mkdirSync(out);
  const file = join(out, "applied_candidates_r7_x.csv");
  scoreOnce(root, out, "applied");
  const first = readFileSync(file, "utf8");
  assert.equal(first.split(/\r?\n/)[0], CAND_HEADER);
  assert.equal(parseCsv(first).length, 1, "first run: one candidate");
  scoreOnce(root, out, "commentary");
  assert.equal(readFileSync(file, "utf8").trim(), CAND_HEADER, "second run: header only, same columns, no stale rows");
});

test("score_r7x.py: no posts at all still writes every CSV, header only", () => {
  const root = mkdtempSync(join(tmpdir(), "score7x-"));
  const out = join(root, "out");
  mkdirSync(join(root, "round7", "raw"), { recursive: true });
  mkdirSync(out);
  writeFileSync(join(root, "round7", "posts_r7.jsonl"), "");
  const r = spawnSync("python3", [join(repo, "scripts", "round7", "score_r7x.py"), out], { env: { ...process.env, R7_SRC: root }, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  for (const f of ["posts_r7.csv", "labels_r7_x.csv", "applied_candidates_r7_x.csv"]) {
    const s = readFileSync(join(out, f), "utf8");
    assert.ok(s.startsWith("id,username,"), f);
    assert.equal(parseCsv(s).length, 0, f);
  }
  assert.equal(readFileSync(join(out, "applied_candidates_r7_x.csv"), "utf8").trim(), CAND_HEADER);
});

/** build_discourse.r7_applied() on `dir`: the applied list and the sentence the X-set headline ends with. */
function buildApplied(dir: string): { applied: unknown[]; summary: string } {
  const code = "import json, sys; from pathlib import Path; sys.path.insert(0, sys.argv[1]); import build_discourse as b; print(json.dumps(b.r7_applied(Path(sys.argv[2]))))";
  const r = spawnSync("python3", ["-c", code, join(repo, "scripts"), dir], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout);
}

test("build: a missing applied_candidates_r7_x.csv reads exactly like a header-only one, and the page shows the empty state", () => {
  const missing = mkdtempSync(join(tmpdir(), "build7-"));
  const empty = mkdtempSync(join(tmpdir(), "build7-"));
  writeFileSync(join(empty, "applied_candidates_r7_x.csv"), CAND_HEADER + "\r\n");
  const a = buildApplied(missing);
  const b = buildApplied(empty);
  assert.deepEqual(a, b);
  assert.deepEqual(a.applied, []);
  assert.equal(a.summary, "No model called any post applied.");
  const page = (x: { applied: unknown[]; summary: string }) => {
    const d = structuredClone(discourse) as typeof discourse;
    d.round7.x_set.applied = x.applied as typeof d.round7.x_set.applied;
    return renderPage(d, PLACEHOLDER_EDITORIAL, meta);
  };
  const html = page(a);
  assert.equal(html, page(b));
  assert.ok(html.includes("<p>No model called any post applied.</p>"), "empty state");
  assert.ok(!html.includes("Posts a model called applied"), "no empty fold");
});
