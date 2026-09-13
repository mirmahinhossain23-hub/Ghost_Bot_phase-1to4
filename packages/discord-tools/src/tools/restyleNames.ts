import type { RiskLevel, ToolResult } from "@ghost/shared";
import { registerTool } from "../registry.js";
import {
  computeStylePlan,
  STYLE_PRESET_NAMES,
  type StylePlanOptions,
  type StylePresetName,
} from "../styleEngine.js";
import { runWithConcurrency, summarizeOutcomes } from "../executionQueue.js";

// "Major server restructuring" territory, per the risk table.
const CRITICAL_PLAN_THRESHOLD = 20;

function readOptions(params: Record<string, unknown>): StylePlanOptions {
  return {
    mode: params.mode as "preset" | "match_category",
    presetName: params.presetName as StylePresetName | undefined,
    matchCategoryName: params.matchCategoryName as string | undefined,
    scope: params.scope as "category" | "server",
    scopeCategoryName: params.scopeCategoryName as string | undefined,
    includeCategoryNames: (params.includeCategoryNames as boolean | undefined) ?? true,
  };
}

function formatDiffLines(plan: { kind: string; before: string; after: string }[]): string[] {
  const MAX_LINES = 30;
  const lines = plan
    .slice(0, MAX_LINES)
    .map((entry) => `${entry.kind === "category" ? "📁" : "•"} ${entry.before} → ${entry.after}`);
  if (plan.length > MAX_LINES) {
    lines.push(`… and ${plan.length - MAX_LINES} more`);
  }
  return lines;
}

registerTool({
  definition: {
    name: "restyle_names",
    description:
      "Bulk-renames category and/or channel names to a consistent visual style. Use this for requests like " +
      "'make my categories stylish', 'make the channel names look professional', or 'copy the style of the " +
      "INFORMATION category'. Always shows a before/after preview and requires confirmation before applying. " +
      `Available presets: ${STYLE_PRESET_NAMES.join(", ")} — pick modern for a clean professional look, ` +
      "premium for an elegant/fancy look, futuristic for a sci-fi look, gaming for a playful colorful look, " +
      "and developer for a minimal technical look. Use mode 'match_category' instead of a preset when the user " +
      "wants Ghost to copy an existing category's naming pattern onto other categories.",
    parameters: {
      mode: { type: "string", description: "'preset' to use a named style, 'match_category' to copy an existing category's pattern.", enum: ["preset", "match_category"] },
      presetName: {
        type: "string",
        description: "Required when mode is 'preset'.",
        enum: [...STYLE_PRESET_NAMES],
        optional: true,
      },
      matchCategoryName: {
        type: "string",
        description: "Required when mode is 'match_category' — the category whose naming pattern to copy.",
        optional: true,
      },
      scope: { type: "string", description: "'category' to restyle one category, 'server' for every category.", enum: ["category", "server"] },
      scopeCategoryName: {
        type: "string",
        description: "Required when scope is 'category' — which category to restyle.",
        optional: true,
      },
      includeCategoryNames: {
        type: "boolean",
        description: "Whether to also restyle the category headers themselves, not just the channels inside. Defaults to true.",
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
    const options = readOptions(params);
    const { plan, error } = computeStylePlan(ctx.guild, options);

    if (error) {
      return { tool: "restyle_names", parameters: params, success: false, message: error };
    }
    if (plan.length === 0) {
      return {
        tool: "restyle_names",
        parameters: params,
        success: true,
        message: "Nothing to change — everything already matches this style.",
      };
    }

    const outcomes = await runWithConcurrency(
      plan,
      async (entry) => {
        const channel = ctx.guild.channels.cache.get(entry.id);
        if (!channel) throw new Error("Channel no longer exists");
        await channel.setName(entry.after, `Restyled by Ghost, requested by ${ctx.requester.user.tag}`);
      },
      { concurrency: 3 }
    );
    const { succeeded: applied, failed } = summarizeOutcomes(outcomes);

    return {
      tool: "restyle_names",
      parameters: params,
      success: true,
      message:
        failed > 0
          ? `Restyled ${applied} name${applied === 1 ? "" : "s"} (${failed} failed).`
          : `Restyled ${applied} name${applied === 1 ? "" : "s"}.`,
      data: { applied, failed },
    };
  },
  preview: async (params, ctx) => {
    const options = readOptions(params);
    const { plan, error } = computeStylePlan(ctx.guild, options);

    if (error) return { summary: error };
    if (plan.length === 0) {
      return { summary: "Nothing to change — everything already matches this style." };
    }

    const categoryCount = plan.filter((e) => e.kind === "category").length;
    const channelCount = plan.filter((e) => e.kind === "channel").length;
    const risk: RiskLevel = plan.length > CRITICAL_PLAN_THRESHOLD ? "critical" : "high";
    const banner = risk === "critical" ? "🚨 **CRITICAL ACTION**\nThis can significantly affect the server.\n\n" : "";

    return {
      summary: `${banner}Rename ${categoryCount} categor${categoryCount === 1 ? "y" : "ies"} and ${channelCount} channel${channelCount === 1 ? "" : "s"}:`,
      diffLines: formatDiffLines(plan),
      risk,
    };
  },
});
