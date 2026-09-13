import type { ServerPlan } from "./planModel.js";

interface StoredPlan {
  guildId: string;
  plan: ServerPlan;
  updatedAt: number;
}

// Longer TTL than the general conversation-context hint (Phase 3) —
// designing a server plan is a genuine back-and-forth, not a quick
// pronoun reference, so it should survive a longer pause.
const PLAN_TTL_MS = 30 * 60 * 1000;

const plansByChannel = new Map<string, StoredPlan>();

export function setPendingPlan(channelId: string, guildId: string, plan: ServerPlan): void {
  plansByChannel.set(channelId, { guildId, plan, updatedAt: Date.now() });
}

export function getPendingPlan(channelId: string): ServerPlan | undefined {
  const entry = plansByChannel.get(channelId);
  if (!entry) return undefined;
  if (Date.now() - entry.updatedAt > PLAN_TTL_MS) {
    plansByChannel.delete(channelId);
    return undefined;
  }
  return entry.plan;
}

export function clearPendingPlan(channelId: string): void {
  plansByChannel.delete(channelId);
}
