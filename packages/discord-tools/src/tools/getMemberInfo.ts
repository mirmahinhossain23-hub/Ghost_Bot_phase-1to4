import type { ToolResult } from "@ghost/shared";
import { registerTool } from "../registry.js";
import { describeMember, resolveMember } from "../memberUtils.js";
import { describeAmbiguity } from "../resolve.js";

registerTool({
  definition: {
    name: "get_member_info",
    description:
      "Gets detailed info about one member: their roles, when they joined, and account creation date. " +
      "Accepts a user ID, an @mention, or a username/display name.",
    parameters: {
      identifier: { type: "string", description: "User ID, @mention, or username/display name to look up." },
    },
    mutating: false,
    requiresConfirmation: false,
  },
  handler: async (params, ctx): Promise<ToolResult> => {
    const identifier = params.identifier as string;
    const resolution = await resolveMember(ctx.guild, identifier);

    if (resolution.status === "not_found") {
      return {
        tool: "get_member_info",
        parameters: params,
        success: false,
        message: `I couldn't find a member matching "${identifier}".`,
      };
    }

    if (resolution.status === "ambiguous") {
      return {
        tool: "get_member_info",
        parameters: params,
        success: false,
        message: describeAmbiguity(resolution.candidates, describeMember, "member"),
      };
    }

    const member = resolution.item;

    const roles = member.roles.cache
      .filter((r) => r.id !== ctx.guild.id)
      .sort((a, b) => b.position - a.position)
      .map((r) => r.name);

    const data = {
      id: member.id,
      tag: member.user.tag,
      displayName: member.displayName,
      roles,
      joinedAt: member.joinedAt?.toISOString() ?? null,
      accountCreatedAt: member.user.createdAt.toISOString(),
      isBot: member.user.bot,
    };

    return {
      tool: "get_member_info",
      parameters: params,
      success: true,
      message: `${data.tag} — joined ${data.joinedAt ?? "unknown"}, roles: ${roles.length ? roles.join(", ") : "none"}.`,
      data,
    };
  },
});
