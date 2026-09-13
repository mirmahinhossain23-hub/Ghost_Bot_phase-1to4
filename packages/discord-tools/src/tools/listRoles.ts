import type { ToolResult } from "@ghost/shared";
import { registerTool } from "../registry.js";

registerTool({
  definition: {
    name: "list_roles",
    description:
      "Lists every role in the server, in hierarchy order (highest first), including color and member count.",
    parameters: {},
    mutating: false,
    requiresConfirmation: false,
  },
  handler: async (_params, ctx): Promise<ToolResult> => {
    const roles = [...ctx.guild.roles.cache.values()]
      .filter((role) => role.id !== ctx.guild.id) // drop @everyone from the list
      .sort((a, b) => b.position - a.position)
      .map((role) => ({
        id: role.id,
        name: role.name,
        color: role.hexColor,
        memberCount: role.members.size,
        position: role.position,
        managed: role.managed,
      }));

    return {
      tool: "list_roles",
      parameters: {},
      success: true,
      message: `Found ${roles.length} role${roles.length === 1 ? "" : "s"}.`,
      data: roles,
    };
  },
});
