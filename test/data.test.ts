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
  assert.equal(discourse.corpus.posts, 577);
  assert.equal(discourse.corpus.authors, 490);
  assert.equal(discourse.corpus.window.start, "2026-09-24");
  assert.equal(discourse.corpus.window.end, "2026-10-20");
  const [r1, r2, r3, r4, all] = discourse.rounds.items;
  assert.equal(r1!.posts, 268);
  assert.equal(r2!.posts, 64);
  assert.equal(r3!.posts, 90);
  assert.equal(r4!.posts, 86);
  assert.equal(all!.posts, 508);
  const hyb = discourse.accuracy.methods.find((m) => m.key === "jev_hybrid") as { coverage_pct: number; accuracy_pct: number };
  assert.equal(hyb.coverage_pct, 50);
  assert.equal(hyb.accuracy_pct, 75);
  assert.ok(!JSON.stringify(discourse.stance_counts).includes("report.md"));
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

const csv3 = readFileSync(new URL("../data/jev_labels_r3.csv", import.meta.url), "utf8").trim().split("\n");
const h3 = csv3[0]!.split(",");
const rows3 = csv3.slice(1).map((line) => Object.fromEntries(line.split(",").map((v, i) => [h3[i], v])) as Record<string, string>);
const pol = readFileSync(new URL("../data/policy_labels.csv", import.meta.url), "utf8").trim().split("\n");
const ph = pol[0]!.split(",");
const prow = pol.slice(1).map((line) => Object.fromEntries(line.split(",").map((v, i) => [ph[i], v])) as Record<string, string>);
const tally = (rs: Record<string, string>[], key: string) => rs.reduce<Record<string, number>>((a, r) => ((a[r[key]!] = (a[r[key]!] ?? 0) + 1), a), {});

test("data: round 3 counts match the label files (90 posts: 48 policy, 28 Dawkins, 14 general)", () => {
  assert.equal(rows3.length, 90);
  assert.deepEqual(tally(rows3, "flashpoint"), { anthropic_abuse_policy: 48, dawkins: 28, general: 14 });
  const r3 = discourse.rounds.items[2]!.jev_hybrid as Record<string, { n: number }>;
  const h = tally(rows3, "hybrid");
  assert.deepEqual([r3.reject!.n, r3.curious!.n, r3.serious!.n, r3.uncertain!.n], [h.R, h.C, h.S, h.U]);
  for (const r of rows3) assert.match(r.url!, /^https:\/\/x\.com\/[^/]+\/status\/\d+$/);
});

test("data: policy block matches policy_labels.csv and the hand check", () => {
  const p = discourse.policy_debate;
  assert.equal(prow.length, 81);
  assert.equal(p.n, 81);
  const pos = tally(prow, "position");
  assert.deepEqual([p.position.support.n, p.position.oppose.n, p.position.neutral_or_unclear.n], [pos.support, pos.oppose, pos.neutral_or_unclear]);
  const rea = tally(prow, "reason");
  for (const k of Object.keys(p.reason) as (keyof typeof p.reason)[]) assert.equal(p.reason[k].n, rea[k] ?? 0);
  const hand = JSON.parse(readFileSync(new URL("../data/hand_labels_policy.json", import.meta.url), "utf8")) as Record<string, unknown>;
  const ids = Object.keys(hand).filter((k) => !k.startsWith("_"));
  assert.equal(ids.length, p.hand_check.n);
  const by = Object.fromEntries(prow.map((r) => [r.id, r]));
  assert.equal(ids.filter((i) => by[i]!.position === (hand[i] as string[])[0]).length, p.hand_check.position);
  assert.equal(ids.filter((i) => by[i]!.reason === (hand[i] as string[])[1]).length, p.hand_check.reason);
  let total = 0;
  for (const row of Object.values(p.crosstab_position_by_hybrid.counts)) total += Object.values(row).reduce((a, b) => a + b, 0);
  assert.equal(total, 81);
  const f = p.crosstab_finding;
  assert.equal(f.oppose_confident.n, prow.filter((r) => r.position === "oppose" && r.hybrid !== "U").length);
  assert.ok(f.text.includes(`${f.oppose_confident.reject} of ${f.oppose_confident.n}`));
});

test("data: Dawkins spotlight links are real status URLs and the summary avoids \"certain\" as his own claim", () => {
  const k = discourse.dawkins_spotlight;
  assert.equal(k.items, 28);
  for (const x of [...k.posts, ...k.reactions]) assert.match(x.url, /^https:\/\/x\.com\/[^/]+\/status\/\d+$/);
  assert.ok(k.posts.some((x) => x.username === "RichardDawkins"));
  assert.match(k.summary.join(" "), /overstates/);
  const json = JSON.stringify(discourse);
  for (const bad of ["report.md", "jev_labels", "posts_r3"]) assert.ok(!JSON.stringify([discourse.policy_debate, discourse.dawkins_spotlight, discourse.key_accounts_round3]).includes(bad), bad);
  assert.ok(json.length > 0);
});

const csv4 = readFileSync(new URL("../data/jev_labels_r4.csv", import.meta.url), "utf8").trim().split("\n");
const h4 = csv4[0]!.split(",");
const rows4 = csv4.slice(1).map((line) => Object.fromEntries(line.split(",").map((v, i) => [h4[i], v])) as Record<string, string>);

test("data: round 4 counts match jev_labels_r4.csv (86 posts across five flashpoints)", () => {
  assert.equal(rows4.length, 86);
  assert.deepEqual(tally(rows4, "flashpoint"), { sacks_allin: 23, anthropic_abuse_policy: 21, general: 18, dawkins: 13, tsao_gwt: 11 });
  const r4 = discourse.rounds.items[3]!;
  assert.equal(r4.round, 4);
  const h = tally(rows4, "hybrid");
  const hy = r4.jev_hybrid as Record<string, { n: number }>;
  assert.deepEqual([hy.reject!.n, hy.curious!.n, hy.serious!.n, hy.uncertain!.n], [h.R ?? 0, h.C ?? 0, h.S ?? 0, h.U ?? 0]);
  const pv = discourse.round4_framing.policy_vs_minds;
  assert.equal(pv.all.yes, rows4.filter((r) => r.policy_politics === "1").length);
  assert.equal(pv.sacks_allin.yes, discourse.politics_spotlight.finding.policy_politics);
  for (const r of rows4) assert.match(r.url!, /^https:\/\/x\.com\/[^/]+\/status\/\d+$/);
});

test("data: Sacks spotlight carries the study note; model comparison covers three models plus the old Jev", () => {
  const k = discourse.politics_spotlight;
  assert.match(k.study_note, /independent SPAR project, not Anthropic research/);
  assert.match(k.study_note, /cross-edit/);
  assert.match(k.study.url, /^https:\/\/www\.lesswrong\.com\//);
  for (const x of [...k.posts, ...k.reactions]) assert.match(x.url, /^https:\/\/x\.com\/[^/]+\/status\/\d+$/);
  const m = discourse.model_comparison;
  assert.deepEqual(m.models.map((x) => x.key), ["typesafe-ai/jev-1.14.0", "perplexity/pplx-decider-v1.2", "liquid/d1-ultra"]);
  assert.equal(m.reference_old_jev.reject_to_serious, 8);
  assert.equal(m.reference_old_jev.stance_acc_pct, 55);
  assert.equal(m.hand_reject_n, 18);
  assert.ok(m.intensity_check.includes(`${m.models[0]!.reject_to_serious} of ${m.hand_reject_n}`));
  assert.match(discourse.lead_tsao.paper.venue, /not peer reviewed/);
  const pub = JSON.stringify([discourse.politics_spotlight, discourse.sebo, discourse.lead_tsao, discourse.model_comparison, discourse.round4_framing, discourse.key_accounts_round4, discourse.workspace_paper, discourse.nature_comment, discourse.round5]);
  for (const bad of ["jev_labels", "posts_r4", "questions_r4", ".csv", ".json", "SKILL"]) assert.ok(!pub.includes(bad), bad);
});

test("data: the instruction's page-layout rules name no specific round", () => {
  const md = readFileSync(new URL("../data/render-instruction.md", import.meta.url), "utf8");
  const layout = md.slice(md.indexOf("## Page layout"), md.indexOf("\n## ", md.indexOf("## Page layout") + 1));
  assert.ok(layout.length > 0);
  assert.doesNotMatch(layout, /\bround \d/i, "say 'the latest round' so a new round needs no instruction edit");
  assert.doesNotMatch(md, /^## .*`\/`/m, "no round section heading should claim the home page");
});
