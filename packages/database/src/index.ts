import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import type { ActionLogEntry, ActionTarget, RiskLevel, ToolResult } from "@ghost/shared";

/**
 * A single shared Prisma client for the whole process. Discord bots are
 * long-running, so we don't want to open a new connection per message —
 * this pattern (cache on globalThis in dev) avoids exhausting connections
 * when the file gets hot-reloaded by tsx watch.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

/** Ensures a Guild row exists before we log anything against it. */
export async function ensureGuild(guildId: string, name: string) {
  return prisma.guild.upsert({
    where: { id: guildId },
    update: { name },
    create: { id: guildId, name },
  });
}

// Characters chosen to avoid visually-ambiguous ones (0/O, 1/I) when a
// human has to read an action code out loud or retype it.
const ACTION_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateActionCode(): string {
  let suffix = "";
  for (let i = 0; i < 5; i++) {
    suffix += ACTION_CODE_CHARS[Math.floor(Math.random() * ACTION_CODE_CHARS.length)];
  }
  return `GST-${suffix}`;
}

export interface LogActionMeta {
  riskLevel: RiskLevel;
  requiredConfirmation: boolean;
  targets?: ActionTarget[];
}

/** Persists one executed tool call to the audit log, returning it with its new action code. */
export async function logAction(
  guildId: string,
  requestedByUserId: string,
  result: ToolResult,
  meta: LogActionMeta
): Promise<ActionLogEntry> {
  // Action codes are generated app-side (not a DB default) since they
  // follow our own "GST-XXXXX" format rather than a generic cuid/uuid.
  // A retry loop handles the astronomically unlikely collision case.
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const row = await prisma.actionLog.create({
        data: {
          actionCode: generateActionCode(),
          guildId,
          requestedByUserId,
          tool: result.tool,
          parameters: JSON.stringify(result.parameters ?? {}),
          targets: JSON.stringify(meta.targets ?? []),
          riskLevel: meta.riskLevel,
          requiredConfirmation: meta.requiredConfirmation,
          success: result.success,
          message: result.message,
          snapshot: result.snapshot ? JSON.stringify(result.snapshot) : null,
        },
      });
      return rowToEntry(row);
    } catch (error) {
      const isUniqueClash = error instanceof Error && error.message.includes("Unique constraint");
      if (!isUniqueClash || attempt === 4) throw error;
    }
  }
  throw new Error("Failed to generate a unique action code after several attempts.");
}

/** Mirrors the Prisma ActionLog model shape — kept explicit so this file
 *  typechecks even before `npx prisma generate` has been run once. */
interface ActionLogRow {
  id: string;
  actionCode: string;
  guildId: string;
  requestedByUserId: string;
  tool: string;
  parameters: string;
  targets: string;
  riskLevel: string;
  requiredConfirmation: boolean;
  success: boolean;
  message: string;
  snapshot: string | null;
  createdAt: Date;
}

function rowToEntry(row: ActionLogRow): ActionLogEntry {
  return {
    id: row.id,
    actionCode: row.actionCode,
    guildId: row.guildId,
    requestedByUserId: row.requestedByUserId,
    tool: row.tool,
    parameters: JSON.parse(row.parameters),
    targets: JSON.parse(row.targets),
    riskLevel: row.riskLevel as RiskLevel,
    requiredConfirmation: row.requiredConfirmation,
    success: row.success,
    message: row.message,
    snapshot: row.snapshot ? JSON.parse(row.snapshot) : undefined,
    createdAt: row.createdAt,
  };
}

/** Recent audit log entries for a guild, newest first — used by /activity later. */
export async function getRecentActions(guildId: string, limit = 20): Promise<ActionLogEntry[]> {
  const rows: ActionLogRow[] = await prisma.actionLog.findMany({
    where: { guildId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return rows.map(rowToEntry);
}

/** Looks up one action by its shareable code (e.g. "GST-8F4K2"). */
export async function getActionByCode(actionCode: string): Promise<ActionLogEntry | null> {
  const row: ActionLogRow | null = await prisma.actionLog.findUnique({ where: { actionCode } });
  return row ? rowToEntry(row) : null;
}

export async function getGuildSettings(guildId: string) {
  return prisma.guild.findUnique({ where: { id: guildId } });
}

export async function setGuildAiProvider(guildId: string, aiProvider: "gemini" | "openai") {
  return prisma.guild.update({ where: { id: guildId }, data: { aiProvider } });
}

export interface StoredTicketConfig {
  categoryId: string;
  panelChannelId: string;
  categoryName: string;
  panelChannelName: string;
  ticketTypes: Array<{ label: string; staffRoleName: string }>;
}

export async function setTicketConfig(guildId: string, config: StoredTicketConfig) {
  return prisma.guild.update({ where: { id: guildId }, data: { ticketConfig: JSON.stringify(config) } });
}

export async function getTicketConfig(guildId: string): Promise<StoredTicketConfig | null> {
  const guild = await prisma.guild.findUnique({ where: { id: guildId } });
  return guild?.ticketConfig ? JSON.parse(guild.ticketConfig) : null;
}

export async function upsertDashboardUser(user: { id: string; username: string; avatar?: string | null }) {
  return prisma.dashboardUser.upsert({
    where: { id: user.id },
    update: { username: user.username, avatar: user.avatar ?? null },
    create: { id: user.id, username: user.username, avatar: user.avatar ?? null },
  });
}

export async function createDashboardSession(userId: string, ttlMs: number) {
  const id = randomUUID();
  return prisma.dashboardSession.create({
    data: { id, userId, expiresAt: new Date(Date.now() + ttlMs) },
  });
}

export async function getDashboardSession(id: string) {
  const session = await prisma.dashboardSession.findUnique({ where: { id }, include: { user: true } });
  if (!session || session.expiresAt.getTime() <= Date.now()) {
    if (session) await prisma.dashboardSession.delete({ where: { id } }).catch(() => undefined);
    return null;
  }
  await prisma.dashboardSession.update({ where: { id }, data: { lastSeen: new Date() } });
  return session;
}

export async function deleteDashboardSession(id: string) {
  await prisma.dashboardSession.delete({ where: { id } }).catch(() => undefined);
}

export async function logDashboardAudit(entry: {
  userId: string;
  action: string;
  guildId?: string;
  targetId?: string;
  parameters?: Record<string, unknown>;
  success: boolean;
  error?: string;
}) {
  return prisma.dashboardAudit.create({
    data: {
      userId: entry.userId,
      action: entry.action,
      guildId: entry.guildId,
      targetId: entry.targetId,
      parameters: JSON.stringify(entry.parameters ?? {}),
      success: entry.success,
      error: entry.error,
    },
  });
}

export async function getDashboardAudit(limit = 100) {
  return prisma.dashboardAudit.findMany({
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(limit, 1), 500),
    select: { id: true, userId: true, action: true, guildId: true, targetId: true, parameters: true, success: true, error: true, createdAt: true },
  });
}
