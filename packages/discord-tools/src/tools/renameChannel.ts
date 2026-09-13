import { ChannelType } from "discord.js";
import type { ToolResult } from "@ghost/shared";
import { registerTool } from "../registry.js";
import { isManageableChannel, isTextLikeChannel, nameMatches, sanitizeTextChannelName } from "../channelUtils.js";

registerTool({
  definition: {
    name: "rename_channel",
    description:
      "Renames a single existing channel. For renaming many channels at once to match a style, use restyle_names instead.",
    parameters: {
      channelName: { type: "string", description: "The channel's current name." },
      newName: { type: "string", description: "The new name to give it." },
    },
    mutating: true,
    requiresConfirmation: false,
    requiredUserPermission: "ManageChannels",
    requiredBotPermission: "ManageChannels",
  },
  handler: async (params, ctx): Promise<ToolResult> => {
    const channelName = params.channelName as string;
    const requestedNewName = params.newName as string;

    const channel = ctx.guild.channels.cache.find(
      (c) => c.type !== ChannelType.GuildCategory && isManageableChannel(c) && nameMatches(c.name, channelName)
    );

    if (!channel) {
      return {
        tool: "rename_channel",
        parameters: params,
        success: false,
        message: `I couldn't find a channel called "${channelName}".`,
      };
    }

    const finalName = isTextLikeChannel(channel.type)
      ? sanitizeTextChannelName(requestedNewName)
      : requestedNewName.trim().slice(0, 100);

    const oldName = channel.name;
    await channel.setName(finalName, `Renamed by Ghost, requested by ${ctx.requester.user.tag}`);

    const note =
      finalName !== requestedNewName.trim()
        ? ` (adjusted to "${finalName}" — Discord text channels can't use spaces or capital letters)`
        : "";

    return {
      tool: "rename_channel",
      parameters: params,
      success: true,
      message: `Renamed **${oldName}** to **${finalName}**${note}.`,
      data: { oldName, newName: finalName },
    };
  },
});
