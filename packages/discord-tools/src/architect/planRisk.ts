import type { RiskLevel } from "@ghost/shared";
import { countPlanOperations, type ServerPlan } from "./planModel.js";

// "Small ADD" vs "large reorganization" thresholds, per the risk table.
const MEDIUM_OP_THRESHOLD = 5;
const HIGH_OP_THRESHOLD = 20;

export function computePlanRisk(plan: ServerPlan): RiskLevel {
  if (plan.existingStrategy === "replace") return "critical";
  if (plan.existingStrategy === "reorganize") return "high";

  const opCount = countPlanOperations(plan);
  if (opCount > HIGH_OP_THRESHOLD) return "high";
  if (opCount > MEDIUM_OP_THRESHOLD) return "medium";
  return "low";
}
