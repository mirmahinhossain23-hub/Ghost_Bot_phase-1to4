import type { ActionTarget, ToolCall } from "@ghost/shared";

const TARGET_PARAM_MAP: Array<{ param: string; type: ActionTarget["type"] }> = [
  { param: "identifier", type: "member" },
  { param: "userId", type: "member" },
  { param: "roleName", type: "role" },
  { param: "referenceRoleName", type: "role" },
  { param: "channelName", type: "channel" },
  { param: "categoryName", type: "category" },
  { param: "scopeCategoryName", type: "category" },
  { param: "matchCategoryName", type: "category" },
];

/**
 * Pulls a human-readable "what did this touch" list out of a tool
 * call's parameters, for the audit log. This is pattern-matching on
 * common parameter names, not true semantic understanding — it's
 * meant to make history readable and searchable, not to be a perfect
 * record. Multiple matches are all kept (e.g. add_role_to_member
 * targets both a member and a role).
 */
export function extractTargets(call: ToolCall): ActionTarget[] {
  const targets: ActionTarget[] = [];
  for (const { param, type } of TARGET_PARAM_MAP) {
    const value = call.parameters[param];
    if (typeof value === "string" && value.trim()) {
      targets.push({ type, label: value.trim() });
    }
  }
  return targets;
}
