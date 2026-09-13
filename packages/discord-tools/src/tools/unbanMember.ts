import type { ToolResult } from "@ghost/shared";
import { registerTool } from "../registry.js";
import { resolveByName, describeAmbiguity } from "../resolve.js";

registerTool({
  definition: {
    name: "unban_member",
    description: "Removes a ban, letting that user rejoin the server. Accepts a user ID or their username.",
    parameters: {
      identifier: { type: "string", description: "The banned user's ID or username." },
      reason: { type: "string", description: "Why the ban is being lifted.", optional: true },
    },
    mutating: true,
    requiresConfirmation: false,
    requiredUserPermission: "BanMembers",
    requiredBotPermission: "BanMembers",
    baseRisk: "medium",
  },
  handler: async (params, ctx): Promise<ToolResult> => {
    const identifier = (params.identifier as string).trim();
    const reason = (params.reason as string | undefined) ?? "No reason given";

    if (/^\d{15,25}$/.test(identifier)) {
      const isBanned = await ctx.guild.bans.fetch(identifier).catch(() => null);
      if (!isBanned) {
        return {
          tool: "unban_member",
          parameters: params,
          success: false,
          message: `That user ID isn't currently banned.`,
        };
      }
      await ctx.guild.bans.remove(identifier, `Unbanned by Ghost, requested by ${ctx.requester.user.tag}: ${reason}`);
      return {
        tool: "unban_member",
        parameters: params,
        success: true,
        message: `Unbanned **${isBanned.user.tag}**.`,
        data: { userId: identifier, tag: isBanned.user.tag },
      };
    }

    const bans = await ctx.guild.bans.fetch();
    const resolution = resolveByName(
      [...bans.values()],
      identifier,
      (ban) => ban.user.username,
      (name, query) => name.toLowerCase().includes(query.trim().toLowerCase())
    );

    if (resolution.status === "not_found") {
      return {
        tool: "unban_member",
        parameters: params,
        success: false,
        message: `I couldn't find a ban matching "${identifier}".`,
      };
    }
    if (resolution.status === "ambiguous") {
      return {
        tool: "unban_member",
        parameters: params,
        success: false,
        message: describeAmbiguity(resolution.candidates, (b) => `${b.user.tag} (${b.user.id})`, "banned user"),
      };
    }

    const ban = resolution.item;
    await ctx.guild.bans.remove(ban.user.id, `Unbanned by Ghost, requested by ${ctx.requester.user.tag}: ${reason}`);

    return {
      tool: "unban_member",
      parameters: params,
      success: true,
      message: `Unbanned **${ban.user.tag}**.`,
      data: { userId: ban.user.id, tag: ban.user.tag },
    };
  },
});
