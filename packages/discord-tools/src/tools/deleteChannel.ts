import { ChannelType } from "discord.js";
import type { ToolResult } from "@ghost/shared";
import { registerTool } from "../registry.js";
import { buildChannelSnapshot, isManageableChannel, nameMatches } from "../channelUtils.js";

registerTool({
  definition: {
    name: "delete_channel",
    description: "Permanently deletes a text or voice channel. Always requires confirmation.",
    parameters: {
      channelName: { type: "string", description: "The exact name of the channel to delete." },
    },
    mutating: true,
    requiresConfirmation: true,
    requiredUserPermission: "ManageChannels",
    requiredBotPermission: "ManageChannels",
    baseRisk: "high",
  },
  handler: async (params, ctx): Promise<ToolResult> => {
    const channelName = params.channelName as string;
    const channel = ctx.guild.channels.cache.find(
      (c) => c.type !== ChannelType.GuildCategory && isManageableChannel(c) && nameMatches(c.name, channelName)
    );

    if (!channel) {
      return {
        tool: "delete_channel",
        parameters: params,
        success: false,
        message: `I couldn't find a channel called "${channelName}".`,
      };
    }

    const name = channel.name;
    const snapshot = buildChannelSnapshot(channel);
    await channel.delete(`Deleted by Ghost, requested by ${ctx.requester.user.tag}`);

    return {
      tool: "delete_channel",
      parameters: params,
      success: true,
      message: `Deleted the channel **${name}**.`,
      data: { name },
      snapshot,
    };
  },
  preview: async (params) => ({
    summary: `Permanently delete the channel **#${params.channelName}**. This cannot be undone from within Ghost.`,
  }),
});
