import type { ToolResult } from "@ghost/shared";
import { registerTool } from "../registry.js";
import { checkBotCanManageRole } from "../permissions.js";

registerTool({
  definition: {
    name: "add_role_to_member",
    description:
      "Gives an existing role to one member. Use this when the user asks Ghost to grant/assign a role to someone (e.g. 'give Ahmed the Developer role').",
    parameters: {
      userId: { type: "string", description: "The Discord user ID of the member to update." },
      roleName: { type: "string", description: "The exact name of the role to grant." },
    },
    mutating: true,
    requiresConfirmation: true,
    requiredUserPermission: "ManageRoles",
    requiredBotPermission: "ManageRoles",
  },
  handler: async (params, ctx): Promise<ToolResult> => {
    const userId = params.userId as string;
    const roleName = params.roleName as string;

    const role = ctx.guild.roles.cache.find(
      (r) => r.name.toLowerCase() === roleName.toLowerCase()
    );
    if (!role) {
      return {
        tool: "add_role_to_member",
        parameters: params,
        success: false,
        message: `I couldn't find a role called "${roleName}".`,
      };
    }

    const hierarchyCheck = checkBotCanManageRole(ctx, role.position);
    if (!hierarchyCheck.ok) {
      return {
        tool: "add_role_to_member",
        parameters: params,
        success: false,
        message: hierarchyCheck.reason!,
      };
    }

    const member = await ctx.guild.members.fetch(userId).catch(() => null);
    if (!member) {
      return {
        tool: "add_role_to_member",
        parameters: params,
        success: false,
        message: `I couldn't find a member with ID "${userId}" in this server.`,
      };
    }

    if (member.roles.cache.has(role.id)) {
      return {
        tool: "add_role_to_member",
        parameters: params,
        success: false,
        message: `${member.user.tag} already has the **${role.name}** role.`,
      };
    }

    await member.roles.add(role, `Assigned by Ghost, requested by ${ctx.requester.user.tag}`);

    return {
      tool: "add_role_to_member",
      parameters: params,
      success: true,
      message: `Gave **${role.name}** to ${member.user.tag}.`,
      data: { userId: member.id, roleId: role.id, roleName: role.name },
    };
  },
});
