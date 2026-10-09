#!/usr/bin/env node
// Copies data/render-instruction.md into agent/lib/default-instruction.ts so the
// build has an offline default. `npm test` fails if the two drift.
import { readFileSync, writeFileSync } from "node:fs";

const md = readFileSync(new URL("../data/render-instruction.md", import.meta.url), "utf8");
writeFileSync(
  new URL("../agent/lib/default-instruction.ts", import.meta.url),
  `// Generated from data/render-instruction.md by scripts/sync-default-instruction.mjs. Do not edit by hand.\nexport const DEFAULT_RENDER_INSTRUCTION = ${JSON.stringify(md)};\n`,
);
console.log("agent/lib/default-instruction.ts updated");
