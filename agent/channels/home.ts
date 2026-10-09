import { defineChannel, GET, HEAD } from "eve/channels";

import { loadData } from "../lib/data.ts";
import { PLACEHOLDER_EDITORIAL, renderPage } from "../lib/render.ts";
import { loadLatestPage } from "../lib/store.ts";
import { DEFAULT_MODEL } from "../lib/config.ts";

/**
 * Serves the latest page the agent rendered. Read-only: there is no input here.
 * Before the first deployment-triggered render it shows the data-only layout
 * with a banner, so the URL never 404s.
 */
async function page(): Promise<{ html: string; rendered: boolean }> {
  const stored = await loadLatestPage();
  if (stored) return { html: stored, rendered: true };
  const data = await loadData(null);
  const html = renderPage(data.discourse, PLACEHOLDER_EDITORIAL, {
    renderedAt: new Date().toISOString(),
    model: `${DEFAULT_MODEL} (not yet run)`,
    dataSource: data.source,
    banner: "Awaiting the first deployment-triggered render: showing committed data without the agent's editorial copy.",
  });
  return { html, rendered: false };
}

function headers(rendered: boolean): HeadersInit {
  return {
    "content-type": "text/html; charset=utf-8",
    "cache-control": rendered ? "public, max-age=0, s-maxage=60, stale-while-revalidate=300" : "no-store",
    "x-content-type-options": "nosniff",
    "referrer-policy": "strict-origin-when-cross-origin",
    "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  };
}

export default defineChannel({
  routes: [
    GET("/", async () => {
      const { html, rendered } = await page();
      return new Response(html, { headers: headers(rendered) });
    }),
    HEAD("/", async () => {
      const { rendered } = await page();
      return new Response(null, { headers: headers(rendered) });
    }),
  ],
});
