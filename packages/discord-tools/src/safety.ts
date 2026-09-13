import type { ToolDefinition, ToolParameterSchema, ValidationResult } from "@ghost/shared";

/**
 * Validates AI-supplied parameters against the tool's declared schema.
 * This is intentionally strict and dumb — no regex-based "smart"
 * coercion. If the AI got a type wrong, we reject it and let the AI
 * retry rather than guessing what it meant.
 */
export function validateParameters(
  definition: ToolDefinition,
  parameters: Record<string, unknown>
): ValidationResult {
  for (const [key, schema] of Object.entries(definition.parameters)) {
    const value = parameters[key];
    const missing = value === undefined || value === null;

    if (missing) {
      if (schema.optional) continue;
      return { ok: false, reason: `Missing required parameter "${key}".` };
    }

    const typeCheck = checkType(value, schema);
    if (!typeCheck.ok) {
      return { ok: false, reason: `Parameter "${key}": ${typeCheck.reason}` };
    }
  }

  // Reject unknown parameters outright — the AI should only ever send
  // what the tool declared, nothing extra.
  for (const key of Object.keys(parameters)) {
    if (!(key in definition.parameters)) {
      return { ok: false, reason: `Unexpected parameter "${key}" for tool "${definition.name}".` };
    }
  }

  return { ok: true };
}

function checkType(value: unknown, schema: ToolParameterSchema): ValidationResult {
  switch (schema.type) {
    case "string":
      if (typeof value !== "string") return { ok: false, reason: "expected a string." };
      if (schema.enum && !schema.enum.includes(value)) {
        return { ok: false, reason: `must be one of: ${schema.enum.join(", ")}.` };
      }
      return { ok: true };
    case "number":
      if (typeof value !== "number" || Number.isNaN(value)) {
        return { ok: false, reason: "expected a number." };
      }
      return { ok: true };
    case "boolean":
      if (typeof value !== "boolean") return { ok: false, reason: "expected true/false." };
      return { ok: true };
    case "array":
      if (!Array.isArray(value)) return { ok: false, reason: "expected an array." };
      if (schema.items) {
        for (const item of value) {
          const itemCheck = checkType(item, schema.items);
          if (!itemCheck.ok) return itemCheck;
        }
      }
      return { ok: true };
    case "object": {
      if (typeof value !== "object" || Array.isArray(value) || value === null) {
        return { ok: false, reason: "expected an object." };
      }
      if (schema.properties) {
        return checkObjectProperties(value as Record<string, unknown>, schema.properties);
      }
      return { ok: true };
    }
    default:
      return { ok: false, reason: "unknown schema type." };
  }
}

/** Same missing/type/unexpected-key checks as validateParameters, applied to a nested object field. */
function checkObjectProperties(
  value: Record<string, unknown>,
  properties: Record<string, ToolParameterSchema>
): ValidationResult {
  for (const [key, schema] of Object.entries(properties)) {
    const fieldValue = value[key];
    const missing = fieldValue === undefined || fieldValue === null;

    if (missing) {
      if (schema.optional) continue;
      return { ok: false, reason: `missing required field "${key}".` };
    }

    const fieldCheck = checkType(fieldValue, schema);
    if (!fieldCheck.ok) {
      return { ok: false, reason: `field "${key}": ${fieldCheck.reason}` };
    }
  }

  for (const key of Object.keys(value)) {
    if (!(key in properties)) {
      return { ok: false, reason: `unexpected field "${key}".` };
    }
  }

  return { ok: true };
}

/** Extra, tool-agnostic guardrails that apply no matter what the tool is. */
export function checkGlobalSafetyRules(
  definition: ToolDefinition,
  parameters: Record<string, unknown>
): ValidationResult {
  // Never let the AI touch the @everyone role through generic role tools.
  const roleNameFields = ["name", "roleName"];
  for (const field of roleNameFields) {
    const value = parameters[field];
    if (typeof value === "string" && value.trim().toLowerCase() === "@everyone") {
      return { ok: false, reason: "The @everyone role can't be managed through this tool." };
    }
  }

  if (definition.name === "create_role") {
    const name = parameters.name;
    if (typeof name === "string" && name.length > 100) {
      return { ok: false, reason: "Role names must be 100 characters or fewer." };
    }
  }

  return { ok: true };
}
