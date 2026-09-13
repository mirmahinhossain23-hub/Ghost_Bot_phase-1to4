import type { StylePresetName } from "../styleEngine.js";

export type BuildMode = "create" | "add" | "reorganize" | "template" | "custom";

/** How to treat resources that already exist in the server. */
export type ExistingStrategy = "preserve" | "reorganize" | "replace";

export type PlannedChannelKind = "text" | "voice";

export interface PlannedChannel {
  name: string;
  kind: PlannedChannelKind;
  private?: boolean;
  topic?: string;
}

export interface PlannedCategory {
  name: string;
  channels: PlannedChannel[];
}

export interface PlannedRole {
  name: string;
  color?: string;
}

/**
 * The full internal plan. The AI (or a template) produces this shape;
 * it never produces raw create_channel/create_role calls directly for
 * a build. The backend is the only thing that turns this into actual
 * Discord operations, after validation and risk analysis.
 */
export interface ServerPlan {
  mode: BuildMode;
  /** Which template this came from, if mode is "template". */
  templateId?: string;
  style?: StylePresetName | "existing";
  existingStrategy: ExistingStrategy;
  categories: PlannedCategory[];
  standaloneChannels: PlannedChannel[];
  roles: PlannedRole[];
  /** Short rationale from the AI, shown in the preview. */
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

export function createEmptyPlan(mode: BuildMode): ServerPlan {
  const now = Date.now();
  return {
    mode,
    existingStrategy: "preserve",
    categories: [],
    standaloneChannels: [],
    roles: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function countPlanOperations(plan: ServerPlan): number {
  const channelCount =
    plan.categories.reduce((sum, c) => sum + c.channels.length, 0) + plan.standaloneChannels.length;
  return plan.categories.length + channelCount + plan.roles.length;
}
