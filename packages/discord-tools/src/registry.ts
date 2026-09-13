import type { Guild, GuildMember } from "discord.js";
import type { RiskLevel, ToolDefinition, ToolResult } from "@ghost/shared";

/** Everything a tool handler needs to safely act inside one guild. */
export interface ToolContext {
  guild: Guild;
  /** The human who asked Ghost to do this. */
  requester: GuildMember;
  /** Ghost's own member object in this guild — used for hierarchy/permission checks. */
  bot: GuildMember;
  /** The channel this conversation is happening in — used by stateful tools like the Server Architect's pending plan. */
  channelId: string;
}

export type ToolHandler = (
  parameters: Record<string, unknown>,
  ctx: ToolContext
) => Promise<ToolResult>;

/** A rich, human-readable preview shown in the confirmation prompt. */
export interface ToolPreview {
  summary: string;
  /** Optional "before → after" style lines, rendered under the summary. */
  diffLines?: string[];
  /**
   * Overrides the tool's static baseRisk when the real risk depends on
   * this specific call (e.g. restyle_names affecting 40 channels vs 2,
   * or a 2-week timeout vs a 10-minute one). Omit to just use baseRisk.
   */
  risk?: RiskLevel;
}

export type ToolPreviewer = (
  parameters: Record<string, unknown>,
  ctx: ToolContext
) => Promise<ToolPreview>;

export interface RegisteredTool {
  definition: ToolDefinition;
  handler: ToolHandler;
  /** Optional: builds a richer confirmation preview than the raw parameters. */
  preview?: ToolPreviewer;
}

const registry = new Map<string, RegisteredTool>();

/** Called once per tool module at startup to add itself to the registry. */
export function registerTool(tool: RegisteredTool) {
  if (registry.has(tool.definition.name)) {
    throw new Error(`Tool "${tool.definition.name}" is already registered.`);
  }
  registry.set(tool.definition.name, tool);
}

export function getTool(name: string): RegisteredTool | undefined {
  return registry.get(name);
}

export function getAllToolDefinitions(): ToolDefinition[] {
  return Array.from(registry.values()).map((t) => t.definition);
}

export function getAllTools(): RegisteredTool[] {
  return Array.from(registry.values());
}
