import { randomUUID } from "node:crypto";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from "discord.js";
import type { RiskLevel, ToolCall } from "@ghost/shared";
import { getBaseRisk, getTool, maxRisk, type ToolContext } from "@ghost/discord-tools";

export interface ConfirmationPreviewItem {
  call: ToolCall;
  summary: string;
  diffLines?: string[];
  risk: RiskLevel;
}

export interface PendingConfirmation {
  id: string;
  guildId: string;
  requesterId: string;
  items: ConfirmationPreviewItem[];
  createdAt: number;
}

// Simple in-memory store: fine for a single-process bot. If Ghost ever
// runs multiple bot instances behind a shared queue, swap this for a
// row in the database instead — nothing else about the flow changes.
const pending = new Map<string, PendingConfirmation>();
const CONFIRMATION_TTL_MS = 5 * 60 * 1000;
const EMBED_DESCRIPTION_LIMIT = 3800; // Discord's real cap is 4096; leave headroom

const RISK_STYLE: Record<RiskLevel, { title: string; color: number; confirmLabel: string }> = {
  low: { title: "Ghost Action Confirmation", color: 0x22c55e, confirmLabel: "Confirm" },
  medium: { title: "Ghost Action Confirmation", color: 0xf97316, confirmLabel: "Confirm" },
  high: { title: "⚠️ Ghost Action Confirmation", color: 0xef4444, confirmLabel: "Confirm" },
  critical: { title: "🚨 CRITICAL ACTION", color: 0xdc2626, confirmLabel: "Confirm Critical Action" },
};

export function createConfirmation(guildId: string, requesterId: string, items: ConfirmationPreviewItem[]): string {
  const id = randomUUID();
  pending.set(id, { id, guildId, requesterId, items, createdAt: Date.now() });
  return id;
}

export function getConfirmation(id: string): PendingConfirmation | undefined {
  const entry = pending.get(id);
  if (!entry) return undefined;
  if (Date.now() - entry.createdAt > CONFIRMATION_TTL_MS) {
    pending.delete(id);
    return undefined;
  }
  return entry;
}

export function deleteConfirmation(id: string) {
  pending.delete(id);
}

export function buildConfirmationMessage(id: string, items: ConfirmationPreviewItem[]) {
  const overallRisk = maxRisk(items.map((i) => i.risk));
  const style = RISK_STYLE[overallRisk];

  const lines: string[] = [];
  if (overallRisk === "critical") {
    lines.push("This action can significantly affect the server.", "");
  }
  lines.push("Ghost plans to:", "");

  for (const item of items) {
    lines.push(`• ${item.summary}`);
    if (item.diffLines?.length) {
      lines.push(...item.diffLines.map((line) => `   ${line}`));
    }
    lines.push("");
  }

  lines.push(
    overallRisk === "critical"
      ? "This requires explicit confirmation and cannot be automatically undone."
      : "This can't be automatically undone. Confirm to proceed."
  );

  let description = lines.join("\n");
  if (description.length > EMBED_DESCRIPTION_LIMIT) {
    description = description.slice(0, EMBED_DESCRIPTION_LIMIT) + "\n… (truncated)";
  }

  const embed = new EmbedBuilder().setTitle(style.title).setColor(style.color).setDescription(description);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`ghost:confirm:${id}`)
      .setLabel(style.confirmLabel)
      .setStyle(overallRisk === "critical" ? ButtonStyle.Danger : ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`ghost:cancel:${id}`)
      .setLabel("Cancel")
      .setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row] };
}

/**
 * Builds the rich preview shown in a confirmation prompt AND the risk
 * used for both the embed styling and the audit log — computed once
 * per call so the two never disagree. Tools that define a `preview()`
 * (restyle_names, delete_category, moderation tools, ...) get a proper
 * summary/diff/risk; everything else falls back to a plain description
 * of the raw call plus the tool's static baseRisk.
 */
export async function buildPreviewItems(calls: ToolCall[], ctx: ToolContext): Promise<ConfirmationPreviewItem[]> {
  const items: ConfirmationPreviewItem[] = [];

  for (const call of calls) {
    const tool = getTool(call.tool);
    let risk: RiskLevel = tool ? getBaseRisk(tool.definition) : "medium";
    let summary = `**${call.tool}** — ${JSON.stringify(call.parameters)}`;
    let diffLines: string[] | undefined;

    if (tool?.preview) {
      try {
        const preview = await tool.preview(call.parameters, ctx);
        summary = preview.summary;
        diffLines = preview.diffLines;
        if (preview.risk) risk = preview.risk;
      } catch {
        // keep the generic summary/baseRisk already set above
      }
    }

    items.push({ call, summary, diffLines, risk });
  }

  return items;
}
