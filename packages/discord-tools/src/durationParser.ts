export interface ParsedDuration {
  ms: number;
  /** Clean human label for confirmation prompts, e.g. "30 minutes". */
  label: string;
}

export type DurationResult = { ok: true; value: ParsedDuration } | { ok: false; reason: string };

// Discord's own hard ceiling for a timeout ("communication disabled until").
const MAX_TIMEOUT_MS = 28 * 24 * 60 * 60 * 1000; // 28 days
const MIN_TIMEOUT_MS = 60 * 1000; // 1 minute — shorter is almost always a typo, not intent

const UNIT_MS: Record<string, number> = {
  s: 1000,
  sec: 1000,
  secs: 1000,
  second: 1000,
  seconds: 1000,
  m: 60 * 1000,
  min: 60 * 1000,
  mins: 60 * 1000,
  minute: 60 * 1000,
  minutes: 60 * 1000,
  h: 60 * 60 * 1000,
  hr: 60 * 60 * 1000,
  hrs: 60 * 60 * 1000,
  hour: 60 * 60 * 1000,
  hours: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
  day: 24 * 60 * 60 * 1000,
  days: 24 * 60 * 60 * 1000,
  w: 7 * 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
  weeks: 7 * 24 * 60 * 60 * 1000,
};

const PATTERN = /^(\d+(?:\.\d+)?)\s*([a-zA-Z]+)$/;

/**
 * Parses a single "<number> <unit>" duration. Deliberately strict:
 * unrecognized units or out-of-range values are rejected with a clear
 * reason rather than silently clamped or guessed at.
 */
export function parseDuration(input: string): DurationResult {
  const trimmed = input.trim().toLowerCase();
  const match = trimmed.match(PATTERN);

  if (!match) {
    return {
      ok: false,
      reason: `I don't understand the duration "${input}". Try something like "10m", "30 minutes", "2 hours", "1 day", or "1 week".`,
    };
  }

  const [, numberPart, unitPart] = match;
  const amount = Number(numberPart);
  const unitMs = UNIT_MS[unitPart];

  if (!unitMs) {
    return {
      ok: false,
      reason: `I don't recognize the time unit "${unitPart}". Use seconds, minutes, hours, days, or weeks.`,
    };
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, reason: "Duration must be a positive number." };
  }

  const ms = Math.round(amount * unitMs);

  if (ms < MIN_TIMEOUT_MS) {
    return { ok: false, reason: "The shortest timeout Ghost will apply is 1 minute." };
  }

  if (ms > MAX_TIMEOUT_MS) {
    return { ok: false, reason: "Discord's timeouts can't exceed 28 days." };
  }

  return { ok: true, value: { ms, label: formatDuration(ms) } };
}

export function formatDuration(ms: number): string {
  const minutes = ms / (60 * 1000);
  if (minutes < 60) return `${trimTrailingZero(minutes)} minute${minutes === 1 ? "" : "s"}`;

  const hours = ms / (60 * 60 * 1000);
  if (hours < 24) return `${trimTrailingZero(hours)} hour${hours === 1 ? "" : "s"}`;

  const days = ms / (24 * 60 * 60 * 1000);
  if (days < 7) return `${trimTrailingZero(days)} day${days === 1 ? "" : "s"}`;

  const weeks = ms / (7 * 24 * 60 * 60 * 1000);
  return `${trimTrailingZero(weeks)} week${weeks === 1 ? "" : "s"}`;
}

function trimTrailingZero(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
