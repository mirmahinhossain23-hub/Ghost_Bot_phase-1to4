import type { ToolResult } from "@ghost/shared";
import { registerTool } from "../registry.js";
import { describeMember, resolveMember } from "../memberUtils.js";
import { describeAmbiguity } from "../resolve.js";
import { checkModerationTarget } from "../permissions.js";

registerTool({
  definition: {
    name: "remove_timeout",
    description: "Clears an active timeout early, letting the member speak again immediately.",
    parameters: {
      identifier: { type: "string", description: "User ID, @mention, or username/display name." },
      reason: { type: "string", description: "Why the timeout is being lifted early.", optional: true },
    },
    mutating: true,
    requiresConfirmation: false,
    requiredUserPermission: "ModerateMembers",
    requiredBotPermission: "ModerateMembers",
    baseRisk: "low",
  },
  handler: async (params, ctx): Promise<ToolResult> => {
    const identifier = params.identifier as string;
    const reason = (params.reason as string | undefined) ?? "No reason given";

    const resolution = await resolveMember(ctx.guild, identifier);
    if (resolution.status === "not_found") {
      return { tool: "remove_timeout", parameters: params, success: false, message: `I couldn't find a member matching "${identifier}".` };
    }
    if (resolution.status === "ambiguous") {
      return {
        tool: "remove_timeout",
        parameters: params,
        success: false,
        message: describeAmbiguity(resolution.candidates, describeMember, "member"),
      };
    }

    const target = resolution.item;
    const safetyCheck = checkModerationTarget(ctx, target, "moderatable");
    if (!safetyCheck.ok) {
      return { tool: "remove_timeout", parameters: params, success: false, message: safetyCheck.reason! };
    }

    if (!target.communicationDisabledUntil || target.communicationDisabledUntil.getTime() <= Date.now()) {
      return {
        tool: "remove_timeout",
        parameters: params,
        success: false,
        message: `${target.user.tag} isn't currently timed out.`,
      };
    }

    const tag = target.user.tag;
    await target.timeout(null, `Timeout cleared by Ghost, requested by ${ctx.requester.user.tag}: ${reason}`);

    return {
      tool: "remove_timeout",
      parameters: params,
      success: true,
      message: `Removed **${tag}**'s timeout.`,
      data: { userId: target.id, tag },
    };
  },
});
