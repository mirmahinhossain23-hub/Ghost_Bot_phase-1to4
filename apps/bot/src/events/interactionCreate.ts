import { Events, type Client, type ButtonInteraction } from "discord.js";
import { PermissionsBitField } from "discord.js";
import { extractTargets, runTool, type ToolContext } from "@ghost/discord-tools";
import { logAction, setTicketConfig } from "@ghost/database";
import { createLogger } from "@ghost/shared";
import { deleteConfirmation, getConfirmation } from "../confirmation.js";
import { formatToolResult } from "../formatting.js";
import { rememberEntity } from "../conversationContext.js";
import { extractPrimaryEntity } from "../entityTracking.js";

const log = createLogger("interactionCreate");

export function registerInteractionCreate(client: Client) {
  client.on(Events.InteractionCreate, (interaction) => {
    if (!interaction.isButton()) return;
    handleButton(interaction).catch((error) => {
      log.error("Unhandled error while handling a button interaction", error);
    });
  });
}

async function handleButton(interaction: ButtonInteraction) {
  if (!interaction.customId.startsWith("ghost:")) return;

  const [, action, confirmationId] = interaction.customId.split(":");
  const entry = getConfirmation(confirmationId);

  if (!entry) {
    await interaction.update({
      content: "This confirmation has expired. Ask Ghost again to get a fresh one.",
      embeds: [],
      components: [],
    });
    return;
  }

  const isOriginalRequester = interaction.user.id === entry.requesterId;
  const isServerManager =
    interaction.guild &&
    interaction.member &&
    "permissions" in interaction.member &&
    typeof interaction.member.permissions !== "string" &&
    interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild);

  if (!isOriginalRequester && !isServerManager) {
    await interaction.reply({
      content: "Only the person who asked Ghost to do this (or a server manager) can respond to this prompt.",
      ephemeral: true,
    });
    return;
  }

  if (action === "cancel") {
    deleteConfirmation(confirmationId);
    await interaction.update({ content: "Cancelled — nothing was changed.", embeds: [], components: [] });
    return;
  }

  if (action !== "confirm" || !interaction.guild) return;

  deleteConfirmation(confirmationId);
  await interaction.update({ content: "Applying changes…", embeds: [], components: [] });

  const guild = interaction.guild;
  const requester = await guild.members.fetch(entry.requesterId);
  const botMember = guild.members.me ?? (await guild.members.fetchMe());
  const ctx: ToolContext = { guild, requester, bot: botMember, channelId: interaction.channelId ?? "" };

  const summaries: string[] = [];
  for (const item of entry.items) {
    const result = await runTool(item.call, ctx);

    if (result.success && result.tool === "configure_ticket_system" && result.data) {
      await setTicketConfig(guild.id, result.data as Parameters<typeof setTicketConfig>[1]).catch((error) =>
        log.error("Failed to persist ticket config", error)
      );
    }

    const logged = await logAction(guild.id, requester.id, result, {
      riskLevel: item.risk,
      requiredConfirmation: true,
      targets: extractTargets(item.call),
    }).catch((error) => {
      log.error("Failed to log action", error);
      return null;
    });

    const primaryEntity = extractPrimaryEntity(result);
    if (primaryEntity) rememberEntity(interaction.channelId ?? "", primaryEntity);

    const actionCodeSuffix = result.success && logged ? ` _(Action ID: ${logged.actionCode})_` : "";
    summaries.push(formatToolResult(result) + actionCodeSuffix);
  }

  await interaction.editReply({ content: summaries.join("\n\n") || "Done.", embeds: [], components: [] });

  if (entry.items.some((item) => item.call.tool === "shutdown_bot")) {
    await interaction.client.destroy();
    process.exit(0);
  }
}
