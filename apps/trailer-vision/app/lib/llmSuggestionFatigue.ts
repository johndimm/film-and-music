import { trailerVisionStorage } from "@film-music/platform";
import { canonicalTitleKey } from "./canonicalTitleKey";

/** After this many discarded duplicate suggestions for a canonical title, treat like excluded. */
export const LLM_DISCARD_FATIGUE_THRESHOLD = 3;

const STORAGE = trailerVisionStorage.llmDiscardFatigueCounts;
const MAX_ENTRIES = 600;

function trimStore(o: Record<string, number>): Record<string, number> {
  const keys = Object.keys(o);
  if (keys.length <= MAX_ENTRIES) return o;
  const sorted = [...keys].sort((a, b) => (o[a] ?? 0) - (o[b] ?? 0));
  const drop = sorted.slice(0, keys.length - MAX_ENTRIES);
  const out = { ...o };
  for (const k of drop) delete out[k];
  return out;
}

/** The model returned a title we could not use (duplicate queue, already decided, fatigue). */
export function recordDuplicateLlmSuggestionDiscard(title: string): void {
  bumpDiscardCount(title);
}

function bumpDiscardCount(title: string): void {
  try {
    const key = canonicalTitleKey(title);
    const raw = localStorage.getItem(STORAGE);
    const o: Record<string, number> = raw ? JSON.parse(raw) : {};
    o[key] = (o[key] ?? 0) + 1;
    localStorage.setItem(STORAGE, JSON.stringify(trimStore(o)));
  } catch {
    /* ignore */
  }
}

/** Canonical keys inferred from persisted discard fatigue (scores ≥ threshold). */
export function mergeLlmDiscardFatigueIntoExcluded(
  excluded: Set<string>,
  threshold = LLM_DISCARD_FATIGUE_THRESHOLD
): void {
  try {
    const raw = localStorage.getItem(STORAGE);
    const o: Record<string, number> = raw ? JSON.parse(raw) : {};
    for (const [k, v] of Object.entries(o)) {
      if ((v ?? 0) >= threshold) excluded.add(k);
    }
  } catch {
    /* ignore */
  }
}
