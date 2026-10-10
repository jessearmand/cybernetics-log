import { defineTool } from "eve/tools";
import { z } from "zod";

import { DEFAULT_MODEL } from "../lib/config.ts";
import { loadData } from "../lib/data.ts";
import { ACCENTS, renderPage } from "../lib/render.ts";
import { deploymentFromSession } from "../lib/session.ts";
import { savePage } from "../lib/store.ts";

const note = z.string().trim().max(700).optional();

export default defineTool({
  description:
    "Render and publish the styled HTML page. You supply only the editorial copy; every chart, table, number, quote and link is " +
    "rendered deterministically from the committed data for this deployment. Use **bold** for emphasis; no HTML or links in your text. " +
    "Call exactly once, after load_discourse_data.",
  inputSchema: z.object({
    headline: z.string().trim().min(10).max(140).describe("Page title (H1)."),
    dek: z.string().trim().min(20).max(320).describe("One or two sentence standfirst under the title."),
    summary: z.array(z.string().trim().min(20).max(900)).min(1).max(4).describe("Opening paragraphs."),
    takeaways: z.array(z.string().trim().min(5).max(240)).max(5).optional().describe("Short key findings shown as cards."),
    section_notes: z
      .object({ stance: note, methods: note, confidence: note, pairTest: note, clusters: note, accounts: note, caveats: note, policy: note, dawkins: note })
      .partial()
      .optional()
      .describe("Optional one-paragraph intro for each section."),
    accent: z.enum(ACCENTS).optional().describe("Accent colour, if the instruction asks for one."),
    instruction_summary: z.string().trim().max(300).optional().describe("One sentence on how you applied the deployment instruction."),
  }),
  label: { start: ({ headline }) => `Publish “${headline.slice(0, 60)}”` },
  async execute(input, ctx) {
    const trigger = deploymentFromSession(ctx.session.auth.initiator);
    const data = await loadData(trigger);
    const instruction = [trigger?.payloadInstruction ? `Payload instruction:\n${trigger.payloadInstruction}` : null, data.instructionFile]
      .filter(Boolean)
      .join("\n\n");
    const html = renderPage(
      data.discourse,
      {
        headline: input.headline,
        dek: input.dek,
        summary: input.summary,
        takeaways: input.takeaways,
        sectionNotes: input.section_notes,
        accent: input.accent,
        instructionSummary: input.instruction_summary,
      },
      {
        renderedAt: new Date().toISOString(),
        model: DEFAULT_MODEL,
        dataSource: data.source,
        deployment: trigger
          ? { id: trigger.deploymentId, environment: trigger.environment, sha: trigger.sha, repository: trigger.repository, targetUrl: trigger.targetUrl }
          : null,
        instruction,
        warnings: data.warnings,
      },
    );
    const key = trigger ? `${trigger.sha.slice(0, 12)}-${trigger.deploymentId}` : `dev-${Date.now()}`;
    const saved = await savePage(html, key);
    return { published: true, store: saved.store, latest: saved.latest, archived: saved.archived, bytes: saved.bytes };
  },
  endsTurn: (output) => output.published === true,
});
