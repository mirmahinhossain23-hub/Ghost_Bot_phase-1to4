export type RecentEntityType = "role" | "channel" | "category" | "member";

export interface RecentEntity {
  type: RecentEntityType;
  id: string;
  name: string;
  timestamp: number;
}

const CONTEXT_TTL_MS = 10 * 60 * 1000; // 10 minutes — long enough for a natural back-and-forth, short enough to avoid stale surprises
const recentByChannel = new Map<string, RecentEntity>();

export function rememberEntity(channelId: string, entity: Omit<RecentEntity, "timestamp">): void {
  recentByChannel.set(channelId, { ...entity, timestamp: Date.now() });
}

export function recallEntity(channelId: string): RecentEntity | undefined {
  const entry = recentByChannel.get(channelId);
  if (!entry) return undefined;
  if (Date.now() - entry.timestamp > CONTEXT_TTL_MS) {
    recentByChannel.delete(channelId);
    return undefined;
  }
  return entry;
}
