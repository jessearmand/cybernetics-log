import bundledDiscourse from "../../data/discourse.json" with { type: "json" };

import type { DeploymentTrigger } from "./github-webhook.ts";

/** Shape of data/discourse.json (only the fields the renderer reads are typed strictly). */
export type Discourse = typeof bundledDiscourse;

// The default instruction ships with the build so a render never depends on the network.
// Keep in sync with data/render-instruction.md (a test checks this).
export { DEFAULT_RENDER_INSTRUCTION } from "./default-instruction.ts";
import { DEFAULT_RENDER_INSTRUCTION } from "./default-instruction.ts";

export interface LoadedData {
  readonly discourse: Discourse;
  /** "github@<sha>" when read from the repo at the deployment's commit, else "bundled". */
  readonly source: string;
  /** Commit the data was read at, when known. */
  readonly sha: string | null;
  /** Contents of data/render-instruction.md at that commit. */
  readonly instructionFile: string;
  readonly warnings: readonly string[];
}

const FETCH_TIMEOUT_MS = 10_000;

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return await response.text();
}

function looksLikeDiscourse(value: unknown): value is Discourse {
  const v = value as Partial<Discourse> | null;
  return !!v && v.schema_version === 1 && !!v.corpus && !!v.stance_counts && !!v.accuracy && !!v.pair_test;
}

/**
 * Loads the data a render uses. The repo is public, so the exact files at the
 * deployment's commit are read from raw.githubusercontent.com: that ties the
 * page to the commit that triggered it even if the webhook lands on a different
 * build. Falls back to the copy bundled into this build.
 */
export async function loadData(trigger: DeploymentTrigger | null): Promise<LoadedData> {
  const warnings: string[] = [];
  const buildSha = process.env.VERCEL_GIT_COMMIT_SHA ?? null;

  if (trigger) {
    const base = `https://raw.githubusercontent.com/${trigger.repository}/${trigger.sha}`;
    try {
      const [json, instruction] = await Promise.all([
        fetchText(`${base}/data/discourse.json`),
        fetchText(`${base}/data/render-instruction.md`).catch(() => DEFAULT_RENDER_INSTRUCTION),
      ]);
      const parsed: unknown = JSON.parse(json);
      if (!looksLikeDiscourse(parsed)) throw new Error("unexpected discourse.json shape");
      return { discourse: parsed, source: `github@${trigger.sha.slice(0, 7)}`, sha: trigger.sha, instructionFile: instruction, warnings };
    } catch (error) {
      warnings.push(`Could not read data at ${trigger.sha.slice(0, 7)} from GitHub (${(error as Error).message}); using the bundled copy.`);
      if (buildSha && buildSha !== trigger.sha) {
        warnings.push(`Bundled data is from ${buildSha.slice(0, 7)}, not the deployment commit ${trigger.sha.slice(0, 7)}.`);
      }
    }
  }

  return { discourse: bundledDiscourse, source: "bundled", sha: buildSha, instructionFile: DEFAULT_RENDER_INSTRUCTION, warnings };
}
