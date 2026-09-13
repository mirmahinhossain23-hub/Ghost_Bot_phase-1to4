import type { ToolResult } from "@ghost/shared";
import { registerTool } from "../registry.js";
import { describeMember, resolveMember } from "../memberUtils.js";
import { describeAmbiguity } from "../resolve.js";
import { checkRequesterAuthorityOver } from "../permissions.js";

registerTool({
  definition: {
    name: "get_moderation_target_info",
    description:
      "Gets a moderation-focused view of a member: whether Ghost and the requester could actually take action " +
      "on them (role hierarchy, ownership), current timeout status, and account age. Use this before a " +
      "moderation action if there's any doubt about whether it's allowed.",
    parameters: {
      identifier: { type: "string", description: "User ID, @mention, or username/display name to check." },
    },
    mutating: false,
    requiresConfirmation: false,
    baseRisk: "low",
  },
  handler: async (params, ctx): Promise<ToolResult> => {
    const identifier = params.identifier as string;
    const resolution = await resolveMember(ctx.guild, identifier);

    if (resolution.status === "not_found") {
      return {
        tool: "get_moderation_target_info",
        parameters: params,
        success: false,
        message: `I couldn't find a member matching "${identifier}".`,
      };
    }
    if (resolution.status === "ambiguous") {
      return {
        tool: "get_moderation_target_info",
        parameters: params,
        success: false,
        message: describeAmbiguity(resolution.candidates, describeMember, "member"),
      };
    }

    const member = resolution.item;
    const isOwner = member.id === ctx.guild.ownerId;
    const requesterAuthority = checkRequesterAuthorityOver(ctx, member);
    const isTimedOut = Boolean(member.communicationDisabledUntil && member.communicationDisabledUntil.getTime() > Date.now());
    const accountAgeDays = Math.floor((Date.now() - member.user.createdAt.getTime()) / (24 * 60 * 60 * 1000));

    const data = {
      id: member.id,
      tag: member.user.tag,
      isOwner,
      highestRole: member.roles.highest.name,
      kickable: member.kickable,
      bannable: member.bannable,
      moderatable: member.moderatable,
      requesterHasAuthority: requesterAuthority.ok,
      requesterAuthorityReason: requesterAuthority.ok ? null : requesterAuthority.reason,
      isTimedOut,
      timedOutUntil: isTimedOut ? member.communicationDisabledUntil!.toISOString() : null,
      accountAgeDays,
      accountCreatedAt: member.user.createdAt.toISOString(),
      joinedAt: member.joinedAt?.toISOString() ?? null,
    };

    const summary = isOwner
      ? `${data.tag} is the server owner — Ghost will never take moderation action against them.`
      : `${data.tag}: kickable=${data.kickable}, bannable=${data.bannable}, moderatable=${data.moderatable}, requester authority=${data.requesterHasAuthority}${isTimedOut ? `, timed out until ${data.timedOutUntil}` : ""}.`;

    return {
      tool: "get_moderation_target_info",
      parameters: params,
      success: true,
      message: summary,
      data,
    };
  },
});
