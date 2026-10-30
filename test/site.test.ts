import assert from "node:assert/strict";
import { test } from "node:test";

import discourse from "../data/discourse.json" with { type: "json" };
import { createHash } from "node:crypto";
import vm from "node:vm";

import { ANCHOR_REDIRECTS, anchorRedirectScript, anchorRedirectScriptHash } from "../agent/lib/anchors.ts";
import { contentSecurityPolicy } from "../agent/lib/headers.ts";
import { PLACEHOLDER_EDITORIAL, pageAt, renderSite } from "../agent/lib/render.ts";
import { SECTION_PAGES, latestRound, listRounds, matchSitePath, pathToStorageKey, roundPath, siteLayout } from "../agent/lib/rounds.ts";
import type { SectionKey } from "../agent/lib/render.ts";

const meta = { renderedAt: "2026-10-09T00:00:00Z", model: "deepseek/deepseek-v4.1-flash", dataSource: "bundled" };

test("routing: / is the latest round; each /rounds/N works; unknown rounds 404", () => {
  const site = renderSite(discourse, PLACEHOLDER_EDITORIAL, meta);
  assert.equal(site.latestRound, 7);
  assert.deepEqual(site.availableRounds, [7, 6, 5, 4, 3, 2, 1]);

  assert.equal(matchSitePath("/", site.availableRounds), "/");
  assert.equal(matchSitePath("/about", site.availableRounds), "/about");
  assert.equal(matchSitePath("/about/", site.availableRounds), "/about");
  for (const n of site.availableRounds) {
    assert.equal(matchSitePath(`/rounds/${n}`, site.availableRounds), `/rounds/${n}`);
    assert.ok(pageAt(site, `/rounds/${n}`), `page for round ${n}`);
  }
  assert.equal(matchSitePath("/rounds/99", site.availableRounds), null);
  assert.equal(matchSitePath("/rounds/0", site.availableRounds), null);
  assert.equal(matchSitePath("/rounds/abc", site.availableRounds), null);
  assert.equal(matchSitePath("/nope", site.availableRounds), null);

  const home = pageAt(site, "/")!;
  assert.match(home, /id="round7"/);
  assert.match(home, /Earlier rounds/);
  assert.match(home, /href="\/rounds\/6"/);
  assert.ok(!home.includes('id="stance"'), "older round body is not on home");
  assert.ok(!home.includes('id="methods"'), "methods live on /about, not home");
});

test("routing: navigation lists rounds newest-first with newer/older links", () => {
  const site = renderSite(discourse, PLACEHOLDER_EDITORIAL, meta);
  const r4 = pageAt(site, "/rounds/4")!;
  assert.match(r4, /rel="next"[^>]*>← Newer · Round 5/);
  assert.match(r4, /rel="prev"[^>]*>Older · Round 3 →/);
  assert.match(r4, /aria-current="page">Round 4</);

  const r7 = pageAt(site, "/rounds/7")!;
  assert.match(r7, /rel="prev"[^>]*>Older · Round 6 →/);
  assert.ok(!r7.includes("Newer · Round"), "latest round has no newer link");

  const r1 = pageAt(site, "/rounds/1")!;
  assert.match(r1, /rel="next"[^>]*>← Newer · Round 2/);
  assert.ok(!r1.includes("Older · Round"), "oldest round has no older link");

  // Home index of earlier rounds is descending and short (headline links only).
  const home = pageAt(site, "/")!;
  const idx = home.indexOf('id="earlier-rounds"');
  assert.ok(idx > 0);
  const block = home.slice(idx, home.indexOf("</section>", idx));
  const hrefs = [...block.matchAll(/href="\/rounds\/(\d+)"/g)].map((m) => Number(m[1]));
  assert.deepEqual(hrefs, [6, 5, 4, 3, 2, 1]);
  assert.match(block, /one-line|Round 6/);
});

test("anchors: legacy fragment ids map onto the new URLs", () => {
  assert.equal(ANCHOR_REDIRECTS.round7, "/rounds/7");
  assert.equal(ANCHOR_REDIRECTS["round-7"], "/rounds/7");
  assert.equal(ANCHOR_REDIRECTS.round5, "/rounds/5");
  assert.equal(ANCHOR_REDIRECTS["round-5"], "/rounds/5");
  assert.equal(ANCHOR_REDIRECTS.round6, "/rounds/6");
  assert.equal(ANCHOR_REDIRECTS.lead, "/rounds/4#lead");
  assert.equal(ANCHOR_REDIRECTS.neuro, "/rounds/4#neuro");
  assert.equal(ANCHOR_REDIRECTS.workspace, "/rounds/5#workspace");
  assert.equal(ANCHOR_REDIRECTS.nature, "/rounds/5#nature");
  assert.equal(ANCHOR_REDIRECTS.policy, "/rounds/3#policy");
  assert.equal(ANCHOR_REDIRECTS.dawkins, "/rounds/3#dawkins");
  assert.equal(ANCHOR_REDIRECTS.sebo, "/rounds/3#sebo");
  assert.equal(ANCHOR_REDIRECTS.politics, "/rounds/4#politics");
  assert.equal(ANCHOR_REDIRECTS.models, "/rounds/4#models");
  assert.equal(ANCHOR_REDIRECTS.stance, "/rounds/1#stance");
  assert.equal(ANCHOR_REDIRECTS.methods, "/about#methods");
  assert.equal(ANCHOR_REDIRECTS.rounds, "/about#rounds");
  assert.equal(ANCHOR_REDIRECTS.caveats, "/about#caveats");
  assert.equal(ANCHOR_REDIRECTS.confidence, "/rounds/1#confidence");
  assert.equal(ANCHOR_REDIRECTS.pair, "/rounds/1#pair");
  assert.equal(ANCHOR_REDIRECTS.clusters, "/rounds/1#clusters");
  assert.equal(ANCHOR_REDIRECTS.accounts, "/rounds/1#accounts");

  const home = pageAt(renderSite(discourse, PLACEHOLDER_EDITORIAL, meta), "/")!;
  assert.ok(home.includes(anchorRedirectScript()));
  assert.match(home, /location\.replace/);
  assert.ok(home.includes('"round5":"/rounds/5"'));
  assert.ok(home.includes('"methods":"/about#methods"'));
  // Round pages do not carry the redirect script.
  assert.ok(!pageAt(renderSite(discourse, PLACEHOLDER_EDITORIAL, meta), "/rounds/5")!.includes("location.replace"));
});

function runRedirect(hash: string): string | null {
  const body = anchorRedirectScript().replace(/^<script>|<\/script>$/g, "");
  let target: string | null = null;
  vm.runInNewContext(body, { location: { hash, replace: (u: unknown) => (target = String(u)) } });
  return target;
}

test("anchors: redirect script follows own keys only", () => {
  assert.equal(runRedirect("#round5"), "/rounds/5");
  assert.equal(runRedirect("#methods"), "/about#methods");
  assert.equal(runRedirect(""), null);
  assert.equal(runRedirect("#unknown"), null);
  for (const h of ["constructor", "toString", "__proto__", "hasOwnProperty", "valueOf"]) {
    assert.equal(runRedirect(`#${h}`), null, `#${h} must not navigate`);
  }
});

test("csp: no script on round/about pages; home allows only the hashed redirect", () => {
  for (const p of ["/rounds/4", "/about"]) {
    const csp = contentSecurityPolicy(p);
    assert.match(csp, /default-src 'none'/);
    assert.ok(!csp.includes("script-src"), `${p} allows no script`);
  }
  const home = contentSecurityPolicy("/");
  assert.ok(!/script-src[^;]*unsafe-inline/.test(home));
  const body = anchorRedirectScript().replace(/^<script>|<\/script>$/g, "");
  const expected = `'sha256-${createHash("sha256").update(body).digest("base64")}'`;
  assert.equal(anchorRedirectScriptHash(), expected);
  assert.match(home, new RegExp(`script-src ${expected.replace(/[+/=]/g, "\\$&")};`));
});

test("content: each round's key findings still appear on its page", () => {
  const site = renderSite(discourse, PLACEHOLDER_EDITORIAL, meta);
  const p = (n: number) => pageAt(site, roundPath(n))!;

  // Round 1
  assert.match(p(1), /title="Reject: 18 \(45%\)"/);
  assert.match(p(1), /title="Curious: 10 \(25%\)"/);
  assert.match(p(1), /title="Serious: 12 \(30%\)"/);
  assert.match(p(1), /title="Uncertain: 254 /);
  assert.match(p(1), /x\.com\/aleksil79\/status\/2105591033228890336/);
  assert.equal((p(1).match(/class="card"/g) ?? []).length, 8);

  // Round 2
  assert.match(p(2), /Round 2 key accounts/);
  assert.match(p(2), /usage-policy update/);

  // Round 3
  assert.match(p(3), /Jev matched the position on <b>17<\/b> of 20/);
  assert.match(p(3), /x\.com\/RichardDawkins\/status\/2049973529576108160/);
  assert.match(p(3), /href="https:\/\/unherd\.com\/2026\/05\/when-claudia-met-claudius\/"/);
  assert.match(p(3), /<div id="sebo"/);

  // Round 4
  assert.match(p(4), /id="lead"/);
  assert.match(p(4), /id="politics"/);
  assert.match(p(4), /independent SPAR project, not Anthropic research/);
  assert.match(p(4), /Jev 1\.14\.0 \(TypeSafe\)/);
  assert.match(p(4), /href="https:\/\/www\.biorxiv\.org\/content\//);
  assert.ok(!p(4).includes('<aside id="neuro"'));

  // Round 5
  assert.match(p(5), /id="workspace"/);
  assert.match(p(5), /id="nature"/);
  assert.match(p(5), /id="round5"/);
  assert.match(p(5), new RegExp(`<b>${discourse.round5.agreement.agree}</b> of ${discourse.round5.agreement.n} posts`));
  assert.match(p(5), /href="https:\/\/www\.nature\.com\/articles\/d41586-026-03313-7"/);
  assert.match(p(5), /href="https:\/\/arxiv\.org\/abs\/2607\.15495"/);

  // Round 6
  assert.match(p(6), /id="round6"/);
  assert.match(p(6), /Round 6: hand check on the new disagreements/);
  assert.match(p(6), /@e_philalethes counts as a miss for d1-ultra in the strict score/);
  assert.match(p(6), /16 of 26/);
  assert.match(p(6), /A third model: GPT-6 Luna Decisions/);

  // Round 7 (also on home)
  assert.match(p(7), /id="round7"/);
  assert.match(p(7), /four more decision models/i);
  assert.ok(p(7).includes(discourse.round7.new_models.agreement_text) || p(7).includes(discourse.round7.new_models.agreement_text.replace(/'/g, "&#39;")));

  // About holds shared methods / overview / caveats
  const about = pageAt(site, "/about")!;
  assert.match(about, /id="methods"/);
  assert.match(about, /id="rounds"/);
  assert.match(about, /id="caveats"/);
  assert.match(about, /<b>55%<\/b>/);
  assert.match(about, /Jev hybrid \(confident or Uncertain\) ★/);
});

test("rounds catalog: scales from data presence; storage keys are stable", () => {
  assert.equal(latestRound(discourse), 7);
  assert.equal(listRounds(discourse).length, 7);
  assert.equal(pathToStorageKey("/"), "index.html");
  assert.equal(pathToStorageKey("/about"), "about.html");
  assert.equal(pathToStorageKey("/rounds/7"), "rounds/7.html");

  const old = structuredClone(discourse) as Record<string, unknown>;
  delete old.round7;
  delete old.round5;
  const site = renderSite(old as typeof discourse, PLACEHOLDER_EDITORIAL, meta);
  assert.equal(site.latestRound, 4);
  assert.ok(!site.availableRounds.includes(5));
  assert.ok(!site.availableRounds.includes(7));
  assert.ok(pageAt(site, "/rounds/4"));
  assert.equal(pageAt(site, "/rounds/5"), undefined);
});

test("home one-liner and round headers carry the round summary", () => {
  const site = renderSite(discourse, PLACEHOLDER_EDITORIAL, meta);
  const home = pageAt(site, "/")!;
  const r7 = listRounds(discourse).find((r) => r.n === 7)!;
  assert.ok(home.includes(r7.summary));
  assert.ok(pageAt(site, "/rounds/3")!.includes(listRounds(discourse).find((r) => r.n === 3)!.summary));
});

test("layout: each section note renders exactly on the pages siteLayout reports", () => {
  const keys = Object.keys(SECTION_PAGES) as SectionKey[];
  const sectionNotes = Object.fromEntries(keys.map((k) => [k, `NOTE-MARKER-${k}-END`])) as Record<SectionKey, string>;
  const editorial = { ...PLACEHOLDER_EDITORIAL, headline: "HEADLINE-MARKER-END for the log", sectionNotes };
  const site = renderSite(discourse, editorial, meta);
  const layout = siteLayout(discourse);
  assert.equal(layout.latest_round, site.latestRound);
  assert.deepEqual(
    layout.pages.map((p) => p.path).sort(),
    site.pages.map((p) => p.path).sort(),
  );
  for (const page of layout.pages) {
    const html = pageAt(site, page.path)!;
    for (const k of keys) {
      assert.equal(html.includes(`NOTE-MARKER-${k}-END`), page.section_notes.includes(k), `${k} on ${page.path}`);
    }
    assert.equal(html.includes("<h1>HEADLINE-MARKER-END"), page.editorial.includes("headline"), `headline on ${page.path}`);
  }
  const home = layout.pages.find((p) => p.path === "/")!;
  assert.equal(home.round, 7);
  assert.deepEqual(home.section_notes, ["round7"]);
  assert.equal(SECTION_PAGES.lead, 4, "the Tsao lead is a round 4 section, not home");
});
