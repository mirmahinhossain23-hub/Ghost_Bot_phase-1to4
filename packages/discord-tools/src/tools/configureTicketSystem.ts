import type { ToolResult } from "@ghost/shared";
import { registerTool } from "../registry.js";
import { setUpTicketScaffolding, type TicketType } from "../architect/ticketConfig.js";

registerTool({
  definition: {
    name: "configure_ticket_system",
    description:
      "Sets up the foundation for a support ticket system: a ticket category, a panel channel, and staff-role " +
      "access per ticket type. IMPORTANT: this creates the real structure but does NOT implement clickable " +
      "'open a ticket' buttons yet — that interactive flow is future work. Say so plainly when using this tool.",
    parameters: {
      ticketTypes: {
        type: "array",
        description: "The kinds of tickets to support, each naming the staff role that should handle it.",
        items: {
          type: "object",
          description: "One ticket type.",
          properties: {
            label: { type: "string", description: "e.g. 'Support', 'Billing', 'Report a user'." },
            staffRoleName: { type: "string", description: "Existing role that should have access to this ticket type." },
          },
        },
      },
      categoryName: { type: "string", description: "Category to hold ticket channels. Defaults to 'Tickets'.", optional: true },
      panelChannelName: { type: "string", description: "The info/panel channel name. Defaults to 'create-a-ticket'.", optional: true },
    },
    mutating: true,
    requiresConfirmation: true,
    requiredUserPermission: "ManageGuild",
    requiredBotPermission: "ManageChannels",
    baseRisk: "medium",
  },
  handler: async (params, ctx): Promise<ToolResult> => {
    const ticketTypes = params.ticketTypes as TicketType[];
    if (!ticketTypes || ticketTypes.length === 0) {
      return {
        tool: "configure_ticket_system",
        parameters: params,
        success: false,
        message: "At least one ticket type is required.",
      };
    }

    const categoryName = (params.categoryName as string | undefined) ?? "Tickets";
    const panelChannelName = (params.panelChannelName as string | undefined) ?? "create-a-ticket";

    const result = await setUpTicketScaffolding({ categoryName, panelChannelName, ticketTypes }, ctx);
    if (!result.ok) {
      return { tool: "configure_ticket_system", parameters: params, success: false, message: result.error! };
    }

    return {
      tool: "configure_ticket_system",
      parameters: params,
      success: true,
      message:
        `Set up the ticket system foundation: category **${categoryName}**, panel channel **#${panelChannelName}**, ` +
        `${ticketTypes.length} ticket type${ticketTypes.length === 1 ? "" : "s"} (${ticketTypes.map((t) => t.label).join(", ")}).\n\n` +
        `**Note:** this is the real structure and configuration, but the interactive "click to open a ticket" ` +
        `button flow isn't built yet — that's future work on top of this foundation.`,
      data: {
        categoryId: result.categoryId,
        panelChannelId: result.panelChannelId,
        categoryName,
        panelChannelName,
        ticketTypes,
      },
    };
  },
});
