import { ChannelType, type Guild } from "discord.js";
import {
  detectCategoryWrapper,
  detectChannelConvention,
  styleCategoryName,
  styleChannelName,
  STYLE_PRESETS,
  type StyleConvention,
  type StylePresetName,
} from "../styleEngine.js";
import type { PlannedChannelKind, ServerPlan } from "./planModel.js";

function toChannelType(kind: PlannedChannelKind): ChannelType {
  return kind === "voice" ? ChannelType.GuildVoice : ChannelType.GuildText;
}

/**
 * Finds the most-decorated existing category in the guild to derive a
 * "match the existing style" convention from — used when a plan asks
 * for style "existing" (ADD/REORGANIZE modes only; there's nothing to
 * derive from on an empty server).
 */
function deriveExistingConvention(guild: Guild): StyleConvention | undefined {
  const categories = [...guild.channels.cache.values()].filter((c) => c.type === ChannelType.GuildCategory);
  if (categories.length === 0) return undefined;

  // Heuristic: the category with the most non-alphanumeric wrapper
  // characters is probably the intentionally-styled one.
  let best: { name: string; id: string; decorationLength: number } | undefined;
  for (const category of categories) {
    const wrapper = detectCategoryWrapper(category.name);
    const decorationLength = wrapper.prefix.length + wrapper.suffix.length;
    if (!best || decorationLength > best.decorationLength) {
      best = { name: category.name, id: category.id, decorationLength };
    }
  }
  if (!best || best.decorationLength === 0) return undefined;

  const wrapper = detectCategoryWrapper(best.name);
  const sampleNames = [...guild.channels.cache.values()]
    .filter((c) => c.parentId === best!.id)
    .map((c) => c.name);
  const channelConvention = detectChannelConvention(sampleNames);

  return { wrapper, channel: channelConvention };
}

/**
 * Returns a new plan with every category/channel name run through the
 * chosen style. Pure with respect to the plan (doesn't mutate the
 * input) — only reads the guild when style is "existing".
 */
export function applyStyleToPlan(plan: ServerPlan, guild: Guild): ServerPlan {
  if (!plan.style) return plan;

  let convention: StyleConvention | undefined;

  if (plan.style === "existing") {
    convention = deriveExistingConvention(guild);
    if (!convention) return plan; // nothing stylable found — leave names as given
  } else {
    convention = STYLE_PRESETS[plan.style as StylePresetName];
  }

  if (!convention) return plan;
  const { wrapper, channel: channelConvention } = convention;

  return {
    ...plan,
    categories: plan.categories.map((category) => ({
      name: styleCategoryName(category.name, wrapper),
      channels: category.channels.map((channel) => ({
        ...channel,
        name: styleChannelName(channel.name, toChannelType(channel.kind), wrapper, channelConvention),
      })),
    })),
    standaloneChannels: plan.standaloneChannels.map((channel) => ({
      ...channel,
      name: styleChannelName(channel.name, toChannelType(channel.kind), wrapper, channelConvention),
    })),
  };
}
