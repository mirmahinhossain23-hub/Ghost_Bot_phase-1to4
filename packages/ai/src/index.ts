import { GeminiProvider } from "./providers/gemini.js";
import { OpenAIProvider } from "./providers/openai.js";
import type { AIProvider } from "./types.js";

export * from "./types.js";
export { buildSystemPrompt } from "./prompt.js";
export { GeminiProvider } from "./providers/gemini.js";
export { OpenAIProvider } from "./providers/openai.js";

/**
 * Reads AI_PROVIDER from the environment and builds the matching
 * provider. This is the ONLY place in the whole project that branches
 * on which AI backend is active — everything downstream just sees the
 * AIProvider interface.
 */
export function getAIProvider(env: NodeJS.ProcessEnv = process.env): AIProvider {
  const provider = (env.AI_PROVIDER ?? "gemini").toLowerCase();

  if (provider === "gemini") {
    return new GeminiProvider(env.GEMINI_API_KEY ?? "", env.GEMINI_MODEL || "gemini-2.0-flash");
  }

  if (provider === "openai") {
    return new OpenAIProvider(env.OPENAI_API_KEY ?? "", env.OPENAI_MODEL || "gpt-4o-mini");
  }

  throw new Error(`Unknown AI_PROVIDER "${provider}". Use "gemini" or "openai".`);
}
