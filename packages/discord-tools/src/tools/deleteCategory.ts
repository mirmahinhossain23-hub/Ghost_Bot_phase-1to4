import { ChannelType, type CategoryChannel, type Guild } from "discord.js";
import type { RiskLevel, ToolResult } from "@ghost/shared";
import { registerTool } from "../registry.js";
import { buildChannelSnapshot, nameMatches } from "../channelUtils.js";
import { runWithConcurrency, summarizeOutcomes } from "../executionQueue.js";

// Cascading past this many channels counts as "many channels" for risk
// purposes, matching the CRITICAL bucket ("deleting many channels").
const CRITICAL_CHILD_THRESHOLD = 5;

function findCategory(guild: Guild, categoryName: string): CategoryChannel | undefined {
  return guild.channels.cache.find(
    (c): c is CategoryChannel => c.type === ChannelType.GuildCategory && nameMatches(c.name, categoryName)
  );
}

registerTool({
  definition: {
    name: "delete_category",
    description:
      "Deletes a category. By default the channels inside it are kept but become uncategorized; set deleteChannelsInside to true to delete them too. Always requires confirmation.",
    parameters: {
      categoryName: { type: "string", description: "The exact name of the category to delete." },
      deleteChannelsInside: {
        type: "boolean",
        description: "If true, also permanently deletes every channel inside this category.",
        optional: true,
      },
    },
    mutating: true,
    requiresConfirmation: true,
    requiredUserPermission: "ManageChannels",
    requiredBotPermission: "ManageChannels",
    baseRisk: "high",
  },
  handler: async (params, ctx): Promise<ToolResult> => {
    const categoryName = params.categoryName as string;
    const deleteChannelsInside = (params.deleteChannelsInside as boolean | undefined) ?? false;

    const category = findCategory(ctx.guild, categoryName);
    if (!category) {
      return {
        tool: "delete_category",
        parameters: params,
        success: false,
        message: `I couldn't find a category called "${categoryName}".`,
      };
    }

    const children = [...ctx.guild.channels.cache.filter((c) => c.parentId === category.id).values()];
    const categorySnapshot = {
      name: category.name,
      position: category.position,
      deletedAt: new Date().toISOString(),
    };

    let childSnapshots: Record<string, unknown>[] = [];
    let failedChildren = 0;

    if (deleteChannelsInside) {
      childSnapshots = children.map(buildChannelSnapshot);
      const outcomes = await runWithConcurrency(
        children,
        async (child): Promise<void> => {
          await child.delete(`Deleted by Ghost as part of deleting category "${category.name}"`);
        },
        { concurrency: 3 }
      );
      failedChildren = summarizeOutcomes(outcomes).failed;
    } else {
      const outcomes = await runWithConcurrency(
        children,
        async (child): Promise<void> => {
          if ("setParent" in child) {
            await child.setParent(null, { lockPermissions: false });
          }
        },
        { concurrency: 3 }
      );
      failedChildren = summarizeOutcomes(outcomes).failed;
    }

    const name = category.name;
    await category.delete(`Deleted by Ghost, requested by ${ctx.requester.user.tag}`);

    const failureNote = failedChildren > 0 ? ` (${failedChildren} channel${failedChildren === 1 ? "" : "s"} failed to update)` : "";

    return {
      tool: "delete_category",
      parameters: params,
      success: true,
      message: deleteChannelsInside
        ? `Deleted the category **${name}** and its ${children.length} channel${children.length === 1 ? "" : "s"}${failureNote}.`
        : `Deleted the category **${name}**. Its ${children.length} channel${children.length === 1 ? "" : "s"} moved out to uncategorized${failureNote}.`,
      data: { name, childCount: children.length, deletedChildren: deleteChannelsInside, failedChildren },
      snapshot: { category: categorySnapshot, children: childSnapshots },
    };
  },
  preview: async (params, ctx) => {
    const categoryName = params.categoryName as string;
    const deleteChannelsInside = (params.deleteChannelsInside as boolean | undefined) ?? false;
    const category = findCategory(ctx.guild, categoryName);
    const childCount = category ? ctx.guild.channels.cache.filter((c) => c.parentId === category.id).size : 0;

    const risk: RiskLevel = deleteChannelsInside && childCount > CRITICAL_CHILD_THRESHOLD ? "critical" : "high";
    const banner = risk === "critical" ? "🚨 **CRITICAL ACTION**\nThis can significantly affect the server.\n\n" : "";

    return {
      summary: deleteChannelsInside
        ? `${banner}Permanently delete the category **${categoryName}** AND all ${childCount} channel${childCount === 1 ? "" : "s"} inside it.`
        : `Delete the category **${categoryName}**. Its ${childCount} channel${childCount === 1 ? "" : "s"} will be kept, just uncategorized.`,
      risk,
    };
  },
});
