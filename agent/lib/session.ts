import { DEPLOYMENT_AUTHENTICATOR } from "./config.ts";
import { attributesToTrigger, type DeploymentTrigger } from "./github-webhook.ts";

interface AuthLike {
  readonly authenticator: string;
  readonly attributes: Readonly<Record<string, string | readonly string[]>>;
}

/**
 * The deployment that started this session, read from the session's initiator
 * principal (set by the verified webhook channel, never by the model).
 * Throws for any other caller, so the tools can't be driven from elsewhere.
 * `eve dev` (EVE_DEV=1) gets a null trigger and renders from bundled data.
 */
export function deploymentFromSession(initiator: AuthLike | null | undefined): DeploymentTrigger | null {
  if (initiator?.authenticator === DEPLOYMENT_AUTHENTICATOR) {
    const trigger = attributesToTrigger(initiator.attributes);
    if (!trigger) throw new Error("Deployment session is missing its trigger attributes.");
    return trigger;
  }
  if (process.env.EVE_DEV === "1") return null;
  throw new Error("This agent only renders for verified GitHub deployment webhooks.");
}
