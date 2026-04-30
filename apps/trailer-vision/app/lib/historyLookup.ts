import { canonicalTitleKey } from "./canonicalTitleKey";

/** Same fields as RatingEntry used for “previous rating” UI on this page. */
export type HistoryRatingRow = {
  title: string;
  channelId?: string;
  userRating: number;
  ratedAt?: string;
  ratingMode?: "seen" | "unseen";
};

function pickBestOfRows(rows: HistoryRatingRow[]): HistoryRatingRow | undefined {
  if (rows.length === 0) return undefined;
  let bestIdx = -1;
  let bestT = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < rows.length; i++) {
    const e = rows[i]!;
    const t = e.ratedAt ? Date.parse(e.ratedAt) : NaN;
    if (Number.isFinite(t) && t >= bestT) {
      bestT = t;
      bestIdx = i;
    }
  }
  if (bestIdx >= 0) return rows[bestIdx];
  return rows[rows.length - 1];
}

/**
 * Resolve a stored rating row for the current card title. Uses the same canonical key as exclusions
 * so minor title formatting from the LLM still matches history; prefers the active channel’s row.
 */
export function pickHistoryEntryForCardTitle(
  history: HistoryRatingRow[],
  cardTitle: string,
  activeChannelId: string
): HistoryRatingRow | undefined {
  const key = canonicalTitleKey(cardTitle);
  const matches = history.filter((e) => canonicalTitleKey(e.title) === key);
  if (matches.length === 0) return undefined;

  const ch = (activeChannelId || "all").trim() || "all";
  const forChannel = matches.filter((e) => (e.channelId ?? "all").trim() === ch);
  if (forChannel.length > 0) return pickBestOfRows(forChannel);

  const legacyGlobal = matches.filter((e) => {
    const c = e.channelId?.trim();
    return !c || c === "all";
  });
  if (legacyGlobal.length > 0) return pickBestOfRows(legacyGlobal);

  return pickBestOfRows(matches);
}
