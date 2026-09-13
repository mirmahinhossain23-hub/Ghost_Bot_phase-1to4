import type { ToolResult } from "@ghost/shared";
import { registerTool } from "../registry.js";
import {
  assessServerState,
  computePlanRisk,
  getPendingPlan,
  renderPlanSummary,
  renderPlanTree,
  setPendingPlan,
  validatePlan,
  type ExistingStrategy,
  type PlannedChannel,
  type PlannedRole,
  type ServerPlan,
} from "../architect/index.js";
import { styleCategoryName, styleChannelName, STYLE_PRESETS, STYLE_PRESET_NAMES, type StylePresetName } from "../styleEngine.js";
import { nameMatches } from "../channelUtils.js";
import { resolveByName, describeAmbiguity } from "../resolve.js";
import { ChannelType } from "discord.js";

const OPERATIONS = [
  "add_category",
  "remove_category",
  "add_channel",
  "remove_channel",
  "add_role",
  "remove_role",
  "restyle_category",
  "restyle_plan",
  "set_existing_strategy",
] as const;

type Operation = (typeof OPERATIONS)[number];

const channelObjectSchema = {
  type: "object" as const,
  description: "A single planned channel.",
  properties: {
    name: { type: "string" as const, description: "Channel name." },
    kind: { type: "string" as const, description: "Channel kind.", enum: ["text", "voice"] },
    private: { type: "boolean" as const, description: "Hide from @everyone.", optional: true },
  },
};

registerTool({
  definition: {
    name: "modify_server_plan",
    description:
      "Edits the currently pending server plan in this channel (from propose_server_plan) — add/remove a " +
      "category, channel, or role, restyle a section, or change how existing resources are handled. Fails " +
      "clearly if there's no pending plan.",
    parameters: {
      operation: {
        type: "string",
        description: "Which edit to make.",
        enum: [...OPERATIONS],
      },
      categoryName: {
        type: "string",
        description: "Target category name — required for add_category, remove_category, add_channel, restyle_category.",
        optional: true,
      },
      channels: {
        type: "array",
        description: "Channels to add — used with add_category or add_channel.",
        items: channelObjectSchema,
        optional: true,
      },
      channelName: {
        type: "string",
        description: "Target channel name — required for remove_channel.",
        optional: true,
      },
      roleName: {
        type: "string",
        description: "Role name — required for add_role and remove_role.",
        optional: true,
      },
      color: { type: "string", description: "Hex color for add_role.", optional: true },
      style: {
        type: "string",
        description: "Style preset — required for restyle_category and restyle_plan.",
        enum: [...STYLE_PRESET_NAMES],
        optional: true,
      },
      existingStrategy: {
        type: "string",
        description: "Required for set_existing_strategy.",
        enum: ["preserve", "reorganize", "replace"],
        optional: true,
      },
    },
    mutating: false,
    requiresConfirmation: false,
    requiredUserPermission: "ManageGuild",
    baseRisk: "low",
  },
  handler: async (params, ctx): Promise<ToolResult> => {
    const plan = getPendingPlan(ctx.channelId);
    if (!plan) {
      return {
        tool: "modify_server_plan",
        parameters: params,
        success: false,
        message: "You don't have a pending server plan in this channel — ask me to design one first.",
      };
    }

    const operation = params.operation as Operation;
    const result = applyOperation(plan, operation, params);
    if (!result.ok) {
      return { tool: "modify_server_plan", parameters: params, success: false, message: result.reason };
    }

    const snapshot = assessServerState(ctx.guild);
    const validation = validatePlan(result.plan, snapshot);
    if (!validation.ok) {
      return {
        tool: "modify_server_plan",
        parameters: params,
        success: false,
        message: `That change would make the plan invalid:\n${validation.errors.map((e) => `• ${e}`).join("\n")}`,
      };
    }

    setPendingPlan(ctx.channelId, ctx.guild.id, result.plan);
    const risk = computePlanRisk(result.plan);

    return {
      tool: "modify_server_plan",
      parameters: params,
      success: true,
      message:
        `Updated the plan:\n\n\`\`\`\n${renderPlanTree(result.plan)}\n\`\`\`\n\n` +
        `${renderPlanSummary(result.plan, snapshot)}\nCalculated risk: ${risk}\n\n` +
        `Ask for more changes, or say "build it" when you're ready.`,
      data: { plan: result.plan, risk },
    };
  },
});

type OpResult = { ok: true; plan: ServerPlan } | { ok: false; reason: string };

function applyOperation(plan: ServerPlan, operation: Operation, params: Record<string, unknown>): OpResult {
  const next: ServerPlan = { ...plan, updatedAt: Date.now() };

  switch (operation) {
    case "add_category": {
      const categoryName = params.categoryName as string | undefined;
      if (!categoryName) return { ok: false, reason: "categoryName is required for add_category." };
      if (next.categories.some((c) => nameMatches(c.name, categoryName))) {
        return { ok: false, reason: `A category called "${categoryName}" is already in the plan.` };
      }
      const channels = ((params.channels as PlannedChannel[] | undefined) ?? []).map((c) => ({
        name: c.name,
        kind: c.kind ?? "text",
        private: c.private,
      }));
      next.categories = [...next.categories, { name: categoryName, channels }];
      return { ok: true, plan: next };
    }

    case "remove_category": {
      const categoryName = params.categoryName as string | undefined;
      if (!categoryName) return { ok: false, reason: "categoryName is required for remove_category." };
      const resolved = resolveByName(next.categories, categoryName, (c) => c.name, nameMatches);
      if (resolved.status === "not_found") {
        return { ok: false, reason: `I couldn't find "${categoryName}" in the current plan.` };
      }
      if (resolved.status === "ambiguous") {
        return { ok: false, reason: describeAmbiguity(resolved.candidates, (c) => c.name, "category") };
      }
      next.categories = next.categories.filter((c) => c !== resolved.item);
      return { ok: true, plan: next };
    }

    case "add_channel": {
      const categoryName = params.categoryName as string | undefined;
      const channels = (params.channels as PlannedChannel[] | undefined) ?? [];
      if (!categoryName || channels.length === 0) {
        return { ok: false, reason: "categoryName and at least one channel are required for add_channel." };
      }
      const resolved = resolveByName(next.categories, categoryName, (c) => c.name, nameMatches);
      if (resolved.status === "not_found") {
        return { ok: false, reason: `I couldn't find "${categoryName}" in the current plan.` };
      }
      if (resolved.status === "ambiguous") {
        return { ok: false, reason: describeAmbiguity(resolved.candidates, (c) => c.name, "category") };
      }
      next.categories = next.categories.map((c) =>
        c === resolved.item
          ? { ...c, channels: [...c.channels, ...channels.map((ch) => ({ name: ch.name, kind: ch.kind ?? "text", private: ch.private }))] }
          : c
      );
      return { ok: true, plan: next };
    }

    case "remove_channel": {
      const channelName = params.channelName as string | undefined;
      if (!channelName) return { ok: false, reason: "channelName is required for remove_channel." };

      const flat = [
        ...next.categories.flatMap((c) => c.channels.map((ch) => ({ channel: ch, category: c }))),
        ...next.standaloneChannels.map((ch) => ({ channel: ch, category: null })),
      ];
      const resolved = resolveByName(flat, channelName, (f) => f.channel.name, nameMatches);
      if (resolved.status === "not_found") {
        return { ok: false, reason: `I couldn't find a channel called "${channelName}" in the current plan.` };
      }
      if (resolved.status === "ambiguous") {
        return {
          ok: false,
          reason: describeAmbiguity(resolved.candidates, (f) => `${f.channel.name} (in ${f.category?.name ?? "no category"})`, "channel"),
        };
      }
      const target = resolved.item;
      if (target.category) {
        next.categories = next.categories.map((c) =>
          c === target.category ? { ...c, channels: c.channels.filter((ch) => ch !== target.channel) } : c
        );
      } else {
        next.standaloneChannels = next.standaloneChannels.filter((ch) => ch !== target.channel);
      }
      return { ok: true, plan: next };
    }

    case "add_role": {
      const roleName = params.roleName as string | undefined;
      if (!roleName) return { ok: false, reason: "roleName is required for add_role." };
      if (next.roles.some((r) => r.name.toLowerCase() === roleName.toLowerCase())) {
        return { ok: false, reason: `A role called "${roleName}" is already in the plan.` };
      }
      const role: PlannedRole = { name: roleName, color: params.color as string | undefined };
      next.roles = [...next.roles, role];
      return { ok: true, plan: next };
    }

    case "remove_role": {
      const roleName = params.roleName as string | undefined;
      if (!roleName) return { ok: false, reason: "roleName is required for remove_role." };
      const resolved = resolveByName(next.roles, roleName, (r) => r.name, (a, b) => a.toLowerCase() === b.toLowerCase());
      if (resolved.status === "not_found") return { ok: false, reason: `I couldn't find "${roleName}" in the current plan.` };
      if (resolved.status === "ambiguous") {
        return { ok: false, reason: describeAmbiguity(resolved.candidates, (r) => r.name, "role") };
      }
      next.roles = next.roles.filter((r) => r !== resolved.item);
      return { ok: true, plan: next };
    }

    case "restyle_category": {
      const categoryName = params.categoryName as string | undefined;
      const style = params.style as StylePresetName | undefined;
      if (!categoryName || !style) return { ok: false, reason: "categoryName and style are required for restyle_category." };
      const resolved = resolveByName(next.categories, categoryName, (c) => c.name, nameMatches);
      if (resolved.status === "not_found") return { ok: false, reason: `I couldn't find "${categoryName}" in the current plan.` };
      if (resolved.status === "ambiguous") {
        return { ok: false, reason: describeAmbiguity(resolved.candidates, (c) => c.name, "category") };
      }
      const convention = STYLE_PRESETS[style];
      next.categories = next.categories.map((c) =>
        c === resolved.item
          ? {
              name: styleCategoryName(c.name, convention.wrapper),
              channels: c.channels.map((ch) => ({
                ...ch,
                name: styleChannelName(ch.name, ch.kind === "voice" ? ChannelType.GuildVoice : ChannelType.GuildText, convention.wrapper, convention.channel),
              })),
            }
          : c
      );
      return { ok: true, plan: next };
    }

    case "restyle_plan": {
      const style = params.style as StylePresetName | undefined;
      if (!style) return { ok: false, reason: "style is required for restyle_plan." };
      next.style = style;
      const convention = STYLE_PRESETS[style];
      next.categories = next.categories.map((c) => ({
        name: styleCategoryName(c.name, convention.wrapper),
        channels: c.channels.map((ch) => ({
          ...ch,
          name: styleChannelName(ch.name, ch.kind === "voice" ? ChannelType.GuildVoice : ChannelType.GuildText, convention.wrapper, convention.channel),
        })),
      }));
      next.standaloneChannels = next.standaloneChannels.map((ch) => ({
        ...ch,
        name: styleChannelName(ch.name, ch.kind === "voice" ? ChannelType.GuildVoice : ChannelType.GuildText, convention.wrapper, convention.channel),
      }));
      return { ok: true, plan: next };
    }

    case "set_existing_strategy": {
      const existingStrategy = params.existingStrategy as ExistingStrategy | undefined;
      if (!existingStrategy) return { ok: false, reason: "existingStrategy is required for set_existing_strategy." };
      next.existingStrategy = existingStrategy;
      return { ok: true, plan: next };
    }

    default:
      return { ok: false, reason: `Unknown operation "${operation}".` };
  }
}
