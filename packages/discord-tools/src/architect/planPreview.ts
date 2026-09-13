import type { ServerPlan } from "./planModel.js";
import { countPlanOperations } from "./planModel.js";
import type { ServerSnapshot } from "./serverInspection.js";

export function renderPlanTree(plan: ServerPlan): string {
  const lines: string[] = [];

  for (const category of plan.categories) {
    lines.push(category.name.toUpperCase());
    category.channels.forEach((channel, index) => {
      const isLast = index === category.channels.length - 1;
      const branch = isLast ? "└──" : "├──";
      const icon = channel.kind === "voice" ? "🔊" : "💬";
      lines.push(`${branch} ${icon} ${channel.name}${channel.private ? " (private)" : ""}`);
    });
    lines.push("");
  }

  if (plan.standaloneChannels.length > 0) {
    lines.push("(no category)");
    plan.standaloneChannels.forEach((channel, index) => {
      const isLast = index === plan.standaloneChannels.length - 1;
      const branch = isLast ? "└──" : "├──";
      const icon = channel.kind === "voice" ? "🔊" : "💬";
      lines.push(`${branch} ${icon} ${channel.name}${channel.private ? " (private)" : ""}`);
    });
    lines.push("");
  }

  if (plan.roles.length > 0) {
    lines.push("ROLES");
    lines.push(plan.roles.map((r) => r.name).join(", "));
  }

  return lines.join("\n").trim();
}

export function renderPlanSummary(plan: ServerPlan, existing: ServerSnapshot): string {
  const opCount = countPlanOperations(plan);
  const parts = [
    `Build mode: ${plan.mode}${plan.templateId ? ` (${plan.templateId})` : ""}`,
    `Existing-resource strategy: ${plan.existingStrategy}`,
    `Estimated operations: ${opCount}`,
    `Current server: ${existing.categoryCount} categories, ${existing.channelCount} channels, ${existing.roleCount} roles`,
  ];
  if (plan.notes) parts.push(`Notes: ${plan.notes}`);
  return parts.join("\n");
}
