export type QueueOutcome<T, R> =
  | { item: T; status: "fulfilled"; value: R }
  | { item: T; status: "rejected"; reason: string };

export interface QueueOptions {
  /** How many workers run at once. Discord's own client still rate-limits under this. */
  concurrency?: number;
  /** Max retry attempts for a transient failure (429 / 5xx). Default 1 — deliberately not aggressive. */
  retries?: number;
  /** Base delay before a retry, multiplied by attempt number (simple linear backoff). */
  retryDelayMs?: number;
}

/**
 * Runs `worker` over every item with bounded concurrency instead of
 * firing everything at once. A single item's failure never aborts the
 * batch — every outcome (success or failure) is captured and returned
 * so the caller can report a full success/failure summary.
 */
export async function runWithConcurrency<T, R>(
  items: T[],
  worker: (item: T) => Promise<R>,
  options: QueueOptions = {}
): Promise<QueueOutcome<T, R>[]> {
  const concurrency = Math.max(1, Math.min(options.concurrency ?? 3, items.length || 1));
  const retries = Math.max(0, options.retries ?? 1);
  const retryDelayMs = options.retryDelayMs ?? 500;

  const results: QueueOutcome<T, R>[] = new Array(items.length);
  let cursor = 0;

  async function runOne(index: number) {
    const item = items[index];
    let attempt = 0;

    for (;;) {
      try {
        const value = await worker(item);
        results[index] = { item, status: "fulfilled", value };
        return;
      } catch (error) {
        if (attempt < retries && isTransientDiscordError(error)) {
          attempt++;
          await sleep(retryDelayMs * attempt);
          continue;
        }
        results[index] = { item, status: "rejected", reason: describeError(error) };
        return;
      }
    }
  }

  async function worker_() {
    while (cursor < items.length) {
      const index = cursor++;
      await runOne(index);
    }
  }

  const pool = Array.from({ length: concurrency }, () => worker_());
  await Promise.all(pool);
  return results;
}

export function summarizeOutcomes<T, R>(outcomes: QueueOutcome<T, R>[]) {
  const succeeded = outcomes.filter((o) => o.status === "fulfilled").length;
  const failed = outcomes.length - succeeded;
  return { succeeded, failed, total: outcomes.length };
}

/**
 * Only rate-limit (429) and server errors (5xx) are worth retrying —
 * anything else (403 missing permissions, 404 not found, validation
 * errors) will fail again identically, so retrying it just wastes
 * time and quota.
 */
function isTransientDiscordError(error: unknown): boolean {
  const status = extractStatus(error);
  return typeof status === "number" && (status === 429 || status >= 500);
}

function extractStatus(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const withStatus = error as { status?: unknown; httpStatus?: unknown };
  if (typeof withStatus.status === "number") return withStatus.status;
  if (typeof withStatus.httpStatus === "number") return withStatus.httpStatus;
  return undefined;
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
