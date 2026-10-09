import assert from "node:assert/strict";
import { test } from "node:test";

import { attributesToTrigger, parseDeploymentStatus, signGitHubBody, triggerToAttributes, verifyGitHubSignature } from "../agent/lib/github-webhook.ts";
import { deploymentFromSession } from "../agent/lib/session.ts";

const opts = { repository: "jessearmand/cybernetics-log", environments: ["production", "page-render"], maxInstructionChars: 50 };
const SHA = "0123456789abcdef0123456789abcdef01234567";

function payload(overrides: { state?: string; environment?: string; repo?: string; instruction?: string } = {}) {
  return {
    deployment_status: { id: 7, state: overrides.state ?? "success", environment: overrides.environment ?? "Production", environment_url: "https://x.vercel.app", created_at: "2026-10-09T00:00:00Z" },
    deployment: { id: 42, sha: SHA, ref: "main", environment: overrides.environment ?? "Production", payload: overrides.instruction ? { instruction: overrides.instruction } : {}, creator: { login: "vercel[bot]" } },
    repository: { full_name: overrides.repo ?? "jessearmand/cybernetics-log" },
  };
}

test("signature: accepts GitHub's HMAC and rejects anything else", () => {
  const body = JSON.stringify(payload());
  const sig = signGitHubBody(body, "s3cret");
  assert.equal(verifyGitHubSignature(body, sig, "s3cret"), true);
  assert.equal(verifyGitHubSignature(body, sig, "other"), false);
  assert.equal(verifyGitHubSignature(`${body} `, sig, "s3cret"), false);
  assert.equal(verifyGitHubSignature(body, null, "s3cret"), false);
  assert.equal(verifyGitHubSignature(body, "sha1=abc", "s3cret"), false);
});

test("parse: successful production deployment triggers a render", () => {
  const r = parseDeploymentStatus(payload(), opts);
  assert.equal(r.kind, "trigger");
  if (r.kind !== "trigger") return;
  assert.equal(r.trigger.deploymentId, "42");
  assert.equal(r.trigger.sha, SHA);
  assert.equal(r.trigger.payloadInstruction, null);
  assert.deepEqual(attributesToTrigger(triggerToAttributes(r.trigger)), { ...r.trigger });
});

test("parse: ignores previews, failures, other repos and junk", () => {
  assert.equal(parseDeploymentStatus(payload({ environment: "Preview" }), opts).kind, "ignore");
  assert.equal(parseDeploymentStatus(payload({ state: "pending" }), opts).kind, "ignore");
  assert.equal(parseDeploymentStatus(payload({ state: "failure" }), opts).kind, "ignore");
  assert.equal(parseDeploymentStatus(payload({ repo: "someone/else" }), opts).kind, "ignore");
  assert.equal(parseDeploymentStatus({ zen: "hi" }, opts).kind, "ignore");
  assert.equal(parseDeploymentStatus(null, opts).kind, "ignore");
});

test("parse: manual page-render deployment carries a capped instruction", () => {
  const r = parseDeploymentStatus(payload({ environment: "page-render", instruction: "x".repeat(80) }), opts);
  assert.equal(r.kind, "trigger");
  if (r.kind === "trigger") assert.equal(r.trigger.payloadInstruction?.length, 50);
});

test("session guard: only the deployment channel's principal may drive the tools", () => {
  const r = parseDeploymentStatus(payload(), opts);
  assert.equal(r.kind, "trigger");
  if (r.kind !== "trigger") return;
  const ok = deploymentFromSession({ authenticator: "github-deployment", attributes: triggerToAttributes(r.trigger) });
  assert.equal(ok?.sha, SHA);
  const prev = process.env.EVE_DEV;
  delete process.env.EVE_DEV;
  try {
    assert.throws(() => deploymentFromSession({ authenticator: "vercel-oidc", attributes: {} }));
    assert.throws(() => deploymentFromSession(null));
  } finally {
    if (prev !== undefined) process.env.EVE_DEV = prev;
  }
});
