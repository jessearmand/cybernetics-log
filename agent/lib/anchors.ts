import { createHash } from "node:crypto";

import { aboutPath, roundPath } from "./rounds.ts";

/**
 * Old single-page fragment ids → new multi-page URLs.
 *
 * Shared when people linked `/#round5` (and hyphenated `/#round-5`) before the
 * per-round split. Fragments never reach the server, so `/` runs a tiny script
 * that reads this map and replaces the location.
 */
export const ANCHOR_REDIRECTS: Readonly<Record<string, string>> = {
  // Round pages (canonical ids and hyphenated aliases people may have typed)
  round7: roundPath(7),
  "round-7": roundPath(7),
  round5: roundPath(5),
  "round-5": roundPath(5),
  round6: roundPath(6),
  "round-6": roundPath(6),

  // Round 5 collection topics
  workspace: `${roundPath(5)}#workspace`,
  nature: `${roundPath(5)}#nature`,

  // Round 4
  lead: `${roundPath(4)}#lead`,
  politics: `${roundPath(4)}#politics`,
  neuro: `${roundPath(4)}#neuro`,
  models: `${roundPath(4)}#models`,

  // Round 3
  policy: `${roundPath(3)}#policy`,
  dawkins: `${roundPath(3)}#dawkins`,
  sebo: `${roundPath(3)}#sebo`,

  // Round 1
  stance: `${roundPath(1)}#stance`,
  confidence: `${roundPath(1)}#confidence`,
  pair: `${roundPath(1)}#pair`,
  clusters: `${roundPath(1)}#clusters`,
  accounts: `${roundPath(1)}#accounts`,

  // Project-wide (about)
  methods: `${aboutPath()}#methods`,
  rounds: `${aboutPath()}#rounds`,
  caveats: `${aboutPath()}#caveats`,
};

/** Body of the legacy-hash redirect. Own-property lookup so `#constructor` etc. are ignored. */
function anchorRedirectSource(): string {
  const json = JSON.stringify(ANCHOR_REDIRECTS);
  return `(function(){var m=${json};var h=location.hash.slice(1);if(!h)return;var d=Object.prototype.hasOwnProperty.call(m,h)&&m[h];if(typeof d==="string")location.replace(d);})();`;
}

/** Inline script for `/` only: map legacy hashes onto the new URLs. */
export function anchorRedirectScript(): string {
  return `<script>${anchorRedirectSource()}</script>`;
}

/** CSP hash source that allows exactly the redirect script and nothing else. */
export function anchorRedirectScriptHash(): string {
  return `'sha256-${createHash("sha256").update(anchorRedirectSource(), "utf8").digest("base64")}'`;
}
