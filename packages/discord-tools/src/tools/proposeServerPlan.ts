import type { ToolResult } from "@ghost/shared";
import { registerTool } from "../registry.js";
import {
  applyStyleToPlan,
  assessServerState,
  computePlanRisk,
  createEmptyPlan,
  getTemplate,
  getTemplateNames,
  instantiateTemplate,
  renderPlanSummary,
  renderPlanTree,
  setPendingPlan,
  validatePlan,
  type BuildMode,
  type ExistingStrategy,
  type PlannedCategory,
  type PlannedChannel,
  type PlannedRole,
  type ServerPlan,
} from "../architect/index.js";
import { STYLE_PRESET_NAMES, type StylePresetName } from "../styleEngine.js";

const channelObjectSchema = {
  type: "object" as const,
  description: "A single planned channel.",
  properties: {
    name: { type: "string" as const, description: "Channel name (plain words — Ghost handles Discord naming rules)." },
    kind: { type: "string" as const, description: "Channel kind.", enum: ["text", "voice"] },
    private: { type: "boolean" as const, description: "Hide from @everyone.", optional: true },
    topic: { type: "string" as const, description: "Optional channel topic (text channels only).", optional: true },
  },
};

const categoryObjectSchema = {
  type: "object" as const,
  description: "A category and the channels inside it.",
  properties: {
    name: { type: "string" as const, description: "Category name (plain words)." },
    channels: {
      type: "array" as const,
      description: "Channels inside this category.",
      items: channelObjectSchema,
    },
  },
};

const roleObjectSchema = {
  type: "object" as const,
  description: "A planned role.",
  properties: {
    name: { type: "string" as const, description: "Role name." },
    color: { type: "string" as const, description: "Hex color, e.g. '#7C3AED'.", optional: true },
  },
};

registerTool({
  definition: {
    name: "propose_server_plan",
    description:
      "Designs a server structure (categories, channels, roles) and stores it as a pending plan with a full " +
      "preview — this does NOT touch Discord yet. Use mode 'template' with templateName for a predefined " +
      "structure, or 'create'/'add'/'reorganize'/'custom' with your own categories/standaloneChannels/roles for " +
      "an AI-designed structure. After this, the user can ask for changes (use modify_server_plan) or say " +
      "something like 'build it' (use build_server_plan) to actually create everything.",
    parameters: {
      mode: {
        type: "string",
        description:
          "create: server is empty/mostly empty. add: add new sections without touching existing ones. " +
          "reorganize: propose improvements to existing structure. template: use a predefined template. " +
          "custom: a fully custom AI-designed structure.",
        enum: ["create", "add", "reorganize", "template", "custom"],
      },
      templateName: {
        type: "string",
        description: `Required when mode is 'template'. One of: ${getTemplateNames().join(", ")}.`,
        optional: true,
      },
      includeSections: {
        type: "array",
        description: "Optional template section IDs to include (see the template's optional sections).",
        items: { type: "string", description: "A section ID." },
        optional: true,
      },
      style: {
        type: "string",
        description: "Visual naming style to apply to the whole plan. 'existing' copies the server's existing style.",
        enum: [...STYLE_PRESET_NAMES, "existing"],
        optional: true,
      },
      existingStrategy: {
        type: "string",
        description:
          "How to treat resources that already exist. Only set this when the user clearly stated intent " +
          "(e.g. explicitly said 'replace') — otherwise leave it out and let Ghost ask.",
        enum: ["preserve", "reorganize", "replace"],
        optional: true,
      },
      categories: {
        type: "array",
        description: "Required for create/add/reorganize/custom modes (omit for 'template').",
        items: categoryObjectSchema,
        optional: true,
      },
      standaloneChannels: {
        type: "array",
        description: "Channels that don't belong in any category.",
        items: channelObjectSchema,
        optional: true,
      },
      roles: {
        type: "array",
        description: "Roles to create alongside the structure.",
        items: roleObjectSchema,
        optional: true,
      },
      notes: {
        type: "string",
        description: "One short sentence on your reasoning for this structure, shown in the preview.",
        optional: true,
      },
    },
    mutating: false,
    requiresConfirmation: false,
    requiredUserPermission: "ManageGuild",
    baseRisk: "low",
  },
  handler: async (params, ctx): Promise<ToolResult> => {
    const mode = params.mode as BuildMode;
    const snapshot = assessServerState(ctx.guild);

    // Existing-server protection: a CREATE request on a server that
    // already has real structure needs an explicit strategy, not a
    // silent guess.
    if (mode === "create" && snapshot.state !== "empty" && !params.existingStrategy) {
      return {
        tool: "propose_server_plan",
        parameters: params,
        success: false,
        message:
          `I found an existing server structure with ${snapshot.categoryCount} categories and ${snapshot.channelCount} channels.\n\n` +
          `I can:\n` +
          `**Add** the new structure alongside your existing setup\n` +
          `**Reorganize** selected sections\n` +
          `**Replace** specific sections after confirmation\n\n` +
          `Tell me which approach you want.`,
      };
    }

    let categories: PlannedCategory[];
    let roles: PlannedRole[];
    let templateId: string | undefined;

    if (mode === "template") {
      const templateName = params.templateName as string | undefined;
      const template = templateName ? getTemplate(templateName) : undefined;
      if (!template) {
        return {
          tool: "propose_server_plan",
          parameters: params,
          success: false,
          message: `templateName must be one of: ${getTemplateNames().join(", ")}.`,
        };
      }
      const instantiated = instantiateTemplate(template, (params.includeSections as string[] | undefined) ?? []);
      categories = instantiated.categories;
      roles = instantiated.roles;
      templateId = template.id;
    } else {
      categories = ((params.categories as PlannedCategory[] | undefined) ?? []).map((c) => ({
        name: c.name,
        channels: (c.channels ?? []).map((ch) => normalizeChannel(ch)),
      }));
      roles = (params.roles as PlannedRole[] | undefined) ?? [];
    }

    const standaloneChannels = ((params.standaloneChannels as PlannedChannel[] | undefined) ?? []).map(
      normalizeChannel
    );

    let plan: ServerPlan = {
      ...createEmptyPlan(mode),
      templateId,
      style: params.style as StylePresetName | "existing" | undefined,
      existingStrategy: (params.existingStrategy as ExistingStrategy | undefined) ?? "preserve",
      categories,
      standaloneChannels,
      roles,
      notes: params.notes as string | undefined,
    };

    if (plan.style) {
      plan = applyStyleToPlan(plan, ctx.guild);
    }

    const validation = validatePlan(plan, snapshot);
    if (!validation.ok) {
      return {
        tool: "propose_server_plan",
        parameters: params,
        success: false,
        message: `This plan has problems:\n${validation.errors.map((e) => `• ${e}`).join("\n")}`,
      };
    }

    setPendingPlan(ctx.channelId, ctx.guild.id, plan);
    const risk = computePlanRisk(plan);

    return {
      tool: "propose_server_plan",
      parameters: params,
      success: true,
      message:
        `Here's the proposed structure:\n\n\`\`\`\n${renderPlanTree(plan)}\n\`\`\`\n\n` +
        `${renderPlanSummary(plan, snapshot)}\n` +
        `Calculated risk: ${risk}\n\n` +
        `Ask me to change anything, or say "build it" to proceed.`,
      data: { plan, risk },
    };
  },
});

function normalizeChannel(channel: PlannedChannel): PlannedChannel {
  return { name: channel.name, kind: channel.kind ?? "text", private: channel.private, topic: channel.topic };
}
