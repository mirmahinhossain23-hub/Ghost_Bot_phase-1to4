/**
 * These types are the "contract" between the AI brain (packages/ai),
 * the thing that actually touches Discord (packages/discord-tools),
 * and the bot process that wires them together (apps/bot).
 *
 * The AI never touches discord.js directly. It can only ever produce
 * a list of ToolCall objects, which then get validated and executed.
 * This file is what makes that boundary type-safe.
 */

/** A single parameter accepted by a tool, described for the AI provider. */
export interface ToolParameterSchema {
  type: "string" | "number" | "boolean" | "array" | "object";
  description: string;
  enum?: string[];
  items?: ToolParameterSchema;
  /**
   * For type "object" (or an "array" of objects via `items`): the
   * shape of that object's fields. Optional — plain untyped objects
   * are still allowed for simple cases, but anything the Server
   * Architect hands the AI to fill in (nested categories/channels)
   * declares this so the AI actually knows the expected shape.
   */
  properties?: Record<string, ToolParameterSchema>;
  optional?: boolean;
}

/**
 * Every tool call gets classified into one of these, computed entirely
 * by our own code (never the AI) — see packages/discord-tools/src/risk.ts.
 * LOW: read-only inspection. MEDIUM: everyday single-item changes.
 * HIGH: permission/hierarchy-sensitive or "many items" changes.
 * CRITICAL: bans, mass moderation, large-scale structural deletion.
 */
export type RiskLevel = "low" | "medium" | "high" | "critical";

/** Static description of a tool the AI is allowed to request. */
export interface ToolDefinition {
  /** Unique machine name, e.g. "list_roles" */
  name: string;
  /** Human/AI-readable description of what it does and when to use it */
  description: string;
  /** JSON-schema-ish description of accepted parameters */
  parameters: Record<string, ToolParameterSchema>;
  /** Whether this tool changes server state (true) or only reads it (false) */
  mutating: boolean;
  /** Whether this tool is destructive enough to always require human confirmation */
  requiresConfirmation: boolean;
  /**
   * Discord permission flag (e.g. "ManageRoles", "Administrator") the
   * REQUESTING human must hold for Ghost to even consider this tool.
   * Omit for read-only tools that anyone can trigger.
   */
  requiredUserPermission?: string;
  /**
   * Discord permission flag Ghost's own bot role must hold to execute
   * this tool. Omit for read-only tools.
   */
  requiredBotPermission?: string;
  /**
   * Baseline risk for this tool when nothing about the specific call
   * changes it. Omit to fall back to a sensible default (low for
   * read-only tools, medium for mutating ones) — only set this when
   * the tool's real-world impact doesn't match that default (e.g.
   * ban_member is always "critical" regardless of parameters). A
   * tool's `preview()` can still override this per-call when the risk
   * genuinely depends on runtime data (how many items, how long a
   * timeout is, etc).
   */
  baseRisk?: RiskLevel;
}

/** One concrete invocation of a tool, as requested by the AI. */
export interface ToolCall {
  tool: string;
  parameters: Record<string, unknown>;
}

/** Result of actually running a ToolCall against Discord. */
export interface ToolResult {
  tool: string;
  parameters: Record<string, unknown>;
  success: boolean;
  message: string;
  data?: unknown;
  /**
   * Best-effort recovery info captured before a destructive change
   * (e.g. a deleted role's color/permissions/position). This is the
   * FOUNDATION for a future "Ghost, undo that" — no undo command
   * exists yet, and not everything is perfectly reconstructable, so
   * this is never presented to users as a guarantee.
   */
  snapshot?: Record<string, unknown>;
}

/** Outcome of running a ToolCall through the validator, before execution. */
export interface ValidationResult {
  ok: boolean;
  reason?: string;
}

/** The full context a tool executor needs to safely act in a guild. */
export interface ExecutionContext {
  guildId: string;
  /** Discord user id of the human who asked Ghost to do this */
  requestedByUserId: string;
}

/** Staff roles referenced by the wider Ghost project (web panel, etc). */
export type StaffTier = "Founder" | "Admin" | "Mod" | "EventStaff";

/** A human-readable pointer to something a logged action affected. */
export interface ActionTarget {
  type: "member" | "role" | "channel" | "category";
  label: string;
}

/** A single logged action, mirrors the Prisma ActionLog model. */
export interface ActionLogEntry {
  id: string;
  /** Short, shareable ID like "GST-8F4K2" — shown to users for support/reference. */
  actionCode: string;
  guildId: string;
  requestedByUserId: string;
  tool: string;
  parameters: Record<string, unknown>;
  targets: ActionTarget[];
  riskLevel: RiskLevel;
  requiredConfirmation: boolean;
  success: boolean;
  message: string;
  snapshot?: Record<string, unknown>;
  createdAt: Date;
}
