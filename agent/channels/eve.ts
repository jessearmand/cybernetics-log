import { disableRoute } from "eve/channels";

// No chat interface: the default /eve/v1 session API (TUI, useEveAgent, curl)
// is disabled. The only way to start a turn is a verified GitHub deployment
// webhook (agent/channels/github-deployment.ts).
export default disableRoute();
