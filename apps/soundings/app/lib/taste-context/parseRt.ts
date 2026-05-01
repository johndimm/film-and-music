/** Parse "91%" → 91, returns null if unparseable. */
export function parseRtPercent(rtScore: string | null | undefined): number | null {
  if (!rtScore) return null;
  const n = parseInt(rtScore, 10);
  return Number.isFinite(n) ? n : null;
}
