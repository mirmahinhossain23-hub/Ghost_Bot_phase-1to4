import type { ToolCall } from "@ghost/shared";
import { extractTargets } from "./targets.js";

export interface PlanGuardResult {
  /** Calls that are internally consistent and safe to proceed with. */
  calls: ToolCall[];
  /** Calls rejected before validation even runs, with why. */
  rejected: Array<{ call: ToolCall; reason: string }>;
}

/**
 * The AI is a planner, not the authority — this is the first line of
 * defense against a bad plan, before anything reaches permission or
 * safety checks. Two things it catches:
 *
 *   1. Exact duplicate calls (the model asked for the same thing
 *      twice) — silently collapsed to one.
 *   2. Contradictory calls — e.g. `delete_role` and `rename_role` both
 *      targeting the same role in one turn. Never guess which one was
 *      "meant"; reject both and ask the user to clarify.
 */
export function guardPlan(calls: ToolCall[]): PlanGuardResult {
  const deduped = dedupe(calls);
  const conflicted = new Set<number>();

  for (let i = 0; i < deduped.length; i++) {
    for (let j = i + 1; j < deduped.length; j++) {
      const a = deduped[i];
      const b = deduped[j];
      const aIsDelete = a.tool.startsWith("delete_");
      const bIsDelete = b.tool.startsWith("delete_");
      if (!aIsDelete && !bIsDelete) continue; // only a delete vs. anything-else counts as contradictory

      const aTargets = extractTargets(a).map((t) => t.label.toLowerCase());
      const bTargets = extractTargets(b).map((t) => t.label.toLowerCase());
      if (aTargets.some((t) => bTargets.includes(t))) {
        conflicted.add(i);
        conflicted.add(j);
      }
    }
  }

  const survivors: ToolCall[] = [];
  const rejected: Array<{ call: ToolCall; reason: string }> = [];

  deduped.forEach((call, index) => {
    if (conflicted.has(index)) {
      rejected.push({
        call,
        reason:
          "This contradicts another action Ghost's plan included for the same target in this request " +
          "(e.g. deleting and editing the same thing). Neither will run — try asking for one at a time.",
      });
    } else {
      survivors.push(call);
    }
  });

  return { calls: survivors, rejected };
}

function dedupe(calls: ToolCall[]): ToolCall[] {
  const seen = new Set<string>();
  const result: ToolCall[] = [];
  for (const call of calls) {
    const key = `${call.tool}:${JSON.stringify(call.parameters)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(call);
  }
  return result;
}
