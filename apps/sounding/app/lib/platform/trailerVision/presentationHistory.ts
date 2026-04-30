/**
 * Soundings-local copy of Trailer Vision presentation-history helpers.
 *
 * NOTE: Do not import from `@film-music/platform` here — in this app that name can resolve
 * to this same module via TS path aliases, which would create a runtime export loop.
 */

export type PassedRow = {
  title: string
  type?: 'movie' | 'tv'
  at?: string
  channelId?: string
}

export type PresentationHistorySeen = {
  title: string
  type: 'movie' | 'tv'
  userRating: number
  predictedRating: number
  rtScore?: string | null
  channelId?: string
  posterUrl?: string | null
  ratedAt?: string
}

export type PresentationHistoryUnseen = {
  title: string
  type: 'movie' | 'tv'
  year: number | null
  director: string | null
  actors: string[]
  plot: string
  posterUrl: string | null
  rtScore: string | null
  interestStars: number
  kind: 'want' | 'skip'
  channelId: string
  at: string
}

export type PresentationRowProvenance =
  | { kind: 'seen'; historyIndex: number }
  | { kind: 'interest'; unseenIndex: number }
  | { kind: 'pass'; passIndex: number }

export type PresentationRow = {
  key: string
  sortMs: number
  tieBreak: number
  title: string
  medium: 'movie' | 'tv'
  channelId?: string
  posterUrl?: string | null
  outcome: 'seen' | 'interest' | 'pass'
  userRating?: number
  predictedRating?: number
  interestStars?: number
  interestKind?: 'want' | 'skip'
  rtScore?: string | null
  provenance: PresentationRowProvenance
}

const LEGACY_MS = 1_400_000_000_000

function safeParseMs(iso: string | undefined): number {
  if (!iso) return NaN
  const n = Date.parse(iso)
  return Number.isFinite(n) ? n : NaN
}

export function normalizePassedStorage(raw: unknown): PassedRow[] {
  if (!Array.isArray(raw)) return []
  const out: PassedRow[] = []
  for (const item of raw) {
    if (typeof item === 'string') {
      const t = item.trim()
      if (t) out.push({ title: t })
      continue
    }
    if (item && typeof item === 'object' && typeof (item as { title?: unknown }).title === 'string') {
      const o = item as { title: string; at?: unknown; channelId?: unknown; type?: unknown }
      const title = o.title.trim()
      if (!title) continue
      const typ = o.type === 'tv' || o.type === 'movie' ? o.type : undefined
      out.push({
        title,
        type: typ,
        at: typeof o.at === 'string' ? o.at : undefined,
        channelId: typeof o.channelId === 'string' ? o.channelId : undefined,
      })
    }
  }
  return out
}

export function passedRowsToTitles(rows: PassedRow[]): string[] {
  return rows.map((r) => r.title)
}

export function buildPresentationRows(input: {
  history: PresentationHistorySeen[]
  unseenLog: PresentationHistoryUnseen[]
  passed: PassedRow[]
}): PresentationRow[] {
  const rows: PresentationRow[] = []
  let tieBreak = 0

  for (let i = 0; i < input.unseenLog.length; i++) {
    const u = input.unseenLog[i]
    const ms = safeParseMs(u.at)
    rows.push({
      key: `u:${i}:${u.at}`,
      sortMs: Number.isFinite(ms) ? ms : LEGACY_MS - 2_000_000 + i,
      tieBreak: tieBreak++,
      title: u.title,
      medium: u.type,
      channelId: u.channelId,
      posterUrl: u.posterUrl,
      outcome: 'interest',
      interestStars: u.interestStars,
      interestKind: u.kind,
      rtScore: u.rtScore,
      provenance: { kind: 'interest', unseenIndex: i },
    })
  }

  for (let i = 0; i < input.history.length; i++) {
    const e = input.history[i]
    const ms = safeParseMs(e.ratedAt)
    rows.push({
      key: `s:${i}:${e.title}`,
      sortMs: Number.isFinite(ms) ? ms : LEGACY_MS + i,
      tieBreak: tieBreak++,
      title: e.title,
      medium: e.type,
      channelId: e.channelId,
      posterUrl: e.posterUrl,
      outcome: 'seen',
      userRating: e.userRating,
      predictedRating: e.predictedRating,
      rtScore: e.rtScore ?? null,
      provenance: { kind: 'seen', historyIndex: i },
    })
  }

  for (let i = 0; i < input.passed.length; i++) {
    const p = input.passed[i]
    const ms = safeParseMs(p.at)
    rows.push({
      key: `p:${i}:${p.title}`,
      sortMs: Number.isFinite(ms) ? ms : LEGACY_MS + 1_000_000 + i,
      tieBreak: tieBreak++,
      title: p.title,
      medium: p.type ?? 'movie',
      channelId: p.channelId,
      posterUrl: null,
      outcome: 'pass',
      provenance: { kind: 'pass', passIndex: i },
    })
  }

  rows.sort((a, b) => b.sortMs - a.sortMs || b.tieBreak - a.tieBreak)
  return rows
}

