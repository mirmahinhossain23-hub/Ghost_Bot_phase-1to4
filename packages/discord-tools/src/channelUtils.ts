import { ChannelType, type GuildBasedChannel } from "discord.js";

/**
 * Captures enough about a channel to (eventually) help reconstruct it.
 * This is honestly-scoped: it's the foundation for a future "undo",
 * not a guarantee — some settings (message history, webhooks, thread
 * state) can never be restored regardless of what we save here.
 */
export function buildChannelSnapshot(channel: GuildBasedChannel): Record<string, unknown> {
  const hasOverwrites = "permissionOverwrites" in channel;
  return {
    id: channel.id,
    name: channel.name,
    type: ChannelType[channel.type],
    categoryId: channel.parentId,
    categoryName: channel.parent?.name ?? null,
    position: "position" in channel ? channel.position : null,
    topic: "topic" in channel ? (channel as { topic?: string | null }).topic ?? null : null,
    permissionOverwrites: hasOverwrites
      ? [...channel.permissionOverwrites.cache.values()].map((overwrite) => ({
          id: overwrite.id,
          type: overwrite.type,
          allow: overwrite.allow.bitfield.toString(),
          deny: overwrite.deny.bitfield.toString(),
        }))
      : [],
    deletedAt: new Date().toISOString(),
  };
}

/**
 * Discord's real, current channel-naming rules (this matters — get it
 * wrong and renames either get silently mangled or rejected):
 *   - Categories and voice/stage channels: full Unicode, spaces, and
 *     UPPERCASE are all allowed.
 *   - Text and forum/announcement channels: NO literal spaces and NO
 *     uppercase Latin letters. Discord still allows most other Unicode
 *     (emoji, symbols, non-Latin scripts) — it's specifically ASCII
 *     capitals and the space character that get rejected/mangled.
 * Every tool that renames a text-like channel runs the name through
 * `sanitizeTextChannelName` first so we never send Discord something
 * it will bounce.
 */
export function isTextLikeChannel(type: ChannelType): boolean {
  return (
    type === ChannelType.GuildText ||
    type === ChannelType.GuildAnnouncement ||
    type === ChannelType.GuildForum
  );
}

export function isVoiceLikeChannel(type: ChannelType): boolean {
  return type === ChannelType.GuildVoice || type === ChannelType.GuildStageVoice;
}

export function sanitizeTextChannelName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .slice(0, 100);
}

/**
 * Strips any leading decoration (emoji, separators, symbols) off a
 * channel/category name to recover the "plain" core words. Used so
 * re-styling an already-styled name doesn't stack decorations on top
 * of each other.
 */
export function extractCoreName(name: string): string {
  const stripped = name.replace(/^[^\p{L}\p{N}]+/u, "").replace(/[^\p{L}\p{N}]+$/u, "");
  return stripped.trim() || name.trim();
}

/**
 * Matches a channel/category's stored name against a plain-language
 * query, tolerating the fact that Ghost's own styling may have added
 * decoration (icons, wrapper symbols) on top of whatever someone would
 * naturally type. Tries an exact match first, then falls back to
 * comparing "core" names with decoration stripped from both sides —
 * so a request for "Information" still finds "✦ INFORMATION ✦" after
 * Ghost has styled it.
 */
export function nameMatches(actualName: string, query: string): boolean {
  const a = actualName.trim().toLowerCase();
  const q = query.trim().toLowerCase();
  if (a === q) return true;
  return extractCoreName(actualName).toLowerCase() === extractCoreName(query).toLowerCase();
}

const ICON_RULES: Array<{ keywords: string[]; icon: string }> = [
  { keywords: ["announce", "news", "update"], icon: "📢" },
  { keywords: ["rule"], icon: "📜" },
  { keywords: ["welcome", "intro"], icon: "👋" },
  { keywords: ["general", "chat", "lounge", "talk"], icon: "💬" },
  { keywords: ["dev", "code", "programming", "engineering"], icon: "💻" },
  { keywords: ["bug", "issue", "error"], icon: "🐛" },
  { keywords: ["design", "art", "ui", "ux"], icon: "🎨" },
  { keywords: ["media", "gallery", "screenshot", "clip"], icon: "🖼️" },
  { keywords: ["suggestion", "feedback", "idea"], icon: "💡" },
  { keywords: ["support", "help", "ticket"], icon: "🎫" },
  { keywords: ["log", "audit"], icon: "📝" },
  { keywords: ["staff", "admin", "mod", "team"], icon: "🛡️" },
  { keywords: ["event"], icon: "🎉" },
  { keywords: ["resource", "link", "guide"], icon: "🔗" },
  { keywords: ["music", "song"], icon: "🎵" },
  { keywords: ["voice", "vc", "call"], icon: "🔊" },
  { keywords: ["client", "commission"], icon: "🤝" },
];

/** Picks a reasonable icon for a channel based on its (core) name and type. */
export function iconForChannel(coreName: string, type: ChannelType): string {
  const lower = coreName.toLowerCase();
  for (const rule of ICON_RULES) {
    if (rule.keywords.some((keyword) => lower.includes(keyword))) {
      return rule.icon;
    }
  }
  if (isVoiceLikeChannel(type)) return "🔊";
  if (type === ChannelType.GuildForum) return "🗂️";
  return "💬";
}

/** True for the channel kinds Ghost's channel tools are allowed to touch. */
export function isManageableChannel(channel: GuildBasedChannel): boolean {
  return (
    channel.type === ChannelType.GuildText ||
    channel.type === ChannelType.GuildAnnouncement ||
    channel.type === ChannelType.GuildForum ||
    channel.type === ChannelType.GuildVoice ||
    channel.type === ChannelType.GuildStageVoice
  );
}
