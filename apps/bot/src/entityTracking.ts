import type { ToolResult } from "@ghost/shared";
import type { RecentEntity } from "./conversationContext.js";

const ROLE_TOOLS = new Set(["create_role", "rename_role", "edit_role"]);

export function extractPrimaryEntity(result: ToolResult): Omit<RecentEntity, "timestamp"> | undefined {
  if (!result.success || !result.data || typeof result.data !== "object") return undefined;
  const data = result.data as Record<string, unknown>;

  if (ROLE_TOOLS.has(result.tool)) {
    const id = data.id ?? data.roleId;
    const name = data.name ?? data.newName;
    if (typeof id === "string" && typeof name === "string") return { type: "role", id, name };
    return undefined;
  }

  if (result.tool === "create_category") {
    return typeof data.id === "string" && typeof data.name === "string"
      ? { type: "category", id: data.id, name: data.name }
      : undefined;
  }

  if (result.tool === "create_channel") {
    return typeof data.id === "string" && typeof data.name === "string"
      ? { type: "channel", id: data.id, name: data.name }
      : undefined;
  }

  if (result.tool === "get_member_info" || result.tool === "get_moderation_target_info") {
    return typeof data.id === "string" && typeof data.tag === "string"
      ? { type: "member", id: data.id, name: data.tag }
      : undefined;
  }

  return undefined;
}
