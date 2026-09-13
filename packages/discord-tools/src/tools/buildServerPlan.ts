import { PermissionsBitField } from "discord.js";
import type { ToolResult } from "@ghost/shared";
import { registerTool } from "../registry.js";
import {
  assessServerState,
  clearPendingPlan,
  computePlanRisk,
  executePlan,
  formatBuildReport,
  getPendingPlan,
  renderPlanSummary,
  renderPlanTree,
  validatePlan,
} from "../architect/index.js";

registerTool({
  definition: {
    name: "build_server_plan",
    description:
      "Executes the currently pending server plan in this channel — actually creates the roles/categories/" +
      "channels. Always requires confirmation. Use this when the user says something like 'build it', " +
      "'looks good, go ahead', or 'yes, create that'.",
    parameters: {},
    mutating: true,
    requiresConfirmation: true,
    requiredUserPermission: "ManageGuild",
    requiredBotPermission: "ManageChannels",
  },
  handler: async (params, ctx): Promise<ToolResult> => {
    const plan = getPendingPlan(ctx.channelId);
    if (!plan) {
      return {
        tool: "build_server_plan",
        parameters: params,
        success: false,
        message: "There's no pending plan to build in this channel — ask me to design one first.",
      };
    }

    const snapshot = assessServerState(ctx.guild);
    const validation = validatePlan(plan, snapshot);
    if (!validation.ok) {
      return {
        tool: "build_server_plan",
        parameters: params,
        success: false,
        message: `I can't build this plan as-is:\n${validation.errors.map((e) => `• ${e}`).join("\n")}`,
      };
    }

    if (plan.roles.length > 0 && !ctx.bot.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
      return {
        tool: "build_server_plan",
        parameters: params,
        success: false,
        message: "This plan includes roles, but I don't have the Manage Roles permission. Grant it to my role and try again.",
      };
    }

    const report = await executePlan(plan, ctx);
    clearPendingPlan(ctx.channelId);

    return {
      tool: "build_server_plan",
      parameters: params,
      success: true,
      message: formatBuildReport(report),
      data: { report },
    };
  },
  preview: async (_params, ctx) => {
    const plan = getPendingPlan(ctx.channelId);
    if (!plan) {
      return { summary: "There's no pending plan to build in this channel." };
    }
    const snapshot = assessServerState(ctx.guild);
    const risk = computePlanRisk(plan);
    const banner = risk === "critical" ? "🚨 **CRITICAL ACTION**\nThis can significantly affect the server.\n\n" : "";

    return {
      summary: `${banner}Build this server plan:\n\`\`\`\n${renderPlanTree(plan)}\n\`\`\`\n${renderPlanSummary(plan, snapshot)}`,
      risk,
    };
  },
});
