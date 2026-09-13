import type { Guild, GuildMember } from "discord.js";
import type { ResolveResult } from "./resolve.js";

export type MemberResolution = ResolveResult<GuildMember>;

/**
 * Resolves a member from whatever the AI/user gave us: a raw Discord
 * ID, a "<@id>" / "<@!id>" mention, or a username/display-name
 * substring.
 *
 * IDs and mentions are unambiguous by definition and always win
 * immediately. Name-based lookups can genuinely match more than one
 * person (two "Alex"es in the same server) — callers MUST handle the
 * "ambiguous" case by asking the user to pick, never by grabbing the
 * first result.
 */
export async function resolveMember(guild: Guild, identifier: string): Promise<MemberResolution> {
  const trimmed = identifier.trim();

  const mentionMatch = trimmed.match(/^<@!?(\d+)>$/);
  const rawId = mentionMatch ? mentionMatch[1] : /^\d{15,25}$/.test(trimmed) ? trimmed : null;

  if (rawId) {
    const byId = await guild.members.fetch(rawId).catch(() => null);
    return byId ? { status: "found", item: byId } : { status: "not_found" };
  }

  const needle = trimmed.replace(/^@/, "").toLowerCase();
  if (!needle) return { status: "not_found" };

  // Exact (case-insensitive) match against the live cache first.
  const exactCached = guild.members.cache.filter(
    (m) => m.user.username.toLowerCase() === needle || m.displayName.toLowerCase() === needle
  );
  if (exactCached.size === 1) return { status: "found", item: exactCached.first()! };
  if (exactCached.size > 1) return { status: "ambiguous", candidates: [...exactCached.values()] };

  // Fall back to Discord's own server-side prefix search for
  // uncached members. If it returns more than one plausible match,
  // that's ambiguous too — never assume the first result is "the" one.
  const results = await guild.members.fetch({ query: needle, limit: 10 }).catch(() => null);
  if (!results || results.size === 0) return { status: "not_found" };
  if (results.size === 1) return { status: "found", item: results.first()! };
  return { status: "ambiguous", candidates: [...results.values()] };
}

/** Short "Tag (id)" label used in ambiguity clarification messages. */
export function describeMember(member: GuildMember): string {
  return `${member.user.tag} (${member.id})`;
}

