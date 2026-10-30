import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import discourse from "../data/discourse.json" with { type: "json" };
import { esc, PLACEHOLDER_EDITORIAL, renderPage } from "../agent/lib/render.ts";

const meta = { renderedAt: "2026-10-09T00:00:00Z", model: "deepseek/deepseek-v4.1-flash", dataSource: "bundled" };

test("render: every section is present and numbers come from the data", () => {
  const html = renderPage(discourse, PLACEHOLDER_EDITORIAL, meta);
  for (const id of ["stance", "methods", "confidence", "pair", "clusters", "accounts", "caveats", "rounds", "policy", "dawkins", "politics", "models", "lead", "workspace", "nature", "round5"]) assert.match(html, new RegExp(`<section id="${id}"`));
  assert.match(html, /<b>577<\/b> English posts/);
  assert.match(html, /<b>490<\/b> authors/);
  assert.match(html, /title="Reject: 18 \(45%\)"/);
  assert.match(html, /title="Curious: 10 \(25%\)"/);
  assert.match(html, /title="Serious: 12 \(30%\)"/);
  assert.match(html, /title="Reject: 93 /);
  assert.match(html, /title="Curious: 133 /);
  assert.match(html, /<b>55%<\/b>/);
  assert.match(html, /<b>47.5%<\/b>/);
  assert.match(html, /Jev hybrid \(confident or Uncertain\) ★/);
  assert.match(html, /title="Uncertain: 254 /);
  assert.ok(!html.includes("report.md"));
  assert.match(html, /Jev matched the position on <b>17<\/b> of 20/);
  assert.match(html, /x\.com\/RichardDawkins\/status\/2049973529576108160/);
  assert.match(html, /href="https:\/\/unherd\.com\/2026\/05\/when-claudia-met-claudius\/"/);
  assert.match(html, /x\.com\/aleksil79\/status\/2105591033228890336/);
  assert.equal((html.match(/class="card"/g) ?? []).length, 8);
  assert.ok(!html.includes('<aside id="neuro"'), "the lead section replaces the round-4 aside");
  assert.match(html, /<span>5 rounds<\/span>/);
  assert.match(html, /href="https:\/\/www\.nature\.com\/articles\/d41586-026-03313-7"/);
  assert.match(html, /href="https:\/\/arxiv\.org\/abs\/2607\.15495"/);
  assert.ok(html.indexOf('<section id="lead"') < html.indexOf('<section id="stance"'), "the Tsao paper leads the page");
  assert.match(html, /<div id="sebo"/);
  assert.match(html, /independent SPAR project, not Anthropic research/);
  assert.match(html, /href="https:\/\/www\.lesswrong\.com\/posts\//);
  assert.match(html, /href="https:\/\/www\.biorxiv\.org\/content\//);
  assert.match(html, /Jev 1\.14\.0 \(TypeSafe\)/);
});

test("render: model and post text is escaped; only allow-listed links are emitted", () => {
  const html = renderPage(
    discourse,
    { ...PLACEHOLDER_EDITORIAL, headline: '<script>alert(1)</script>', summary: ['**bold** <img src=x onerror=alert(1)> [x](javascript:alert(1))'] },
    { ...meta, deployment: { id: "1", environment: "Production", sha: "0".repeat(40), repository: "jessearmand/cybernetics-log", targetUrl: "javascript:alert(1)" } },
  );
  assert.ok(!html.includes("<script>alert(1)</script>"));
  assert.ok(!html.includes("<img src=x"));
  assert.ok(!html.includes('href="javascript:'));
  assert.match(html, /<strong>bold<\/strong>/);
  assert.equal(esc(`<"'&>`), "&lt;&quot;&#39;&amp;&gt;");
});

test("render: data committed before round 4 still renders (older deployments, replayed webhooks)", () => {
  const old = structuredClone(discourse) as Record<string, unknown>;
  for (const k of ["round4_framing", "politics_spotlight", "sebo", "neuroscience_sidebar", "model_comparison", "key_accounts_round4", "lead_tsao", "workspace_paper", "nature_comment", "round5"]) delete old[k];
  const html = renderPage(old as typeof discourse, PLACEHOLDER_EDITORIAL, meta);
  assert.match(html, /<section id="policy"/);
  for (const id of ["politics", "models", "lead", "workspace", "nature", "round5"]) assert.ok(!html.includes(`<section id="${id}"`), id);
  assert.ok(!html.includes('href="#politics"'));
  assert.ok(!html.includes("undefined"));
});

test("render: the Dawkins section is compressed to two lines once round 5 is present", () => {
  const html = renderPage(discourse, PLACEHOLDER_EDITORIAL, meta);
  const sec = html.slice(html.indexOf('<section id="dawkins"'), html.indexOf("</section>", html.indexOf('<section id="dawkins"')));
  assert.equal((sec.match(/<p>/g) ?? []).length, 2);
  assert.ok(!sec.includes("<h3>Reactions</h3>"));
  assert.match(sec, /I spent three days trying to persuade myself that Claudia is not conscious\. I failed\./);
});

test("round-5 stance bars treat a missing stance key as zero", () => {
  const d = structuredClone(discourse);
  delete (d.round5.models[0]!.round6.stance as Record<string, unknown>).reporting;
  const html = renderPage(d, PLACEHOLDER_EDITORIAL, meta);
  assert.match(html, /with reporting/);
  assert.match(html, /Reporting: 0 \(0%\)/);
});

test("round 6 hand check renders with the e_philalethes caveat", () => {
  const html = renderPage(discourse, PLACEHOLDER_EDITORIAL, meta);
  assert.match(html, /Round 6: hand check on the new disagreements/);
  assert.match(html, /@e_philalethes counts as a miss for d1-ultra in the strict score/);
  assert.match(html, /d1-ultra&#39;s Serious has a fair case|d1-ultra's Serious has a fair case/);
  assert.match(html, /16 of 26/);
});

/** The HTML of one section. The lazy regexes here rely on sections and folds never being nested, which render.ts guarantees. */
const sectionHtml = (html: string, id: string) => {
  const m = html.match(new RegExp(`<section id="${id}"[\\s\\S]*?</section>`));
  assert.ok(m, `section ${id}`);
  return m[0];
};
const withoutFolds = (s: string) => s.replace(/<details class="fold">[\s\S]*?<\/details>/g, "");

test("mobile: long bulleted explanations are collapsed by default behind native <details>", () => {
  const html = renderPage(discourse, PLACEHOLDER_EDITORIAL, meta);
  const want: Record<string, string[]> = {
    lead: ["The preprint in brief", discourse.lead_tsao.discussion_title],
    workspace: ["The paper in brief", "What it does not claim"],
    nature: ["The commentary in brief"],
    politics: ["The fight in brief", "Reactions"],
    policy: ["Caveats", "Jeff Sebo on the rule"],
    round5: ["Round 5: notable accounts", "Caveats"],
    models: ["Caveats"],
    rounds: ["Round 4: notable new accounts", "Round 3: notable new accounts", "Round 2 key accounts"],
    caveats: ["Read the caveats"],
  };
  for (const [id, labels] of Object.entries(want)) {
    const s = sectionHtml(html, id);
    for (const l of labels) assert.ok(s.includes(`<summary><h3 class="flabel">${esc(l)}</h3>`), `${id}: "${l}" is a collapsible summary`);
    assert.ok(!/<details class="fold" open/.test(s), `${id}: collapsed by default`);
    // Every bullet in these sections sits inside a fold; nothing long is left expanded.
    assert.ok(!/<li[ >]/.test(withoutFolds(s)), `${id}: no bullet outside a fold`);
  }
  // The Sacks bullets and the five general caveats are inside their folds, not lost.
  const cav = sectionHtml(html, "caveats");
  for (const c of discourse.caveats) assert.ok(cav.includes(`<b>${esc(c.title)}.</b>`), c.title);
  assert.ok(cav.includes(`<span class="fcount">${discourse.caveats.length} points</span>`));
  for (const x of discourse.politics_spotlight.summary) assert.ok(sectionHtml(html, "politics").includes(esc(x)));
  // Lead text and key numbers stay outside the folds.
  assert.match(withoutFolds(sectionHtml(html, "round5")), new RegExp(`<b>${discourse.round5.agreement.agree}</b> of ${discourse.round5.agreement.n} posts`));
  assert.match(withoutFolds(sectionHtml(html, "lead")), /class="cite"/);
  // Summaries are a comfortable tap target with a visible expand marker.
  assert.match(html, /details\.fold>summary\{[^}]*min-height:48px/);
  assert.match(html, /details\.fold\[open\]>summary::before\{transform:rotate\(45deg\)\}/);
});

test("mobile: the footer drops the Corpus block and links to the complete data on GitHub", () => {
  const html = renderPage(discourse, PLACEHOLDER_EDITORIAL, meta);
  const footer = html.slice(html.indexOf("<footer>"));
  assert.ok(!footer.includes("<dt>Corpus</dt>"));
  assert.ok(!html.includes(esc(discourse.corpus.source)), "corpus source line is no longer on the page");
  for (const n of discourse.corpus.notes) assert.ok(!html.includes(esc(n)), `corpus note still on the page: ${n.slice(0, 40)}`);
  assert.match(footer, /<dt>Data<\/dt><dd><a href="https:\/\/github\.com\/jessearmand\/cybernetics-log\/tree\/main\/data"[^>]*>Complete data on GitHub<\/a>/);
  assert.match(footer, /href="https:\/\/github\.com\/jessearmand\/cybernetics-log#corpus"/);
  assert.match(html, /@media \(max-width:640px\)\{footer dl\{grid-template-columns:1fr/);
});

test("mobile: the corpus notes moved off the page live in the README", () => {
  const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
  const start = readme.indexOf("## Corpus\n");
  const end = readme.indexOf("\n## ", start + 1);
  assert.ok(start >= 0 && end > start, "README has a Corpus section followed by another section");
  const sec = readme.slice(start, end);
  assert.ok(sec.length > 100, "README has a Corpus section");
  const c = discourse.corpus;
  assert.ok(sec.includes(`${c.posts} English posts from ${c.authors} authors, ${c.window.label}`));
  assert.ok(sec.includes(`**Source:** ${c.source}.`));
  for (const n of c.notes) assert.ok(sec.includes(`- ${n}\n`), `README is missing corpus note: ${n.slice(0, 40)}`);
});

test("round 5: the third model is shown, its hand-label scores marked not comparable, and its long lists folded", () => {
  const html = renderPage(discourse, PLACEHOLDER_EDITORIAL, meta);
  const s = sectionHtml(html, "round5");
  const t = discourse.round5.third_model;
  assert.ok(s.includes(`<h3>A third model: ${esc(t.name)}</h3>`));
  assert.ok(s.includes("<b>Not comparable on hand labels:</b>"));
  // Every row for the third model in a hand-label table carries the marker.
  assert.equal(s.split(`${esc(t.name)}<sup title="Not comparable`).length - 1, 2);
  assert.ok(s.includes(`<summary><h3 class="flabel">Agreement on every question</h3>`));
  assert.ok(s.includes(`<summary><h3 class="flabel">Posts picked for hand-labelling</h3><span class="fcount">${t.candidates.length} points</span>`));
  // The outlier check: biased against the third model, its own folded table, combined caveat visible.
  const o = t.outlier_check;
  assert.ok(s.includes("<b>Biased against GPT-6 Luna:</b>"));
  assert.ok(s.includes(`<summary><h3 class="flabel">The ${o.n} outlier posts, post by post</h3>`));
  assert.ok(!/<table class="methods outl">/.test(withoutFolds(s)), "the outlier tables are folded on mobile");
  for (const x of [o.text, o.instability, o.combined, o.caveat]) assert.ok(withoutFolds(s).includes(esc(x)));
  assert.ok(s.includes(esc("Doesn’t engage in any side, irrelevant comment ")));
  for (const c of t.candidates) assert.ok(s.includes(`@${esc(c.username)}`));
  assert.ok(!/<table class="methods agree">/.test(withoutFolds(s)), "the agreement table is folded on mobile");
  assert.ok(withoutFolds(s).includes(esc(t.agreement_text)), "the headline agreement numbers stay visible");
  assert.ok(s.includes(`GPT-6 Luna billed $${t.run.gateway_cost_usd} through the gateway`));
});

test("round 5: data built before the third model still renders", () => {
  const d = structuredClone(discourse) as Record<string, unknown> & { round5: Record<string, unknown> };
  delete d.round5.third_model;
  const html = renderPage(d as unknown as typeof discourse, PLACEHOLDER_EDITORIAL, meta);
  assert.ok(!html.includes("A third model"));
  assert.ok(!html.includes("undefined"));
});

test("round 5: data built before the outlier hand labels still renders", () => {
  const d = structuredClone(discourse) as unknown as { round5: { third_model: Record<string, unknown> } };
  delete d.round5.third_model.outlier_check;
  const html = renderPage(d as unknown as typeof discourse, PLACEHOLDER_EDITORIAL, meta);
  assert.ok(html.includes("A third model"));
  assert.ok(!html.includes("outlier posts, post by post"));
  assert.ok(!html.includes("undefined"));
});

test("round 7: tables and lists are folded on mobile, the key findings and data links stay visible", () => {
  const html = renderPage(discourse, PLACEHOLDER_EDITORIAL, meta);
  const s = sectionHtml(html, "round7");
  const r = discourse.round7;
  assert.ok(html.indexOf('<section id="round5"') < html.indexOf('<section id="round7"'));
  assert.ok(html.includes('<a href="#round7">Round 7</a>'));
  for (const l of ["Hand-label scores, every model", "Posts a model called applied", "Round 7 stance, every model", "Round 7 caveats"]) assert.ok(s.includes(`<summary><h3 class="flabel">${esc(l)}</h3>`), l);
  assert.ok(!/<details class="fold" open/.test(s));
  const visible = withoutFolds(s);
  assert.ok(!/<li[ >]/.test(visible), "no bullet outside a fold");
  const text = visible.replace(/<\/?b>/g, "");
  for (const t of [r.new_models.agreement_text, r.new_models.shared_text, r.new_models.joey_text, r.new_models.comparability, r.x_set.headline, r.x_set.seeker_text]) assert.ok(text.includes(esc(t)), t);
  assert.ok(visible.includes("<b>No post in this set describes applying a stance on AI consciousness to a product decision.</b>"));
  for (const a of r.x_set.applied) assert.ok(!visible.includes(`@${esc(a.username)}</b>`), `@${a.username} is inside the fold`);
  for (const f of ["posts_r7.csv", "labels_r7.csv", "model_vs_seeker_r7_x.csv", "applied_candidates_r7_x.csv"]) assert.ok(s.includes(`href="https://github.com/jessearmand/cybernetics-log/blob/main/data/${f}"`), f);
  assert.ok(!/\.csv/.test(s.replace(/href="[^"]*"/g, "")), "no file names in the page text");
});

test("round 7: the bold lead stops at the first sentence, not at an abbreviation or a decimal", () => {
  const d = structuredClone(discourse) as typeof discourse;
  const n = d.round7.new_models as { shared_text: string };
  const x = d.round7.x_set as { headline: string };
  n.shared_text = "e.g. d1-ultra is wrong on 13. Decision-1 repeats that answer.";
  x.headline = "P 0.41. Seven posts were called applied, each by one model. The rest were not.";
  const html = renderPage(d, PLACEHOLDER_EDITORIAL, meta);
  assert.ok(html.includes("<b>e.g. d1-ultra is wrong on 13.</b> Decision-1 repeats that answer."));
  assert.ok(html.includes("<b>P 0.41. Seven posts were called applied, each by one model.</b> The rest were not."));
});

test("round 7: data built before round 7 still renders", () => {
  const d = structuredClone(discourse) as Record<string, unknown>;
  delete d.round7;
  const html = renderPage(d as unknown as typeof discourse, PLACEHOLDER_EDITORIAL, meta);
  assert.ok(!html.includes('id="round7"'));
  assert.ok(!html.includes("#round7"));
  assert.ok(!html.includes("undefined"));
});
