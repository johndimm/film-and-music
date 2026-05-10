import Link from 'next/link'
import { cookies } from 'next/headers'
import RequestAccessForm from './RequestAccessForm'
import SplashAuthCard from './SplashAuthCard'
import SplashAudioGuard from './SplashAudioGuard'

const MUSIC_DESC =
  'Discovery with Spotify & YouTube: channels, queue, interactive graph.'
const FILM_DESC =
  'Browse trailers, rate what you watched, save a watchlist — the app learns from how you use it.'
const CONSTELLATIONS_DESC = 'Interactive graph: people, works, and how they connect.'

const CREATOR_GITHUB = 'https://github.com/johndimm/film-and-music'
const CREATOR_LINKEDIN = 'https://www.linkedin.com/in/johndimm/'

/** Soundings deployment home: Soundings, Trailer Vision, Constellations. `/soundings` redirects here. */
export default async function SplashPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const cookieStore = await cookies()
  const { error } = await searchParams
  /** `/player` can refresh with refresh_token; expire-only access cookie → surface “Sign in again”. */
  const expRaw = cookieStore.get('spotify_access_token_expires_at')?.value?.trim()
  const expMs = expRaw !== undefined && expRaw !== '' ? Number(expRaw) : NaN
  const accessExpiryPassed = Number.isFinite(expMs) && expMs < Date.now()
  const spotifySignedIn =
    !error &&
    (cookieStore.has('spotify_refresh_token') ||
      (cookieStore.has('spotify_access_token') && !accessExpiryPassed))

  /** Do not redirect to `/player` here — that made `/` silently become the player after a navigation round-trip, then Web Playback resumed a few seconds later ("music on landing with no clicks"). Signed-in users should stay on Film & Music until they choose Soundings or Trailer Vision. */

  const loginUrl = '/api/auth/login'
  const ytUrl = '/api/auth/youtube'

  const appTitle =
    'text-2xl font-bold tracking-tight text-white sm:text-3xl md:text-[1.875rem] md:leading-snug'

  const appBody = 'text-base leading-relaxed text-zinc-300 sm:text-[1.05rem]'

  return (
    <div className="min-h-dvh bg-zinc-950 px-4 py-6 text-zinc-100 sm:px-6 lg:py-8">
      <SplashAudioGuard />
      <div className="mx-auto flex w-full max-w-6xl flex-col lg:max-h-none">
        {error && (
          <p className="mb-6 text-center text-base text-red-400">
            {error === 'spotify_auth_failed'
              ? 'Spotify login was cancelled.'
              : error === 'token_exchange_failed'
                ? 'Could not complete Spotify login. Check redirect URI and credentials in the Spotify dashboard.'
                : 'Something went wrong. Please try again.'}
          </p>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:items-stretch lg:gap-8">
            {/* Soundings */}
            <section className="flex min-h-0 flex-col rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6 shadow-sm sm:p-8">
              <div className="text-center">
                <span className="text-5xl leading-none">🎵</span>
                <h2 className={`${appTitle} mt-5`}>Soundings</h2>
                <p className={`${appBody} mt-3`}>{MUSIC_DESC}</p>
              </div>
              {/* GET /api/auth/youtube sets cookies + redirects — avoid raw anchor tags here (prefetch can hit those URLs without an intentional click). */}
              <SplashAuthCard loginUrl={loginUrl} ytUrl={ytUrl} spotifySignedIn={spotifySignedIn} />
              <div className="mt-8 border-t border-zinc-800 pt-8">
                <RequestAccessForm />
              </div>
            </section>

            {/* Trailer Vision */}
            <section className="flex min-h-0 flex-col rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6 shadow-sm sm:p-8">
              <div className="flex flex-1 flex-col text-center">
                <span className="text-5xl leading-none">🎬</span>
                <h2 className={`${appTitle} mt-5`}>Trailer Vision</h2>
                <p className={`${appBody} mt-3`}>{FILM_DESC}</p>
                <Link
                  href="/trailer-visions"
                  prefetch={false}
                  aria-label="Open Trailer Vision"
                  className="group mt-5 block w-full shrink-0 cursor-pointer overflow-hidden rounded-2xl shadow-sm outline-none ring-2 ring-transparent ring-offset-2 ring-offset-zinc-900 transition hover:opacity-95 hover:ring-sky-500/40 focus-visible:ring-sky-400"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/nano-banano-photo.png"
                    alt=""
                    className="block w-full rounded-2xl transition group-hover:scale-[1.01]"
                  />
                </Link>
                <div className="mt-8 flex min-h-[12rem] flex-1 flex-col gap-8 sm:min-h-0">
                  <div className="flex flex-wrap justify-center gap-2">
                    {['AI recs', 'Trailers', 'Watchlist', 'Ratings'].map((tag) => (
                      <span
                        key={tag}
                        className="rounded-md bg-sky-500/20 px-3 py-1.5 text-sm font-medium text-sky-200"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                  <div className="flex-1 sm:min-h-8" aria-hidden />
                  <Link
                    href="/trailer-visions"
                    prefetch={false}
                    className="inline-flex w-full max-w-[18rem] items-center justify-center self-center rounded-xl bg-sky-600 px-6 py-3.5 text-base font-semibold text-white shadow-sm transition-colors hover:bg-sky-500"
                  >
                    Open Trailer Vision
                  </Link>
                </div>
              </div>
            </section>

            {/* Constellations */}
            <section className="flex min-h-0 flex-col rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6 shadow-sm sm:p-8">
              <div className="flex flex-1 flex-col text-center">
                <span className="text-5xl leading-none">🕸️</span>
                <h2 className={`${appTitle} mt-5`}>Constellations</h2>
                <p className={`${appBody} mt-3`}>{CONSTELLATIONS_DESC}</p>
                <Link
                  href="/constellations"
                  prefetch={false}
                  aria-label="Open Constellations"
                  className="group mt-5 block w-full shrink-0 cursor-pointer overflow-hidden rounded-2xl shadow-sm outline-none ring-2 ring-transparent ring-offset-2 ring-offset-zinc-900 transition hover:opacity-95 hover:ring-violet-500/40 focus-visible:ring-violet-400"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/godfather.png"
                    alt=""
                    className="block w-full rounded-2xl transition group-hover:scale-[1.01]"
                  />
                </Link>
                <div className="mt-8 flex min-h-[12rem] flex-1 flex-col gap-8 sm:min-h-0">
                  <div className="flex-1 sm:min-h-8" aria-hidden />
                  <Link
                    href="/constellations"
                    prefetch={false}
                    className="inline-flex w-full max-w-[18rem] items-center justify-center self-center rounded-xl bg-violet-600 px-6 py-3.5 text-base font-semibold text-white shadow-sm transition-colors hover:bg-violet-500"
                  >
                    Open Constellations
                  </Link>
                </div>
              </div>
            </section>
        </div>

        <footer className="mt-10 flex flex-wrap justify-center gap-x-8 gap-y-2 border-t border-zinc-800/80 pt-8 text-sm text-zinc-500">
          <a
            href={CREATOR_GITHUB}
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-zinc-200"
          >
            GitHub
          </a>
          <a
            href={CREATOR_LINKEDIN}
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-zinc-200"
          >
            LinkedIn
          </a>
          <a href="/privacy" className="transition-colors hover:text-zinc-200">Privacy</a>
          <a href="/terms" className="transition-colors hover:text-zinc-200">Terms</a>
        </footer>
      </div>
    </div>
  )
}
