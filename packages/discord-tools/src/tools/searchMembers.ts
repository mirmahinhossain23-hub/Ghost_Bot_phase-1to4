import type { ToolResult } from "@ghost/shared";
import { registerTool } from "../registry.js";

registerTool({
  definition: {
    name: "search_members",
    description: "Searches members by a partial username or display name match.",
    parameters: {
      query: { type: "string", description: "Text to search for in usernames/display names." },
      limit: { type: "number", description: "Max results (default 10, max 25).", optional: true },
    },
    mutating: false,
    requiresConfirmation: false,
  },
  handler: async (params, ctx): Promise<ToolResult> => {
    const query = (params.query as string).trim().toLowerCase();
    const limit = Math.min(25, Math.max(1, Math.floor((params.limit as number | undefined) ?? 10)));

    if (!query) {
      return {
        tool: "search_members",
        parameters: params,
        success: false,
        message: "Give me some text to search for.",
      };
    }

    const results = await ctx.guild.members.fetch({ query, limit }).catch(() => null);
    const members = results ? [...results.values()] : [];

    return {
      tool: "search_members",
      parameters: params,
      success: true,
      message: `Found ${members.length} member${members.length === 1 ? "" : "s"} matching "${query}".`,
      data: members.map((m) => ({
        id: m.id,
        tag: m.user.tag,
        displayName: m.displayName,
        roleCount: m.roles.cache.size - 1,
      })),
    };
  },
});
