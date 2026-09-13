import type { PlannedCategory, PlannedRole } from "./planModel.js";

export interface TemplateSection {
  id: string;
  label: string;
  category: PlannedCategory;
}

export interface ServerTemplate {
  id: string;
  name: string;
  description: string;
  coreSections: PlannedCategory[];
  optionalSections: TemplateSection[];
  suggestedRoles: PlannedRole[];
}

function textChannels(names: string[]): PlannedCategory["channels"] {
  return names.map((name) => ({ name, kind: "text" as const }));
}

export const SERVER_TEMPLATES: ServerTemplate[] = [
  {
    id: "roblox-dev-studio",
    name: "Roblox Development Studio",
    description: "For a Roblox game development team — announcements, community, and a dev workspace.",
    coreSections: [
      { name: "Information", channels: textChannels(["announcements", "rules", "updates"]) },
      { name: "Community", channels: textChannels(["general", "media", "suggestions"]) },
      { name: "Development", channels: textChannels(["development-chat", "bug-reports", "ideas"]) },
    ],
    optionalSections: [
      {
        id: "clients",
        label: "Clients",
        category: { name: "Clients", channels: textChannels(["client-chat", "commissions"]) },
      },
      {
        id: "qa",
        label: "QA / Testing",
        category: { name: "QA", channels: textChannels(["testing-chat", "bug-tracker"]) },
      },
      {
        id: "partnerships",
        label: "Partnerships",
        category: { name: "Partnerships", channels: textChannels(["partner-chat"]) },
      },
      {
        id: "recruitment",
        label: "Recruitment",
        category: { name: "Recruitment", channels: textChannels(["applications", "interviews"]) },
      },
    ],
    suggestedRoles: [
      { name: "Owner", color: "#EC4899" },
      { name: "Developer", color: "#7C3AED" },
      { name: "Tester", color: "#06B6D4" },
      { name: "Client", color: "#F97316" },
      { name: "Member", color: "#99AAB5" },
    ],
  },
  {
    id: "gaming-community",
    name: "Gaming Community",
    description: "A community server for a game or gaming group — chat, voice, and events.",
    coreSections: [
      { name: "Information", channels: textChannels(["announcements", "rules"]) },
      { name: "Community", channels: textChannels(["general", "memes", "clips"]) },
      {
        name: "Voice",
        channels: [
          { name: "General Voice", kind: "voice" },
          { name: "Gaming Voice", kind: "voice" },
        ],
      },
    ],
    optionalSections: [
      {
        id: "tournaments",
        label: "Tournaments",
        category: { name: "Tournaments", channels: textChannels(["tournament-chat", "bracket-updates"]) },
      },
      {
        id: "lfg",
        label: "Looking For Group",
        category: { name: "LFG", channels: textChannels(["looking-for-group"]) },
      },
      {
        id: "fan-art",
        label: "Fan Art",
        category: { name: "Creative", channels: textChannels(["fan-art"]) },
      },
    ],
    suggestedRoles: [
      { name: "Admin", color: "#EF4444" },
      { name: "Moderator", color: "#F97316" },
      { name: "VIP", color: "#EAB308" },
      { name: "Member", color: "#99AAB5" },
    ],
  },
  {
    id: "business-agency",
    name: "Business / Agency",
    description: "A workspace-style server for a small business or agency team plus their clients.",
    coreSections: [
      { name: "Information", channels: textChannels(["announcements", "updates"]) },
      { name: "Team", channels: textChannels(["team-chat", "project-updates"]) },
      { name: "Clients", channels: textChannels(["client-chat", "proposals"]) },
    ],
    optionalSections: [
      {
        id: "sales",
        label: "Sales",
        category: { name: "Sales", channels: textChannels(["leads", "deals"]) },
      },
      {
        id: "hr",
        label: "HR",
        category: { name: "HR", channels: textChannels(["hr-chat", "applications"]) },
      },
    ],
    suggestedRoles: [
      { name: "Executive", color: "#7C3AED" },
      { name: "Manager", color: "#4F8CFF" },
      { name: "Employee", color: "#22C55E" },
      { name: "Client", color: "#F97316" },
    ],
  },
  {
    id: "content-creator",
    name: "Content Creator Community",
    description: "A hub for a creator's audience — announcements, community chat, and content feedback.",
    coreSections: [
      { name: "Information", channels: textChannels(["announcements", "rules"]) },
      { name: "Community", channels: textChannels(["general", "fan-chat"]) },
      { name: "Content", channels: textChannels(["content-feedback", "suggestions"]) },
    ],
    optionalSections: [
      {
        id: "memberships",
        label: "Memberships",
        category: { name: "Memberships", channels: textChannels(["perks", "exclusive-chat"]) },
      },
      {
        id: "collabs",
        label: "Collabs",
        category: { name: "Collabs", channels: textChannels(["collab-requests"]) },
      },
    ],
    suggestedRoles: [
      { name: "Creator", color: "#EC4899" },
      { name: "Moderator", color: "#F97316" },
      { name: "Subscriber", color: "#EAB308" },
      { name: "Member", color: "#99AAB5" },
    ],
  },
  {
    id: "staff-team",
    name: "Staff Team",
    description: "An internal staff/moderation workspace — meant to sit alongside an existing community server.",
    coreSections: [
      { name: "Staff", channels: [...textChannels(["staff-chat", "staff-announcements"]), { name: "Staff Voice", kind: "voice" }] },
      { name: "Management", channels: textChannels(["leadership-chat", "decisions"]) },
    ],
    optionalSections: [
      {
        id: "applications",
        label: "Applications",
        category: { name: "Applications", channels: textChannels(["staff-applications", "interviews"]) },
      },
      {
        id: "logs",
        label: "Logs",
        category: { name: "Logs", channels: textChannels(["mod-logs", "action-logs"]) },
      },
    ],
    suggestedRoles: [
      { name: "Owner", color: "#EC4899" },
      { name: "Admin", color: "#EF4444" },
      { name: "Moderator", color: "#F97316" },
      { name: "Trial Mod", color: "#EAB308" },
    ],
  },
  {
    id: "simple-community",
    name: "Simple Community",
    description: "A small, no-frills community server — just the essentials.",
    coreSections: [
      { name: "Information", channels: textChannels(["announcements", "rules"]) },
      { name: "General", channels: textChannels(["general", "off-topic"]) },
    ],
    optionalSections: [
      {
        id: "voice",
        label: "Voice Channels",
        category: { name: "Voice", channels: [{ name: "General Voice", kind: "voice" }] },
      },
    ],
    suggestedRoles: [
      { name: "Admin", color: "#EF4444" },
      { name: "Member", color: "#99AAB5" },
    ],
  },
];

export function getTemplate(id: string): ServerTemplate | undefined {
  return SERVER_TEMPLATES.find((t) => t.id === id);
}

export function getTemplateNames(): string[] {
  return SERVER_TEMPLATES.map((t) => t.id);
}

/** Turns a template + a list of chosen optional section IDs into a concrete plan's building blocks. */
export function instantiateTemplate(
  template: ServerTemplate,
  includeSections: string[] = []
): { categories: PlannedCategory[]; roles: PlannedRole[] } {
  const chosen = template.optionalSections.filter((section) => includeSections.includes(section.id));
  return {
    categories: [...template.coreSections, ...chosen.map((s) => s.category)],
    roles: template.suggestedRoles,
  };
}
