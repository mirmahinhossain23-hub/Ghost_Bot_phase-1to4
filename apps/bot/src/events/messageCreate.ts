import { Events, type Message } from "discord.js";
import type { AIProvider, AIRequest } from "@ghost/ai";
import { buildSystemPrompt } from "@ghost/ai";
import {
  extractTargets,
  getAllToolDefinitions,
  getPendingPlan,
  guardPlan,
  prepareToolCall,
  runTool,
  type ToolContext,
} from "@ghost/discord-tools";
import { ensureGuild, logAction } from "@ghost/database";
import { createLogger } from "@ghost/shared";
import { checkActivation } from "../activation.js";
import { formatToolResult } from "../formatting.js";
import { buildConfirmationMessage, buildPreviewItems, createConfirmation } from "../confirmation.js";
import { recallEntity, rememberEntity } from "../conversationContext.js";
import { extractPrimaryEntity } from "../entityTracking.js";

const log = createLogger("messageCreate");

/**
 * discord.js's message.channel type is a wide union (text, voice, thread,
 * DM, etc.) with inconsistent `parent` typings across variants — this
 * helper isolates the "does it have a category, and what's that category
 * called" question so the rest of the file doesn't have to fight TS's
 * narrowing across that union.
 */
function getParentCategoryName(channel: Message["channel"]): string | undefined {
  if (!("parent" in channel)) return undefined;
  const parent = (channel as { parent?: { name?: string } | null }).parent;
  return parent?.name ?? undefined;
}

function getChannelName(channel: Message["channel"]): string | undefined {
  if (!("name" in channel)) return undefined;
  return (channel as { name?: string | null }).name ?? undefined;
}

export function registerMessageCreate(client: import("discord.js").Client, provider: AIProvider, wakeWord: string) {
  client.on(Events.MessageCreate, (message) => {
    handleMessage(message, provider, wakeWord).catch((error) => {
      log.error("Unhandled error while handling a message", error);
    });
  });
}

async function handleMessage(message: Message, provider: AIProvider, wakeWord: string) {
  if (message.author.bot) return;
  if (!message.guild) {
    // Phase 1 is guild-only. DMs will get their own onboarding flow later.
    return;
  }

  const { activated, cleanedContent } = checkActivation(message, wakeWord);
  if (!activated) return;

  if (!cleanedContent) {
    await message.reply(
      "I'm listening — try something like \"Ghost, what roles and channels do we have?\" or \"Ghost, create a role called Developer\"."
    );
    return;
  }

  const guild = message.guild;
  const requester = message.member ?? (await guild.members.fetch(message.author.id));
  const botMember = guild.members.me ?? (await guild.members.fetchMe());

  await ensureGuild(guild.id, guild.name);

  if ("sendTyping" in message.channel) {
    await message.channel.sendTyping().catch(() => undefined);
  }

  const channelName = getChannelName(message.channel);
  const categoryName = getParentCategoryName(message.channel);
  const recent = recallEntity(message.channel.id);

  const request: AIRequest = {
    systemPrompt: buildSystemPrompt({
      guildName: guild.name,
      currentChannelName: channelName,
      currentCategoryName: categoryName,
      recentEntity: recent ? { type: recent.type, name: recent.name } : undefined,
      hasPendingServerPlan: Boolean(getPendingPlan(message.channel.id)),
    }),
    history: [{ role: "user", content: cleanedContent, authorName: requester.displayName }],
    tools: getAllToolDefinitions(),
  };

  let aiResponse;
  try {
    aiResponse = await provider.generate(request);
  } catch (error) {
    log.error("AI provider failed", error);
    await message.reply(
      `I couldn't reach my AI brain (${provider.name}). Double-check the API key in your .env file, then try again.`
    );
    return;
  }

  const ctx: ToolContext = { guild, requester, bot: botMember, channelId: message.channel.id };

  // AI failure protection: collapse duplicate calls and reject any that
  // contradict each other (e.g. deleting and renaming the same role in
  // one turn) BEFORE they ever reach validation.
  const guarded = guardPlan(aiResponse.toolCalls);

  const readyImmediate: typeof aiResponse.toolCalls = [];
  const readyConfirm: typeof aiResponse.toolCalls = [];
  const rejectedReasons: string[] = guarded.rejected.map(
    (r) => `⚠️ **${r.call.tool}** — ${r.reason}`
  );

  for (const call of guarded.calls) {
    const prepared = prepareToolCall(call, ctx);
    if (prepared.status === "rejected") {
      rejectedReasons.push(`⚠️ **${call.tool}** — ${prepared.reason}`);
      continue;
    }
    if (prepared.requiresConfirmation) {
      readyConfirm.push(call);
    } else {
      readyImmediate.push(call);
    }
  }

  const replyParts: string[] = [];
  if (aiResponse.message) replyParts.push(aiResponse.message);

  if (readyImmediate.length > 0) {
    const previewItems = await buildPreviewItems(readyImmediate, ctx);
    for (const item of previewItems) {
      const result = await runTool(item.call, ctx);

      const logged = await logAction(guild.id, requester.id, result, {
        riskLevel: item.risk,
        requiredConfirmation: false,
        targets: extractTargets(item.call),
      }).catch((error) => {
        log.error("Failed to log action", error);
        return null;
      });

      const primaryEntity = extractPrimaryEntity(result);
      if (primaryEntity) rememberEntity(message.channel.id, primaryEntity);

      const actionCodeSuffix =
        result.success && logged && result.tool !== "get_member_info" && result.tool !== "get_moderation_target_info"
          ? ` _(Action ID: ${logged.actionCode})_`
          : "";

      replyParts.push(formatToolResult(result) + actionCodeSuffix);
    }
  }

  replyParts.push(...rejectedReasons);

  if (readyConfirm.length > 0) {
    const previewItems = await buildPreviewItems(readyConfirm, ctx);
    const confirmationId = createConfirmation(guild.id, requester.id, previewItems);
    if (replyParts.length > 0) {
      await message.reply(replyParts.join("\n\n"));
    }
    await message.reply(buildConfirmationMessage(confirmationId, previewItems));
    return;
  }

  if (replyParts.length === 0) {
    replyParts.push("Done.");
  }

  await message.reply(replyParts.join("\n\n"));

  if (readyImmediate.some((call) => call.tool === "shutdown_bot")) {
    await message.client.destroy();
    process.exit(0);
  }
}
