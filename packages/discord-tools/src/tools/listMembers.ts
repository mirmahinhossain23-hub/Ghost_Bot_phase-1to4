import type { ToolResult } from "@ghost/shared";
import { registerTool } from "../registry.js";

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

registerTool({
  definition: {
    name: "list_members",
    description:
      "Lists server members, optionally filtered to only members with a given role, or only members with NO roles at all. " +
      "Use for requests like 'show me members without any roles' or 'who has the Developer role'.",
    parameters: {
      roleName: { type: "string", description: "Only include members who have this role.", optional: true },
      noRoles: { type: "boolean", description: "Only include members with no roles besides @everyone.", optional: true },
      limit: { type: "number", description: `Max members to return (default ${DEFAULT_LIMIT}, max ${MAX_LIMIT}).`, optional: true },
    },
    mutating: false,
    requiresConfirmation: false,
  },
  handler: async (params, ctx): Promise<ToolResult> => {
    const roleName = params.roleName as string | undefined;
    const noRoles = (params.noRoles as boolean | undefined) ?? false;
    const limit = Math.min(MAX_LIMIT, Math.max(1, Math.floor((params.limit as number | undefined) ?? DEFAULT_LIMIT)));

    if (roleName && noRoles) {
      return {
        tool: "list_members",
        parameters: params,
        success: false,
        message: "roleName and noRoles can't both be set — pick one filter.",
      };
    }

    let role: ReturnType<typeof ctx.guild.roles.cache.find> | undefined;
    if (roleName) {
      role = ctx.guild.roles.cache.find((r) => r.name.toLowerCase() === roleName.toLowerCase());
      if (!role) {
        return {
          tool: "list_members",
          parameters: params,
          success: false,
          message: `I couldn't find a role called "${roleName}".`,
        };
      }
    }

    await ctx.guild.members.fetch().catch(() => undefined);

    let members = [...ctx.guild.members.cache.values()].filter((m) => !m.user.bot);

    if (role) {
      members = members.filter((m) => m.roles.cache.has(role!.id));
    } else if (noRoles) {
      members = members.filter((m) => m.roles.cache.size === 1); // only @everyone
    }

    const total = members.length;
    const page = members.slice(0, limit).map((m) => ({
      id: m.id,
      tag: m.user.tag,
      displayName: m.displayName,
      roleCount: m.roles.cache.size - 1,
      joinedAt: m.joinedAt?.toISOString() ?? null,
    }));

    const label = role ? `with **${role.name}**` : noRoles ? "with no roles" : "in this server";

    return {
      tool: "list_members",
      parameters: params,
      success: true,
      message: `Found ${total} member${total === 1 ? "" : "s"} ${label}${total > limit ? ` — showing first ${limit}` : ""}.`,
      data: { total, shown: page.length, members: page },
    };
  },
});
