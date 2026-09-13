import type { ToolCall, ToolDefinition } from "@ghost/shared";

export interface AIMessage {
  role: "user" | "assistant";
  /** Discord display name of whoever sent a "user" message, for context. */
  authorName?: string;
  content: string;
}

export interface AIRequest {
  systemPrompt: string;
  history: AIMessage[];
  tools: ToolDefinition[];
}

export interface AIResponse {
  /** The natural-language reply Ghost should show the user. */
  message: string;
  /** Any actions the AI wants to take, to be validated before execution. */
  toolCalls: ToolCall[];
}

/**
 * Every AI backend (Gemini, OpenAI, whatever comes next) implements this
 * one interface. Nothing else in the codebase is allowed to know which
 * provider is active — that's the whole point of the abstraction.
 */
export interface AIProvider {
  readonly name: "gemini" | "openai";
  generate(request: AIRequest): Promise<AIResponse>;
}
