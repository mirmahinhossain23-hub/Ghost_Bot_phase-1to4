import { PermissionsBitField, type GuildMember } from "discord.js";
import type { ValidationResult } from "@ghost/shared";
import type { ToolContext } from "./registry.js";
import type { ToolDefinition } from "@ghost/shared";

const CEO_USER_ID = process.env.GHOST_CEO_USER_ID?.trim();

export function isCeo(ctx: ToolContext): boolean {
  return (
    Boolean(CEO_USER_ID) &&
    ctx.requester.id === CEO_USER_ID &&
    ctx.requester.permissions.has(PermissionsBitField.Flags.Administrator)
  );
}

/**
 * Checks that the human who asked Ghost to run this tool actually holds
 * the Discord permission the tool declares it needs. This runs BEFORE
 * the bot's own permissions are checked — a user with no authority
 * should never learn anything about what Ghost could theoretically do.
 */
export function checkUserPermission(
  definition: ToolDefinition,
  ctx: ToolContext
): ValidationResult {
  if (!definition.requiredUserPermission) return { ok: true };

  if (isCeo(ctx)) return { ok: true };

  const flag = definition.requiredUserPermission as keyof typeof PermissionsBitField.Flags;
  if (!(flag in PermissionsBitField.Flags)) {
    return { ok: false, reason: `Unknown permission flag "${definition.requiredUserPermission}".` };
  }

  if (!ctx.requester.permissions.has(PermissionsBitField.Flags[flag])) {
    return {
      ok: false,
      reason: `You need the **${definition.requiredUserPermission}** permission to ask Ghost to do that.`,
    };
  }

  return { ok: true };
}

/**
 * Checks that Ghost's own bot role in this server actually holds the
 * Discord permission required to carry out the action. If the server
 * owner never granted Ghost "Manage Roles", Ghost should say so clearly
 * instead of failing with a cryptic Discord API error.
 */
export function checkBotPermission(
  definition: ToolDefinition,
  ctx: ToolContext
): ValidationResult {
  if (!definition.requiredBotPermission) return { ok: true };

  const flag = definition.requiredBotPermission as keyof typeof PermissionsBitField.Flags;
  if (!(flag in PermissionsBitField.Flags)) {
    return { ok: false, reason: `Unknown permission flag "${definition.requiredBotPermission}".` };
  }

  if (!ctx.bot.permissions.has(PermissionsBitField.Flags[flag])) {
    return {
      ok: false,
      reason: `I don't have the **${definition.requiredBotPermission}** permission in this server yet. Ask an admin to grant it to my role, then try again.`,
    };
  }

  return { ok: true };
}

/**
 * Discord role hierarchy: a bot (or user) can only manage roles that sit
 * BELOW its own highest role in the role list. Skipping this check is
 * the single most common cause of silent Discord API failures.
 */
export function checkBotCanManageRole(ctx: ToolContext, targetRolePosition: number): ValidationResult {
  const botTopPosition = ctx.bot.roles.highest.position;
  if (targetRolePosition >= botTopPosition) {
    return {
      ok: false,
      reason:
        "That role sits at or above my highest role, so Discord won't let me manage it. " +
        "Move my role above it in Server Settings → Roles, then try again.",
    };
  }
  return { ok: true };
}

/**
 * The advanced safety layer for anything that acts ON a specific
 * member (moderation, and anything else that targets a person). This
 * is the ONE place all of that logic lives — tools call this instead
 * of re-deriving hierarchy/ownership checks themselves.
 *
 * `capability` picks which of discord.js's own hierarchy-aware getters
 * to trust for "can Ghost actually do this" (they already account for
 * the bot's permissions, role position, and the guild owner). What
 * they do NOT account for is whether the HUMAN who asked Ghost has
 * the standing to request it — Discord's API has no concept of "on
 * behalf of this user" for bot actions, so that half is ours to check.
 */
export function checkModerationTarget(
  ctx: ToolContext,
  target: GuildMember,
  capability: "kickable" | "bannable" | "moderatable" | "manageable"
): ValidationResult {
  if (CEO_USER_ID && target.id === CEO_USER_ID) {
    return { ok: false, reason: "I won't take moderation action against the configured CEO account." };
  }

  if (target.id === ctx.guild.ownerId) {
    return { ok: false, reason: "I won't take moderation action against the server owner." };
  }

  if (target.id === ctx.bot.id) {
    return { ok: false, reason: "I can't take that action on myself." };
  }

  if (!target[capability]) {
    return {
      ok: false,
      reason:
        "Discord won't let me do that to this member — their highest role may be at or above mine, " +
        "or I'm missing the right permission.",
    };
  }

  return checkRequesterAuthorityOver(ctx, target);
}

/**
 * Discord's own UI stops a moderator from acting on someone with an
 * equal or higher role — but that check happens client-side, not in
 * the API itself, so a bot acting "on behalf of" a low-privileged
 * human bypasses it entirely unless we enforce it ourselves. The
 * guild owner is exempt (they can act on anyone).
 */
export function checkRequesterAuthorityOver(ctx: ToolContext, target: GuildMember): ValidationResult {
  if (ctx.requester.id === ctx.guild.ownerId || isCeo(ctx)) return { ok: true };

  if (target.id === ctx.requester.id) {
    return { ok: false, reason: "You can't have Ghost take a moderation action on yourself." };
  }

  const requesterTop = ctx.requester.roles.highest.position;
  const targetTop = target.roles.highest.position;

  if (targetTop >= requesterTop) {
    return {
      ok: false,
      reason:
        "That member's highest role is at or above your own, so the same rule Discord applies to human " +
        "moderators applies here too — you can't act on them through Ghost either.",
    };
  }

  return { ok: true };
}
