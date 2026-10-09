import { defineAgent } from "eve";

export default defineAgent({
  // Default model, routed through Vercel AI Gateway (OIDC on Vercel,
  // AI_GATEWAY_API_KEY locally). Mirrors DEFAULT_MODEL in lib/config.ts.
  model: "deepseek/deepseek-v4.1-flash",
  // The renderer needs only its two authored tools: no bash, web, or file tools.
  defaultTools: false,
  limits: {
    maxTokenCostUsdPerSession: 0.5,
    sessionTimeoutMs: 60 * 60 * 1_000,
  },
});
