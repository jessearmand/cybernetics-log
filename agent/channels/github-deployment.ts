import { defineChannel, GET, POST } from "eve/channels";

import {
  allowedRepository,
  DEPLOYMENT_AUTHENTICATOR,
  MAX_INSTRUCTION_CHARS,
  MAX_WEBHOOK_BYTES,
  renderEnvironments,
  webhookSecret,
} from "../lib/config.ts";
import { parseDeploymentStatus, triggerToAttributes, verifyGitHubSignature } from "../lib/github-webhook.ts";

/**
 * The agent's only inbound surface: a GitHub repository webhook for
 * `deployment_status` events.
 *
 *   GitHub repo webhook ──POST /github/deployments──▶ verify X-Hub-Signature-256
 *     ──▶ deployment_status.state == "success" in an allowed environment
 *     ──▶ from("deployment-<id>").send(render prompt, { auth: github-deployment service principal })
 *
 * Vercel's Git integration creates a GitHub deployment for every push and
 * reports `success` when the build is live, so "commit data → push → Vercel
 * deploys → GitHub deployment succeeds → agent re-renders" needs no Actions
 * workflow. Manual runs create their own deployment (scripts/trigger-render.sh).
 */
export default defineChannel({
  turnPolicy: "queue",
  audience: () => "public",
  routes: [
    POST("/github/deployments", async (request, { from, resolveSession }) => {
      const secret = webhookSecret();
      if (!secret) {
        console.error("[github-deployment] GITHUB_DEPLOYMENT_WEBHOOK_SECRET is not set; rejecting webhook");
        return Response.json({ ok: false, error: "webhook secret not configured" }, { status: 503 });
      }

      const length = Number(request.headers.get("content-length") ?? "0");
      if (length > MAX_WEBHOOK_BYTES) return Response.json({ ok: false, error: "payload too large" }, { status: 413 });
      const body = await request.text();
      if (Buffer.byteLength(body) > MAX_WEBHOOK_BYTES) return Response.json({ ok: false, error: "payload too large" }, { status: 413 });

      if (!verifyGitHubSignature(body, request.headers.get("x-hub-signature-256"), secret)) {
        return Response.json({ ok: false, error: "invalid signature" }, { status: 401 });
      }

      const event = request.headers.get("x-github-event") ?? "";
      const delivery = request.headers.get("x-github-delivery") ?? "";
      if (event === "ping") return Response.json({ ok: true, event: "ping" });
      if (event !== "deployment_status") return Response.json({ ok: true, ignored: `event ${event || "?"}` }, { status: 202 });

      let payload: unknown;
      try {
        payload = JSON.parse(body);
      } catch {
        return Response.json({ ok: false, error: "invalid JSON" }, { status: 400 });
      }

      const parsed = parseDeploymentStatus(payload, {
        repository: allowedRepository(),
        environments: renderEnvironments(),
        maxInstructionChars: MAX_INSTRUCTION_CHARS,
      });
      if (parsed.kind === "ignore") return Response.json({ ok: true, ignored: parsed.reason }, { status: 202 });
      const t = parsed.trigger;

      // One session per GitHub deployment; redeliveries of the same deployment are no-ops.
      const address = `deployment-${t.deploymentId}`;
      if (await resolveSession(address)) {
        return Response.json({ ok: true, duplicate: true, deploymentId: t.deploymentId }, { status: 202 });
      }

      const message = [
        `A GitHub deployment of ${t.repository} succeeded. Render the page for it.`,
        "",
        `- deployment: ${t.deploymentId} (${t.environment})`,
        `- commit: ${t.sha} (ref ${t.ref || "?"})`,
        `- created by: ${t.creator || "?"} at ${t.createdAt}`,
        `- delivery: ${delivery || "?"}`,
        "",
        t.payloadInstruction
          ? "This deployment carries an explicit instruction in its payload; load_discourse_data returns it as payload_instruction and it takes precedence over the instruction file."
          : "Use the instruction file at this commit (data/render-instruction.md), returned by load_discourse_data.",
        "Call load_discourse_data, then publish_page once.",
      ].join("\n");

      const session = await from(address).send(message, {
        auth: {
          authenticator: DEPLOYMENT_AUTHENTICATOR,
          principalType: "service",
          principalId: `github:${t.repository}`,
          attributes: triggerToAttributes(t),
        },
      });
      console.info(`[github-deployment] render started for deployment ${t.deploymentId} @ ${t.sha.slice(0, 7)} (session ${session.id})`);
      return Response.json({ ok: true, sessionId: session.id, deploymentId: t.deploymentId, sha: t.sha }, { status: 202 });
    }),

    // Lets the webhook URL be sanity-checked in a browser without exposing anything.
    GET("/github/deployments", async () => Response.json({ ok: true, accepts: "POST deployment_status webhooks (signed)" })),
  ],
  events: {
    "session.failed"(event) {
      console.error("[github-deployment] render session failed", event);
    },
  },
});
