import { ChannelType, type Guild } from "discord.js";
import { detectCategoryWrapper } from "../styleEngine.js";

export type ServerState = "empty" | "partial" | "established";

export interface ServerSnapshot {
  state: ServerState;
  categoryCount: number;
  channelCount: number;
  roleCount: number;
}

/**
 * Classifies how "built out" a server already is, used to decide
 * whether a CREATE request needs to pause and ask about strategy
 * instead of silently building on top of something real.
 */
export function assessServerState(guild: Guild): ServerSnapshot {
  const categoryCount = guild.channels.cache.filter((c) => c.type === ChannelType.GuildCategory).size;
  const channelCount = guild.channels.cache.filter((c) => c.type !== ChannelType.GuildCategory).size;
  const roleCount = guild.roles.cache.size - 1; // exclude @everyone

  let state: ServerState;
  if (categoryCount === 0 && channelCount <= 2) {
    state = "empty";
  } else if (categoryCount <= 2 && channelCount <= 8) {
    state = "partial";
  } else {
    state = "established";
  }

  return { state, categoryCount, channelCount, roleCount };
}

export interface ServerAnalysis {
  findings: string[];
  recommendations: string[];
}

/**
 * Read-only structural analysis: orphaned channels, inconsistent
 * naming, overlapping categories, unused roles. Heuristic, not a
 * claim of perfect judgment — it's meant to surface real, checkable
 * observations a human can act on, not to auto-fix anything.
 */
export function analyzeServer(guild: Guild): ServerAnalysis {
  const findings: string[] = [];
  const recommendations: string[] = [];

  const allChannels = [...guild.channels.cache.values()].filter((c) => c.type !== ChannelType.GuildCategory);
  const categories = [...guild.channels.cache.values()].filter((c) => c.type === ChannelType.GuildCategory);

  // Orphaned channels (no category)
  const orphaned = allChannels.filter((c) => !c.parentId);
  if (orphaned.length > 0) {
    findings.push(`${orphaned.length} channel${orphaned.length === 1 ? " is" : "s are"} outside any category.`);
    recommendations.push("Move orphaned channels into an appropriate category.");
  }

  // Naming consistency: for each category, do its channels share ONE convention?
  const inconsistentCategories: string[] = [];
  for (const category of categories) {
    const childNames = allChannels.filter((c) => c.parentId === category.id).map((c) => c.name);
    if (childNames.length < 2) continue;
    const withDecoration = childNames.filter((n) => /^[^\p{L}\p{N}]/u.test(n)).length;
    // If some channels are decorated and some aren't, that's inconsistent.
    if (withDecoration > 0 && withDecoration < childNames.length) {
      inconsistentCategories.push(category.name);
    }
  }
  if (inconsistentCategories.length > 0) {
    findings.push(`Naming conventions are inconsistent within: ${inconsistentCategories.join(", ")}.`);
    recommendations.push("Apply a consistent naming convention (Ghost's restyle_names tool can do this in one step).");
  }

  // Overlapping categories: significant shared "core words" between two category names.
  const categoryWords = categories.map((c) => ({ name: c.name, words: stripToWords(c.name) }));
  const overlapPairs: string[] = [];
  for (let i = 0; i < categoryWords.length; i++) {
    for (let j = i + 1; j < categoryWords.length; j++) {
      const a = categoryWords[i].words;
      const b = categoryWords[j].words;
      const shared = a.filter((word) => b.includes(word));
      if (shared.length > 0 && (shared.length >= a.length || shared.length >= b.length)) {
        overlapPairs.push(`${categoryWords[i].name} / ${categoryWords[j].name}`);
      }
    }
  }
  if (overlapPairs.length > 0) {
    findings.push(`${overlapPairs.length} pair(s) of categories have overlapping purposes: ${overlapPairs.join(", ")}.`);
    recommendations.push("Consider merging overlapping categories.");
  }

  // Unused roles: zero members, not managed (bot/integration) roles, not @everyone.
  const unusedRoles = guild.roles.cache.filter((r) => r.id !== guild.id && !r.managed && r.members.size === 0);
  if (unusedRoles.size > 0) {
    findings.push(
      `${unusedRoles.size} role${unusedRoles.size === 1 ? "" : "s"} currently have no members: ${[...unusedRoles.values()].map((r) => r.name).join(", ")}.`
    );
    recommendations.push("Review unused roles — keep, repurpose, or remove them.");
  }

  if (findings.length === 0) {
    findings.push("No structural issues found — categories, naming, and roles all look consistent.");
  }

  return { findings, recommendations };
}

function stripToWords(name: string): string[] {
  const wrapper = detectCategoryWrapper(name);
  const core = name.slice(wrapper.prefix.length, name.length - wrapper.suffix.length);
  return core
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter(Boolean);
}
