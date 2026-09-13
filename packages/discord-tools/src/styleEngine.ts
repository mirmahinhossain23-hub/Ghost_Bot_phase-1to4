import { ChannelType, type Guild } from "discord.js";
import {
  extractCoreName,
  iconForChannel,
  isTextLikeChannel,
  isVoiceLikeChannel,
  nameMatches,
  sanitizeTextChannelName,
} from "./channelUtils.js";

export type StylePresetName = "minimal" | "modern" | "premium" | "futuristic" | "gaming" | "developer";

export interface StyleWrapper {
  prefix: string;
  suffix: string;
  uppercase: boolean;
}

export interface ChannelConvention {
  separator: string;
  useIcon: boolean;
}

export interface StyleConvention {
  wrapper: StyleWrapper;
  channel: ChannelConvention;
}

export const STYLE_PRESETS: Record<StylePresetName, StyleConvention> = {
  minimal: {
    wrapper: { prefix: "", suffix: "", uppercase: false },
    channel: { separator: "-", useIcon: false },
  },
  modern: {
    wrapper: { prefix: "━━ ", suffix: " ━━", uppercase: true },
    channel: { separator: "-", useIcon: false },
  },
  premium: {
    wrapper: { prefix: "✦ ", suffix: " ✦", uppercase: true },
    channel: { separator: "・", useIcon: true },
  },
  futuristic: {
    wrapper: { prefix: "╭・", suffix: "", uppercase: true },
    channel: { separator: "・", useIcon: true },
  },
  gaming: {
    wrapper: { prefix: "🎮・", suffix: "", uppercase: true },
    channel: { separator: "・", useIcon: true },
  },
  developer: {
    wrapper: { prefix: "⌁ ", suffix: "", uppercase: true },
    channel: { separator: "・", useIcon: true },
  },
};

export const STYLE_PRESET_NAMES = Object.keys(STYLE_PRESETS) as StylePresetName[];

export interface StylePlanEntry {
  id: string;
  kind: "category" | "channel";
  before: string;
  after: string;
}

export interface StylePlanOptions {
  mode: "preset" | "match_category";
  presetName?: StylePresetName;
  matchCategoryName?: string;
  scope: "category" | "server";
  scopeCategoryName?: string;
  includeCategoryNames: boolean;
}

export interface StylePlanResult {
  plan: StylePlanEntry[];
  error?: string;
}

/** Detects the wrapper (prefix/suffix/case) a category name is using, e.g. "✦ INFO ✦" -> prefix "✦ ", suffix " ✦". */
export function detectCategoryWrapper(name: string): StyleWrapper {
  const trimmed = name.trim();
  const letterIndexes: number[] = [];
  for (let i = 0; i < trimmed.length; i++) {
    if (/[\p{L}\p{N}]/u.test(trimmed[i])) letterIndexes.push(i);
  }

  if (letterIndexes.length === 0) {
    return { prefix: "", suffix: "", uppercase: false };
  }

  const first = letterIndexes[0];
  const last = letterIndexes[letterIndexes.length - 1];
  const core = trimmed.slice(first, last + 1);

  return {
    prefix: trimmed.slice(0, first),
    suffix: trimmed.slice(last + 1),
    uppercase: core === core.toUpperCase() && core !== core.toLowerCase(),
  };
}

/** Detects the separator/icon convention a set of channel names is using. */
export function detectChannelConvention(sampleNames: string[]): ChannelConvention {
  const candidateSeparators = ["・", "│", "|", "·", "•", ">", ":", "-"];

  for (const separator of candidateSeparators) {
    const withSeparator = sampleNames.filter((name) => name.includes(separator));
    if (withSeparator.length >= Math.max(1, Math.ceil(sampleNames.length / 2))) {
      const useIcon = withSeparator.some((name) => {
        const before = name.split(separator)[0] ?? "";
        return /\p{Extended_Pictographic}/u.test(before);
      });
      return { separator, useIcon };
    }
  }

  return { separator: "-", useIcon: false };
}

/** Applies a wrapper style to a category name. Pure — works for existing OR brand-new (not-yet-created) names. */
export function styleCategoryName(rawName: string, wrapper: StyleWrapper): string {
  const core = extractCoreName(rawName);
  const styledCore = wrapper.uppercase ? core.toUpperCase() : core;
  return `${wrapper.prefix}${styledCore}${wrapper.suffix}`.trim().slice(0, 100);
}

/** Applies a wrapper+convention style to a channel name, respecting Discord's per-type naming rules. Pure. */
export function styleChannelName(
  rawName: string,
  type: ChannelType,
  wrapper: StyleWrapper,
  convention: ChannelConvention
): string {
  const core = extractCoreName(rawName);
  const icon = convention.useIcon ? iconForChannel(core, type) : "";
  const decoration = icon ? `${icon}${convention.separator}` : "";

  if (isTextLikeChannel(type)) {
    return sanitizeTextChannelName(`${decoration}${core}`);
  }
  if (isVoiceLikeChannel(type)) {
    const styledCore = wrapper.uppercase ? core.toUpperCase() : core;
    return `${decoration}${styledCore}`.trim().slice(0, 100);
  }
  return rawName;
}

function styleCategoryEntry(category: { id: string; name: string }, wrapper: StyleWrapper): StylePlanEntry | null {
  const after = styleCategoryName(category.name, wrapper);
  if (after === category.name) return null;
  return { id: category.id, kind: "category", before: category.name, after };
}

function styleChannelEntry(
  channel: { id: string; name: string; type: ChannelType },
  wrapper: StyleWrapper,
  convention: ChannelConvention
): StylePlanEntry | null {
  if (!isTextLikeChannel(channel.type) && !isVoiceLikeChannel(channel.type)) {
    return null; // category or unsupported type, handled elsewhere
  }
  const after = styleChannelName(channel.name, channel.type, wrapper, convention);
  if (after === channel.name) return null;
  return { id: channel.id, kind: "channel", before: channel.name, after };
}

export function computeStylePlan(guild: Guild, options: StylePlanOptions): StylePlanResult {
  let convention: StyleConvention;
  let excludeCategoryId: string | undefined;

  if (options.mode === "preset") {
    if (!options.presetName || !STYLE_PRESETS[options.presetName]) {
      return { plan: [], error: `Unknown style preset "${options.presetName}".` };
    }
    convention = STYLE_PRESETS[options.presetName];
  } else {
    if (!options.matchCategoryName) {
      return { plan: [], error: "matchCategoryName is required when mode is 'match_category'." };
    }
    const source = guild.channels.cache.find(
      (c) => c.type === ChannelType.GuildCategory && nameMatches(c.name, options.matchCategoryName!)
    );
    if (!source) {
      return { plan: [], error: `I couldn't find a category called "${options.matchCategoryName}" to copy the style from.` };
    }
    excludeCategoryId = source.id;
    const wrapper = detectCategoryWrapper(source.name);
    const sourceChannelNames = guild.channels.cache
      .filter((c) => c.parentId === source.id)
      .map((c) => c.name);
    const channelConvention = detectChannelConvention(sourceChannelNames);
    convention = { wrapper, channel: channelConvention };
  }

  const categories = guild.channels.cache.filter((c) => c.type === ChannelType.GuildCategory);

  let targetCategoryIds: Set<string>;
  if (options.scope === "server") {
    targetCategoryIds = new Set(
      categories.filter((c) => c.id !== excludeCategoryId).map((c) => c.id)
    );
  } else {
    if (!options.scopeCategoryName) {
      return { plan: [], error: "scopeCategoryName is required when scope is 'category'." };
    }
    const target = categories.find((c) => nameMatches(c.name, options.scopeCategoryName!));
    if (!target) {
      return { plan: [], error: `I couldn't find a category called "${options.scopeCategoryName}".` };
    }
    targetCategoryIds = new Set([target.id]);
  }

  const plan: StylePlanEntry[] = [];

  if (options.includeCategoryNames) {
    for (const categoryId of targetCategoryIds) {
      const category = guild.channels.cache.get(categoryId);
      if (!category) continue;
      const entry = styleCategoryEntry({ id: category.id, name: category.name }, convention.wrapper);
      if (entry) plan.push(entry);
    }
  }

  for (const channel of guild.channels.cache.values()) {
    if (!channel.parentId || !targetCategoryIds.has(channel.parentId)) continue;
    const entry = styleChannelEntry(
      { id: channel.id, name: channel.name, type: channel.type },
      convention.wrapper,
      convention.channel
    );
    if (entry) plan.push(entry);
  }

  return { plan };
}
