import type { ToolResult } from "@ghost/shared";

const DISCORD_MESSAGE_LIMIT = 1900; // leave headroom under Discord's 2000 char cap

export function formatToolResult(result: ToolResult): string {
  if (!result.success) {
    return `⚠️ **${result.tool}** — ${result.message}`;
  }

  switch (result.tool) {
    case "list_roles":
      return formatRoleList(result);
    case "list_channels":
      return formatChannelList(result);
    case "list_members":
    case "search_members":
      return formatMemberList(result);
    case "list_bans":
      return formatBanList(result);
    default:
      return result.message;
  }
}

function formatRoleList(result: ToolResult): string {
  const roles = (result.data as Array<{ name: string; memberCount: number; color: string }>) ?? [];
  if (roles.length === 0) return "No roles found (besides @everyone).";

  const lines = roles.map(
    (role) => `• **${role.name}** — ${role.memberCount} member${role.memberCount === 1 ? "" : "s"} (${role.color})`
  );

  return truncate([`**Roles (${roles.length})**`, ...lines].join("\n"));
}

function formatChannelList(result: ToolResult): string {
  const data = result.data as {
    categories: Array<{ category: string; channels: Array<{ name: string; type: string }> }>;
    uncategorized: Array<{ name: string; type: string }>;
  };

  const lines: string[] = [];

  for (const category of data.categories) {
    lines.push(`**${category.category}**`);
    for (const channel of category.channels) {
      lines.push(`  • ${channelIcon(channel.type)} ${channel.name}`);
    }
  }

  if (data.uncategorized.length > 0) {
    lines.push(`**(No category)**`);
    for (const channel of data.uncategorized) {
      lines.push(`  • ${channelIcon(channel.type)} ${channel.name}`);
    }
  }

  return truncate(lines.join("\n"));
}

function channelIcon(type: string): string {
  if (type.includes("Voice")) return "🔊";
  if (type.includes("Forum")) return "🗂️";
  return "💬";
}

function formatMemberList(result: ToolResult): string {
  const data = result.data as
    | { total: number; shown: number; members: Array<{ tag: string; roleCount: number }> }
    | Array<{ tag: string; roleCount: number }>;

  const members = Array.isArray(data) ? data : data.members;
  if (members.length === 0) return result.message;

  const lines = members.map((m) => `• **${m.tag}** — ${m.roleCount} role${m.roleCount === 1 ? "" : "s"}`);
  return truncate([result.message, "", ...lines].join("\n"));
}

function truncate(text: string): string {
  if (text.length <= DISCORD_MESSAGE_LIMIT) return text;
  return text.slice(0, DISCORD_MESSAGE_LIMIT) + "\n… (truncated)";
}

function formatBanList(result: ToolResult): string {
  const data = result.data as { total: number; bans: Array<{ tag: string; reason: string | null }> };
  if (!data.bans.length) return result.message;

  const lines = data.bans.map((b) => `• **${b.tag}**${b.reason ? ` — ${b.reason}` : ""}`);
  return truncate([result.message, "", ...lines].join("\n"));
}
