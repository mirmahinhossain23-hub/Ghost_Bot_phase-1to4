import type { RiskLevel, ToolDefinition } from "@ghost/shared";

const RISK_ORDER: RiskLevel[] = ["low", "medium", "high", "critical"];

/**
 * A tool's baseline risk. If the tool didn't declare one explicitly,
 * we fall back to a sensible default purely from whether it mutates
 * anything — read-only tools are "low", everyday changes are
 * "medium". Tools whose real-world impact doesn't match that default
 * (bans, permission edits, bulk operations, ...) set `baseRisk`
 * explicitly on their definition.
 */
export function getBaseRisk(definition: ToolDefinition): RiskLevel {
  if (definition.baseRisk) return definition.baseRisk;
  return definition.mutating ? "medium" : "low";
}

/** Highest risk among a set — used when a batch of calls has mixed risk levels. */
export function maxRisk(levels: RiskLevel[]): RiskLevel {
  let highest: RiskLevel = "low";
  for (const level of levels) {
    if (RISK_ORDER.indexOf(level) > RISK_ORDER.indexOf(highest)) highest = level;
  }
  return highest;
}

export function isAtLeast(level: RiskLevel, threshold: RiskLevel): boolean {
  return RISK_ORDER.indexOf(level) >= RISK_ORDER.indexOf(threshold);
}
