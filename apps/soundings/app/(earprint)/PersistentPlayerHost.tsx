'use client'

import { useEffect, useLayoutEffect, useState, type ReactNode } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { soundingsStorage } from '@/app/lib/platform'
import PlayerClientWrapper from '@/app/player/PlayerClientWrapper'
import { applyFreshLoginIfNeeded } from '@/app/lib/freshLogin'
import { parseShareId } from '@/app/lib/shareId'

/**
 * Same values as `useSearchParams()` but without triggering Suspense.
 * The root layout used to wrap the whole host in `<Suspense fallback={children}>` for
 * `useSearchParams`; when that suspended on navigation, the player unmounted and Spotify stopped.
 */
function useWindowSearchParams(pathname: string): URLSearchParams {
  const [sp, setSp] = useState(() => new URLSearchParams())

  useLayoutEffect(() => {
    setSp(new URLSearchParams(typeof window !== 'undefined' ? window.location.search : ''))
  }, [pathname])

  return sp
}

function readPendingShareGate(): boolean {
  if (typeof window === 'undefined') return false
  try {
    const raw = sessionStorage.getItem(soundingsStorage.pendingShare)
    if (!raw) return false
    const parsed = JSON.parse(raw) as { id?: string; at?: number }
    return (
      Boolean(parseShareId(parsed?.id)) &&
      typeof parsed.at === 'number' &&
      Date.now() - parsed.at < 15 * 60 * 1000
    )
  } catch {
    return false
  }
}

function PersistentPlayerHostInner({
  children,
  accessToken,
  youtubeResolveTestFromServer,
  youtubeModeFromCookie,
}: {
  children: ReactNode
  accessToken: string
  youtubeResolveTestFromServer: boolean
  youtubeModeFromCookie: boolean
}) {
  const pathname = usePathname()
  const sp = useWindowSearchParams(pathname)
  const router = useRouter()

  /**
   * SSR has no URL query; reading `window.location.search` (or `sp.get(...)`) during the
   * first client render would disagree with the server HTML and cause a hydration mismatch.
   * We CAN seed `youtubeLocked` from the cookie prop (same value on server + client), so
   * returning users with the cookie keep YouTube mode without a `?youtube=1` query string.
   */
  const [youtubeLocked, setYoutubeLocked] = useState(youtubeModeFromCookie)
  const [guideDemo, setGuideDemo] = useState<string | null>(null)
  /** OAuth can strip `?share=`; sessionStorage still has the id until PlayerClient consumes it. */
  const [pendingShareGate, setPendingShareGate] = useState(false)
  useLayoutEffect(() => {
    setPendingShareGate(readPendingShareGate())
  }, [])

  /**
   * Belt-and-suspenders: fresh-login reset may also be invoked from PlayerClient (see
   * `applyFreshLoginIfNeeded` in `app/lib/freshLogin.ts`). The module-level flag inside
   * that helper makes the second caller a no-op, so whoever runs first wins and the result
   * is the same.
   *
   * Calling it here still matters because `PlayerClient` is not mounted on every route
   * that uses this host (the host wraps `{children}`), so this path is what guarantees the
   * reset fires when a user lands on a non-`/player` page immediately after login.
   */
  applyFreshLoginIfNeeded()

  /**
   * Preserve `?share=<id>` across OAuth round-trips.
   *
   * A recipient opening /player?share=XYZ may be unauthenticated — they'll be redirected
   * to Spotify login, which returns them to /player?spotify_login=1 with the share param
   * stripped. Stashing the id in sessionStorage here (on every mount, regardless of auth
   * state) lets PlayerClient pick it up after the redirect. Cleared once applied.
   */
  useEffect(() => {
    if (typeof window === 'undefined') return
    // `parseShareId` tolerates share targets that paste the navigator.share `text`
    // onto the URL (e.g. iMessage → "?share=abcdef1234Listen on Foo").
    const shareId = parseShareId(sp.get('share'))
    if (shareId) {
      try {
        sessionStorage.setItem(
          soundingsStorage.pendingShare,
          JSON.stringify({ id: shareId, at: Date.now() })
        )
      } catch {}
    }
  }, [sp])

  useEffect(() => {
    if (!pathname.startsWith('/player')) return
    if (sp.get('youtube') === '1') {
      setYoutubeLocked(true)
      // Mirror the server route: persist YouTube-only mode so internal `/player` links
      // (header, Settings redirect) that drop the query string keep working.
      try {
        document.cookie = `${soundingsStorage.youtubeModeCookie}=1; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`
      } catch {}
    }
    const g = sp.get('guide-demo')
    if (typeof g === 'string') setGuideDemo(g)

    // The actual localStorage reset runs synchronously during render (above); this effect
    // only (a) updates the youtubeLocked flag so the player re-renders with the right source,
    // and (b) strips the query marker so a later refresh doesn't re-run anything.
    const freshSource: 'spotify' | 'youtube' | null =
      sp.get('spotify_login') === '1'
        ? 'spotify'
        : sp.get('youtube_login') === '1'
          ? 'youtube'
          : null
    if (freshSource) {
      setYoutubeLocked(freshSource === 'youtube')
      router.replace(pathname)
    }
  }, [pathname, sp, router])

  const unifiedEmbed = sp.get('unifiedEmbed') === '1'
  const shareFromQuery = parseShareId(sp.get('share'))
  const canPlay =
    Boolean(accessToken) ||
    Boolean(guideDemo) ||
    youtubeLocked ||
    Boolean(shareFromQuery) ||
    pendingShareGate
  const isPlayerRoute = pathname.startsWith('/player')
  // Keep Soundings playback running while viewing “read-only” movie pages like Logs/Help.
  // We only need to avoid double-audio or heavy contention on the Trailer Vision player itself.
  // Channel History is full-screen browsing (often on TV): remounting the off-screen player here
  // would resume Soundings after leaving the main trailer page — unwanted background music.
  const isMoviePlayerRoute =
    pathname === '/trailer-visions' ||
    pathname.startsWith('/trailer-visions/player') ||
    pathname.startsWith('/trailer-visions/channel-history')
  /**
   * Film & Music splash — never mount off-screen playback here.
   * Normalize so `/`, ``, and trailing-slash-only variants all count as landing (`next.config` trailingSlash edge cases).
   */
  const pathNorm = pathname.replace(/\/+$/, '')
  const isFilmMusicLanding = pathNorm === '' || pathNorm === '/'
  const isStaticPage = pathNorm === '/privacy' || pathNorm === '/terms'

  if (!canPlay || isMoviePlayerRoute || isFilmMusicLanding || isStaticPage) {
    return <>{children}</>
  }

  return (
    <>
      <div
        className={
          isPlayerRoute
            ? ''
            : 'fixed -left-[9999px] top-0 h-[480px] w-[800px] overflow-hidden opacity-0 pointer-events-none'
        }
        aria-hidden={!isPlayerRoute}
      >
        <PlayerClientWrapper
          accessToken={accessToken}
          guideDemo={guideDemo}
          youtubeResolveTestFromServer={youtubeResolveTestFromServer}
          youtubeOnly={youtubeLocked}
          hideAppChrome={unifiedEmbed}
        />
      </div>
      {children}
    </>
  )
}

export default function PersistentPlayerHost({
  children,
  accessToken,
  youtubeResolveTestFromServer,
  youtubeModeFromCookie = false,
}: {
  children: ReactNode
  accessToken: string
  youtubeResolveTestFromServer: boolean
  youtubeModeFromCookie?: boolean
}) {
  return (
    <PersistentPlayerHostInner
      accessToken={accessToken}
      youtubeResolveTestFromServer={youtubeResolveTestFromServer}
      youtubeModeFromCookie={youtubeModeFromCookie}
    >
      {children}
    </PersistentPlayerHostInner>
  )
}
