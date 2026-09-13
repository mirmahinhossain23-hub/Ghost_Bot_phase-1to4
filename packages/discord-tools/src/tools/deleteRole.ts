import type { ToolResult } from "@ghost/shared";
import { registerTool } from "../registry.js";
import { checkBotCanManageRole } from "../permissions.js";

registerTool({
  definition: {
    name: "delete_role",
    description: "Permanently deletes a role from the server. Always requires confirmation.",
    parameters: {
      roleName: { type: "string", description: "The exact name of the role to delete." },
    },
    mutating: true,
    requiresConfirmation: true,
    requiredUserPermission: "ManageRoles",
    requiredBotPermission: "ManageRoles",
    baseRisk: "high",
  },
  handler: async (params, ctx): Promise<ToolResult> => {
    const roleName = params.roleName as string;
    const role = ctx.guild.roles.cache.find((r) => r.name.toLowerCase() === roleName.toLowerCase());

    if (!role) {
      return {
        tool: "delete_role",
        parameters: params,
        success: false,
        message: `I couldn't find a role called "${roleName}".`,
      };
    }

    const hierarchyCheck = checkBotCanManageRole(ctx, role.position);
    if (!hierarchyCheck.ok) {
      return { tool: "delete_role", parameters: params, success: false, message: hierarchyCheck.reason! };
    }

    const memberCount = role.members.size;
    const name = role.name;
    const snapshot = {
      name: role.name,
      color: role.hexColor,
      permissions: role.permissions.bitfield.toString(),
      hoist: role.hoist,
      mentionable: role.mentionable,
      position: role.position,
      memberIds: role.members.map((m) => m.id),
      deletedAt: new Date().toISOString(),
    };
    await role.delete(`Deleted by Ghost, requested by ${ctx.requester.user.tag}`);

    return {
      tool: "delete_role",
      parameters: params,
      success: true,
      message: `Deleted the role **${name}** (it had ${memberCount} member${memberCount === 1 ? "" : "s"}).`,
      data: { name, memberCount },
      snapshot,
    };
  },
  preview: async (params, ctx) => {
    const roleName = params.roleName as string;
    const role = ctx.guild.roles.cache.find((r) => r.name.toLowerCase() === roleName.toLowerCase());
    return {
      summary: role
        ? `Permanently delete the role **${role.name}**, currently held by ${role.members.size} member${role.members.size === 1 ? "" : "s"}.`
        : `Permanently delete a role called "${roleName}".`,
    };
  },
});
