import { defineChannel, GET, HEAD } from "eve/channels";

import { DEFAULT_MODEL } from "../lib/config.ts";
import { loadData } from "../lib/data.ts";
import { PLACEHOLDER_EDITORIAL, pageAt, renderSite } from "../lib/render.ts";
import { listRounds, matchSitePath } from "../lib/rounds.ts";
import { loadPage } from "../lib/store.ts";

/**
 * Serves the multi-page log. Read-only: there is no input here.
 * Before the first deployment-triggered render it builds pages from the
 * committed data with a banner, so known URLs never 404.
 */
async function htmlFor(pathname: string): Promise<{ html: string; rendered: boolean } | { notFound: true }> {
  const data = await loadData(null);
  const available = listRounds(data.discourse).map((r) => r.n);
  const matched = matchSitePath(pathname, available);
  if (!matched) return { notFound: true };

  const stored = await loadPage(matched);
  if (stored) return { html: stored, rendered: true };

  const site = renderSite(data.discourse, PLACEHOLDER_EDITORIAL, {
    renderedAt: new Date().toISOString(),
    model: `${DEFAULT_MODEL} (not yet run)`,
    dataSource: data.source,
    banner: "Awaiting the first deployment-triggered render: showing committed data without the agent's editorial copy.",
  });
  const html = pageAt(site, matched);
  if (!html) return { notFound: true };
  return { html, rendered: false };
}

function headers(rendered: boolean): HeadersInit {
  return {
    "content-type": "text/html; charset=utf-8",
    "cache-control": rendered ? "public, max-age=0, s-maxage=60, stale-while-revalidate=300" : "no-store",
    "x-content-type-options": "nosniff",
    "referrer-policy": "strict-origin-when-cross-origin",
    // script-src allows the tiny legacy-hash redirect on `/` only.
    "content-security-policy":
      "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  };
}

async function respond(pathname: string, method: "GET" | "HEAD"): Promise<Response> {
  const result = await htmlFor(pathname);
  if ("notFound" in result) {
    return new Response("Not found", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  }
  const h = headers(result.rendered);
  if (method === "HEAD") return new Response(null, { headers: h });
  return new Response(result.html, { headers: h });
}

export default defineChannel({
  routes: [
    GET("/", async () => respond("/", "GET")),
    HEAD("/", async () => respond("/", "HEAD")),
    GET("/about", async () => respond("/about", "GET")),
    HEAD("/about", async () => respond("/about", "HEAD")),
    GET("/rounds/:round", async (_req, { params }) => respond(`/rounds/${params.round}`, "GET")),
    HEAD("/rounds/:round", async (_req, { params }) => respond(`/rounds/${params.round}`, "HEAD")),
  ],
});
