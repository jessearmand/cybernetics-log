// Recomputes the round 7 figures from the committed CSVs and checks them against discourse.json.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import discourse from "../data/discourse.json" with { type: "json" };
import { parseCsv } from "./csv.ts";

const read = (f: string) => readFileSync(new URL(`../data/${f}`, import.meta.url), "utf8");
const R = discourse.round7;
const N = R.new_models;
const X = R.x_set;
const NEW = ["baseten/joey-1", "baseten/elephant-1", "baseten/mammoth-1", "microsoft/microsoft-decision-1"];
const OLD: Record<string, string> = { "liquid/d1-ultra": "d1", "perplexity/pplx-decider-v1.2": "pplx", "openai/gpt-6-luna-decisions": "oa" };
const D1 = "liquid/d1-ultra";

function kappa(a: string[], b: string[]): number | null {
  const n = a.length;
  const po = a.filter((x, i) => x === b[i]).length / n;
  const count = (xs: string[]) => xs.reduce((m, x) => m.set(x, (m.get(x) ?? 0) + 1), new Map<string, number>());
  const ca = count(a), cb = count(b);
  const pe = [...new Set([...a, ...b])].reduce((s, k) => s + (ca.get(k) ?? 0) * (cb.get(k) ?? 0), 0) / (n * n);
  return pe === 1 ? null : Math.round(((po - pe) / (1 - pe)) * 1000) / 1000;
}

const L5 = new Map(parseCsv(read("labels_r5.csv")).map((r) => [r.id!, r]));
const L6 = new Map(parseCsv(read("labels_r6.csv")).map((r) => [r.id!, r]));
const L7 = new Map(parseCsv(read("labels_r7.csv")).map((r) => [r.id!, r]));
const stance = (id: string, m: string, q: "stance" | "stance4") => (m in OLD ? (q === "stance" ? L5 : L6).get(id)![`${OLD[m]}_${q}`]! : L7.get(id)![`${m}:${q}`]!);

test("round 7: new-model agreement with d1-ultra and Decider is recomputed from the per-post answers", () => {
  const ids = [...L7.keys()];
  assert.equal(ids.length, 69);
  for (const q of ["stance4", "stance"] as const) {
    for (const row of N.agreement[q]) {
      for (const [ref, cell] of [[D1, row.vs_d1], ["perplexity/pplx-decider-v1.2", row.vs_pplx]] as const) {
        const both = ids.filter((i) => stance(i, row.model, q) !== "" && stance(i, ref, q) !== "");
        const a = both.map((i) => stance(i, row.model, q)), b = both.map((i) => stance(i, ref, q));
        assert.deepEqual(cell, { agree: a.filter((x, i) => x === b[i]).length, n: both.length, kappa: kappa(a, b) }, `${row.model} ${q} vs ${ref}`);
      }
    }
  }
  // The claim in the text: each of these agrees with both references more than d1-ultra and Decider agree with each other.
  const b6 = N.baseline.stance4.agree;
  for (const m of ["microsoft/microsoft-decision-1", "baseten/elephant-1", "baseten/mammoth-1"]) {
    const r = N.agreement.stance4.find((x) => x.model === m)!;
    assert.ok(r.vs_d1.agree > b6 && r.vs_pplx.agree > b6, m);
  }
});

test("round 7: shared mistakes — on hand-labelled posts d1-ultra gets wrong, how often each model repeats its answer", () => {
  const hand = [...parseCsv(read("hand_labels_r5.csv")), ...parseCsv(read("hand_labels_r6.csv")), ...parseCsv(read("hand_labels_r5_6_openai.csv"))];
  const hand5 = [...parseCsv(read("hand_labels_r5.csv")), ...parseCsv(read("hand_labels_r5_6_openai.csv"))];
  const S3 = ["reject", "curious", "serious"];
  const sets = { stance4: hand.filter((h) => h.hand !== "skip"), stance: hand5.filter((h) => S3.includes(h.hand!)) };
  for (const q of ["stance4", "stance"] as const) {
    const wrong = sets[q].filter((h) => stance(h.id!, D1, q) !== h.hand).map((h) => h.id!);
    assert.equal(N.shared[q].labelled, sets[q].length);
    assert.equal(N.shared[q].d1_wrong, wrong.length);
    for (const m of N.shared[q].models) assert.equal(m.same_as_d1, wrong.filter((i) => stance(i, m.model, q) === stance(i, D1, q)).length, `${q} ${m.model}`);
  }
  assert.deepEqual([N.shared.stance4.labelled, N.shared.stance4.d1_wrong], [21, 13]);
  const same = (m: string) => N.shared.stance4.models.find((x) => x.model === m)!.same_as_d1;
  assert.deepEqual(["microsoft/microsoft-decision-1", "baseten/elephant-1", "baseten/mammoth-1"].map(same), [10, 9, 7]);
  assert.ok(N.shared_text.includes("wrong on 13. Decision-1 gives the same wrong answer on 10 of them, elephant-1 on 9 and mammoth-1 on 7"));
});

test("round 7: hand-label scores are marked not comparable and only mammoth-1 is called a fine-tune", () => {
  assert.match(N.comparability, /not comparable/);
  assert.match(N.comparability, /neither set is a random sample/);
  const tuned = N.run.filter((m) => /fine-tuned|Qwen/.test(m.about));
  assert.deepEqual(tuned.map((m) => m.model), ["baseten/mammoth-1"]);
  const comp = parseCsv(read("model_comparison_r7.csv"));
  for (const h of N.hand) {
    for (const [k, v] of Object.entries(h)) {
      if (typeof v !== "object") continue;
      const row = comp.find((r) => r.model === h.model && r.metric === k)!;
      assert.deepEqual(v, { correct: Number(row.correct), n: Number(row.n) });
      assert.match(row.comparable!, /^no \(/, "every hand-label row is marked not comparable");
    }
  }
});

test("round 7 X set: Seeker labels, agreement with them, and the posts called applied", () => {
  const posts = parseCsv(read("posts_r7.csv"));
  const lx = parseCsv(read("labels_r7_x.csv"));
  assert.equal(posts.length, 79);
  assert.deepEqual(X.seeker, { applied: 0, commentary: 34, academic: 45 });
  for (const k of Object.keys(X.seeker) as (keyof typeof X.seeker)[]) assert.equal(posts.filter((p) => p.seeker_label === k).length, X.seeker[k]);
  const keys: Record<string, string> = { d1: "liquid/d1-ultra", pplx: "perplexity/pplx-decider-v1.2", oa: "openai/gpt-6-luna-decisions", joey: "baseten/joey-1", elephant: "baseten/elephant-1", mammoth: "baseten/mammoth-1", msd1: "microsoft/microsoft-decision-1" };
  for (const [k, m] of Object.entries(keys)) {
    const row = X.seeker_rows.find((r) => r.model === m)!;
    const s = lx.map((r) => r.seeker_label!), a = lx.map((r) => r[`${k}_use`]!);
    assert.equal(row.agree, a.filter((x, i) => x === s[i]).length, m);
    assert.equal(row.kappa, kappa(s, a), m);
    assert.equal(row.applied, a.filter((x) => x === "applied").length, m);
    const stanceRow = X.stance.find((r) => r.model === m)!;
    for (const o of ["reject", "curious", "serious", "reporting"] as const) assert.equal(stanceRow[o], lx.filter((r) => r[`${k}_stance4`] === o).length);
  }
  // Every post any model called applied, each called applied by exactly one model.
  const applied = lx.filter((r) => Object.keys(keys).some((k) => r[`${k}_use`] === "applied"));
  assert.deepEqual(X.applied.map((a) => a.id).sort(), applied.map((r) => r.id!).sort());
  for (const r of applied) assert.equal(Object.keys(keys).filter((k) => r[`${k}_use`] === "applied").length, 1, r.username);
  assert.equal(X.applied.filter((a) => a.models.join() === "joey-1").length, 6);
  assert.match(X.headline, /Seeker labels: applied 0, commentary 34, academic 45/);
});

test("round 7 text: Seeker labels are never called hand labels, and no pronoun is assumed", () => {
  const texts = [N.note, N.agreement_text, N.shared_text, N.joey_text, N.comparability, X.note, X.headline, X.seeker_text, X.stance_text, ...R.caveats];
  for (const t of texts) assert.ok(!/\b(he|she|his|her|him)\b/i.test(t), t);
  for (const t of [X.note, X.headline, X.seeker_text, X.stance_text]) assert.ok(!/hand.label/i.test(t), t);
  assert.ok(R.caveats.some((c) => /single annotator, another bot, not from Jesse's hand labels/.test(c)));
});
