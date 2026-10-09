import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verifies GitHub's `X-Hub-Signature-256` header (HMAC-SHA256 of the exact
 * delivered bytes with the webhook secret). Constant-time comparison.
 */
export function verifyGitHubSignature(body: string, signatureHeader: string | null, secret: string): boolean {
  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) return false;
  const expected = signGitHubBody(body, secret);
  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Signs a webhook body the way GitHub does. Used by tests and local fixtures. */
export function signGitHubBody(body: string, secret: string): string {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

/** The fields of a `deployment_status` webhook this agent uses. */
export interface DeploymentTrigger {
  readonly deploymentId: string;
  readonly statusId: string;
  readonly state: string;
  readonly environment: string;
  readonly sha: string;
  readonly ref: string;
  readonly repository: string;
  readonly creator: string;
  readonly targetUrl: string | null;
  readonly createdAt: string;
  /** Optional free-text instruction from `deployment.payload.instruction`. */
  readonly payloadInstruction: string | null;
}

export type ParseResult =
  | { readonly kind: "trigger"; readonly trigger: DeploymentTrigger }
  | { readonly kind: "ignore"; readonly reason: string };

const SHA_RE = /^[0-9a-f]{40}$/;

function str(value: unknown): string | null {
  return typeof value === "string" ? value : typeof value === "number" ? String(value) : null;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

/**
 * Turns a verified `deployment_status` payload into a render trigger, or says
 * why it is ignored. Only successful deployments of the allowed repository in
 * an allowed environment trigger a render.
 */
export function parseDeploymentStatus(
  payload: unknown,
  options: { readonly repository: string; readonly environments: readonly string[]; readonly maxInstructionChars: number },
): ParseResult {
  const root = record(payload);
  const status = record(root?.deployment_status);
  const deployment = record(root?.deployment);
  const repo = record(root?.repository);
  if (!root || !status || !deployment || !repo) return { kind: "ignore", reason: "not a deployment_status payload" };

  const repository = (str(repo.full_name) ?? "").toLowerCase();
  if (repository !== options.repository.toLowerCase()) {
    return { kind: "ignore", reason: `repository ${repository || "?"} is not allowed` };
  }

  const state = str(status.state) ?? "";
  if (state !== "success") return { kind: "ignore", reason: `deployment state is ${state || "?"}` };

  const environment = str(status.environment) ?? str(deployment.environment) ?? "";
  if (!options.environments.includes(environment.toLowerCase())) {
    return { kind: "ignore", reason: `environment ${environment || "?"} does not trigger renders` };
  }

  const sha = (str(deployment.sha) ?? "").toLowerCase();
  if (!SHA_RE.test(sha)) return { kind: "ignore", reason: "deployment has no commit sha" };

  const deploymentId = str(deployment.id);
  if (!deploymentId) return { kind: "ignore", reason: "deployment has no id" };

  const deploymentPayload = record(deployment.payload);
  const rawInstruction = str(deploymentPayload?.instruction)?.trim() ?? "";
  const payloadInstruction = rawInstruction ? rawInstruction.slice(0, options.maxInstructionChars) : null;

  return {
    kind: "trigger",
    trigger: {
      deploymentId,
      statusId: str(status.id) ?? "",
      state,
      environment,
      sha,
      ref: str(deployment.ref) ?? "",
      repository,
      creator: str(record(deployment.creator)?.login) ?? "",
      targetUrl: str(status.environment_url) ?? str(status.target_url),
      createdAt: str(status.created_at) ?? new Date().toISOString(),
      payloadInstruction,
    },
  };
}

/** Session auth attributes are flat strings; this is the trigger in that shape. */
export function triggerToAttributes(trigger: DeploymentTrigger): Record<string, string> {
  return {
    deploymentId: trigger.deploymentId,
    statusId: trigger.statusId,
    environment: trigger.environment,
    sha: trigger.sha,
    ref: trigger.ref,
    repository: trigger.repository,
    creator: trigger.creator,
    targetUrl: trigger.targetUrl ?? "",
    createdAt: trigger.createdAt,
    payloadInstruction: trigger.payloadInstruction ?? "",
  };
}

/** Reads a trigger back out of session auth attributes (validated). */
export function attributesToTrigger(attributes: Readonly<Record<string, string | readonly string[]>> | undefined): DeploymentTrigger | null {
  if (!attributes) return null;
  const get = (k: string) => {
    const v = attributes[k];
    return typeof v === "string" ? v : "";
  };
  const sha = get("sha");
  if (!SHA_RE.test(sha) || !get("deploymentId") || !get("repository")) return null;
  return {
    deploymentId: get("deploymentId"),
    statusId: get("statusId"),
    state: "success",
    environment: get("environment"),
    sha,
    ref: get("ref"),
    repository: get("repository"),
    creator: get("creator"),
    targetUrl: get("targetUrl") || null,
    createdAt: get("createdAt"),
    payloadInstruction: get("payloadInstruction") || null,
  };
}
