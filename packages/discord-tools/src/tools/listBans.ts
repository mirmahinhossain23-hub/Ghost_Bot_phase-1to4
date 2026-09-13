import type { ToolResult } from "@ghost/shared";
import { registerTool } from "../registry.js";

registerTool({
  definition: {
    name: "list_bans",
    description: "Lists everyone currently banned from the server, with the ban reason if one was recorded.",
    parameters: {
      limit: { type: "number", description: "Max bans to return (default 25, max 100).", optional: true },
    },
    mutating: false,
    requiresConfirmation: false,
    requiredUserPermission: "BanMembers",
    baseRisk: "low",
  },
  handler: async (params, ctx): Promise<ToolResult> => {
    const limit = Math.min(100, Math.max(1, Math.floor((params.limit as number | undefined) ?? 25)));

    const bans = await ctx.guild.bans.fetch();
    const list = [...bans.values()].slice(0, limit).map((b) => ({
      userId: b.user.id,
      tag: b.user.tag,
      reason: b.reason ?? null,
    }));

    return {
      tool: "list_bans",
      parameters: params,
      success: true,
      message: `${bans.size} member${bans.size === 1 ? " is" : "s are"} currently banned${bans.size > limit ? ` — showing first ${limit}` : ""}.`,
      data: { total: bans.size, bans: list },
    };
  },
});
