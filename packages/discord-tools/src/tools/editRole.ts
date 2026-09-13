import type { ToolResult } from "@ghost/shared";
import { registerTool } from "../registry.js";
import { checkBotCanManageRole } from "../permissions.js";

const HEX_COLOR = /^#?[0-9a-fA-F]{6}$/;

registerTool({
  definition: {
    name: "edit_role",
    description:
      "Changes a role's color, whether it's displayed separately in the member list (hoist), or whether it's mentionable. " +
      "This does NOT change what the role can do — for renaming use rename_role, and Ghost doesn't grant server-wide " +
      "permissions through chat as a safety measure.",
    parameters: {
      roleName: { type: "string", description: "The role to edit." },
      color: { type: "string", description: "New hex color, e.g. '#7C3AED'.", optional: true },
      hoist: { type: "boolean", description: "Whether to display this role separately in the member list.", optional: true },
      mentionable: { type: "boolean", description: "Whether anyone can @mention this role.", optional: true },
    },
    mutating: true,
    requiresConfirmation: false,
    requiredUserPermission: "ManageRoles",
    requiredBotPermission: "ManageRoles",
  },
  handler: async (params, ctx): Promise<ToolResult> => {
    const roleName = params.roleName as string;
    const color = params.color as string | undefined;
    const hoist = params.hoist as boolean | undefined;
    const mentionable = params.mentionable as boolean | undefined;

    if (color === undefined && hoist === undefined && mentionable === undefined) {
      return {
        tool: "edit_role",
        parameters: params,
        success: false,
        message: "Tell me what to change: color, hoist, and/or mentionable.",
      };
    }

    if (color && !HEX_COLOR.test(color)) {
      return {
        tool: "edit_role",
        parameters: params,
        success: false,
        message: `"${color}" isn't a valid hex color (expected something like #7C3AED).`,
      };
    }

    const role = ctx.guild.roles.cache.find((r) => r.name.toLowerCase() === roleName.toLowerCase());
    if (!role) {
      return {
        tool: "edit_role",
        parameters: params,
        success: false,
        message: `I couldn't find a role called "${roleName}".`,
      };
    }

    const hierarchyCheck = checkBotCanManageRole(ctx, role.position);
    if (!hierarchyCheck.ok) {
      return { tool: "edit_role", parameters: params, success: false, message: hierarchyCheck.reason! };
    }

    await role.edit({
      color: color as `#${string}` | undefined,
      hoist,
      mentionable,
      reason: `Edited by Ghost, requested by ${ctx.requester.user.tag}`,
    });

    const changes: string[] = [];
    if (color) changes.push(`color to ${role.hexColor}`);
    if (hoist !== undefined) changes.push(`hoist to ${hoist}`);
    if (mentionable !== undefined) changes.push(`mentionable to ${mentionable}`);

    return {
      tool: "edit_role",
      parameters: params,
      success: true,
      message: `Updated **${role.name}**: ${changes.join(", ")}.`,
      data: { roleId: role.id, changes },
    };
  },
});
