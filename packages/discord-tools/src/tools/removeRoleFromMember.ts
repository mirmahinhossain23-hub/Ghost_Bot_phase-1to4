import type { ToolResult } from "@ghost/shared";
import { registerTool } from "../registry.js";
import { checkBotCanManageRole } from "../permissions.js";

registerTool({
  definition: {
    name: "remove_role_from_member",
    description:
      "Removes a role from one member. Use this when the user asks Ghost to take away/revoke a role from someone.",
    parameters: {
      userId: { type: "string", description: "The Discord user ID of the member to update." },
      roleName: { type: "string", description: "The exact name of the role to remove." },
    },
    mutating: true,
    requiresConfirmation: true,
    requiredUserPermission: "ManageRoles",
    requiredBotPermission: "ManageRoles",
  },
  handler: async (params, ctx): Promise<ToolResult> => {
    const userId = params.userId as string;
    const roleName = params.roleName as string;

    const role = ctx.guild.roles.cache.find((r) => r.name.toLowerCase() === roleName.toLowerCase());
    if (!role) {
      return {
        tool: "remove_role_from_member",
        parameters: params,
        success: false,
        message: `I couldn't find a role called "${roleName}".`,
      };
    }

    const hierarchyCheck = checkBotCanManageRole(ctx, role.position);
    if (!hierarchyCheck.ok) {
      return { tool: "remove_role_from_member", parameters: params, success: false, message: hierarchyCheck.reason! };
    }

    const member = await ctx.guild.members.fetch(userId).catch(() => null);
    if (!member) {
      return {
        tool: "remove_role_from_member",
        parameters: params,
        success: false,
        message: `I couldn't find a member with ID "${userId}" in this server.`,
      };
    }

    if (!member.roles.cache.has(role.id)) {
      return {
        tool: "remove_role_from_member",
        parameters: params,
        success: false,
        message: `${member.user.tag} doesn't have the **${role.name}** role.`,
      };
    }

    await member.roles.remove(role, `Removed by Ghost, requested by ${ctx.requester.user.tag}`);

    return {
      tool: "remove_role_from_member",
      parameters: params,
      success: true,
      message: `Removed **${role.name}** from ${member.user.tag}.`,
      data: { userId: member.id, roleId: role.id, roleName: role.name },
    };
  },
});
