import { defineSandbox } from "eve/sandbox";
import { JustBashSandbox } from "eve/sandbox/just-bash";

// The renderer never runs shell commands (defaultTools: false and its two tools
// run in the app runtime). Pin the lightweight in-process just-bash provider so
// builds don't provision a Vercel Sandbox snapshot or need Docker/microsandbox.
export const environment = JustBashSandbox.environment();
export default defineSandbox(() => environment.open());
