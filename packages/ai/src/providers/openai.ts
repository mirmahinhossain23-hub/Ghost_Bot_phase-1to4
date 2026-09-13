import OpenAI from "openai";
import type { ToolCall, ToolDefinition, ToolParameterSchema } from "@ghost/shared";
import type { AIProvider, AIRequest, AIResponse } from "../types.js";

function toJsonSchema(schema: ToolParameterSchema): Record<string, unknown> {
  switch (schema.type) {
    case "string":
      return { type: "string", description: schema.description, ...(schema.enum ? { enum: schema.enum } : {}) };
    case "number":
      return { type: "number", description: schema.description };
    case "boolean":
      return { type: "boolean", description: schema.description };
    case "array":
      return {
        type: "array",
        description: schema.description,
        items: schema.items ? toJsonSchema(schema.items) : { type: "string" },
      };
    case "object": {
      if (!schema.properties) return { type: "object", description: schema.description };
      const properties: Record<string, unknown> = {};
      const required: string[] = [];
      for (const [key, propSchema] of Object.entries(schema.properties)) {
        properties[key] = toJsonSchema(propSchema);
        if (!propSchema.optional) required.push(key);
      }
      return { type: "object", description: schema.description, properties, required };
    }
  }
}

function toOpenAiTool(tool: ToolDefinition): OpenAI.Chat.Completions.ChatCompletionTool {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const [key, schema] of Object.entries(tool.parameters)) {
    properties[key] = toJsonSchema(schema);
    if (!schema.optional) required.push(key);
  }

  return {
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: {
        type: "object",
        properties,
        required,
      },
    },
  };
}

export class OpenAIProvider implements AIProvider {
  readonly name = "openai" as const;
  private client: OpenAI;
  private model: string;

  constructor(apiKey: string, model = "gpt-4o-mini") {
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY is not set. Add it to your .env file.");
    }
    this.client = new OpenAI({ apiKey });
    this.model = model;
  }

  async generate(request: AIRequest): Promise<AIResponse> {
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: "system", content: request.systemPrompt },
      ...request.history.map((message): OpenAI.Chat.Completions.ChatCompletionMessageParam => ({
        role: message.role,
        content: message.authorName ? `${message.authorName}: ${message.content}` : message.content,
      })),
    ];

    const tools = request.tools.map(toOpenAiTool);

    const completion = await this.client.chat.completions.create({
      model: this.model,
      messages,
      ...(tools.length ? { tools } : {}),
    });

    const choice = completion.choices[0]?.message;

    const toolCalls: ToolCall[] = (choice?.tool_calls ?? [])
      .filter((call): call is OpenAI.Chat.Completions.ChatCompletionMessageToolCall & {
        type: "function";
      } => call.type === "function")
      .map((call) => ({
        tool: call.function.name,
        parameters: safeParseJson(call.function.arguments),
      }));

    return {
      message: choice?.content?.trim() || (toolCalls.length ? "" : "I'm not sure how to respond to that."),
      toolCalls,
    };
  }
}

function safeParseJson(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}
