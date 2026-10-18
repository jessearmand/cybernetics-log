// Recomputes every figure in data/gated_stance_r4b.md from data/gated_stance_r4b.csv and checks
// that the write-up contains it verbatim. The CSV holds plain numbers and labels, so a comma split is safe.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (f: string) => readFileSync(new URL(`../data/${f}`, import.meta.url), "utf8");
const md = read("gated_stance_r4b.md");
const lines = read("gated_stance_r4b.csv").trim().split(/\r?\n/);
const header = lines[0]!.split(",");
type Row = { model: string; hand: string; gated: string; p_position: number; direction: string; p_direction: number; three_way: string; cost: number };
const all: Row[] = lines.slice(1).map((l) => {
  const r = Object.fromEntries(l.split(",").map((v, i) => [header[i], v])) as Record<string, string>;
  return { model: r.model!, hand: r.hand!, gated: r.gated!, p_position: +r.p_position!, direction: r.direction!, p_direction: +r.p_direction!, three_way: r.three_way!, cost: +r.cost! };
});
const D1 = "liquid/d1-ultra";
const JEV = "typesafe-ai/jev-1.14.0";
const of = (m: string) => all.filter((r) => r.model === m);
const CLS = ["R", "C", "S"] as const;
type Pair = [string, string];

const gatedAt = (r: Row, t: number) => (r.p_position < t ? "C" : r.direction === "reject" ? "R" : "S");
const n = (ps: Pair[], h: string, p: string) => ps.filter(([a, b]) => a === h && b === p).length;
const macroF1 = (ps: Pair[]) =>
  CLS.map((c) => {
    const tp = n(ps, c, c);
    const fp = ps.filter(([h, p]) => h !== c && p === c).length;
    const fn = ps.filter(([h, p]) => h === c && p !== c).length;
    const pr = tp + fp ? tp / (tp + fp) : 0;
    const rc = tp + fn ? tp / (tp + fn) : 0;
    return pr + rc ? (2 * pr * rc) / (pr + rc) : 0;
  }).reduce((a, b) => a + b, 0) / 3;
const pct = (k: number, of_: number) => `${((100 * k) / of_).toFixed(1)}%`;
const acc = (ps: Pair[]) => ((100 * ps.filter(([h, p]) => h === p).length) / ps.length).toFixed(1).replace(/\.0$/, "") + "%";
const summary = (ps: Pair[]) => {
  const hc = (c: string) => ps.filter(([h]) => h === c).length;
  return `${acc(ps)} | ${macroF1(ps).toFixed(3)} | ${n(ps, "C", "C")}/${hc("C")} | ${n(ps, "R", "S")}/${hc("R")}`;
};
const has = (s: string) => assert.ok(md.includes(s), `write-up is missing: ${s}`);

test("gated stance: CSV shape matches the write-up", () => {
  for (const m of [D1, JEV]) {
    const rs = of(m);
    assert.equal(rs.length, 40, m);
    assert.deepEqual(CLS.map((c) => rs.filter((r) => r.hand === c).length), [18, 10, 12]);
    for (const r of rs) assert.equal(r.gated, gatedAt(r, 0.5), "stored gated label follows the 0.5 gate");
  }
  has("40 stance hand labels (R 18, C 10, S 12)");
});

test("gated stance: results table (gated and round-4 3-way rows)", () => {
  for (const [m, name] of [[D1, "d1-ultra"], [JEV, "Jev 1.14.0"]] as const) {
    const rs = of(m);
    const three: Pair[] = rs.map((r) => [r.hand, r.three_way]);
    const gated: Pair[] = rs.map((r) => [r.hand, r.gated]);
    has(`| ${name}, 3-way (round 4) | ${summary(three)} |`);
    // The write-up bolds the d1-ultra gated row's name, curious recall and Reject → Serious.
    const [a, f, c, rs_] = summary(gated).split(" | ");
    has(m === D1 ? `| **${name}, gated** | ${a} | ${f} | **${c}** | **${rs_}** |` : `| ${name}, gated | ${a} | ${f} | ${c} | ${rs_} |`);
    assert.equal(rs.filter((r) => r.gated === "C").length, 20, `${m} sends 20 of 40 to Curious`);
  }
  has("Both models send 20 of the 40 posts to Curious.");
});

test("gated stance: confusion matrices", () => {
  const cell = (m: string, h: string) => CLS.map((p) => of(m).filter((r) => r.hand === h && r.gated === p).length).join(" | ");
  const label = { R: "hand R (18)", C: "hand C (10)", S: "hand S (12)" } as const;
  for (const h of CLS) has(`| ${label[h]} | ${cell(D1, h)} | ${cell(JEV, h)} |`);
});

test("gated stance: gate-threshold sweep (d1-ultra)", () => {
  const rs = of(D1);
  for (const t of [0.3, 0.6, 0.8]) {
    const ps: Pair[] = rs.map((r) => [r.hand, gatedAt(r, t)]);
    has(`| ${t} | ${macroF1(ps).toFixed(3)} | ${n(ps, "C", "C")} | ${n(ps, "R", "S")} |`);
  }
});

test("gated stance: direction step and confidence figures", () => {
  const dirOk = (r: Row) => (r.direction === "reject" ? "R" : "S") === r.hand;
  const rs = of(D1).filter((r) => r.hand !== "C");
  const passed = rs.filter((r) => r.p_position >= 0.5);
  has(`${passed.filter(dirOk).length} of ${passed.length} hand-Reject and hand-Serious posts`);
  const hi = rs.filter((r) => r.p_direction >= 0.8);
  has(`gets ${rs.filter(dirOk).length}/30 right (${rs.filter((r) => r.hand === "R" && r.direction === "serious").length} Reject → Serious) and ${hi.filter(dirOk).length}/${hi.length} at P ≥ 0.8`);
  const jr = of(JEV).filter((r) => r.hand !== "C");
  has(`Jev gets ${jr.filter(dirOk).length}/30 (${jr.filter((r) => r.hand === "R" && r.direction === "serious").length} Reject → Serious)`);

  const conf = (r: Row) => Math.max(r.p_position, 1 - r.p_position) * (r.p_position >= 0.5 ? r.p_direction : 1);
  const at = (m: string, t: number) => {
    const sel = of(m).filter((r) => conf(r) >= t);
    return [`${pct(sel.filter((r) => r.hand === r.gated).length, sel.length)}`, sel.length] as const;
  };
  for (const [t, words] of [[0.7, "at confidence ≥ 0.7 is"], [0.8, "at ≥ 0.8 it is"], [0.9, "and at ≥ 0.9 it is"]] as const) {
    const [a, k] = at(D1, t);
    has(`${words} ${a} (${k} posts)`);
  }
  has(`Jev is lower again: ${at(JEV, 0.7)[0]} at ≥ 0.7 and ${at(JEV, 0.8)[0]} at ≥ 0.8`);

  const cp = of(D1).filter((r) => r.hand === "C").map((r) => r.p_position).sort((a, b) => a - b);
  const median = (cp[4]! + cp[5]!) / 2;
  assert.ok(Math.abs(median - 0.3) < 0.01, `hand-Curious median ${median}`);
  has("hand-Curious medians are about 0.3");
  for (const h of ["R", "S"]) {
    const v = of(D1).filter((r) => r.hand === h).map((r) => r.p_position);
    assert.ok(Math.min(...v) < 0.05 && Math.max(...v) > 0.9, `${h} spans the range`);
  }
  for (const h of ["R", "S"]) assert.equal(of(D1).filter((r) => r.hand === h && r.gated === "C").length, 7);
  has("moves 7 Reject and 7 Serious posts into Curious");
});

test("gated stance: cost", () => {
  const sum = (m: string) => `$${of(m).reduce((a, r) => a + r.cost, 0).toFixed(6)}`;
  has(`${all.length} calls. d1-ultra reported ${sum(D1)} and Jev 1.14.0 ${sum(JEV)}`);
});
