import type { ToolResult } from "@ghost/shared";
import { registerTool } from "../registry.js";

registerTool({
  definition: {
    name: "server_info",
    description:
      "Gives a high-level snapshot of the server: name, member count, role count, channel count, boost level, and creation date.",
    parameters: {},
    mutating: false,
    requiresConfirmation: false,
  },
  handler: async (_params, ctx): Promise<ToolResult> => {
    const guild = ctx.guild;

    const data = {
      name: guild.name,
      memberCount: guild.memberCount,
      roleCount: guild.roles.cache.size - 1, // exclude @everyone
      channelCount: guild.channels.cache.size,
      boostLevel: guild.premiumTier,
      boostCount: guild.premiumSubscriptionCount ?? 0,
      createdAt: guild.createdAt.toISOString(),
      owner: guild.ownerId,
    };

    return {
      tool: "server_info",
      parameters: {},
      success: true,
      message: `${data.name} — ${data.memberCount} members, ${data.roleCount} roles, ${data.channelCount} channels.`,
      data,
    };
  },
});
