import type { ToolResult } from "@ghost/shared";
import { registerTool } from "../registry.js";

registerTool({
  definition: {
    name: "shutdown_bot",
    description: "Stops the Ghost bot process. This does not delete or change the Discord server.",
    parameters: {},
    mutating: true,
    requiresConfirmation: true,
    requiredUserPermission: "Administrator",
    baseRisk: "high",
  },
  handler: async (_params, _ctx): Promise<ToolResult> => ({
    tool: "shutdown_bot",
    parameters: {},
    success: true,
    message: "Ghost is shutting down.",
  }),
});