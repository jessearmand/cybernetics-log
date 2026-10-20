import assert from "node:assert/strict";
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
