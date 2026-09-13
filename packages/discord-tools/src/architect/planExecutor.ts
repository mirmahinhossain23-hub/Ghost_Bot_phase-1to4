import { ChannelType } from "discord.js";
import type { ToolContext } from "../registry.js";
import { runWithConcurrency } from "../executionQueue.js";
import type { PlannedCategory, PlannedChannel, ServerPlan } from "./planModel.js";

export interface BuildReportItem {
  kind: "role" | "category" | "channel";
  name: string;
  success: boolean;
  skipped?: boolean;
  reason?: string;
}

export interface BuildReport {
  items: BuildReportItem[];
  createdCount: number;
  /** Always 0 today — see the REORGANIZE limitation note in planExecutor.ts. */
  modifiedCount: number;
  failedCount: number;
  skippedCount: number;
}

function channelType(kind: PlannedChannel["kind"]): ChannelType.GuildVoice | ChannelType.GuildText {
  return kind === "voice" ? ChannelType.GuildVoice : ChannelType.GuildText;
}

/**
 * Executes a plan already validated by planValidation.ts. Order matters:
 * roles and categories are created first (each internally concurrent),
 * THEN channels — and a channel whose planned category failed to create
 * is never created "loose" outside its intended structure; it's marked
 * skipped instead, matching the spec's dependency-safety requirement.
 *
 * NOTE on REORGANIZE: this executor only ever ADDS resources. True
 * in-place reorganization (renaming/moving specific existing channels
 * per a generated diff) isn't implemented yet — REORGANIZE plans get
 * the higher risk classification and existing-aware preview, but
 * execute as an additive build today. `modifiedCount` is always 0
 * until that's built; this is documented, not silently pretended.
 */
export async function executePlan(plan: ServerPlan, ctx: ToolContext): Promise<BuildReport> {
  const items: BuildReportItem[] = [];
  const requesterTag = ctx.requester.user.tag;

  // --- Phase A: roles ---
  const roleOutcomes = await runWithConcurrency(
    plan.roles,
    async (role) => {
      await ctx.guild.roles.create({
        name: role.name,
        color: role.color as `#${string}` | undefined,
        reason: `Created by Ghost's Server Architect, requested by ${requesterTag}`,
      });
    },
    { concurrency: 3 }
  );
  roleOutcomes.forEach((outcome, index) => {
    items.push({
      kind: "role",
      name: plan.roles[index].name,
      success: outcome.status === "fulfilled",
      reason: outcome.status === "rejected" ? outcome.reason : undefined,
    });
  });

  // --- Phase B: categories ---
  const categoryParentIds = new Map<PlannedCategory, string | null>();
  const categoryOutcomes = await runWithConcurrency(
    plan.categories,
    async (category): Promise<string> => {
      const created = await ctx.guild.channels.create({
        name: category.name,
        type: ChannelType.GuildCategory,
        reason: `Created by Ghost's Server Architect, requested by ${requesterTag}`,
      });
      return created.id;
    },
    { concurrency: 3 }
  );
  categoryOutcomes.forEach((outcome, index) => {
    const category = plan.categories[index];
    categoryParentIds.set(category, outcome.status === "fulfilled" ? outcome.value : null);
    items.push({
      kind: "category",
      name: category.name,
      success: outcome.status === "fulfilled",
      reason: outcome.status === "rejected" ? outcome.reason : undefined,
    });
  });

  // --- Phase C: channels inside categories — skip (never orphan-create) if the parent failed ---
  const channelJobs: Array<{ category: PlannedCategory; channel: PlannedChannel; parentId: string }> = [];
  for (const category of plan.categories) {
    const parentId = categoryParentIds.get(category);
    if (!parentId) {
      for (const channel of category.channels) {
        items.push({
          kind: "channel",
          name: channel.name,
          success: false,
          skipped: true,
          reason: `Parent category "${category.name}" failed to create`,
        });
      }
      continue;
    }
    for (const channel of category.channels) {
      channelJobs.push({ category, channel, parentId });
    }
  }

  const channelOutcomes = await runWithConcurrency(
    channelJobs,
    async (job) => {
      await ctx.guild.channels.create({
        name: job.channel.name,
        type: channelType(job.channel.kind),
        parent: job.parentId,
        topic: job.channel.topic,
        permissionOverwrites: job.channel.private ? [{ id: ctx.guild.id, deny: ["ViewChannel"] }] : undefined,
        reason: `Created by Ghost's Server Architect, requested by ${requesterTag}`,
      });
    },
    { concurrency: 4 }
  );
  channelOutcomes.forEach((outcome, index) => {
    items.push({
      kind: "channel",
      name: channelJobs[index].channel.name,
      success: outcome.status === "fulfilled",
      reason: outcome.status === "rejected" ? outcome.reason : undefined,
    });
  });

  // --- Phase D: standalone (uncategorized) channels ---
  const standaloneOutcomes = await runWithConcurrency(
    plan.standaloneChannels,
    async (channel) => {
      await ctx.guild.channels.create({
        name: channel.name,
        type: channelType(channel.kind),
        topic: channel.topic,
        permissionOverwrites: channel.private ? [{ id: ctx.guild.id, deny: ["ViewChannel"] }] : undefined,
        reason: `Created by Ghost's Server Architect, requested by ${requesterTag}`,
      });
    },
    { concurrency: 4 }
  );
  standaloneOutcomes.forEach((outcome, index) => {
    items.push({
      kind: "channel",
      name: plan.standaloneChannels[index].name,
      success: outcome.status === "fulfilled",
      reason: outcome.status === "rejected" ? outcome.reason : undefined,
    });
  });

  const createdCount = items.filter((i) => i.success).length;
  const skippedCount = items.filter((i) => i.skipped).length;
  const failedCount = items.filter((i) => !i.success && !i.skipped).length;

  return { items, createdCount, modifiedCount: 0, failedCount, skippedCount };
}

export function formatBuildReport(report: BuildReport): string {
  const lines = [
    "**SERVER BUILD COMPLETE**",
    "",
    `Created successfully: ${report.createdCount}`,
    `Modified successfully: ${report.modifiedCount}`,
    `Failed: ${report.failedCount}`,
    `Skipped (dependency failed): ${report.skippedCount}`,
  ];

  const problems = report.items.filter((i) => !i.success);
  if (problems.length > 0) {
    lines.push("", "**ISSUES**");
    for (const item of problems.slice(0, 15)) {
      lines.push(`${item.name}`, `Reason: ${item.reason ?? "Unknown error"}`);
    }
    if (problems.length > 15) lines.push(`…and ${problems.length - 15} more`);
  }

  return lines.join("\n");
}
