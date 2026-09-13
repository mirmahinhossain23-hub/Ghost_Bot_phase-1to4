import type { ToolResult } from "@ghost/shared";
import { registerTool } from "../registry.js";
import { checkBotCanManageRole } from "../permissions.js";

registerTool({
  definition: {
    name: "move_role",
    description:
      "Moves a role's position in the hierarchy, above or below another named role. Role position affects " +
      "which roles can manage which other roles, and display order in the member list.",
    parameters: {
      roleName: { type: "string", description: "The role to move." },
      direction: { type: "string", description: "Whether to move it above or below the reference role.", enum: ["above", "below"] },
      referenceRoleName: { type: "string", description: "The role to position it relative to." },
    },
    mutating: true,
    requiresConfirmation: false,
    requiredUserPermission: "ManageRoles",
    requiredBotPermission: "ManageRoles",
  },
  handler: async (params, ctx): Promise<ToolResult> => {
    const roleName = params.roleName as string;
    const direction = params.direction as "above" | "below";
    const referenceRoleName = params.referenceRoleName as string;

    const role = ctx.guild.roles.cache.find((r) => r.name.toLowerCase() === roleName.toLowerCase());
    if (!role) {
      return {
        tool: "move_role",
        parameters: params,
        success: false,
        message: `I couldn't find a role called "${roleName}".`,
      };
    }

    const referenceRole = ctx.guild.roles.cache.find(
      (r) => r.name.toLowerCase() === referenceRoleName.toLowerCase()
    );
    if (!referenceRole) {
      return {
        tool: "move_role",
        parameters: params,
        success: false,
        message: `I couldn't find a role called "${referenceRoleName}".`,
      };
    }

    const sourceHierarchyCheck = checkBotCanManageRole(ctx, role.position);
    if (!sourceHierarchyCheck.ok) {
      return { tool: "move_role", parameters: params, success: false, message: sourceHierarchyCheck.reason! };
    }
    const targetHierarchyCheck = checkBotCanManageRole(ctx, referenceRole.position);
    if (!targetHierarchyCheck.ok) {
      return { tool: "move_role", parameters: params, success: false, message: targetHierarchyCheck.reason! };
    }

    const targetPosition =
      direction === "above" ? referenceRole.position + 1 : Math.max(1, referenceRole.position - 1);

    await role.setPosition(targetPosition, { reason: `Moved by Ghost, requested by ${ctx.requester.user.tag}` });

    return {
      tool: "move_role",
      parameters: params,
      success: true,
      message: `Moved **${role.name}** ${direction} **${referenceRole.name}**.`,
      data: { roleId: role.id, direction, referenceRoleId: referenceRole.id },
    };
  },
});
