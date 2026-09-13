import { ChannelType } from "discord.js";
import type { ToolResult } from "@ghost/shared";
import { registerTool } from "../registry.js";
import { sanitizeTextChannelName, nameMatches } from "../channelUtils.js";

registerTool({
  definition: {
    name: "create_channel",
    description:
      "Creates a new text or voice channel, optionally inside an existing category. Use for requests like 'create a #bugs channel' or 'make a voice channel called Lounge'.",
    parameters: {
      name: { type: "string", description: "The channel's name, e.g. 'bug-reports' or 'General Voice'." },
      kind: { type: "string", description: "Channel kind.", enum: ["text", "voice"] },
      categoryName: {
        type: "string",
        description: "Name of the category to put this channel in. Omit to create it uncategorized.",
        optional: true,
      },
      private: {
        type: "boolean",
        description: "If true, hides the channel from @everyone (only visible to staff/roles you add later).",
        optional: true,
      },
    },
    mutating: true,
    requiresConfirmation: false,
    requiredUserPermission: "ManageChannels",
    requiredBotPermission: "ManageChannels",
  },
  handler: async (params, ctx): Promise<ToolResult> => {
    const rawName = params.name as string;
    const kind = params.kind as "text" | "voice";
    const categoryName = params.categoryName as string | undefined;
    const isPrivate = (params.private as boolean | undefined) ?? false;

    const type = kind === "voice" ? ChannelType.GuildVoice : ChannelType.GuildText;
    const name = kind === "voice" ? rawName.trim().slice(0, 100) : sanitizeTextChannelName(rawName);

    let parentId: string | undefined;
    if (categoryName) {
      const category = ctx.guild.channels.cache.find(
        (c) => c.type === ChannelType.GuildCategory && nameMatches(c.name, categoryName)
      );
      if (!category) {
        return {
          tool: "create_channel",
          parameters: params,
          success: false,
          message: `I couldn't find a category called "${categoryName}".`,
        };
      }
      parentId = category.id;
    }

    const existing = ctx.guild.channels.cache.find(
      (c) => nameMatches(c.name, name) && c.parentId === (parentId ?? null)
    );
    if (existing) {
      return {
        tool: "create_channel",
        parameters: params,
        success: false,
        message: `A channel called "${name}" already exists${categoryName ? ` in ${categoryName}` : ""}.`,
      };
    }

    const channel = await ctx.guild.channels.create({
      name,
      type,
      parent: parentId,
      permissionOverwrites: isPrivate
        ? [{ id: ctx.guild.id, deny: ["ViewChannel"] }]
        : undefined,
      reason: `Created by Ghost, requested by ${ctx.requester.user.tag}`,
    });

    return {
      tool: "create_channel",
      parameters: params,
      success: true,
      message: `Created the ${kind} channel **${channel.name}**${categoryName ? ` in ${categoryName}` : ""}.`,
      data: { id: channel.id, name: channel.name, kind },
    };
  },
});
