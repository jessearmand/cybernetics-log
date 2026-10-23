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

test("round 6: hand check on the new disagreements and the combined score", () => {
  const hand6 = parseCsv(read("hand_labels_r6.csv"));
  const H = R5.hand6;
  const handIds = new Set(hand.map((h) => h.id!));
  const newDis = r6.filter((r) => r.d1_stance4 !== r.pplx_stance4 && !handIds.has(r.id!)).map((r) => r.id!).sort();
  assert.deepEqual(hand6.map((h) => h.id!).sort(), newDis, "round-6 hand labels are exactly the new four-way disagreements");
  assert.equal(hand6.length, 9);
  const lab = hand6.filter((h) => h.hand !== "skip");
  const sk = hand6.filter((h) => h.hand === "skip");
  const s4 = (h: Record<string, string>, k: K) => by6.get(h.id!)![`${k}_stance4`]!;
  const user = (h: Record<string, string>) => by6.get(h.id!)!.username!;
  has(`Round 6 left ${hand6.length} new disagreements`);
  has(`${lab.length} with a label and ${sk.length} skipped`);
  const right = (k: K) => lab.filter((h) => s4(h, k) === h.hand).length;
  assert.deepEqual([right("pplx"), right("d1")], [4, 0]);
  has(`On the ${lab.length} posts he did not skip, pplx-decider-v1.2 matched ${right("pplx")} and d1-ultra matched ${right("d1")}`);
  const pxMiss = lab.filter((h) => s4(h, "pplx") !== h.hand);
  assert.deepEqual(pxMiss.map((h) => [user(h), h.hand, s4(h, "pplx")]), [["RichUniverse_", "curious", "reporting"], ["e_philalethes", "curious", "reject"]]);
  has("pplx-decider-v1.2 called RichUniverse_ reporting and e_philalethes reject, both of which Jesse labelled curious");
  const d1Rep = lab.filter((h) => h.hand === "reporting");
  assert.ok(d1Rep.every((h) => s4(h, "d1") === "reject"));
  const confs = d1Rep.map((h) => Number(by6.get(h.id!)!.d1_conf4).toFixed(2)).sort().reverse();
  has(`d1-ultra called both reporting posts reject, with confidence ${confs[0]} and ${confs[1]}`);
  assert.deepEqual([...new Set(lab.filter((h) => h.hand === "curious").map((h) => s4(h, "d1")))].sort(), ["reject", "serious"]);
  const skRep = (k: K) => sk.filter((h) => s4(h, k) === "reporting").length;
  has(`Of the ${sk.length} skipped posts, pplx-decider-v1.2 called ${skRep("pplx")} reporting and d1-ultra called ${skRep("d1")}`);
  const used = hand6.filter((h) => s4(h, "pplx") === "reporting");
  const pulled = used.filter((h) => h.hand === "curious");
  has(`pplx-decider-v1.2 used reporting for ${used.length} of the ${hand6.length} posts, and only ${pulled.length} of those was a curious post`);
  // The e_philalethes caveat: a strict miss for d1-ultra, but Jesse's own note leans serious.
  const lean = hand6.filter((h) => /leaning serious/.test(h.note!));
  assert.equal(lean.length, 1);
  assert.equal(user(lean[0]!), "e_philalethes");
  assert.equal(lean[0]!.hand, "curious");
  assert.equal(s4(lean[0]!, "d1"), "serious");
  assert.match(lean[0]!.note!, /considers possibility with the right hardware/);
  has("e_philalethes counts as a miss for d1-ultra in the strict score");
  has("so d1-ultra's serious has a fair case");
  assert.equal(H.leans_serious, "e_philalethes");
  assert.match(H.lean_caveat, /d1-ultra's Serious has a fair case/);
  // Combined: all 26 hand labels, four-way, skips as reporting.
  const combined = [...hand.map((h) => [h.id!, h6(h)]), ...hand6.map((h) => [h.id!, h6(h)])] as [string, string][];
  assert.equal(new Set(combined.map(([i]) => i)).size, 26);
  const all = (k: K) => combined.filter(([i, v]) => by6.get(i)![`${k}_stance4`] === v).length;
  const ns = [...labelled.map((h) => [h.id!, h.hand!]), ...lab.map((h) => [h.id!, h.hand!])] as [string, string][];
  const st = (k: K) => ns.filter(([i, v]) => by6.get(i)![`${k}_stance4`] === v).length;
  has(`Across all ${combined.length} hand labels from rounds 5 and 6, scored four-way with skips counted as reporting, pplx-decider-v1.2 matched ${all("pplx")} and d1-ultra matched ${all("d1")}`);
  has(`On the ${ns.length} posts he did not skip, pplx-decider-v1.2 matched ${st("pplx")} and d1-ultra matched ${st("d1")}`);
  assert.ok(H.combined.includes(`Decider matched ${all("pplx")} and d1-ultra ${all("d1")}`));
  assert.ok(H.combined.includes(`Decider matched ${st("pplx")} and d1-ultra ${st("d1")}`));
  for (const m of H.models) {
    const k = m.id as K;
    assert.deepEqual([m.stance_correct, m.skips_reporting, m.combined_all, m.combined_stance], [right(k), skRep(k), all(k), st(k)]);
  }
  assert.deepEqual([H.n_all, H.n_stance, H.labelled, H.skipped], [combined.length, ns.length, lab.length, sk.length]);
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

test("lead: Tsao's discreteness quotes are verbatim from her follow-up post; the hive conclusion is Jesse's", () => {
  const src = JSON.parse(read("tsao_followup.json")) as { id: string; username: string; text: string; url: string };
  const l = discourse.lead_tsao;
  assert.equal(l.followup.id, src.id);
  assert.equal(l.followup.url, `https://x.com/doristsao/status/${src.id}`);
  assert.equal(src.username, "doristsao");
  const page = [...l.discussion, l.followup.blurb].join("\n");
  const quotes = [...page.matchAll(/"([^"]+)"/g)].map((m) => m[1]!).filter((q) => /frame rate|discrete/.test(q));
  assert.ok(quotes.length >= 3);
  for (const q of [...quotes, ...l.followup.quotes]) assert.ok(src.text.includes(q), `not in her post: ${q}`);
  assert.ok(!/takes no position on this/.test(page));
  const seeker = l.discussion.find((x) => x.startsWith("Seeker"))!;
  assert.ok(!/hive/.test(seeker), "the not-a-hive conclusion is credited to Jesse, not Seeker");
  assert.match(l.discussion.find((x) => /hive/.test(x))!, /^Jesse/);
  assert.match(l.discussion.join(" "), /pushes against Tsao's own reading/);
});

// ---- Third model (openai/gpt-6-luna-decisions), added on the same 69 posts after the hand labels were drawn ----
const ALL = ["d1", "pplx", "oa"] as const;
type A = (typeof ALL)[number];
const N3: Record<A, string> = { d1: "d1-ultra", pplx: "pplx-decider-v1.2", oa: "gpt-6-luna-decisions" };
const hand6csv = parseCsv(read("hand_labels_r6.csv"));
const T = R5.third_model;

function kappa(a: string[], b: string[]): number | null {
  const n = a.length;
  const po = a.filter((x, i) => x === b[i]).length / n;
  const cnt = (xs: string[]) => xs.reduce((m, x) => m.set(x, (m.get(x) ?? 0) + 1), new Map<string, number>());
  const ca = cnt(a), cb = cnt(b);
  let pe = 0;
  for (const k of new Set([...a, ...b])) pe += (ca.get(k) ?? 0) * (cb.get(k) ?? 0);
  pe /= n * n;
  return pe === 1 ? null : Math.round(((po - pe) / (1 - pe)) * 1000) / 1000;
}

test("third model: same posts, the old columns untouched, coverage and stance counts", () => {
  assert.deepEqual(r5.map((r) => r.id), posts5.map((p) => p.id));
  assert.equal(r6.length, 69);
  const missing = r5.filter((r) => r.oa_stance === "");
  assert.deepEqual(missing.map((r) => r.username).sort(), ["SeanYoung1995", "TokenandoAI"]);
  for (const r of r5) for (const c of ["oa_frame", "oa_policy", "oa_claims_found"]) assert.notEqual(r[c], "", c);
  for (const r of r6) assert.notEqual(r.oa_stance4, "");
  for (const r of r6) assert.equal(r.oa_stance3, by5.get(r.id!)!.oa_stance);
  has(`| gpt-6-luna-decisions | ${["reject", "curious", "serious"].map((s) => count(r5, "oa_stance", s)).join(" | ")} |`);
  has(`| gpt-6-luna-decisions | ${["reject", "curious", "serious", "reporting"].map((s) => count(r6, "oa_stance4", s)).join(" | ")} |`);
  assert.equal(T.missing.length, 2);
  assert.equal(R5.models[2]!.answered, 67);
  assert.equal(R5.models[2]!.hand_comparable, false);
  has(`${T.run.answered} of ${T.run.calls} calls answered`);
  has(`gateway cost $${T.run.gateway_cost_usd}`);
  has(`$${T.run.market_cost_usd} at list price`);
});

test("third model: pairwise agreement and Cohen's kappa on every question match the CSVs", () => {
  const Q: [string, Record<string, string>[], "choice" | "bool", string][] = [
    ["stance", r5, "choice", "stance"], ["frame", r5, "choice", "frame"], ["on_topic", r5, "bool", "on_topic"],
    ["policy", r5, "bool", "policy_politics"], ["claims_found", r5, "bool", "claims_found"], ["stance4", r6, "choice", "stance (round 6)"],
  ];
  const ans = (r: Record<string, string>, q: string, k: A, kind: string) => (kind === "bool" ? (Number(r[`${k}_${q}`]) >= 0.5 ? "yes" : "no") : r[`${k}_${q}`]!);
  const agreeCsv = parseCsv(read("model_agreement_r5_6.csv"));
  const pairs: [A, A][] = [["d1", "pplx"], ["d1", "oa"], ["pplx", "oa"]];
  for (const [q, rows, kind, label] of Q) {
    const cells: string[] = [];
    for (const [a, b] of pairs) {
      const both = rows.filter((r) => r[`${a}_${q}`] !== "" && r[`${b}_${q}`] !== "");
      const xa = both.map((r) => ans(r, q, a, kind)), xb = both.map((r) => ans(r, q, b, kind));
      const agree = xa.filter((x, i) => x === xb[i]).length;
      const k = kappa(xa, xb);
      const row = agreeCsv.find((x) => x.question === q && x.pair === `${a}/${b}`)!;
      assert.deepEqual([Number(row.n), Number(row.agree), row.kappa === "" ? null : Number(row.kappa)], [both.length, agree, k], `${q} ${a}/${b}`);
      const j = T.agreement.find((x) => x.question === q && x.pair === `${a}/${b}`)!;
      assert.deepEqual([j.n, j.agree, j.kappa], [both.length, agree, k]);
      cells.push(`${agree}/${both.length} (${k === null ? "—" : Number.isInteger(k) ? k.toFixed(1) : k})`);
    }
    has(`| ${label} | ${cells.join(" | ")} |`);
  }
  assert.equal(agreeCsv.length, 18);
});

test("third model: hand-label scores, flagged as not comparable, and the four-way confusion", () => {
  const v = (h: Record<string, string>) => (h.hand === "skip" ? "reporting" : h.hand!);
  const all = [...hand, ...hand6csv].map((h) => [h.id!, v(h)] as const);
  const nonskip = [...labelled, ...hand6csv.filter((h) => h.hand !== "skip")].map((h) => [h.id!, h.hand!] as const);
  assert.equal(all.length, 26);
  assert.equal(nonskip.length, 16);
  // Every hand label sits on a d1-ultra / Decider disagreement, so their scores share a selection the third model did not.
  for (const h of hand) assert.notEqual(by5.get(h.id!)!.d1_stance, by5.get(h.id!)!.pplx_stance);
  for (const h of hand6csv) assert.notEqual(by6.get(h.id!)!.d1_stance4, by6.get(h.id!)!.pplx_stance4);
  const s = (k: A) => ({
    r5: labelled.filter((h) => by5.get(h.id!)![`${k}_stance`] === h.hand).length,
    all: all.filter(([i, x]) => by6.get(i)![`${k}_stance4`] === x).length,
    stance: nonskip.filter(([i, x]) => by6.get(i)![`${k}_stance4`] === x).length,
  });
  assert.deepEqual([s("pplx").all, s("d1").all, s("pplx").stance, s("d1").stance], [16, 10, 7, 3], "earlier tallies unchanged");
  const o = s("oa"), d = s("d1"), x = s("pplx");
  has(`gpt-6-luna-decisions matched ${o.r5} (d1-ultra ${d.r5}, pplx-decider-v1.2 ${x.r5})`);
  has(`gpt-6-luna-decisions ${o.all}/26, pplx-decider-v1.2 ${x.all}/26, d1-ultra ${d.all}/26. On the 16 he did not skip: ${o.stance}/16, ${x.stance}/16 and ${d.stance}/16`);
  has("**The hand-label scores below are not comparable with the other two models.**");
  assert.equal(T.scores.oa.combined_all, o.all);
  assert.equal(T.scores.oa.comparable, false);
  assert.match(T.comparability, /not comparable/);
  const rej = labelled.filter((h) => h.hand === "reject").sort((a, b) => a.username!.localeCompare(b.username!));
  assert.deepEqual(rej.map((h) => by5.get(h.id!)!.oa_stance), T.scores.oa.r5_rejects_called);
  assert.ok(!T.scores.oa.r5_rejects_called.includes("reject"), "it misses both substrate rejects too");
  const rep = all.filter(([, x]) => x === "reporting");
  has(`it found ${rep.filter(([i]) => by6.get(i)!.oa_stance4 === "reporting").length} of the ${rep.length} reporting posts and called ${rep.filter(([i]) => by6.get(i)!.oa_stance4 === "reject").length} of them reject`);
  const S4 = ["reject", "curious", "serious", "reporting"] as const;
  const comp = parseCsv(read("model_comparison_r5_6.csv"));
  for (const k of ALL)
    for (const t of S4)
      for (const p of S4) {
        const nn = all.filter(([i, x]) => x === t && by6.get(i)![`${k}_stance4`] === p).length;
        assert.equal((T.confusion as Record<string, Record<string, Record<string, number>>>)[k]![t]![p], nn);
        assert.equal(Number(comp.find((c) => c.model.endsWith(N3[k]) && c.metric === `confusion_hand_${t}_model_${p}`)!.correct), nn);
      }
  for (const c of comp.filter((c) => c.model.includes("gpt-6"))) assert.match(c.comparable, /^no/);
});

test("third model: hand-label candidates are exactly the unlabelled posts where it disagrees with both others", () => {
  const labelledIds = new Set([...hand, ...hand6csv].map((h) => h.id!));
  const want = r5
    .filter((r) => !labelledIds.has(r.id!))
    .filter((r) => {
      const q6 = by6.get(r.id!)!;
      const off5 = r.oa_stance !== "" && r.d1_stance === r.pplx_stance && r.oa_stance !== r.d1_stance;
      const off6 = q6.d1_stance4 === q6.pplx_stance4 && q6.oa_stance4 !== q6.d1_stance4;
      // Every unlabelled post has d1-ultra and Decider agreeing, so this equals "disagrees with both".
      assert.equal(r.d1_stance, r.pplx_stance);
      assert.equal(q6.d1_stance4, q6.pplx_stance4);
      return off5 || off6;
    })
    .map((r) => r.id!);
  const cands = parseCsv(read("hand_label_candidates_r5_6.csv"));
  assert.deepEqual(cands.map((c) => c.id), want);
  assert.deepEqual(T.candidates.map((c) => c.id), want);
  has(`There are ${want.length} posts without a hand label where gpt-6-luna-decisions disagrees`);
  for (const c of cands) {
    assert.ok(!labelledIds.has(c.id!));
    has(`- ${c.username} (${c.id}): `);
    const r = by5.get(c.id!)!, q6 = by6.get(c.id!)!;
    assert.deepEqual([c.d1_stance, c.pplx_stance, c.oa_stance, c.oa_stance4], [r.d1_stance, r.pplx_stance, r.oa_stance, q6.oa_stance4]);
  }
});
