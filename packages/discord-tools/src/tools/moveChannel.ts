import { ChannelType } from "discord.js";
import type { ToolResult } from "@ghost/shared";
import { registerTool } from "../registry.js";
import { isManageableChannel, nameMatches } from "../channelUtils.js";

registerTool({
  definition: {
    name: "move_channel",
    description:
      "Moves a channel into a different category, out of its category, and/or to a new position in the channel list.",
    parameters: {
      channelName: { type: "string", description: "The channel to move." },
      categoryName: {
        type: "string",
        description: "Category to move it into. Use the literal value 'none' to remove it from its current category.",
        optional: true,
      },
      position: {
        type: "number",
        description: "Zero-based position within its (new) parent category.",
        optional: true,
      },
    },
    mutating: true,
    requiresConfirmation: false,
    requiredUserPermission: "ManageChannels",
    requiredBotPermission: "ManageChannels",
  },
  handler: async (params, ctx): Promise<ToolResult> => {
    const channelName = params.channelName as string;
    const categoryName = params.categoryName as string | undefined;
    const position = params.position as number | undefined;

    if (categoryName === undefined && position === undefined) {
      return {
        tool: "move_channel",
        parameters: params,
        success: false,
        message: "Tell me either a category to move it to, a position, or both.",
      };
    }

    const channel = ctx.guild.channels.cache.find(
      (c) => c.type !== ChannelType.GuildCategory && isManageableChannel(c) && nameMatches(c.name, channelName)
    );
    if (!channel || !("setParent" in channel)) {
      return {
        tool: "move_channel",
        parameters: params,
        success: false,
        message: `I couldn't find a channel called "${channelName}".`,
      };
    }

    const changes: string[] = [];

    if (categoryName !== undefined) {
      if (categoryName.toLowerCase() === "none") {
        await channel.setParent(null, { lockPermissions: false });
        changes.push("removed it from its category");
      } else {
        const category = ctx.guild.channels.cache.find(
          (c) => c.type === ChannelType.GuildCategory && nameMatches(c.name, categoryName)
        );
        if (!category) {
          return {
            tool: "move_channel",
            parameters: params,
            success: false,
            message: `I couldn't find a category called "${categoryName}".`,
          };
        }
        await channel.setParent(category.id, { lockPermissions: false });
        changes.push(`moved it into ${category.name}`);
      }
    }

    if (position !== undefined) {
      await channel.setPosition(Math.max(0, Math.floor(position)));
      changes.push(`set its position to ${Math.max(0, Math.floor(position))}`);
    }

    return {
      tool: "move_channel",
      parameters: params,
      success: true,
      message: `${channel.name}: ${changes.join(" and ")}.`,
      data: { channelId: channel.id },
    };
  },
});
