import { defineAgent } from "eve";

export default defineAgent({
  // Default model, routed through Vercel AI Gateway (OIDC on Vercel,
  // AI_GATEWAY_API_KEY locally). Mirrors DEFAULT_MODEL in lib/config.ts.
  model: "deepseek/deepseek-v4.1-flash",
  // The renderer needs only its two authored tools: no bash, web, or file tools.
  defaultTools: false,
  limits: {
    // Hard cap on AI Gateway model cost for one render session. Uses `total`, not
    // `window`: nobody can approve a continuation for a webhook-started session.
    sessionUsage: ({ total }) => (total.costUsd ?? 0) >= 0.5,
    // Idle timeout since eve 0.82: restarts each time a turn settles.
    sessionTimeoutMs: 60 * 60 * 1_000,
  },
});
