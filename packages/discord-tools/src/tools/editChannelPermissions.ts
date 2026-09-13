import { ChannelType, type PermissionOverwriteOptions } from "discord.js";
import type { ToolResult } from "@ghost/shared";
import { registerTool } from "../registry.js";
import { isManageableChannel, nameMatches } from "../channelUtils.js";

/**
 * Deliberately NOT the full Discord permission list. This tool is for
 * "make this channel private", "let the Mod role delete messages here",
 * etc — everyday channel-access requests. Server-wide/dangerous flags
 * (Administrator, ManageRoles, ManageGuild, ...) are intentionally left
 * out so this tool can never be used to quietly escalate someone's
 * access to the whole server through a single channel.
 */
const ALLOWED_FLAGS = [
  "ViewChannel",
  "SendMessages",
  "ReadMessageHistory",
  "AddReactions",
  "AttachFiles",
  "EmbedLinks",
  "MentionEveryone",
  "ManageMessages",
  "Connect",
  "Speak",
  "Stream",
] as const;

registerTool({
  definition: {
    name: "edit_channel_permissions",
    description:
      "Sets whether a role can/can't do specific things in one channel — e.g. making a channel private, or letting a role moderate messages there.",
    parameters: {
      channelName: { type: "string", description: "The channel to edit." },
      roleName: {
        type: "string",
        description: "The role this override applies to. Use '@everyone' for the whole server's default role.",
      },
      allow: {
        type: "array",
        description: `Permissions to explicitly allow. Choose from: ${ALLOWED_FLAGS.join(", ")}.`,
        items: { type: "string", description: "A permission flag name.", enum: [...ALLOWED_FLAGS] },
        optional: true,
      },
      deny: {
        type: "array",
        description: `Permissions to explicitly deny. Choose from: ${ALLOWED_FLAGS.join(", ")}.`,
        items: { type: "string", description: "A permission flag name.", enum: [...ALLOWED_FLAGS] },
        optional: true,
      },
    },
    mutating: true,
    requiresConfirmation: true,
    requiredUserPermission: "ManageRoles",
    requiredBotPermission: "ManageRoles",
    baseRisk: "high",
  },
  handler: async (params, ctx): Promise<ToolResult> => {
    const channelName = params.channelName as string;
    const roleName = params.roleName as string;
    const allow = (params.allow as string[] | undefined) ?? [];
    const deny = (params.deny as string[] | undefined) ?? [];

    if (allow.length === 0 && deny.length === 0) {
      return {
        tool: "edit_channel_permissions",
        parameters: params,
        success: false,
        message: "Tell me at least one permission to allow or deny.",
      };
    }

    const invalid = [...allow, ...deny].filter((flag) => !ALLOWED_FLAGS.includes(flag as (typeof ALLOWED_FLAGS)[number]));
    if (invalid.length > 0) {
      return {
        tool: "edit_channel_permissions",
        parameters: params,
        success: false,
        message: `I can only manage these permissions through this tool: ${ALLOWED_FLAGS.join(", ")}. Unrecognized: ${invalid.join(", ")}.`,
      };
    }

    const channel = ctx.guild.channels.cache.find(
      (c) => c.type !== ChannelType.GuildCategory && isManageableChannel(c) && nameMatches(c.name, channelName)
    );
    if (!channel || !("permissionOverwrites" in channel)) {
      return {
        tool: "edit_channel_permissions",
        parameters: params,
        success: false,
        message: `I couldn't find a channel called "${channelName}".`,
      };
    }

    const roleId =
      roleName.trim().toLowerCase() === "@everyone"
        ? ctx.guild.id
        : ctx.guild.roles.cache.find((r) => r.name.toLowerCase() === roleName.toLowerCase())?.id;

    if (!roleId) {
      return {
        tool: "edit_channel_permissions",
        parameters: params,
        success: false,
        message: `I couldn't find a role called "${roleName}".`,
      };
    }

    const overwrite: Record<string, boolean> = {};
    for (const flag of allow) overwrite[flag] = true;
    for (const flag of deny) overwrite[flag] = false;

    await channel.permissionOverwrites.edit(roleId, overwrite as unknown as PermissionOverwriteOptions, {
      reason: `Edited by Ghost, requested by ${ctx.requester.user.tag}`,
    });

    return {
      tool: "edit_channel_permissions",
      parameters: params,
      success: true,
      message: `Updated **${roleName}**'s permissions in #${channel.name}. Allowed: ${allow.join(", ") || "none"}. Denied: ${deny.join(", ") || "none"}.`,
      data: { channelId: channel.id, roleId, allow, deny },
    };
  },
  preview: async (params) => {
    const channelName = params.channelName as string;
    const roleName = params.roleName as string;
    const allow = (params.allow as string[] | undefined) ?? [];
    const deny = (params.deny as string[] | undefined) ?? [];
    const isEveryone = roleName.trim().toLowerCase() === "@everyone";

    const banner = isEveryone ? "🚨 **CRITICAL ACTION** — this changes the default access for the WHOLE server.\n\n" : "";

    return {
      summary:
        `${banner}Update **${roleName}**'s permissions in #${channelName}.\n` +
        `Allow: ${allow.join(", ") || "none"}\n` +
        `Deny: ${deny.join(", ") || "none"}`,
      risk: isEveryone ? "critical" : "high",
    };
  },
});

export const EDIT_CHANNEL_PERMISSIONS_ALLOWED_FLAGS = ALLOWED_FLAGS;
