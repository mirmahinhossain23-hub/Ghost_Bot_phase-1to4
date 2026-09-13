import type { Message } from "discord.js";

export interface ActivationResult {
  activated: boolean;
  /** The message content with the mention/wake-word stripped off. */
  cleanedContent: string;
}

/**
 * Decides whether Ghost should respond to this message at all.
 *
 * Activates on:
 *   - A direct @mention of the bot, anywhere in the message.
 *   - The message starting with the configured wake word (default
 *     "ghost"), optionally preceded by a casual greeting like "hey".
 *
 * Deliberately does NOT activate just because the word appears
 * somewhere mid-sentence ("I saw a ghost yesterday" must be ignored).
 */
export function checkActivation(message: Message, wakeWord: string): ActivationResult {
  const botId = message.client.user?.id;

  if (botId && message.mentions.users.has(botId)) {
    const mentionPattern = new RegExp(`^\\s*<@!?${botId}>[,:]?\\s*`);
    return {
      activated: true,
      cleanedContent: message.content.replace(mentionPattern, "").trim(),
    };
  }

  const escapedWakeWord = wakeWord.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const wakePattern = new RegExp(`^\\s*(hey[,]?\\s+)?${escapedWakeWord}[,:]?\\s+`, "i");

  if (wakePattern.test(message.content)) {
    return {
      activated: true,
      cleanedContent: message.content.replace(wakePattern, "").trim(),
    };
  }

  // Exact "Ghost" / "Ghost?" with nothing else after it still counts.
  const bareWakePattern = new RegExp(`^\\s*(hey[,]?\\s+)?${escapedWakeWord}[.,!?]?\\s*$`, "i");
  if (bareWakePattern.test(message.content)) {
    return { activated: true, cleanedContent: "" };
  }

  return { activated: false, cleanedContent: message.content };
}
