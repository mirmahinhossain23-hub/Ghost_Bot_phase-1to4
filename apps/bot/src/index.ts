import "dotenv/config";
import { Events } from "discord.js";
import { getAIProvider } from "@ghost/ai";
import { createLogger } from "@ghost/shared";
import { createGhostClient } from "./client.js";
import { registerMessageCreate } from "./events/messageCreate.js";
import { registerInteractionCreate } from "./events/interactionCreate.js";
import { startDashboard } from "./dashboard.js";

const log = createLogger("bot");

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    log.error(`Missing required environment variable: ${name}. Copy .env.example to .env and fill it in.`);
    process.exit(1);
  }
  return value;
}

async function main() {
  const token = requireEnv("DISCORD_TOKEN");
  const wakeWord = process.env.GHOST_WAKE_WORD || "ghost";

  const provider = getAIProvider();
  log.info(`AI provider: ${provider.name}`);

  const client = createGhostClient();
  const dashboardServer = startDashboard(client);

  client.once(Events.ClientReady, (readyClient) => {
    log.info(`Ghost is online as ${readyClient.user.tag}`);
    log.info(`Wake word: "${wakeWord}" (also responds to @mentions)`);
  });

  registerMessageCreate(client, provider, wakeWord);
  registerInteractionCreate(client);

  client.on(Events.Error, (error) => log.error("Discord client error", error));

  await client.login(token);

  const shutdown = async () => {
    dashboardServer.close();
    await client.destroy();
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

main().catch((error) => {
  log.error("Fatal error during startup", error);
  process.exit(1);
});
