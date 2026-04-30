/**
 * Split LLM-authored blurbs into list segments: newline-separated lines, or
 * middle-dot (•) clauses on one line. Strips common leading bullet prefixes.
 */
export function splitLlmListSegments(text: string): string[] {
  const t = text.trim();
  if (!t) return [];

  const strip = (s: string) =>
    s
      .replace(/^[-*•–—]\s+/, "")
      .replace(/^\d+[.)]\s+/, "")
      .trim();

  const lines = t.split(/\r?\n+/).map((s) => strip(s)).filter(Boolean);
  if (lines.length > 1) return lines;

  const one = lines[0] ?? t;
  const byDot = one.split(/\s*•\s+/).map((s) => strip(s)).filter(Boolean);
  if (byDot.length > 1) return byDot;

  return [strip(one)].filter(Boolean);
}
