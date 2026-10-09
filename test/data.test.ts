import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import discourse from "../data/discourse.json" with { type: "json" };
import hand from "../data/hand_labels.json" with { type: "json" };
import { DEFAULT_RENDER_INSTRUCTION } from "../agent/lib/default-instruction.ts";

const csv = readFileSync(new URL("../data/jev_labels.csv", import.meta.url), "utf8").trim().split("\n");
const header = csv[0]!.split(",");
const rows = csv.slice(1).map((line) => Object.fromEntries(line.split(",").map((v, i) => [header[i], v])) as Record<string, string>);
const count = (key: string) => rows.reduce<Record<string, number>>((acc, r) => ((acc[r[key]!] = (acc[r[key]!] ?? 0) + 1), acc), {});

test("data: corpus matches the brief", () => {
  assert.equal(rows.length, 268);
  assert.equal(discourse.corpus.posts, 268);
  assert.equal(discourse.corpus.authors, 213);
  assert.equal(discourse.corpus.window.start, "2026-09-24");
  assert.equal(discourse.corpus.window.end, "2026-10-08");
});

test("data: hand sample is 45/25/30 from hand_labels.json (not report.md's swapped split)", () => {
  const h = Object.values(hand as Record<string, string>).reduce<Record<string, number>>((a, v) => ((a[v] = (a[v] ?? 0) + 1), a), {});
  assert.deepEqual(h, { R: 18, C: 10, S: 12 });
  const c = discourse.stance_counts.hand_sample.counts;
  assert.deepEqual([c.reject.pct, c.curious.pct, c.serious.pct], [45, 25, 30]);
});

test("data: Jev counts match jev_labels.csv (93/47/128 and 61/133/74)", () => {
  assert.deepEqual(count("jev_label"), { R: 93, C: 47, S: 128 });
  assert.deepEqual(count("q2_rule"), { R: 61, C: 133, S: 74 });
  const t = discourse.stance_counts.jev_three_way.counts;
  const q = discourse.stance_counts.jev_two_question.counts;
  assert.deepEqual([t.reject.n, t.curious.n, t.serious.n], [93, 47, 128]);
  assert.deepEqual([q.reject.n, q.curious.n, q.serious.n], [61, 133, 74]);
});

test("data: accuracy is 47.5 / 55 / 45 (50 held out)", () => {
  const m = Object.fromEntries(discourse.accuracy.methods.map((x) => [x.key, x]));
  assert.equal(m.embeddinggemma_2!.accuracy_pct, 47.5);
  assert.equal(m.jev_three_way!.accuracy_pct, 55);
  assert.equal(m.jev_two_question!.accuracy_pct, 45);
  assert.equal((m.jev_two_question as { held_out_accuracy_pct?: number }).held_out_accuracy_pct, 50);
  const labelled = rows.filter((r) => r.id! in hand);
  assert.equal(labelled.length, 40);
  assert.equal(labelled.filter((r) => r.jev_label === (hand as Record<string, string>)[r.id!]).length, 22);
});

test("data: clusters, pair test, accounts and caveats are present", () => {
  assert.equal(discourse.clusters.items.length, 8);
  assert.equal(discourse.clusters.items.reduce((s, c) => s + c.n, 0), 268);
  assert.equal(discourse.pair_test.original.username, "bitcloud");
  assert.equal(discourse.pair_test.inversion.username, "aleksil79");
  for (const s of ["reject", "curious", "serious"] as const) {
    assert.ok(discourse.key_accounts[s].length >= 5);
    for (const a of discourse.key_accounts[s]) assert.match(a.url, /^https:\/\/x\.com\/[^/]+\/status\/\d+$/);
  }
  const titles = discourse.caveats.map((c) => c.title.toLowerCase()).join(" | ");
  assert.match(titles, /intensity/);
  assert.match(titles, /charged words/);
  assert.equal(discourse.confidence_curve.jev_three_way.length, discourse.confidence_curve.jev_two_question.length);
});

test("data: bundled default instruction matches data/render-instruction.md", () => {
  assert.equal(DEFAULT_RENDER_INSTRUCTION, readFileSync(new URL("../data/render-instruction.md", import.meta.url), "utf8"));
});
