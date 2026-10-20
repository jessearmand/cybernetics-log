// Recomputes the round-5/6 figures from the committed CSVs and checks them against the
// write-up (data/round5_6.md, verbatim) and against discourse.json.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import discourse from "../data/discourse.json" with { type: "json" };

const read = (f: string) => readFileSync(new URL(`../data/${f}`, import.meta.url), "utf8");
const md = read("round5_6.md");
const has = (s: string) => assert.ok(md.includes(s), `write-up is missing: ${s}`);

/** RFC 4180 CSV: quoted fields may hold commas, doubled quotes and newlines. */
function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') (field += '"'), i++;
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") row.push(field), (field = "");
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field), rows.push(row), (row = []), (field = "");
    } else field += ch;
  }
  if (field || row.length) row.push(field), rows.push(row);
  const [header, ...body] = rows.filter((r) => r.length > 1 || r[0]);
  return body.map((r) => {
    assert.equal(r.length, header!.length, "ragged CSV row");
    return Object.fromEntries(r.map((v, i) => [header![i], v]));
  });
}

const r5 = parseCsv(read("labels_r5.csv"));
const hand = parseCsv(read("hand_labels_r5.csv"));
const r6 = parseCsv(read("labels_r6.csv"));
const posts5 = read("posts_r5.jsonl").trim().split("\n").map((l) => JSON.parse(l) as { id: string; username: string; flashpoint: string });
const by5 = new Map(r5.map((r) => [r.id!, r]));
const by6 = new Map(r6.map((r) => [r.id!, r]));
const M = { d1: "d1-ultra", pplx: "pplx-decider-v1.2" } as const;
type K = keyof typeof M;
const count = (rs: Record<string, string>[], key: string, v: string) => rs.filter((r) => r[key] === v).length;
const R5 = discourse.round5;
const model = (k: K) => R5.models[k === "d1" ? 0 : 1]!;
const labelled = hand.filter((h) => h.hand !== "skip");
const skips = hand.filter((h) => h.hand === "skip");
const rejects = labelled.filter((h) => h.hand === "reject");
const h6 = (h: Record<string, string>) => (h.hand === "skip" ? "reporting" : h.hand!);

test("round 5: corpus, flashpoints and three-way stance counts", () => {
  assert.equal(r5.length, 69);
  assert.equal(posts5.length, 69);
  const authors = new Set(posts5.map((p) => p.username)).size;
  has(`69 posts from ${authors} authors`);
  assert.equal(R5.authors, authors);
  has(`${R5.returning_authors} of the authors appeared in earlier rounds`);
  for (const f of R5.flashpoints) {
    const n = posts5.filter((p) => p.flashpoint === f.key).length;
    assert.equal(f.posts, n, f.key);
    has(`  - ${f.key} ${n}\n`);
  }
  for (const k of ["d1", "pplx"] as K[]) {
    const c = ["reject", "curious", "serious"].map((s) => count(r5, `${k}_stance`, s));
    has(`| ${M[k]} | ${c.join(" | ")} |`);
    assert.deepEqual(c, ["reject", "curious", "serious"].map((s) => (model(k).stance as Record<string, { n: number }>)[s]!.n));
  }
  const agree = r5.filter((r) => r.d1_stance === r.pplx_stance).length;
  assert.equal(agree, r5.filter((r) => r.agree === "True").length);
  has(`agree on stance for ${agree} of 69 posts`);
  assert.equal(R5.agreement.agree, agree);
});

test("round 5: hand check on the disagreements", () => {
  assert.equal(hand.length, 17);
  for (const h of hand) {
    const r = by5.get(h.id!)!;
    assert.notEqual(r.d1_stance, r.pplx_stance, `hand-labelled post ${h.id} is a disagreement`);
    assert.equal(h.d1, r.d1_stance);
    assert.equal(h.pplx, r.pplx_stance);
  }
  assert.equal(r5.filter((r) => r.d1_stance !== r.pplx_stance).length, 17, "every disagreement was hand-labelled");
  has(`hand-labelled the ${hand.length} posts where the models disagreed`);
  has(`gave ${labelled.length} of them a stance and skipped ${skips.length}`);
  const right = (k: K) => labelled.filter((h) => by5.get(h.id!)![`${k}_stance`] === h.hand).length;
  has(`d1-ultra matched ${right("d1")} of ${labelled.length} and pplx-decider-v1.2 matched ${right("pplx")} of ${labelled.length}`);
  assert.equal(model("d1").hand_correct, right("d1"));
  assert.equal(model("pplx").hand_correct, right("pplx"));
  assert.deepEqual(rejects.map((h) => h.username).sort(), ["dave_uncensored", "elephant_ben"]);
  has("missed both rejects, elephant_ben and dave_uncensored");
  for (const k of ["d1", "pplx"] as K[]) {
    const calls = new Set(rejects.map((h) => by5.get(h.id!)![`${k}_stance`]));
    assert.equal(calls.size, 1);
    has(`${M[k]} called both ${[...calls][0]}`);
  }
  const skipSerious = skips.filter((h) => by5.get(h.id!)!.d1_stance === "serious").length;
  has(`d1-ultra called ${skipSerious} of the ${skips.length} skipped posts serious`);
  assert.ok(R5.hand_check.text.includes(`d1-ultra matched ${right("d1")} and Decider ${right("pplx")}`));
});

test("round 5: claims_found flags", () => {
  const flagged = (k: K) => r5.filter((r) => Number(r[`${k}_claims_found`]) >= 0.5).map((r) => r.username!).sort();
  const union = [...new Set([...flagged("d1"), ...flagged("pplx")])].sort();
  has(`flagged ${union.length} posts between them at P ≥ 0.5: d1-ultra flagged ${flagged("d1").length} and pplx-decider-v1.2 flagged ${flagged("pplx").length}`);
  assert.deepEqual(R5.claims_found.flagged, union);
  assert.deepEqual([...R5.claims_found.misattributions, ...R5.claims_found.matches_paper].sort(), union);
  has(`**${R5.claims_found.misattributions.length} clear misattributions:**`);
  has(`**${R5.claims_found.matches_paper.length} roughly match the paper's own claim:**`);
  for (const u of union) has(u);
});

test("round 6: four-way stance counts and the hand check", () => {
  assert.equal(r6.length, 69);
  for (const r of r6) {
    const o = by5.get(r.id!)!;
    assert.equal(r.d1_stance3, o.d1_stance);
    assert.equal(r.pplx_stance3, o.pplx_stance);
  }
  for (const h of hand) assert.equal(by6.get(h.id!)!.hand, h6(h), "round-6 hand column maps skip to reporting");
  const S4 = ["reject", "curious", "serious", "reporting"];
  for (const k of ["d1", "pplx"] as K[]) {
    const c = S4.map((s) => count(r6, `${k}_stance4`, s));
    has(`| ${M[k]} | ${c.join(" | ")} |`);
    assert.deepEqual(c, S4.map((s) => (model(k).round6.stance as Record<string, { n: number }>)[s]!.n));
  }
  const caught = (k: K) => skips.filter((h) => by6.get(h.id!)![`${k}_stance4`] === "reporting").length;
  has(`pplx-decider-v1.2 labelled ${caught("pplx")} of the ${skips.length} skipped posts reporting, and d1-ultra labelled ${caught("d1")} of ${skips.length}`);
  const all = (k: K) => hand.filter((h) => by6.get(h.id!)![`${k}_stance4`] === h6(h)).length;
  has(`On all ${hand.length} hand-labelled posts, pplx-decider-v1.2 matched ${all("pplx")} and d1-ultra matched ${all("d1")}`);
  assert.equal(model("pplx").round6.hand_correct_all, all("pplx"));
  assert.equal(model("d1").round6.hand_correct_all, all("d1"));
  const st = (k: K) => labelled.filter((h) => by6.get(h.id!)![`${k}_stance4`] === h.hand).length;
  assert.equal(st("d1"), st("pplx"));
  has(`both matched ${st("d1")} of ${labelled.length}`);
  for (const k of ["d1", "pplx"] as K[]) for (const h of rejects) assert.equal(by6.get(h.id!)![`${k}_stance4`], "serious");
  has("both models call both rejects serious");
  has(`${count(r6, "d1_stance4", "reporting")} of 69 posts for d1-ultra and ${count(r6, "pplx_stance4", "reporting")} for pplx-decider-v1.2`);
  has(`d1-ultra's curious count fell from ${count(r6, "d1_stance3", "curious")} to ${count(r6, "d1_stance4", "curious")}`);
  const moved = labelled.filter((h) => h.hand === "curious" && ["d1", "pplx"].every((k) => by6.get(h.id!)![`${k}_stance4`] === "reporting")).map((h) => h.username!).sort();
  assert.deepEqual(moved, ["Sniffmeta", "stretchcloud"]);
  has(`Two enthusiastic research summaries that Jesse labelled curious, ${moved.join(" and ")}, went to reporting with both models`);
  assert.ok(R5.round6.text.includes(`Decider matched ${all("pplx")} and d1-ultra ${all("d1")}`));
});

test("rounds 5 and 6: costs match discourse.json; totals include round 5", () => {
  has(`Round 5 cost $${R5.cost_usd.round5} (`);
  has(`round 6 cost $${R5.cost_usd.round6} (`);
  assert.equal(discourse.corpus.posts, 508 + posts5.length);
});

test("round 5: quotes in the notable-account blurbs appear in the posts", () => {
  const text = new Map(read("posts_r5.jsonl").trim().split("\n").map((l) => JSON.parse(l) as { id: string; text: string }).map((p) => [p.id, p.text]));
  for (const a of R5.key_accounts) {
    const t = text.get(a.url.split("/").pop()!);
    assert.ok(t, `${a.username} post is in round 5`);
    for (const m of a.blurb.matchAll(/"([^"]+)"/g)) assert.ok(t!.includes(m[1]!), `${a.username}: "${m[1]}" is not in the post`);
  }
});

test("Dawkins: every quote on the page appears in his own posts or the clip in the corpus", () => {
  const sources = read("posts_r3.jsonl").trim().split("\n").map((l) => JSON.parse(l) as { id: string; text: string })
    .filter((p) => ["2049973529576108160", "2050465374093643803", "2108173237180104764"].includes(p.id)).map((p) => p.text).join("\n");
  const own = discourse.dawkins_spotlight.summary.join(" ");
  const quotes = [...own.matchAll(/"([^"]+)"/g)].map((m) => m[1]!).filter((q) => !["Claudia", "certain"].includes(q));
  assert.ok(quotes.length >= 4);
  for (const q of quotes) assert.ok(sources.includes(q.replace(/[.?]$/, "")), `not in his posts: ${q}`);
  assert.equal(discourse.dawkins_spotlight.summary.length, 2);
  assert.ok(!/fluency/i.test(own), "Nature does not use Dawkins as an example of mistaking fluency for experience");
});
