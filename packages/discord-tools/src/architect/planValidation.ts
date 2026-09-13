import type { ServerPlan } from "./planModel.js";
import type { ServerSnapshot } from "./serverInspection.js";

// Discord's actual, documented platform ceilings — a safety margin is
// applied on top rather than validating right up to the exact limit.
const MAX_CHANNELS_PER_GUILD = 500;
const MAX_CHANNELS_PER_CATEGORY = 50;
const MAX_ROLES_PER_GUILD = 250;
const MAX_NAME_LENGTH = 100;

export interface PlanValidationResult {
  ok: boolean;
  errors: string[];
}

export function validatePlan(plan: ServerPlan, existing: ServerSnapshot): PlanValidationResult {
  const errors: string[] = [];

  validateStructure(plan, errors);
  validateNames(plan, errors);
  validateResourceLimits(plan, existing, errors);

  return { ok: errors.length === 0, errors };
}

function validateStructure(plan: ServerPlan, errors: string[]): void {
  // Duplicate category names within the plan.
  const categoryNames = plan.categories.map((c) => c.name.trim().toLowerCase());
  const dupeCategories = findDuplicates(categoryNames);
  if (dupeCategories.length > 0) {
    errors.push(`Duplicate categories in the plan: ${dupeCategories.join(", ")}.`);
  }

  // Duplicate channel names within the SAME category.
  for (const category of plan.categories) {
    const names = category.channels.map((c) => c.name.trim().toLowerCase());
    const dupes = findDuplicates(names);
    if (dupes.length > 0) {
      errors.push(`Duplicate channels in "${category.name}": ${dupes.join(", ")}.`);
    }
  }

  // Duplicate standalone channel names.
  const standaloneNames = plan.standaloneChannels.map((c) => c.name.trim().toLowerCase());
  const dupeStandalone = findDuplicates(standaloneNames);
  if (dupeStandalone.length > 0) {
    errors.push(`Duplicate standalone channels: ${dupeStandalone.join(", ")}.`);
  }

  // Duplicate role names.
  const roleNames = plan.roles.map((r) => r.name.trim().toLowerCase());
  const dupeRoles = findDuplicates(roleNames);
  if (dupeRoles.length > 0) {
    errors.push(`Duplicate roles in the plan: ${dupeRoles.join(", ")}.`);
  }

  // A plan with genuinely nothing in it isn't buildable.
  const hasContent = plan.categories.length > 0 || plan.standaloneChannels.length > 0 || plan.roles.length > 0;
  if (!hasContent) {
    errors.push("This plan doesn't contain anything to build yet.");
  }
}

function validateNames(plan: ServerPlan, errors: string[]): void {
  const checkName = (name: string, kind: string) => {
    if (!name || !name.trim()) {
      errors.push(`A ${kind} name can't be empty.`);
    } else if (name.length > MAX_NAME_LENGTH) {
      errors.push(`"${name}" is too long for a ${kind} name (max ${MAX_NAME_LENGTH} characters).`);
    }
  };

  for (const category of plan.categories) {
    checkName(category.name, "category");
    for (const channel of category.channels) {
      checkName(channel.name, "channel");
    }
  }
  for (const channel of plan.standaloneChannels) {
    checkName(channel.name, "channel");
  }
  for (const role of plan.roles) {
    checkName(role.name, "role");
    if (role.name.trim().toLowerCase() === "@everyone") {
      errors.push("The @everyone role can't be created — it already exists in every server.");
    }
  }
}

function validateResourceLimits(plan: ServerPlan, existing: ServerSnapshot, errors: string[]): void {
  for (const category of plan.categories) {
    if (category.channels.length > MAX_CHANNELS_PER_CATEGORY) {
      errors.push(
        `"${category.name}" has ${category.channels.length} channels planned, over Discord's ${MAX_CHANNELS_PER_CATEGORY}-per-category limit.`
      );
    }
  }

  const plannedChannelCount =
    plan.categories.reduce((sum, c) => sum + c.channels.length, 0) +
    plan.standaloneChannels.length +
    plan.categories.length; // categories themselves count toward the channel limit too

  if (existing.channelCount + existing.categoryCount + plannedChannelCount > MAX_CHANNELS_PER_GUILD) {
    errors.push(
      `This plan would push the server past Discord's ${MAX_CHANNELS_PER_GUILD}-channel limit (currently at ${existing.channelCount + existing.categoryCount}, plan adds ${plannedChannelCount}).`
    );
  }

  if (existing.roleCount + plan.roles.length > MAX_ROLES_PER_GUILD) {
    errors.push(
      `This plan would push the server past Discord's ${MAX_ROLES_PER_GUILD}-role limit (currently at ${existing.roleCount}, plan adds ${plan.roles.length}).`
    );
  }
}

function findDuplicates(values: string[]): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) dupes.add(value);
    seen.add(value);
  }
  return [...dupes];
}
