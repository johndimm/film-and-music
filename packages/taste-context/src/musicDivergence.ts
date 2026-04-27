import { migrateRatingValue } from "./ratingScale";

/** Neutral midpoint on the 0.5–5 half-star session scale (opinion strength vs “meh”). */
const NEUTRAL_MID = 3.5;

/**
 * When there is no critic/audience score (e.g. music), use distance from a neutral
 * midpoint so strong likes/dislikes surface first, matching the movie |user−RT| intent.
 * Skipped / null star rows sort as least informative (0).
 */
export function musicDivergenceFromNeutral(entry: { stars: number | null }): number {
  if (entry.stars == null) return 0;
  return Math.abs(migrateRatingValue(entry.stars) - NEUTRAL_MID);
}
