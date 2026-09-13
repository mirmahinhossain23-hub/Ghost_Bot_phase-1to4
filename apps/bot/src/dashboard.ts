import { timingSafeEqual } from "node:crypto";
import { fileURLToPath } from "node:url";
import express, { type NextFunction, type Request, type Response } from "express";
import type { Client } from "discord.js";
import { PermissionsBitField } from "discord.js";
import {
  createDashboardSession,
  deleteDashboardSession,
  getDashboardAudit,
  getDashboardSession,
  logDashboardAudit,
  upsertDashboardUser,
} from "@ghost/database";
import { getAllToolDefinitions, prepareToolCall, runTool, type ToolContext } from "@ghost/discord-tools";

const SESSION_COOKIE = "ghost_dashboard_session";
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const OWNER_USER_ID = (process.env.OWNER_USER_ID || process.env.GHOST_CEO_USER_ID)?.trim();
const CLIENT_ID = process.env.DISCORD_CLIENT_ID?.trim();
const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET?.trim();
const DASHBOARD_URL = process.env.DASHBOARD_URL?.replace(/\/$/, "");

interface AuthenticatedRequest extends Request {
  dashboardUser?: { id: string; username: string; accessLevel: string };
}

function constantTimeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function cookieValue(request: Request): string | undefined {
  const header = request.headers.cookie ?? "";
  const match = header.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
  return match?.[1];
}

async function requireOwner(request: AuthenticatedRequest, response: Response, next: NextFunction) {
  const sessionId = cookieValue(request);
  if (!sessionId) return response.status(401).json({ error: "Authentication required." });
  const session = await getDashboardSession(sessionId);
  if (!session || session.user.id !== OWNER_USER_ID) {
    return response.status(403).json({ error: "Owner access required." });
  }
  request.dashboardUser = session.user;
  return next();
}

function safeGuild(client: Client, guildId: string) {
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return null;
  const bot = guild.members.me;
  return {
    id: guild.id,
    name: guild.name,
    icon: guild.iconURL({ size: 128 }),
    ownerId: guild.ownerId,
    memberCount: guild.memberCount,
    channelCount: guild.channels.cache.size,
    roleCount: Math.max(0, guild.roles.cache.size - 1),
    botPermissions: bot?.permissions.toArray() ?? [],
    botHighestRole: bot?.roles.highest.name ?? null,
    connected: true,
  };
}

function createRateLimiter(windowMs: number, maxRequests: number) {
  const requests = new Map<string, { startedAt: number; count: number }>();
  return (request: Request, response: Response, next: NextFunction) => {
    const key = request.ip || request.socket.remoteAddress || "unknown";
    const now = Date.now();
    const current = requests.get(key);
    if (!current || now - current.startedAt >= windowMs) {
      requests.set(key, { startedAt: now, count: 1 });
      return next();
    }
    current.count += 1;
    if (current.count > maxRequests) return response.status(429).json({ error: "Too many requests. Try again shortly." });
    return next();
  };
}

export function startDashboard(client: Client) {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "32kb" }));
  app.set("trust proxy", 1);
  app.use(createRateLimiter(60_000, 120));
  app.use((_request, response, next) => {
    response.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
        "img-src 'self' data: https://cdn.discordapp.com https://media.discordapp.net; " +
        "connect-src 'self'; frame-ancestors 'none'; base-uri 'none'"
    );
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("X-Frame-Options", "DENY");
    next();
  });
  app.use((request, response, next) => {
    if (request.method === "GET" || request.path.startsWith("/auth/")) return next();
    const origin = request.headers.origin;
    if (origin && DASHBOARD_URL && origin !== DASHBOARD_URL) return response.status(403).json({ error: "Cross-origin request rejected." });
    return next();
  });
  const dashboardRoot = fileURLToPath(new URL("../../dashboard", import.meta.url));
  app.use(express.static(dashboardRoot));
  app.get("/", (_request, response) => response.sendFile("index.html", { root: dashboardRoot }));

  app.get("/health", (_request, response) => response.json({ ok: true, discordReady: client.isReady(), guildCount: client.guilds.cache.size }));
  app.get("/auth/discord", (_request, response) => {
    if (!CLIENT_ID || !DASHBOARD_URL) return response.status(503).json({ error: "OAuth is not configured." });
    const params = new URLSearchParams({ client_id: CLIENT_ID, response_type: "code", redirect_uri: `${DASHBOARD_URL}/auth/discord/callback`, scope: "identify" });
    response.redirect(`https://discord.com/oauth2/authorize?${params}`);
  });

  app.get("/auth/discord/callback", async (request, response) => {
    try {
      if (!CLIENT_ID || !CLIENT_SECRET || !DASHBOARD_URL || !request.query.code) return response.status(400).send("OAuth is not configured or the code is missing.");
      const tokenResponse = await fetch("https://discord.com/api/oauth2/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, grant_type: "authorization_code", code: String(request.query.code), redirect_uri: `${DASHBOARD_URL}/auth/discord/callback` }),
      });
      if (!tokenResponse.ok) return response.status(401).send("Discord OAuth failed.");
      const token = (await tokenResponse.json()) as { access_token?: string };
      if (!token.access_token) return response.status(401).send("Discord OAuth returned no token.");
      const userResponse = await fetch("https://discord.com/api/users/@me", { headers: { Authorization: `Bearer ${token.access_token}` } });
      if (!userResponse.ok) return response.status(401).send("Discord identity lookup failed.");
      const user = (await userResponse.json()) as { id: string; username: string; avatar?: string | null };
      if (!OWNER_USER_ID || !constantTimeEqual(user.id, OWNER_USER_ID)) return response.status(403).send("This Discord account is not the configured owner.");
      const storedUser = await upsertDashboardUser(user);
      const session = await createDashboardSession(storedUser.id, SESSION_TTL_MS);
      response.setHeader("Set-Cookie", `${SESSION_COOKIE}=${session.id}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_MS / 1000}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`);
      return response.redirect(DASHBOARD_URL);
    } catch {
      return response.status(500).send("Login failed.");
    }
  });

  app.post("/auth/logout", requireOwner, async (request: AuthenticatedRequest, response) => {
    const sessionId = cookieValue(request);
    if (sessionId) await deleteDashboardSession(sessionId);
    response.setHeader("Set-Cookie", `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
    return response.status(204).send();
  });

  app.get("/api/me", requireOwner, (request: AuthenticatedRequest, response) => response.json({ user: request.dashboardUser, accessLevel: "OWNER" }));
  app.get("/api/system/status", requireOwner, (_request, response) => response.json({
    bot: { ready: client.isReady(), user: client.user?.tag ?? null, uptimeMs: client.uptime, guildCount: client.guilds.cache.size, ping: client.ws.ping },
    ai: { provider: process.env.AI_PROVIDER ?? "gemini", model: process.env.AI_PROVIDER === "openai" ? process.env.OPENAI_MODEL ?? "gpt-4o-mini" : process.env.GEMINI_MODEL ?? "gemini-2.0-flash" },
    database: { configured: Boolean(process.env.DATABASE_URL) },
  }));
  app.get("/api/audit", requireOwner, async (_request, response) => response.json({ entries: await getDashboardAudit() }));
  app.get("/api/guilds", requireOwner, (_request, response) => response.json({ guilds: client.guilds.cache.map((guild) => safeGuild(client, guild.id)) }));
  app.get("/api/commands", requireOwner, (_request, response) => response.json({ commands: getAllToolDefinitions() }));
  app.get("/api/guilds/:guildId/members", requireOwner, async (request, response) => {
    const guildId = String(request.params.guildId);
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return response.status(404).json({ error: "Bot is not connected to this server." });
    const members = await guild.members.fetch();
    return response.json({ members: members.map((member) => ({ id: member.id, username: member.user.username, displayName: member.displayName, avatar: member.displayAvatarURL({ size: 64 }), roles: member.roles.cache.filter((role) => role.id !== guild.id).map((role) => ({ id: role.id, name: role.name })), joinedAt: member.joinedAt })) });
  });
  app.get("/api/guilds/:guildId/roles", requireOwner, (request, response) => {
    const guildId = String(request.params.guildId);
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return response.status(404).json({ error: "Bot is not connected to this server." });
    return response.json({ roles: guild.roles.cache.sort((a, b) => b.position - a.position).map((role) => ({ id: role.id, name: role.name, color: role.hexColor, position: role.position, managed: role.managed, hoist: role.hoist, mentionable: role.mentionable, memberCount: role.members.size })) });
  });
  app.get("/api/guilds/:guildId/channels", requireOwner, (request, response) => {
    const guildId = String(request.params.guildId);
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return response.status(404).json({ error: "Bot is not connected to this server." });
    return response.json({ channels: guild.channels.cache.map((channel) => ({ id: channel.id, name: channel.name, type: channel.type, parentId: channel.parentId, position: "rawPosition" in channel ? channel.rawPosition : 0 })).sort((a, b) => a.position - b.position) });
  });
  app.post("/api/guilds/:guildId/actions", requireOwner, async (request: AuthenticatedRequest, response) => {
    const guildId = String(request.params.guildId);
    const guild = client.guilds.cache.get(guildId);
    const body = request.body as { tool?: string; parameters?: Record<string, unknown>; confirm?: boolean };
    if (!guild) return response.status(404).json({ error: "Bot is not connected to this server." });
    if (!body.tool || !body.parameters || body.confirm !== true) return response.status(400).json({ error: "A tool, parameters, and explicit confirmation are required." });
    const requester = await guild.members.fetch(request.dashboardUser!.id).catch(() => null);
    if (!requester) return response.status(503).json({ error: "Bot member is unavailable in this server." });
    const bot = guild.members.me ?? (await guild.members.fetchMe());
    const ctx: ToolContext = { guild, requester, bot, channelId: "dashboard" };
    const prepared = prepareToolCall({ tool: body.tool, parameters: body.parameters }, ctx);
    if (prepared.status === "rejected") {
      await logDashboardAudit({ userId: request.dashboardUser!.id, action: `tool:${body.tool}`, guildId: guild.id, parameters: body.parameters, success: false, error: prepared.reason });
      return response.status(403).json({ error: prepared.reason });
    }
    if (prepared.requiresConfirmation && body.confirm !== true) return response.status(400).json({ error: "This action requires confirmation." });
    const result = await runTool(prepared.call, ctx);
    await logDashboardAudit({ userId: request.dashboardUser!.id, action: `tool:${body.tool}`, guildId: guild.id, parameters: body.parameters, success: result.success, error: result.success ? undefined : result.message });
    return response.status(result.success ? 200 : 409).json(result);
  });
  app.get("/api/invites", requireOwner, (_request, response) => {
    if (!CLIENT_ID) return response.status(503).json({ error: "DISCORD_CLIENT_ID is not configured." });
    const permissions = new PermissionsBitField(["ViewChannel", "SendMessages", "ReadMessageHistory", "ManageRoles", "ManageChannels", "KickMembers", "BanMembers", "ModerateMembers"]).bitfield.toString();
    response.json({ clientId: CLIENT_ID, permissions, url: `https://discord.com/oauth2/authorize?client_id=${CLIENT_ID}&scope=bot%20applications.commands&permissions=${permissions}` });
  });

  const port = Number(process.env.DASHBOARD_PORT ?? 3000);
  return app.listen(port, () => console.log(`[INFO] [dashboard] Control Center listening on port ${port}`));
}