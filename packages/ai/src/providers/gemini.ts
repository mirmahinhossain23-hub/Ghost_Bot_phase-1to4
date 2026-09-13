import { GoogleGenAI } from "@google/genai";
import type { ToolCall, ToolDefinition, ToolParameterSchema } from "@ghost/shared";
import type { AIProvider, AIRequest, AIResponse } from "../types.js";

/**
 * Converts our provider-agnostic ToolDefinition parameters into the
 * JSON-schema-shaped object Gemini's functionDeclarations expect.
 *
 * NOTE: the @google/genai SDK's TypeScript types for schemas are still
 * evolving release to release, so this function intentionally returns
 * `any` — it's a boundary-conversion function, not app logic, and pinning
 * it to a specific SDK type version would make upgrades more brittle,
 * not less.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toGeminiSchema(schema: ToolParameterSchema): any {
  switch (schema.type) {
    case "string":
      return {
        type: "STRING",
        description: schema.description,
        ...(schema.enum ? { enum: schema.enum } : {}),
      };
    case "number":
      return { type: "NUMBER", description: schema.description };
    case "boolean":
      return { type: "BOOLEAN", description: schema.description };
    case "array":
      return {
        type: "ARRAY",
        description: schema.description,
        items: schema.items ? toGeminiSchema(schema.items) : { type: "STRING" },
      };
    case "object":
      return {
        type: "OBJECT",
        description: schema.description,
        ...(schema.properties ? objectSchemaFields(schema.properties) : {}),
      };
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function objectSchemaFields(properties: Record<string, ToolParameterSchema>): any {
  const fieldProps: Record<string, unknown> = {};
  const required: string[] = [];
  for (const [key, schema] of Object.entries(properties)) {
    fieldProps[key] = toGeminiSchema(schema);
    if (!schema.optional) required.push(key);
  }
  return { properties: fieldProps, ...(required.length ? { required } : {}) };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toGeminiFunctionDeclaration(tool: ToolDefinition): any {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const [key, schema] of Object.entries(tool.parameters)) {
    properties[key] = toGeminiSchema(schema);
    if (!schema.optional) required.push(key);
  }

  return {
    name: tool.name,
    description: tool.description,
    parameters: {
      type: "OBJECT",
      properties,
      ...(required.length ? { required } : {}),
    },
  };
}

export class GeminiProvider implements AIProvider {
  readonly name = "gemini" as const;
  private client: GoogleGenAI;
  private model: string;

  constructor(apiKey: string, model = "gemini-2.0-flash") {
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not set. Add it to your .env file.");
    }
    this.client = new GoogleGenAI({ apiKey });
    this.model = model;
  }

  async generate(request: AIRequest): Promise<AIResponse> {
    const contents = request.history.map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [
        {
          text: message.authorName ? `${message.authorName}: ${message.content}` : message.content,
        },
      ],
    }));

    const functionDeclarations = request.tools.map(toGeminiFunctionDeclaration);

    const response = await this.client.models.generateContent({
      model: this.model,
      contents,
      config: {
        systemInstruction: request.systemPrompt,
        ...(functionDeclarations.length
          ? { tools: [{ functionDeclarations }] }
          : {}),
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const toolCalls: ToolCall[] = extractFunctionCalls(response);

    return {
      message: response.text?.trim() || (toolCalls.length ? "" : "I'm not sure how to respond to that."),
      toolCalls,
    };
  }
}

/**
 * Reads function calls off the response defensively: the convenience
 * `.functionCalls` getter is the documented path, but we fall back to
 * walking `candidates[0].content.parts` in case a given SDK version
 * doesn't expose it, so Ghost degrades gracefully instead of crashing.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractFunctionCalls(response: any): ToolCall[] {
  const direct = response?.functionCalls;
  if (Array.isArray(direct) && direct.length > 0) {
    return direct.map((call: { name: string; args?: Record<string, unknown> }) => ({
      tool: call.name,
      parameters: call.args ?? {},
    }));
  }

  const parts: unknown[] = response?.candidates?.[0]?.content?.parts ?? [];
  const calls: ToolCall[] = [];
  for (const part of parts) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fc = (part as any)?.functionCall;
    if (fc?.name) {
      calls.push({ tool: fc.name, parameters: fc.args ?? {} });
    }
  }
  return calls;
}
