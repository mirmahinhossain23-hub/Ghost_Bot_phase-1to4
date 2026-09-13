import type { ToolResult } from "@ghost/shared";
import { registerTool } from "../registry.js";
import { describeMember, resolveMember } from "../memberUtils.js";
import { describeAmbiguity } from "../resolve.js";
import { checkModerationTarget } from "../permissions.js";

registerTool({
  definition: {
    name: "kick_member",
    description:
      "Kicks a member from the server (they can rejoin with a new invite). Use for requests like 'kick @user' or 'kick Ahmed for spamming'.",
    parameters: {
      identifier: { type: "string", description: "User ID, @mention, or username/display name of the member to kick." },
      reason: { type: "string", description: "Why they're being kicked — shown in the audit log.", optional: true },
    },
    mutating: true,
    requiresConfirmation: true,
    requiredUserPermission: "KickMembers",
    requiredBotPermission: "KickMembers",
    baseRisk: "high",
  },
  handler: async (params, ctx): Promise<ToolResult> => {
    const identifier = params.identifier as string;
    const reason = (params.reason as string | undefined) ?? "No reason given";

    const resolution = await resolveMember(ctx.guild, identifier);
    if (resolution.status === "not_found") {
      return { tool: "kick_member", parameters: params, success: false, message: `I couldn't find a member matching "${identifier}".` };
    }
    if (resolution.status === "ambiguous") {
      return {
        tool: "kick_member",
        parameters: params,
        success: false,
        message: describeAmbiguity(resolution.candidates, describeMember, "member"),
      };
    }

    const target = resolution.item;
    const safetyCheck = checkModerationTarget(ctx, target, "kickable");
    if (!safetyCheck.ok) {
      return { tool: "kick_member", parameters: params, success: false, message: safetyCheck.reason! };
    }

    const tag = target.user.tag;
    await target.kick(`Kicked by Ghost, requested by ${ctx.requester.user.tag}: ${reason}`);

    return {
      tool: "kick_member",
      parameters: params,
      success: true,
      message: `Kicked **${tag}**. Reason: ${reason}`,
      data: { userId: target.id, tag },
    };
  },
  preview: async (params, ctx) => {
    const identifier = params.identifier as string;
    const resolution = await resolveMember(ctx.guild, identifier);
    const tag = resolution.status === "found" ? resolution.item.user.tag : identifier;
    return {
      summary:
        `⚠️ **Moderation Action**\n` +
        `Target: **${tag}**\n` +
        `Action: Kick\n` +
        `Reason: ${(params.reason as string | undefined) ?? "No reason given"}\n` +
        `Requested by: ${ctx.requester.user.tag}`,
    };
  },
});
