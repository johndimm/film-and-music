import { soundingsStorage } from '@film-music/platform'

/** Session snapshot for collaboration graph (Constellations) — written by the player, read on `/constellations`. */

const STORAGE_KEY = soundingsStorage.nowPlaying

export type NowPlayingSnapshot = {
  artist: string
  track: string
  /** Album name from the player (Spotify); used to match “album” nodes in Constellations. */
  album?: string
}

export function writeNowPlayingSnapshot(s: NowPlayingSnapshot | null): void {
  if (typeof window === 'undefined') return
  try {
    if (s && (s.artist || s.track)) {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(s))
    } else {
      sessionStorage.removeItem(STORAGE_KEY)
    }
    try {
      window.dispatchEvent(new Event('soundings-now-playing'))
    } catch {
      /* ignore */
    }
  } catch {
    /* ignore */
  }
}

export function readNowPlayingSnapshot(): NowPlayingSnapshot | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const p = JSON.parse(raw) as unknown
    if (!p || typeof p !== 'object') return null
    const artist = 'artist' in p && typeof (p as { artist?: unknown }).artist === 'string' ? (p as { artist: string }).artist : ''
    const track = 'track' in p && typeof (p as { track?: unknown }).track === 'string' ? (p as { track: string }).track : ''
    const album =
      'album' in p && typeof (p as { album?: unknown }).album === 'string' ? (p as { album: string }).album : ''
    if (!artist && !track) return null
    return { artist, track, album: album || undefined }
  } catch {
    return null
  }
}
