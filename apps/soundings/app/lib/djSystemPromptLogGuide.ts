/**
 * Section markers must match substrings in `SYSTEM_PROMPT` in `lib/llm.ts` exactly
 * (first occurrence defines the slice). Used only by the LLM log viewer UI.
 */
export type DjSystemPromptLogSection = {
  /** Unique substring marking the start of this block */
  heading: string
  /** Short margin note explaining purpose for developers */
  note: string
}

export const DJ_SYSTEM_PROMPT_LOG_GUIDE: readonly DjSystemPromptLogSection[] = [
  {
    heading: 'You are a DJ navigating a listener\'s taste across a high-dimensional music space.',
    note: 'Roles the model as a spatial “DJ”: all later rules interpret suggestions as points in taste space.',
  },
  {
    heading: 'THE 3D MAP (for display — project your full musical knowledge onto these axes):',
    note: 'Defines X / Y / Z so every suggestion carries map coordinates shown in Soundings UI (acoustic→electronic, calm→intense, obscure→mainstream).',
  },
  {
    heading: 'Reference anchors (be consistent — the same song should always land near the same position):',
    note: 'Calibration examples so different LLM runs don’t drift wildly on coordinate semantics.',
  },
  {
    heading:
      'When assigning coords: x/y capture sonic character; z captures how widely known/mainstream the specific recording is (not the artist in general',
    note: 'Clarifies Z is about this recording’s fame, not the artist’s overall fame.',
  },
  {
    heading: 'NAVIGATION RULES (ratings are ★0.5–★5 in half-star steps; skipped = no signal):',
    note: 'Connects Heard star ratings to behavior: likes pull Slot 1 “nearby”, dislikes avoid sonic territory (not the whole artist), neutral/skipped defined.',
  },
  {
    heading: 'ARTIST RULE — strictly enforced:',
    note: 'Hard constraint for each 3-song batch: three different artists (reduces repetitive recommendations).',
  },
  {
    heading: 'THE 3-SLOT RULE — every batch of 3 must serve distinct purposes:',
    note: 'Slot 1 = explore near likes; Slot 2 = far/unvisited region; Slot 3 = constrained wild card — shapes batch diversity.',
  },
  {
    heading:
      'FIRST TURN (no history): Pick 3 songs from maximally distant parts of the space — e.g. something acoustic and calm, something electronic and intense',
    note: 'Cold-start behavior when there is no session profile or ratings yet.',
  },
  {
    heading: 'DISLIKE ESCALATION:',
    note: 'Session-level rules for when to stop probing a disliked sonic neighborhood; multipart series blackout.',
  },
  {
    heading:
      'If the user provides explicit constraints (genres, eras, styles), follow them strictly — all 3 slots must satisfy the constraints.',
    note: 'User DJ notes/genre filters beat the generic slot playbook for all three slots.',
  },
  {
    heading: 'DATE INTEGRITY — strictly enforced:',
    note: 'Reduces hallucinated release years — prefer fewer suggestions over wrong eras.',
  },
  {
    heading:
      'Also include "suggested_artists": an array of 8–12 DISTINCT real recording-artist or band names that fit the user\'s constraints and the taste profile',
    note: 'Feeds explorer quick-pick buttons separate from the 3-track batch.',
  },
  {
    heading: 'Respond with ONLY a JSON object:',
    note: 'Output contract: structured songs + evolving taste summary + suggested_artists; no markdown wrapper.',
  },
  {
    heading:
      'You may add optional "spotify_id" on any song object when (and only when) you have a trustworthy reference — see rules below.',
    note: 'Optional accelerator for Spotify lookup; search string remains source of truth.',
  },
  {
    heading: 'YOUTUBE (youtube_url or youtube_video_id) — optional; strongly preferred when the listener uses YouTube playback:',
    note: 'Saves YouTube Data API quota when the model can name a real video id or URL.',
  },
  {
    heading: 'SPOTIFY ID (spotify_id) — conservative but not silent:',
    note: 'When to include real track ids/URLs vs omitting to avoid broken playback.',
  },
  {
    heading: 'The "composed" field is the year of composition — use it ONLY for classical music',
    note: 'Classical-only metadata for composition year; suppress for modern pop/rock.',
  },
  {
    heading: 'The "performer" field is for classical pieces only: set it to the performing ensemble or soloist',
    note: 'Separates composer vs performer in classical rows to improve search/resolve quality.',
  },
] as const

export type SplitPromptSection = {
  label: string
  body: string
  note: string
}

/**
 * Split logged system text by known Soundings DJ headings; falls back to a single blob if markers don’t match.
 */
export function splitDjSystemPromptForLogUi(fullText: string): SplitPromptSection[] {
  const text = fullText.trim()
  if (!text) {
    return [{ label: '(empty)', body: '', note: 'No system prompt in this log entry.' }]
  }

  type Found = { idx: number; note: string; label: string }
  const hits: Found[] = []
  for (const { heading, note } of DJ_SYSTEM_PROMPT_LOG_GUIDE) {
    const idx = text.indexOf(heading)
    if (idx >= 0) hits.push({ idx, note, label: heading })
  }
  hits.sort((a, b) => a.idx - b.idx)
  const unique: Found[] = []
  const seenIdx = new Set<number>()
  for (const h of hits) {
    if (seenIdx.has(h.idx)) continue
    seenIdx.add(h.idx)
    unique.push(h)
  }

  if (unique.length < 2) {
    return [
      {
        label: 'System prompt (unsplit)',
        body: text,
        note: 'Could not find enough Soundings DJ section markers — this may be a different app’s system prompt or an older/alternate prompt. Raw text shown below.',
      },
    ]
  }

  const out: SplitPromptSection[] = []
  if (unique[0].idx > 0) {
    const prefix = text.slice(0, unique[0].idx).trim()
    if (prefix) {
      out.push({
        label: 'Preamble',
        body: prefix,
        note: 'Text before the first recognized section marker (unusual if non-empty).',
      })
    }
  }

  for (let i = 0; i < unique.length; i++) {
    const start = unique[i].idx
    const end = i + 1 < unique.length ? unique[i + 1].idx : text.length
    out.push({
      label: unique[i].label.length > 72 ? `${unique[i].label.slice(0, 72)}…` : unique[i].label,
      body: text.slice(start, end).trim(),
      note: unique[i].note,
    })
  }

  return out
}
