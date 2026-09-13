import type { ToolResult } from "@ghost/shared";
import { registerTool } from "../registry.js";
import { describeMember, resolveMember } from "../memberUtils.js";
import { describeAmbiguity } from "../resolve.js";
import { checkModerationTarget } from "../permissions.js";
import { parseDuration } from "../durationParser.js";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

registerTool({
  definition: {
    name: "timeout_member",
    description:
      "Temporarily prevents a member from sending messages/speaking, for a natural-language duration. " +
      "Use for requests like 'timeout Ahmed for 30 minutes for spamming'. Durations like '10m', '2 hours', " +
      "'1 day', or '1 week' are all understood; invalid durations are rejected rather than guessed at.",
    parameters: {
      identifier: { type: "string", description: "User ID, @mention, or username/display name of the member to time out." },
      duration: { type: "string", description: "How long, e.g. '30 minutes', '2 hours', '1 day'. Max 28 days." },
      reason: { type: "string", description: "Why they're being timed out.", optional: true },
    },
    mutating: true,
    requiresConfirmation: true,
    requiredUserPermission: "ModerateMembers",
    requiredBotPermission: "ModerateMembers",
    baseRisk: "medium",
  },
  handler: async (params, ctx): Promise<ToolResult> => {
    const identifier = params.identifier as string;
    const durationInput = params.duration as string;
    const reason = (params.reason as string | undefined) ?? "No reason given";

    const duration = parseDuration(durationInput);
    if (!duration.ok) {
      return { tool: "timeout_member", parameters: params, success: false, message: duration.reason };
    }

    const resolution = await resolveMember(ctx.guild, identifier);
    if (resolution.status === "not_found") {
      return { tool: "timeout_member", parameters: params, success: false, message: `I couldn't find a member matching "${identifier}".` };
    }
    if (resolution.status === "ambiguous") {
      return {
        tool: "timeout_member",
        parameters: params,
        success: false,
        message: describeAmbiguity(resolution.candidates, describeMember, "member"),
      };
    }

    const target = resolution.item;
    const safetyCheck = checkModerationTarget(ctx, target, "moderatable");
    if (!safetyCheck.ok) {
      return { tool: "timeout_member", parameters: params, success: false, message: safetyCheck.reason! };
    }

    const tag = target.user.tag;
    await target.timeout(duration.value.ms, `Timed out by Ghost, requested by ${ctx.requester.user.tag}: ${reason}`);

    return {
      tool: "timeout_member",
      parameters: params,
      success: true,
      message: `Timed out **${tag}** for ${duration.value.label}. Reason: ${reason}`,
      data: { userId: target.id, tag, durationMs: duration.value.ms },
    };
  },
  preview: async (params, ctx) => {
    const identifier = params.identifier as string;
    const durationInput = params.duration as string;
    const duration = parseDuration(durationInput);

    if (!duration.ok) {
      return { summary: duration.reason };
    }

    const resolution = await resolveMember(ctx.guild, identifier);
    const tag = resolution.status === "found" ? resolution.item.user.tag : identifier;

    return {
      summary:
        `⚠️ **Moderation Action**\n` +
        `Target: **${tag}**\n` +
        `Action: Timeout\n` +
        `Duration: ${duration.value.label}\n` +
        `Reason: ${(params.reason as string | undefined) ?? "No reason given"}\n` +
        `Requested by: ${ctx.requester.user.tag}`,
      risk: duration.value.ms >= ONE_DAY_MS ? "high" : "medium",
    };
  },
});
