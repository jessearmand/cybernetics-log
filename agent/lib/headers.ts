import { anchorRedirectScriptHash } from "./anchors.ts";

/**
 * CSP for a site page. Only `/` carries the legacy-hash redirect, and only that
 * exact script (pinned by hash) may run there; every other page allows no script.
 */
export function contentSecurityPolicy(pagePath: string): string {
  const script = pagePath === "/" ? `script-src ${anchorRedirectScriptHash()}; ` : "";
  return `default-src 'none'; style-src 'unsafe-inline'; ${script}img-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`;
}

export function pageHeaders(pagePath: string, rendered: boolean): Record<string, string> {
  return {
    "content-type": "text/html; charset=utf-8",
    "cache-control": rendered ? "public, max-age=0, s-maxage=60, stale-while-revalidate=300" : "no-store",
    "x-content-type-options": "nosniff",
    "referrer-policy": "strict-origin-when-cross-origin",
    "content-security-policy": contentSecurityPolicy(pagePath),
  };
}
