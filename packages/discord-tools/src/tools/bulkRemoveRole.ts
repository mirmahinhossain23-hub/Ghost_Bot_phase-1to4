import type { ToolResult } from "@ghost/shared";
import { registerTool } from "../registry.js";
import { checkBotCanManageRole } from "../permissions.js";
import { runWithConcurrency } from "../executionQueue.js";

registerTool({
  definition: {
    name: "bulk_remove_role",
    description:
      "Removes a role from EVERY member who currently has it. Use for requests like 'remove the Tester role from everyone'. Always requires confirmation.",
    parameters: {
      roleName: { type: "string", description: "The role to strip from every member." },
    },
    mutating: true,
    requiresConfirmation: true,
    requiredUserPermission: "ManageRoles",
    requiredBotPermission: "ManageRoles",
    baseRisk: "high",
  },
  handler: async (params, ctx): Promise<ToolResult> => {
    const roleName = params.roleName as string;
    const role = ctx.guild.roles.cache.find((r) => r.name.toLowerCase() === roleName.toLowerCase());

    if (!role) {
      return {
        tool: "bulk_remove_role",
        parameters: params,
        success: false,
        message: `I couldn't find a role called "${roleName}".`,
      };
    }

    const hierarchyCheck = checkBotCanManageRole(ctx, role.position);
    if (!hierarchyCheck.ok) {
      return { tool: "bulk_remove_role", parameters: params, success: false, message: hierarchyCheck.reason! };
    }

    // Make sure we're seeing everyone who actually has the role, not just
    // whoever happens to be cached from recent gateway activity.
    await ctx.guild.members.fetch().catch(() => undefined);

    const holders = [...role.members.values()];
    const botTopPosition = ctx.bot.roles.highest.position;

    const outcomes = await runWithConcurrency(
      holders,
      async (member) => {
        if (member.roles.highest.position >= botTopPosition) {
          throw new Error("member is above Ghost");
        }
        await member.roles.remove(role, `Bulk-removed by Ghost, requested by ${ctx.requester.user.tag}`);
      },
      { concurrency: 5 }
    );

    const succeeded = outcomes.filter((o) => o.status === "fulfilled");
    const failures = outcomes.filter((o) => o.status === "rejected");

    const failureLines = failures
      .slice(0, 10)
      .map((f) => `• ${f.item.user.tag} — ${f.reason ?? "Discord API rejected the request"}`);
    if (failures.length > 10) failureLines.push(`…and ${failures.length - 10} more`);

    return {
      tool: "bulk_remove_role",
      parameters: params,
      success: true,
      message:
        failures.length > 0
          ? `Removed **${role.name}** from ${succeeded.length} member${succeeded.length === 1 ? "" : "s"}.\n\n✅ ${succeeded.length} successful\n❌ ${failures.length} failed\n\nFailures:\n${failureLines.join("\n")}`
          : `Removed **${role.name}** from ${succeeded.length} member${succeeded.length === 1 ? "" : "s"}.`,
      data: { roleId: role.id, removed: succeeded.length, failed: failures.length },
    };
  },
  preview: async (params, ctx) => {
    const roleName = params.roleName as string;
    const role = ctx.guild.roles.cache.find((r) => r.name.toLowerCase() === roleName.toLowerCase());
    return {
      summary: role
        ? `Remove **${role.name}** from all ${role.members.size} member${role.members.size === 1 ? "" : "s"} who currently have it.\nAffected members: ${role.members.size}`
        : `Remove the role "${roleName}" from everyone who has it.`,
    };
  },
});
