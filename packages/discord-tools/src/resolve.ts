export type ResolveResult<T> =
  | { status: "found"; item: T }
  | { status: "ambiguous"; candidates: T[] }
  | { status: "not_found" };

/**
 * Resolves exactly one item by name out of a candidate list, refusing
 * to guess when more than one plausible match exists.
 *
 * Priority order:
 *   1. Exact (case-insensitive) name match. If exactly one, done.
 *      If more than one (two channels somehow sharing a name), that's
 *      still ambiguous — never silently pick the first.
 *   2. Fall back to the provided lenient matcher (e.g. Phase 2's
 *      decoration-stripping nameMatches). Same one-or-ambiguous rule.
 */
export function resolveByName<T>(
  items: T[],
  query: string,
  getName: (item: T) => string,
  lenientMatch: (name: string, query: string) => boolean
): ResolveResult<T> {
  const q = query.trim().toLowerCase();

  const exact = items.filter((item) => getName(item).trim().toLowerCase() === q);
  if (exact.length === 1) return { status: "found", item: exact[0] };
  if (exact.length > 1) return { status: "ambiguous", candidates: exact };

  const lenient = items.filter((item) => lenientMatch(getName(item), query));
  if (lenient.length === 1) return { status: "found", item: lenient[0] };
  if (lenient.length > 1) return { status: "ambiguous", candidates: lenient };

  return { status: "not_found" };
}

/** Renders an ambiguous-match list into a short clarification message. */
export function describeAmbiguity<T>(candidates: T[], describe: (item: T) => string, noun: string): string {
  const lines = candidates.slice(0, 10).map((c) => `• ${describe(c)}`);
  const more = candidates.length > 10 ? `\n…and ${candidates.length - 10} more` : "";
  return `That could mean more than one ${noun} — which did you mean?\n${lines.join("\n")}${more}`;
}
