import type { ToolResult } from "@ghost/shared";
import { registerTool } from "../registry.js";
import { checkBotCanManageRole } from "../permissions.js";

registerTool({
  definition: {
    name: "rename_role",
    description: "Renames an existing role.",
    parameters: {
      roleName: { type: "string", description: "The role's current name." },
      newName: { type: "string", description: "The new name to give it." },
    },
    mutating: true,
    requiresConfirmation: false,
    requiredUserPermission: "ManageRoles",
    requiredBotPermission: "ManageRoles",
  },
  handler: async (params, ctx): Promise<ToolResult> => {
    const roleName = params.roleName as string;
    const newName = (params.newName as string).trim().slice(0, 100);

    const role = ctx.guild.roles.cache.find((r) => r.name.toLowerCase() === roleName.toLowerCase());
    if (!role) {
      return {
        tool: "rename_role",
        parameters: params,
        success: false,
        message: `I couldn't find a role called "${roleName}".`,
      };
    }

    const hierarchyCheck = checkBotCanManageRole(ctx, role.position);
    if (!hierarchyCheck.ok) {
      return { tool: "rename_role", parameters: params, success: false, message: hierarchyCheck.reason! };
    }

    const oldName = role.name;
    await role.setName(newName, `Renamed by Ghost, requested by ${ctx.requester.user.tag}`);

    return {
      tool: "rename_role",
      parameters: params,
      success: true,
      message: `Renamed **${oldName}** to **${newName}**.`,
      data: { oldName, newName },
    };
  },
});
