/**
 * Handles the per-browser cleanup that must run after a fresh login via
 * `/player?spotify_login=1` (Spotify OAuth callback) or `/player?youtube_login=1`
 * (the `/api/auth/youtube` route handler), and when the splash card opens
 * `/player?splash=spotify` (must drop stale YouTube `currentCard`/queue rows before hydrate).
 *
 * The reset has to run before `PlayerClient` reads `localStorage` to hydrate
 * channels, otherwise the player boots with leftover cross-source state
 * (e.g. Spotify `currentCard` still present in YouTube mode, which produces a
 * black player panel because the `YoutubePlayer` only renders when
 * `currentCard.track.source === 'youtube'`).
 *
 * We key idempotency by **which marker** fired (`spotify_login` vs `youtube_login` vs
 * `splash=spotify`), not a single global flag. **`pruneLocalStorageChannelsForSource`** is
 * invoked from those markers only — not on every mount (doing so was too aggressive and could
 * empty the Spotify queue whenever persisted settings briefly disagreed with the tab).
 */

import { soundingsStorage } from '@/app/lib/platform'

const SETTINGS_STORAGE_KEY = soundingsStorage.settings
const CHANNELS_STORAGE_KEY = soundingsStorage.channels

/** Last marker we scrubbed for this page load — allow a *different* marker on the next navigation. */
let appliedHydrationFingerprint: string | null = null

/**
 * Infer persisted row kind when scrubbing LS after OAuth / splash. Avoid guessing from id shape —
 * Spotify track ids look like opaque strings too — so only explicit markers classify as YouTube.
 */
export function effectiveCardPlaybackSource(card: unknown): 'spotify' | 'youtube' | null {
  if (!card || typeof card !== 'object') return null
  const tr = (card as { track?: unknown }).track
  if (!tr || typeof tr !== 'object') return null
  const t = tr as Record<string, unknown>
  if (t.source === 'youtube') return 'youtube'
  if (t.source === 'spotify') return 'spotify'
  if (typeof t.videoId === 'string' && t.videoId.trim() !== '') return 'youtube'
  const uri = t.uri
  if (typeof uri === 'string' && uri.includes('spotify')) return 'spotify'
  return null
}

function matchesPlaybackSource(card: unknown, desired: 'spotify' | 'youtube'): boolean {
  const eff = effectiveCardPlaybackSource(card)
  // Unknown rows (no explicit source / videoId / Spotify uri) survive Spotify scrub —
  // they are legacy or incomplete metadata, not proven YouTube. YouTube scrub still drops them.
  if (eff === null) return desired === 'spotify'
  return eff === desired
}

/**
 * Persists trimmed channels: only `desired` playback rows survive in `currentCard`/`queue`.
 * @returns Whether localStorage channels were mutated.
 */
export function pruneLocalStorageChannelsForSource(desired: 'spotify' | 'youtube'): boolean {
  if (typeof window === 'undefined') return false
  try {
    const rawChannels = localStorage.getItem(CHANNELS_STORAGE_KEY)
    if (!rawChannels) return false
    const channels = JSON.parse(rawChannels) as unknown
    if (!Array.isArray(channels)) return false

    let droppedCurrent = 0
    let droppedQueue = 0
    let mutated = false
    const cleaned = channels.map((c: Record<string, unknown>) => {
      const current = c.currentCard
      const queue = Array.isArray(c.queue) ? c.queue : []
      const currentOk = !current || matchesPlaybackSource(current, desired)
      const filteredQueue = queue.filter((card: unknown) => matchesPlaybackSource(card, desired))
      if (!currentOk) droppedCurrent++
      droppedQueue += queue.length - filteredQueue.length
      if (currentOk && filteredQueue.length === queue.length && current === c.currentCard) {
        return c
      }
      mutated = true
      const resumePositionStale = !currentOk || filteredQueue.length !== queue.length
      return {
        ...c,
        currentCard: currentOk ? current ?? null : null,
        queue: filteredQueue,
        playbackPositionMs: resumePositionStale && !currentOk ? 0 : c.playbackPositionMs,
        playbackTrackUri: resumePositionStale && !currentOk ? null : c.playbackTrackUri,
      }
    })

    console.info('[channel-scrub]', desired, '— dropped current:', droppedCurrent, 'queue items:', droppedQueue, 'mutated:', mutated)
    if (mutated) {
      localStorage.setItem(CHANNELS_STORAGE_KEY, JSON.stringify(cleaned))
      return true
    }
    return false
  } catch (err) {
    console.warn('[channel-scrub] failed', err)
    return false
  }
}

function applyFreshLoginSource(next: 'spotify' | 'youtube') {
  try {
    const rawSettings = localStorage.getItem(SETTINGS_STORAGE_KEY)
    const existing = rawSettings ? JSON.parse(rawSettings) : {}
    localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({ ...existing, source: next }),
    )
    pruneLocalStorageChannelsForSource(next)
  } catch (err) {
    console.warn('[fresh-login] failed', err)
  }
}

function hydrationMarkerFingerprint(): { fp: string; source: 'spotify' | 'youtube' } | null {
  if (typeof window === 'undefined') return null
  const params = new URLSearchParams(window.location.search)
  if (params.get('spotify_login') === '1') return { fp: 'spotify_login', source: 'spotify' }
  if (params.get('youtube_login') === '1') return { fp: 'youtube_login', source: 'youtube' }
  if (params.get('splash') === 'spotify') return { fp: 'splash_spotify', source: 'spotify' }
  return null
}

/** Returns the fresh-login source if one was applied, otherwise null. */
export function applyFreshLoginIfNeeded(): 'spotify' | 'youtube' | null {
  if (typeof window === 'undefined') return null
  try {
    const marker = hydrationMarkerFingerprint()
    if (!marker) return null
    if (appliedHydrationFingerprint === marker.fp) return null

    appliedHydrationFingerprint = marker.fp
    if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'production') {
      console.info('[soundings-fresh-login]', { marker: marker.fp, setSourceTo: marker.source })
    }
    applyFreshLoginSource(marker.source)
    return marker.source
  } catch (err) {
    console.warn('[fresh-login] check threw', err)
    return null
  }
}
