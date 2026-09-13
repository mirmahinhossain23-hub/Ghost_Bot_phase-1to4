import type { ToolResult } from "@ghost/shared";
import { registerTool } from "../registry.js";

const HEX_COLOR = /^#?[0-9a-fA-F]{6}$/;

registerTool({
  definition: {
    name: "create_role",
    description:
      "Creates a new role in the server. Use this when the user asks Ghost to add/create a role (e.g. 'create a Developer role').",
    parameters: {
      name: { type: "string", description: "The role's display name, e.g. 'Developer'." },
      color: {
        type: "string",
        description: "Hex color for the role, e.g. '#7C3AED'. Optional — omit for Discord's default gray.",
        optional: true,
      },
      hoist: {
        type: "boolean",
        description: "Whether the role should be displayed separately in the member list.",
        optional: true,
      },
      mentionable: {
        type: "boolean",
        description: "Whether anyone can @mention this role.",
        optional: true,
      },
    },
    mutating: true,
    requiresConfirmation: true,
    requiredUserPermission: "ManageRoles",
    requiredBotPermission: "ManageRoles",
  },
  handler: async (params, ctx): Promise<ToolResult> => {
    const name = params.name as string;
    const color = params.color as string | undefined;
    const hoist = (params.hoist as boolean | undefined) ?? false;
    const mentionable = (params.mentionable as boolean | undefined) ?? false;

    if (color && !HEX_COLOR.test(color)) {
      return {
        tool: "create_role",
        parameters: params,
        success: false,
        message: `"${color}" isn't a valid hex color (expected something like #7C3AED).`,
      };
    }

    const existing = ctx.guild.roles.cache.find(
      (r) => r.name.toLowerCase() === name.toLowerCase()
    );
    if (existing) {
      return {
        tool: "create_role",
        parameters: params,
        success: false,
        message: `A role called "${name}" already exists.`,
      };
    }

    const role = await ctx.guild.roles.create({
      name,
      color: (color as `#${string}`) ?? undefined,
      hoist,
      mentionable,
      reason: `Created by Ghost, requested by ${ctx.requester.user.tag}`,
    });

    return {
      tool: "create_role",
      parameters: params,
      success: true,
      message: `Created the role **${role.name}** (${role.hexColor}).`,
      data: { id: role.id, name: role.name, color: role.hexColor },
    };
  },
});
