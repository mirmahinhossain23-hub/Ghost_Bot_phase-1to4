import { ChannelType } from "discord.js";
import type { ToolResult } from "@ghost/shared";
import { registerTool } from "../registry.js";

registerTool({
  definition: {
    name: "list_channels",
    description:
      "Lists every text channel, voice channel, and category in the server, grouped by category.",
    parameters: {},
    mutating: false,
    requiresConfirmation: false,
  },
  handler: async (_params, ctx): Promise<ToolResult> => {
    const categories = ctx.guild.channels.cache.filter(
      (c) => c.type === ChannelType.GuildCategory
    );

    const grouped = categories.map((category) => {
      const children = ctx.guild.channels.cache
        .filter((c) => c.parentId === category.id)
        .sort((a, b) => ("position" in a && "position" in b ? a.position - b.position : 0))
        .map((c) => ({
          id: c.id,
          name: c.name,
          type: ChannelType[c.type],
        }));

      return { category: category.name, categoryId: category.id, channels: children };
    });

    const uncategorized = ctx.guild.channels.cache
      .filter(
        (c) =>
          !c.parentId &&
          c.type !== ChannelType.GuildCategory
      )
      .map((c) => ({ id: c.id, name: c.name, type: ChannelType[c.type] }));

    return {
      tool: "list_channels",
      parameters: {},
      success: true,
      message: `Found ${ctx.guild.channels.cache.size} channel${
        ctx.guild.channels.cache.size === 1 ? "" : "s"
      } across ${categories.size} categor${categories.size === 1 ? "y" : "ies"}.`,
      data: { categories: grouped, uncategorized },
    };
  },
});
