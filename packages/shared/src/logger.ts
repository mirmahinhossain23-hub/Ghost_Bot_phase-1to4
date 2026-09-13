/**
 * Tiny dependency-free logger so every package prints in a consistent,
 * readable format. Swap this out for pino/winston later if you want
 * structured logs shipped somewhere — the call sites won't change.
 */

type LogLevel = "info" | "warn" | "error" | "debug";

const COLORS: Record<LogLevel, string> = {
  info: "\x1b[36m", // cyan
  warn: "\x1b[33m", // yellow
  error: "\x1b[31m", // red
  debug: "\x1b[90m", // gray
};

const RESET = "\x1b[0m";

function write(level: LogLevel, scope: string, message: string, extra?: unknown) {
  const color = COLORS[level];
  const timestamp = new Date().toISOString();
  const line = `${color}[${timestamp}] [${level.toUpperCase()}] [${scope}]${RESET} ${message}`;

  if (level === "error") {
    console.error(line, extra ?? "");
  } else if (level === "warn") {
    console.warn(line, extra ?? "");
  } else {
    console.log(line, extra ?? "");
  }
}

export function createLogger(scope: string) {
  return {
    info: (message: string, extra?: unknown) => write("info", scope, message, extra),
    warn: (message: string, extra?: unknown) => write("warn", scope, message, extra),
    error: (message: string, extra?: unknown) => write("error", scope, message, extra),
    debug: (message: string, extra?: unknown) => {
      if (process.env.GHOST_DEBUG === "true") write("debug", scope, message, extra);
    },
  };
}

export type Logger = ReturnType<typeof createLogger>;
