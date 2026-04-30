"use client";

import { splitLlmListSegments } from "./splitLlmListSegments";

/**
 * Renders LLM text as a semantic list: newlines / • in the string become multiple
 * list items; otherwise a single item. Always uses &lt;ul&gt;/&lt;li&gt; so the
 * response reads as a list in the UI.
 */
export function LlmBulletedText({
  text,
  className,
  lineClamp,
}: {
  text: string;
  className?: string;
  /** Applied to each list item (e.g. queue preview). */
  lineClamp?: 2 | 3;
}) {
  const segs = splitLlmListSegments(text);
  if (segs.length === 0) return null;

  const liClamp =
    lineClamp === 2 ? "line-clamp-2" : lineClamp === 3 ? "line-clamp-3" : "";

  return (
    <ul
      className={`list-disc space-y-1.5 pl-5 marker:text-zinc-500 [li]:pl-0.5 ${className ?? ""}`.trim()}
    >
      {segs.map((s, i) => (
        <li key={i} className={liClamp}>
          {s}
        </li>
      ))}
    </ul>
  );
}
