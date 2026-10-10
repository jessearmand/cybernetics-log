import assert from "node:assert/strict";
import { test } from "node:test";

import discourse from "../data/discourse.json" with { type: "json" };
import { esc, PLACEHOLDER_EDITORIAL, renderPage } from "../agent/lib/render.ts";

const meta = { renderedAt: "2026-10-09T00:00:00Z", model: "deepseek/deepseek-v4.1-flash", dataSource: "bundled" };

test("render: every section is present and numbers come from the data", () => {
  const html = renderPage(discourse, PLACEHOLDER_EDITORIAL, meta);
  for (const id of ["stance", "methods", "confidence", "pair", "clusters", "accounts", "caveats", "rounds", "policy", "dawkins"]) assert.match(html, new RegExp(`<section id="${id}"`));
  assert.match(html, /<b>422<\/b> English posts/);
  assert.match(html, /<b>359<\/b> authors/);
  assert.match(html, /title="Reject: 18 \(45%\)"/);
  assert.match(html, /title="Curious: 10 \(25%\)"/);
  assert.match(html, /title="Serious: 12 \(30%\)"/);
  assert.match(html, /title="Reject: 93 /);
  assert.match(html, /title="Curious: 133 /);
  assert.match(html, /<b>55%<\/b>/);
  assert.match(html, /<b>47.5%<\/b>/);
  assert.match(html, /Jev hybrid \(confident or Uncertain\) ★/);
  assert.match(html, /title="Uncertain: 197 /);
  assert.ok(!html.includes("report.md"));
  assert.match(html, /Jev matched the position on <b>17<\/b> of 20/);
  assert.match(html, /x\.com\/RichardDawkins\/status\/2049973529576108160/);
  assert.match(html, /href="https:\/\/unherd\.com\/2026\/05\/when-claudia-met-claudius\/"/);
  assert.match(html, /x\.com\/aleksil79\/status\/2105591033228890336/);
  assert.equal((html.match(/class="card"/g) ?? []).length, 8);
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
