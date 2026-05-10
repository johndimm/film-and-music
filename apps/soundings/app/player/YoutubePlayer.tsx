'use client'
import { useRef, useImperativeHandle, forwardRef, useMemo, useEffect, useState } from 'react'
import { extractYoutubeVideoIdLoose } from '@/app/lib/youtubeVideoId'

// ── Minimal YT IFrame API types ──────────────────────────────────────────────
interface YTPlayer {
  getCurrentTime(): number
  getDuration(): number
  /** YT.PlayerState: -1 unstarted, 0 ended, 1 playing, 2 paused, 3 buffering, 5 cued */
  getPlayerState(): number
  pauseVideo(): void
  playVideo(): void
  seekTo(seconds: number, allowSeekAhead?: boolean): void
  setVolume(v: number): void
  destroy(): void
}
interface YTPlayerOptions {
  events?: {
    onReady?: (e: { target: YTPlayer }) => void
    onStateChange?: (e: { data: number }) => void
    onError?: (e: { data: number }) => void
  }
}
interface YTNamespace {
  Player: new (el: HTMLIFrameElement, opts?: YTPlayerOptions) => YTPlayer
  PlayerState: { ENDED: number; PLAYING: number; PAUSED: number; BUFFERING: number; CUED: number }
}
declare global {
  interface Window {
    YT?: YTNamespace
    onYouTubeIframeAPIReady?: () => void
  }
}

// ── Singleton YT API loader ───────────────────────────────────────────────────
let ytApiReady = false
const ytQueue: (() => void)[] = []

function loadYtApi() {
  if (typeof window === 'undefined') return
  if (window.YT?.Player) { ytApiReady = true; return }
  const prev = window.onYouTubeIframeAPIReady
  window.onYouTubeIframeAPIReady = () => {
    prev?.()
    ytApiReady = true
    console.info('[yt] iframe API ready')
    ytQueue.forEach(cb => cb())
    ytQueue.length = 0
  }
  if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
    console.info('[yt] injecting iframe_api script')
    const s = document.createElement('script')
    s.src = 'https://www.youtube.com/iframe_api'
    document.head.appendChild(s)
  }
}

function whenYtReady(cb: () => void) {
  if (ytApiReady && window.YT?.Player) { cb(); return }
  ytQueue.push(cb)
  loadYtApi()
}

/**
 * Fallback when the YT.Player wrapper is not yet available: send a postMessage command
 * directly to the iframe. Requires `enablejsapi=1` in the embed URL (we set it).
 * Matches the undocumented-but-stable IFrame Player API protocol.
 *
 * Target origin is `'*'` — same as the upstream YT IFrame API itself — because Chrome
 * refuses to deliver messages targeted at `https://www.youtube.com` to a freshly
 * mounted iframe whose `contentWindow.location` is still `about:blank` (same-origin
 * with the parent document). The payload is an opaque command string with no sensitive
 * data, so wildcard origin is acceptable.
 */
function postCommand(iframe: HTMLIFrameElement | null, func: 'playVideo' | 'pauseVideo') {
  if (!iframe?.contentWindow) return false
  try {
    iframe.contentWindow.postMessage(
      JSON.stringify({ event: 'command', func, args: [] }),
      '*',
    )
    return true
  } catch {
    return false
  }
}

/**
 * Call a method on the YT.Player wrapper when it is actually callable; otherwise
 * fall back to the iframe postMessage protocol. `new YT.Player(iframe, …)` returns
 * a bare stub in some cases — methods live on `event.target` inside onReady, so
 * the ref may be set even when `playVideo`/`pauseVideo` are not functions on it.
 */
function invoke(
  player: YTPlayer | null,
  iframe: HTMLIFrameElement | null,
  method: 'playVideo' | 'pauseVideo',
): 'player' | 'postmessage' | 'none' {
  if (player) {
    const fn = (player as unknown as Record<string, unknown>)[method]
    if (typeof fn === 'function') {
      try {
        ;(fn as () => void).call(player)
        return 'player'
      } catch {
        /* fall through to postMessage */
      }
    }
  }
  return postCommand(iframe, method) ? 'postmessage' : 'none'
}

// ─────────────────────────────────────────────────────────────────────────────
const IFRAME_ALLOW =
  'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; compute-pressure'

function youtubeEmbedSrc(videoId: string, iframePostMessageOrigin: string): string {
  return (
    `https://www.youtube.com/embed/${encodeURIComponent(videoId)}` +
    `?autoplay=1&playsinline=1&enablejsapi=1&start=0&origin=${encodeURIComponent(iframePostMessageOrigin)}`
  )
}

/**
 * Passed to YouTube embed `origin=` for the IFrame API postMessage handshake.
 * In dev only: when you open **`http://127.0.0.1`** YouTube frequently returns **error 150**
 * for URLs that embed fine from **`http://localhost`** — same TCP server, different host in
 * the browser. Map the **query param only** (Referer stays the IP URL) enough that playback
 * often succeeds without breaking `onReady`; if a clip still 150 on `127`, use `localhost`.
 */
function iframeApiOriginQueryParam(): string {
  if (typeof window === 'undefined') return ''
  if (
    process.env.NODE_ENV === 'development' &&
    window.location.hostname === '127.0.0.1'
  ) {
    const { protocol, port } = window.location
    return `${protocol}//localhost${port ? `:${port}` : ''}`
  }
  return window.location.origin
}

/**
 * If the video hasn't started playing within this window, show the tap-to-play overlay.
 * Dev timeouts are longer: Strict Mode clears/rebinds, optional bind delay below, plus HMR jitter.
 */
const AUTOPLAY_TIMEOUT_MS = process.env.NODE_ENV === 'development' ? 10_000 : 3500
/** Waits past Strict Mode’s first-pass effect cleanup before `new YT.Player` (fixes missing `onReady`). */
const YT_PLAYER_BIND_DELAY_MS = process.env.NODE_ENV === 'development' ? 240 : 0

interface Props {
  videoId: string
  onEnded?: () => void
  onPlayerError?: (errorCode: number) => void
}

export type YoutubePlayerHandle = {
  fadeOut: () => Promise<void>
  getCurrentTime: () => number
  getDuration: () => number
  play: () => void
  pause: () => void
  seek: (ms: number) => void
}

const YoutubePlayer = forwardRef<YoutubePlayerHandle, Props>(function YoutubePlayer(
  { videoId, onEnded, onPlayerError },
  ref
) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const ytPlayerRef = useRef<YTPlayer | null>(null)
  /**
   * Gate for wrapper creation. React Strict Mode invokes effects twice in dev: mount →
   * cleanup → mount again, with the same refs. We want the `new YT.Player(iframe, ...)`
   * call to happen exactly ONCE per component instance, because YouTube's postMessage
   * handshake only reaches the first wrapper bound to a given iframe. Binding a second
   * wrapper leaves `ytPlayerRef` pointing at a stub that never receives `onReady`, so
   * `getCurrentTime()` returns 0 forever and the progress slider is stuck at 0.
   */
  const wrapperCreatedRef = useRef(false)
  /** Cleared when `new YT.Player` is deferred so Strict Mode cleanup can cancel the queued bind. */
  const ytPlayerConstructionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** Prevents double-firing onPlayerError when both the SDK callback and raw postMessage listener fire. */
  const errorFiredRef = useRef(false)
  /**
   * Latch for "user asked to play before the API wrapper was ready." Overlay click sets it;
   * onReady consumes it. Without this, the first tap on the tap-to-play overlay is a no-op
   * whenever the YT script is still loading.
   */
  const pendingPlayRef = useRef(false)
  /**
   * One-shot latch: fire seekTo(0) at most once on the first PLAYING state
   * transition if YouTube's resume-watching feature puts us past the intro.
   * Component is keyed by track id in the parent, so this naturally resets
   * for each new track.
   */
  const didSeekToZeroOnPlayRef = useRef(false)
  const onEndedRef = useRef(onEnded)
  const onErrorRef = useRef(onPlayerError)
  onEndedRef.current = onEnded
  onErrorRef.current = onPlayerError

  const [blocked, setBlocked] = useState(false)
  /**
   * Client-only iframe: SSR + hydrating pass render a neutral placeholder instead of `<iframe>`
   * (no `origin=` vs `origin=http…` disagreement). Passing `suppressHydrationWarning` on iframe
   * was insufficient because React/dev still flagged `src` before `useEffect` ran.
   */
  const [iframeMounted, setIframeMounted] = useState(false)
  useEffect(() => {
    setIframeMounted(true)
  }, [])

  const normalizedId = useMemo(() => extractYoutubeVideoIdLoose(videoId) ?? null, [videoId])
  const embedSrc = useMemo(() => {
    if (!normalizedId || !iframeMounted) return ''
    return youtubeEmbedSrc(normalizedId, iframeApiOriginQueryParam())
  }, [normalizedId, iframeMounted])

  const prevEmbedSrcForWrapperRef = useRef('')

  useEffect(() => {
    if (!normalizedId || !iframeMounted) return
    console.info('[yt] mount', { videoId, normalizedId, wrapperCreated: wrapperCreatedRef.current })
    setBlocked(false)
    pendingPlayRef.current = false
    errorFiredRef.current = false

    const prevEmbed = prevEmbedSrcForWrapperRef.current
    if (prevEmbed !== '' && prevEmbed !== embedSrc) {
      wrapperCreatedRef.current = false
      ytPlayerRef.current = null
    }
    prevEmbedSrcForWrapperRef.current = embedSrc

    /**
     * Poll getCurrentTime as a ground-truth fallback. The YT IFrame API handshake
     * (onReady/onStateChange) sometimes never completes — extension interference, origin
     * mismatch, unusually slow iframe handshake — even though the iframe's `autoplay=1`
     * successfully started playback. Without this poll, the tap-to-play overlay gets stuck
     * on top of a video that is actually playing (and audible), which looks exactly like
     * "nothing plays" from the user's perspective.
     */
    let lastPolledTime = 0
    const pollTimer = setInterval(() => {
      const p = ytPlayerRef.current
      if (!p) return
      let t = 0
      try {
        t = typeof p.getCurrentTime === 'function' ? p.getCurrentTime() : 0
      } catch {
        return
      }
      if (t > 0 && t !== lastPolledTime) {
        lastPolledTime = t
        setBlocked(prev => {
          if (prev) console.info('[yt] poll detected playback — clearing overlay', { t })
          return false
        })
      }
    }, 500)

    const autoplayTimer = setTimeout(() => {
      // Final check via the poll's metric: if time is already advancing we shouldn't show
      // the overlay at all.
      const p = ytPlayerRef.current
      let t = 0
      try { t = typeof p?.getCurrentTime === 'function' ? p.getCurrentTime() : 0 } catch {}
      if (t > 0) {
        console.info('[yt] autoplay timeout — but getCurrentTime > 0, suppressing overlay', { t })
        return
      }
      console.info('[yt] autoplay timeout — showing tap-to-play overlay', {
        hasPlayer: Boolean(ytPlayerRef.current),
      })
      setBlocked(true)
    }, AUTOPLAY_TIMEOUT_MS)

    // Only create the YT.Player wrapper on the FIRST effect invocation (see comment on
    // `wrapperCreatedRef`). Strict Mode's second invocation only sets up fresh timers on
    // top of the wrapper the first invocation already established.
    if (!wrapperCreatedRef.current) {
      wrapperCreatedRef.current = true
      whenYtReady(() => {
        if (!iframeRef.current || !window.YT?.Player) {
          console.info('[yt] ready callback skipped', {
            hasIframe: Boolean(iframeRef.current),
            hasYT: Boolean(window.YT?.Player),
          })
          wrapperCreatedRef.current = false
          return
        }
        if (ytPlayerConstructionTimerRef.current !== null) {
          clearTimeout(ytPlayerConstructionTimerRef.current)
          ytPlayerConstructionTimerRef.current = null
        }
        ytPlayerConstructionTimerRef.current = setTimeout(() => {
          ytPlayerConstructionTimerRef.current = null
          const el = iframeRef.current
          if (!el || !window.YT?.Player) {
            wrapperCreatedRef.current = false
            return
          }
          try {
            const player = new window.YT.Player(el, {
              events: {
                onReady: e => {
                  ytPlayerRef.current = e.target
                  try {
                    const s = e.target.getPlayerState()
                    try {
                      e.target.seekTo(0, true)
                    } catch {}
                    console.info('[yt] onReady', { state: s, pending: pendingPlayRef.current })
                    if (s === 1 || s === 3) setBlocked(false)
                    if (pendingPlayRef.current || s === -1 || s === 2 || s === 5) {
                      pendingPlayRef.current = false
                      e.target.playVideo()
                    }
                  } catch (err) {
                    console.warn('[yt] onReady play failed', err)
                  }
                },
                onStateChange: e => {
                  console.info('[yt] state', e.data)
                  if (e.data === 1 || e.data === 3) setBlocked(false)
                  if (e.data === 1 && !didSeekToZeroOnPlayRef.current) {
                    didSeekToZeroOnPlayRef.current = true
                    const p = ytPlayerRef.current
                    try {
                      const t = p?.getCurrentTime?.() ?? 0
                      if (t > 1.5) {
                        console.info('[yt] detected resume offset, snapping to 0', { t })
                        p?.seekTo?.(0, true)
                      }
                    } catch {}
                  }
                  if (e.data === 0) onEndedRef.current?.()
                },
                onError: e => {
                  console.warn('[yt] onError', e.data)
                  if (e.data === 5) {
                    setBlocked(true)
                  } else if (!errorFiredRef.current) {
                    errorFiredRef.current = true
                    onErrorRef.current?.(e.data)
                  }
                },
              },
            })
            ytPlayerRef.current = player
          } catch (err) {
            console.warn('[yt] YT.Player construction failed', err)
            wrapperCreatedRef.current = false
          }
        }, YT_PLAYER_BIND_DELAY_MS)
      })
    }

    return () => {
      clearTimeout(autoplayTimer)
      clearInterval(pollTimer)
      if (ytPlayerConstructionTimerRef.current !== null) {
        clearTimeout(ytPlayerConstructionTimerRef.current)
        ytPlayerConstructionTimerRef.current = null
      }
      // React 18 Strict Mode (dev): effect runs twice — first pass sets `wrapperCreatedRef`.
      // Without resetting here, the second pass skips `new YT.Player(...)`, timers restart,
      // and `onReady`/`getCurrentTime()` never activate while `ytPlayerRef` still holds
      // the tentative stub (`playVideo` missing) → perpetual tap-to-play overlay.
      // Real unmount clears the iframe; re-binding happens on the next effect invocation.
      wrapperCreatedRef.current = false
      ytPlayerRef.current = null
    }
  }, [normalizedId, videoId, embedSrc, iframeMounted])

  /**
   * Raw postMessage fallback: YouTube's IFrame API SDK fires `onError` via its own message
   * listener, but in some browsers / configurations the SDK callback never fires even though
   * the iframe sends the error event. We listen directly as a backup. `errorFiredRef` prevents
   * double-advance when both the SDK and this listener see the same error.
   */
  useEffect(() => {
    if (!normalizedId) return
    const handleMessage = (evt: MessageEvent) => {
      if (!iframeRef.current || evt.source !== iframeRef.current.contentWindow) return
      try {
        const msg = JSON.parse(typeof evt.data === 'string' ? evt.data : JSON.stringify(evt.data))
        if (msg?.event === 'onError') {
          const code = Number(msg.info)
          console.info('[yt] postMessage onError', code)
          if (code === 5) {
            setBlocked(true)
          } else if (!errorFiredRef.current) {
            errorFiredRef.current = true
            onErrorRef.current?.(code)
          }
        }
      } catch {}
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [normalizedId])

  /**
   * Tab-return recovery. When the user backgrounds the tab YouTube often pauses the video,
   * and occasionally the iframe's internal controls end up in a state where clicking the
   * play button is a no-op (the HTML5 player has been unloaded but the chrome is still
   * visible). Showing our tap-to-play overlay routes the next click through our own
   * `playVideo()` invocation, which reliably resumes playback — and if the iframe's
   * controls *are* still working, the overlay's click handler behaves identically.
   */
  useEffect(() => {
    const onVisible = () => {
      if (document.hidden) return
      const p = ytPlayerRef.current
      if (!p) return
      let state = -1
      try { state = typeof p.getPlayerState === 'function' ? p.getPlayerState() : -1 } catch {}
      // 1 = playing, 3 = buffering — playback is alive, nothing to do.
      // 2 = paused, 0 = ended, 5 = cued, -1 = unstarted → show overlay so the next tap
      //   goes through our handler and actually resumes.
      if (state === 1 || state === 3) return
      console.info('[yt] visibility return — player not playing, showing overlay', { state })
      setBlocked(true)
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])

  /**
   * Pause only on real document unload (tab close, refresh, or full-page navigation).
   * Do not use `pagehide`: SPA transitions (Next.js `<Link>`) can fire `pagehide` while
   * `PersistentPlayerHost` keeps this component mounted for background Soundings playback.
   */
  useEffect(() => {
    const suspend = () => {
      invoke(ytPlayerRef.current, iframeRef.current, 'pauseVideo')
    }
    window.addEventListener('beforeunload', suspend)
    window.addEventListener('unload', suspend)
    return () => {
      window.removeEventListener('beforeunload', suspend)
      window.removeEventListener('unload', suspend)
    }
  }, [])

  useImperativeHandle(ref, () => ({
    fadeOut: async () => {},
    getCurrentTime: () => {
      try { return ytPlayerRef.current?.getCurrentTime() ?? 0 } catch { return 0 }
    },
    getDuration: () => {
      try { return ytPlayerRef.current?.getDuration() ?? 0 } catch { return 0 }
    },
    play: () => {
      const via = invoke(ytPlayerRef.current, iframeRef.current, 'playVideo')
      console.info('[yt] handle.play', { via, hasPlayer: Boolean(ytPlayerRef.current) })
      if (via !== 'player') pendingPlayRef.current = true
    },
    pause: () => {
      const via = invoke(ytPlayerRef.current, iframeRef.current, 'pauseVideo')
      console.info('[yt] handle.pause', { via, hasPlayer: Boolean(ytPlayerRef.current) })
    },
    seek: (ms: number) => {
      try { ytPlayerRef.current?.seekTo(ms / 1000, true) } catch {}
    },
  }), [])

  if (!normalizedId) {
    return (
      <div className="absolute inset-0 z-[6] flex items-center justify-center bg-zinc-950 text-zinc-500 text-sm px-4 text-center">
        Invalid or missing YouTube video id
      </div>
    )
  }

  return (
    <div className="absolute inset-0 z-[6]">
      {iframeMounted ? (
        <iframe
          key={embedSrc}
          ref={iframeRef}
          title="YouTube video player"
          src={embedSrc}
          allow={IFRAME_ALLOW}
          // YouTube validates the embedder via the Referer header on production HTTPS — sending
          // `no-referrer` causes many videos to refuse to play on Vercel even though they work
          // on localhost (where Referer behavior is looser). Keep this as the cross-origin
          // default so YouTube can verify the embedding origin.
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
          className="absolute inset-0 h-full w-full border-0"
        />
      ) : (
        <div className="absolute inset-0 bg-black" aria-hidden />
      )}
      {iframeMounted && blocked && (
        <button
          type="button"
          className="absolute inset-0 flex items-center justify-center bg-black/70 cursor-pointer z-10"
          onClick={() => {
            const via = invoke(ytPlayerRef.current, iframeRef.current, 'playVideo')
            console.info('[yt] tap-to-play clicked', {
              via,
              hasPlayer: Boolean(ytPlayerRef.current),
              apiReady: ytApiReady,
            })
            if (via !== 'player') pendingPlayRef.current = true
            // Clear the overlay on user gesture. We used to wait for onStateChange
            // confirmation, but some environments never deliver that event (iframe API
            // handshake fails silently) even when playback is working — the overlay would
            // then stay stuck on top of a playing video. Skip-to-next / reload are the
            // recovery paths if play truly didn't start.
            setBlocked(false)
          }}
        >
          <span className="text-white text-6xl leading-none">▶</span>
        </button>
      )}
    </div>
  )
})

export default YoutubePlayer
