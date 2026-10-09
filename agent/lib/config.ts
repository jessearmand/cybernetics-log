/**
 * Runtime configuration. Everything here is non-secret and has a safe default;
 * secrets (webhook secret, Blob credentials, AI Gateway auth) only come from the
 * environment and are never logged.
 */

/** Default AI Gateway model for the renderer (see agent/agent.ts). */
export const DEFAULT_MODEL = "deepseek/deepseek-v4.1-flash";

/** The only repository whose deployments may trigger a render. */
export function allowedRepository(): string {
  return (process.env.GITHUB_REPOSITORY_ALLOWLIST ?? "jessearmand/cybernetics-log").trim().toLowerCase();
}

/**
 * GitHub deployment environments that trigger a render. Vercel's GitHub
 * integration reports production deploys as "Production". "page-render" is the
 * environment scripts/trigger-render.sh uses for manual, instruction-only runs.
 */
export function renderEnvironments(): string[] {
  return (process.env.RENDER_ENVIRONMENTS ?? "Production,page-render")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/** Shared secret configured on the GitHub repository webhook. */
export function webhookSecret(): string | undefined {
  const value = process.env.GITHUB_DEPLOYMENT_WEBHOOK_SECRET?.trim();
  return value ? value : undefined;
}

/** Blob pathname prefix for rendered pages. */
export const BLOB_PREFIX = (process.env.PAGE_BLOB_PREFIX ?? "cybernetics-log").replace(/\/+$/, "");

/** Access mode of the Blob store ("private" or "public"); must match the store. */
export function blobAccess(): "private" | "public" {
  return process.env.PAGE_BLOB_ACCESS === "public" ? "public" : "private";
}

/** Authenticator name stamped on sessions started by a verified deployment webhook. */
export const DEPLOYMENT_AUTHENTICATOR = "github-deployment";

/** Max accepted webhook body (GitHub caps payloads at 25 MB; deployment_status is a few KB). */
export const MAX_WEBHOOK_BYTES = 1_000_000;

/** Max characters of a deployment-payload instruction that reach the model. */
export const MAX_INSTRUCTION_CHARS = 4_000;
