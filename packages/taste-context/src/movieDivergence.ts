import { migrateRatingValue, rtTomatometerPercentToStars } from "./ratingScale";
import { parseRtPercent } from "./parseRt";

/**
 * |user − Tomatometer★| when RT is present; otherwise |user − AI predicted★|.
 * Used to pick the most “informative per token” ratings for LLM context.
 */
export function movieDivergenceScore(entry: {
  userRating: number;
  predictedRating: number;
  rtScore?: string | null;
}): number {
  const u = migrateRatingValue(entry.userRating);
  const rt = parseRtPercent(entry.rtScore);
  if (rt !== null) {
    return Math.abs(u - rtTomatometerPercentToStars(rt));
  }
  return Math.abs(u - migrateRatingValue(entry.predictedRating));
}
