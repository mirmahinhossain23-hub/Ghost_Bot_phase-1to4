import type { ToolCall, ToolResult } from "@ghost/shared";
import { getTool } from "./registry.js";
import type { ToolContext } from "./registry.js";
import { checkBotPermission, checkUserPermission } from "./permissions.js";
import { checkGlobalSafetyRules, validateParameters } from "./safety.js";

export type PreparedCall =
  | { status: "ready"; call: ToolCall; requiresConfirmation: boolean; toolLabel: string }
  | { status: "rejected"; call: ToolCall; reason: string };

/**
 * Runs everything EXCEPT the actual Discord mutation:
 *   unknown tool? -> reject
 *   bad parameters? -> reject
 *   user lacks permission? -> reject
 *   bot lacks permission? -> reject
 *   otherwise -> ready to run (flagged if it needs human confirmation first)
 *
 * The bot app calls this for every ToolCall the AI produced, BEFORE
 * showing anything to the user. Only calls that come back "ready" are
 * ever eligible to reach `runTool`.
 */
export function prepareToolCall(call: ToolCall, ctx: ToolContext): PreparedCall {
  const registered = getTool(call.tool);
  if (!registered) {
    return { status: "rejected", call, reason: `Ghost doesn't have a tool called "${call.tool}".` };
  }

  const { definition } = registered;

  const paramCheck = validateParameters(definition, call.parameters);
  if (!paramCheck.ok) return { status: "rejected", call, reason: paramCheck.reason! };

  const safetyCheck = checkGlobalSafetyRules(definition, call.parameters);
  if (!safetyCheck.ok) return { status: "rejected", call, reason: safetyCheck.reason! };

  const userCheck = checkUserPermission(definition, ctx);
  if (!userCheck.ok) return { status: "rejected", call, reason: userCheck.reason! };

  const botCheck = checkBotPermission(definition, ctx);
  if (!botCheck.ok) return { status: "rejected", call, reason: botCheck.reason! };

  return {
    status: "ready",
    call,
    requiresConfirmation: definition.requiresConfirmation,
    toolLabel: definition.name,
  };
}

/**
 * Actually executes a tool call. Only ever call this on a ToolCall that
 * `prepareToolCall` returned as "ready" for — and, if it was flagged
 * `requiresConfirmation`, only after the human clicked Confirm.
 */
export async function runTool(call: ToolCall, ctx: ToolContext): Promise<ToolResult> {
  const registered = getTool(call.tool);
  if (!registered) {
    return {
      tool: call.tool,
      parameters: call.parameters,
      success: false,
      message: `Unknown tool "${call.tool}".`,
    };
  }

  try {
    return await registered.handler(call.parameters, ctx);
  } catch (error) {
    return {
      tool: call.tool,
      parameters: call.parameters,
      success: false,
      message: `Something went wrong running "${call.tool}": ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }
}
