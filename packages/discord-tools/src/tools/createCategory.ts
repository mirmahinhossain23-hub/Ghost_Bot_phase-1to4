import { ChannelType } from "discord.js";
import type { ToolResult } from "@ghost/shared";
import { registerTool } from "../registry.js";
import { nameMatches } from "../channelUtils.js";

registerTool({
  definition: {
    name: "create_category",
    description: "Creates a new category (a section that channels can be grouped under).",
    parameters: {
      name: { type: "string", description: "The category's name, e.g. 'DEVELOPMENT'." },
    },
    mutating: true,
    requiresConfirmation: false,
    requiredUserPermission: "ManageChannels",
    requiredBotPermission: "ManageChannels",
  },
  handler: async (params, ctx): Promise<ToolResult> => {
    const name = (params.name as string).trim().slice(0, 100);

    const existing = ctx.guild.channels.cache.find(
      (c) => c.type === ChannelType.GuildCategory && nameMatches(c.name, name)
    );
    if (existing) {
      return {
        tool: "create_category",
        parameters: params,
        success: false,
        message: `A category called "${name}" already exists.`,
      };
    }

    const category = await ctx.guild.channels.create({
      name,
      type: ChannelType.GuildCategory,
      reason: `Created by Ghost, requested by ${ctx.requester.user.tag}`,
    });

    return {
      tool: "create_category",
      parameters: params,
      success: true,
      message: `Created the category **${category.name}**.`,
      data: { id: category.id, name: category.name },
    };
  },
});
