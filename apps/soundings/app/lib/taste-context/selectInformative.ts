export type WhenUnderMax = "preserve-order" | "diverge-plus-recent";

export interface SelectInformativeOptions<T> {
  items: T[];
  maxEntries: number;
  getKey: (item: T) => string;
  getDivergence: (item: T) => number;
  /** If omitted, uses {@link defaultRecentCountNextMovie} (floor(max/4), cap 10). */
  recentCount?: number;
  /**
   * When the list fits in `maxEntries`:
   * - `preserve-order` — return items unchanged (e.g. next-movie chronological history).
   * - `diverge-plus-recent` — still split into recent tail + highest-divergence older (e.g. taste-summary).
   */
  whenUnderMax: WhenUnderMax;
}

/** Next-movie / general prompt: ~1/4 of slots for recency, at most 10. */
export function defaultRecentCountNextMovie(maxEntries: number): number {
  return Math.min(Math.floor(maxEntries / 4), 10);
}

/** Taste-summary: fixed recent window (capped by session length). */
export function defaultRecentCountTasteSummary(historyLength: number): number {
  return Math.min(5, historyLength);
}

/**
 * Picks a token-efficient subset: highest-divergence older items + a recent tail.
 * Divergent block first, recent last (freshest signal at the end of the list).
 */
export function selectInformativeByDivergence<T>(o: SelectInformativeOptions<T>): T[] {
  const { items, maxEntries, getKey, getDivergence, whenUnderMax } = o;
  if (items.length === 0 || maxEntries <= 0) return [];

  if (items.length <= maxEntries && whenUnderMax === "preserve-order") {
    return items;
  }

  const recentCount =
    o.recentCount ??
    (whenUnderMax === "diverge-plus-recent"
      ? defaultRecentCountTasteSummary(items.length)
      : defaultRecentCountNextMovie(maxEntries));

  if (items.length <= maxEntries && whenUnderMax === "diverge-plus-recent") {
    // Still merge divergent + recent (may reorder) even though everything fits.
    const r = Math.min(recentCount, items.length);
    const recentEntries = items.slice(-r);
    const recentKeys = new Set(recentEntries.map((e) => getKey(e)));
    const olderEntries = items.slice(0, -r).filter((e) => !recentKeys.has(getKey(e)));
    const remainingSlots = Math.max(0, items.length - recentEntries.length);
    const scored = olderEntries.map((entry) => ({ entry, d: getDivergence(entry) }));
    scored.sort((a, b) => b.d - a.d);
    const divergent = scored.slice(0, remainingSlots).map((s) => s.entry);
    return [...divergent, ...recentEntries];
  }

  const recentEntries = items.slice(-Math.min(recentCount, items.length));
  const recentKeys = new Set(recentEntries.map((e) => getKey(e)));
  const olderEntries = items.slice(0, -recentEntries.length).filter((e) => !recentKeys.has(getKey(e)));
  const remainingSlots = maxEntries - recentEntries.length;
  const scored = olderEntries.map((entry) => ({ entry, d: getDivergence(entry) }));
  scored.sort((a, b) => b.d - a.d);
  const divergentEntries = scored.slice(0, remainingSlots).map((s) => s.entry);
  return [...divergentEntries, ...recentEntries];
}
