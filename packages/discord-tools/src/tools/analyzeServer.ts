import type { ToolResult } from "@ghost/shared";
import { registerTool } from "../registry.js";
import { analyzeServer } from "../architect/index.js";

registerTool({
  definition: {
    name: "analyze_server",
    description:
      "Analyzes the server's structure and produces recommendations: orphaned channels, inconsistent naming, " +
      "overlapping categories, unused roles. Never modifies anything — read-only.",
    parameters: {},
    mutating: false,
    requiresConfirmation: false,
    baseRisk: "low",
  },
  handler: async (_params, ctx): Promise<ToolResult> => {
    const analysis = analyzeServer(ctx.guild);

    const message =
      `**SERVER ANALYSIS**\n\n` +
      analysis.findings.map((f) => `• ${f}`).join("\n") +
      (analysis.recommendations.length > 0
        ? `\n\n**RECOMMENDED ACTIONS**\n\n${analysis.recommendations.map((r, i) => `${i + 1}. ${r}`).join("\n")}`
        : "");

    return {
      tool: "analyze_server",
      parameters: {},
      success: true,
      message,
      data: analysis,
    };
  },
});
