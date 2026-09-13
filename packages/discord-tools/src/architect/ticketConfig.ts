import { ChannelType } from "discord.js";
import type { ToolContext } from "../registry.js";
import { nameMatches } from "../channelUtils.js";

export interface TicketType {
  label: string;
  staffRoleName: string;
}

export interface TicketConfig {
  categoryName: string;
  panelChannelName: string;
  ticketTypes: TicketType[];
}

export interface TicketSetupResult {
  ok: boolean;
  error?: string;
  categoryId?: string;
  panelChannelId?: string;
}

/**
 * Creates the real scaffolding a ticket system needs (a category and a
 * panel channel, with staff roles validated to actually exist) and
 * returns what was created so the caller can persist it.
 *
 * Deliberately does NOT post a message with "Open Ticket" buttons —
 * buttons with no interaction handler behind them are exactly the
 * "decorative fake UI" the spec says not to build. The interactive
 * click-to-open-a-private-channel flow is real future work, not
 * simulated here.
 */
export async function setUpTicketScaffolding(config: TicketConfig, ctx: ToolContext): Promise<TicketSetupResult> {
  for (const type of config.ticketTypes) {
    const role = ctx.guild.roles.cache.find((r) => r.name.toLowerCase() === type.staffRoleName.toLowerCase());
    if (!role) {
      return { ok: false, error: `I couldn't find a role called "${type.staffRoleName}" for ticket type "${type.label}".` };
    }
  }

  let category = ctx.guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildCategory && nameMatches(c.name, config.categoryName)
  );
  if (!category) {
    category = await ctx.guild.channels.create({
      name: config.categoryName,
      type: ChannelType.GuildCategory,
      reason: "Ticket system category created by Ghost's Server Architect",
    });
  }

  let panelChannel = ctx.guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildText && nameMatches(c.name, config.panelChannelName) && c.parentId === category!.id
  );
  if (!panelChannel) {
    panelChannel = await ctx.guild.channels.create({
      name: config.panelChannelName,
      type: ChannelType.GuildText,
      parent: category.id,
      topic: "Ticket panel — configuration is set up, but the interactive open-a-ticket flow isn't built yet.",
      permissionOverwrites: [{ id: ctx.guild.id, deny: ["SendMessages"] }],
      reason: "Ticket panel channel created by Ghost's Server Architect",
    });
  }

  return { ok: true, categoryId: category.id, panelChannelId: panelChannel.id };
}
