import type { ToolResult } from "@ghost/shared";
import { registerTool } from "../registry.js";
import { describeMember, resolveMember } from "../memberUtils.js";
import { describeAmbiguity } from "../resolve.js";
import { checkModerationTarget } from "../permissions.js";

const MAX_DELETE_MESSAGE_SECONDS = 7 * 24 * 60 * 60; // Discord's own cap: 7 days of messages

registerTool({
  definition: {
    name: "ban_member",
    description:
      "Bans a member from the server (they cannot rejoin without being unbanned). Use for requests like " +
      "'ban this member for scamming'. This only works on members currently in the server — banning a raw " +
      "user ID who has already left isn't supported yet.",
    parameters: {
      identifier: { type: "string", description: "User ID, @mention, or username/display name of the member to ban." },
      reason: { type: "string", description: "Why they're being banned — shown in the audit log.", optional: true },
      deleteMessageDays: {
        type: "number",
        description: "How many days of their recent messages to also delete (0-7). Defaults to 0.",
        optional: true,
      },
    },
    mutating: true,
    requiresConfirmation: true,
    requiredUserPermission: "BanMembers",
    requiredBotPermission: "BanMembers",
    baseRisk: "critical",
  },
  handler: async (params, ctx): Promise<ToolResult> => {
    const identifier = params.identifier as string;
    const reason = (params.reason as string | undefined) ?? "No reason given";
    const deleteMessageDays = (params.deleteMessageDays as number | undefined) ?? 0;

    if (deleteMessageDays < 0 || deleteMessageDays > 7) {
      return {
        tool: "ban_member",
        parameters: params,
        success: false,
        message: "deleteMessageDays must be between 0 and 7.",
      };
    }

    const resolution = await resolveMember(ctx.guild, identifier);
    if (resolution.status === "not_found") {
      return { tool: "ban_member", parameters: params, success: false, message: `I couldn't find a member matching "${identifier}".` };
    }
    if (resolution.status === "ambiguous") {
      return {
        tool: "ban_member",
        parameters: params,
        success: false,
        message: describeAmbiguity(resolution.candidates, describeMember, "member"),
      };
    }

    const target = resolution.item;
    const safetyCheck = checkModerationTarget(ctx, target, "bannable");
    if (!safetyCheck.ok) {
      return { tool: "ban_member", parameters: params, success: false, message: safetyCheck.reason! };
    }

    const tag = target.user.tag;
    const deleteMessageSeconds = Math.min(MAX_DELETE_MESSAGE_SECONDS, deleteMessageDays * 24 * 60 * 60);

    await ctx.guild.members.ban(target, {
      reason: `Banned by Ghost, requested by ${ctx.requester.user.tag}: ${reason}`,
      deleteMessageSeconds,
    });

    return {
      tool: "ban_member",
      parameters: params,
      success: true,
      message: `Banned **${tag}**. Reason: ${reason}`,
      data: { userId: target.id, tag },
    };
  },
  preview: async (params, ctx) => {
    const identifier = params.identifier as string;
    const resolution = await resolveMember(ctx.guild, identifier);
    const tag = resolution.status === "found" ? resolution.item.user.tag : identifier;
    return {
      summary:
        `🚨 **CRITICAL Moderation Action**\n` +
        `Target: **${tag}**\n` +
        `Action: Ban\n` +
        `Reason: ${(params.reason as string | undefined) ?? "No reason given"}\n` +
        `Requested by: ${ctx.requester.user.tag}`,
      risk: "critical",
    };
  },
});
