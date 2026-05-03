'use client'

/**
 * OAuth / mode-switch routes are implemented as GET handlers that set cookies and redirect.
 * Raw anchor tags in the viewport can be speculatively prefetched; hitting `/api/auth/youtube`
 * without a real click starts YouTube mode and can make `/player` load + autoplay (often trailer-like
 * YouTube embeds) a few seconds later while the user still believes they are only on `/`.
 */
export default function SplashAuthCard({
  loginUrl,
  ytUrl,
  spotifySignedIn = false,
}: {
  loginUrl: string
  ytUrl: string
  spotifySignedIn?: boolean
}) {
  return (
    <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
      <button
        type="button"
        onClick={() => {
          window.location.assign(spotifySignedIn ? '/player' : loginUrl)
        }}
        className={`flex flex-col items-center gap-3 rounded-xl border px-4 py-5 text-left transition-colors ${
          spotifySignedIn
            ? 'border-emerald-500/55 bg-emerald-950/35 ring-1 ring-emerald-400/25 hover:border-emerald-400/80 hover:bg-emerald-950/50'
            : 'border-zinc-700 bg-zinc-950 hover:border-zinc-500 hover:bg-zinc-900'
        }`}
        aria-label={spotifySignedIn ? 'Open Soundings (Spotify session active)' : 'Log in with Spotify'}
      >
        <svg viewBox="0 0 24 24" className="h-11 w-11 shrink-0" fill="#1DB954" aria-hidden>
          <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
        </svg>
        <div className="text-center">
          <span className="flex flex-wrap items-center justify-center gap-2">
            <span className="block text-base font-semibold text-white">Spotify</span>
            {spotifySignedIn ? (
              <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-300">
                Signed in
              </span>
            ) : null}
          </span>
          <span className="mt-1 block text-sm leading-snug text-zinc-300">
            {spotifySignedIn ? 'Tap to open Soundings' : 'Requires Premium · beta access'}
          </span>
        </div>
      </button>
      <button
        type="button"
        onClick={() => {
          window.location.assign(ytUrl)
        }}
        className="flex flex-col items-center gap-3 rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-5 text-left transition-colors hover:border-zinc-500 hover:bg-zinc-900"
      >
        <svg viewBox="0 0 24 24" className="h-11 w-11 shrink-0" fill="#FF0000" aria-hidden>
          <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
        </svg>
        <div className="text-center">
          <span className="block text-base font-semibold text-white">YouTube</span>
          <span className="mt-1 block text-sm leading-snug text-zinc-300">
            No login · ~100 searches/day
          </span>
        </div>
      </button>
    </div>
  )
}
