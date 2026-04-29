import Link from 'next/link'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import RequestAccessForm from './RequestAccessForm'
import { getBaseUrl } from '@/app/lib/baseUrl'

const SHARED_DESC =
  'One channel list can blend music stations and movie picks — jump into either experience below.'
const MUSIC_DESC =
  'Discovery with Spotify & YouTube: channels, queue, interactive graph.'
const FILM_DESC =
  'Describe your taste, browse trailers, rate what you watched, save a watchlist.'

/** Two equal pillars (Soundings & Trailer Vision) under Film & Music. `/soundings` redirects here. */
export default async function SplashPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const cookieStore = await cookies()
  const hasToken = cookieStore.has('spotify_access_token')
  const { error } = await searchParams
  const base = getBaseUrl()

  if (hasToken && !error) {
    redirect(base ? `${base}/player` : '/player')
  }

  const loginUrl = base ? `${base}/api/auth/login` : '/api/auth/login'
  const ytUrl = base ? `${base}/api/auth/youtube` : '/api/auth/youtube'

  const appTitle =
    'text-2xl font-bold tracking-tight text-white sm:text-3xl md:text-[1.875rem] md:leading-snug'

  const appBody = 'text-base leading-relaxed text-zinc-300 sm:text-[1.05rem]'

  return (
    <div className="min-h-dvh bg-zinc-950 px-4 py-6 text-zinc-100 sm:px-6 lg:py-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col lg:max-h-none">
        {/* Umbrella */}
        <header className="mb-6 shrink-0 text-center lg:mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl md:text-[2.35rem]">
            Film &amp; Music
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-base leading-relaxed text-zinc-400 sm:text-lg">
            {SHARED_DESC}
          </p>
        </header>

        {error && (
          <p className="mb-6 text-center text-base text-red-400">
            {error === 'spotify_auth_failed'
              ? 'Spotify login was cancelled.'
              : error === 'token_exchange_failed'
                ? 'Could not complete Spotify login. Check redirect URI and credentials in the Spotify dashboard.'
                : 'Something went wrong. Please try again.'}
          </p>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-stretch lg:gap-8">
            {/* Soundings */}
            <section className="flex min-h-0 flex-col rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6 shadow-sm sm:p-8">
              <div className="text-center">
                <span className="text-5xl leading-none">🎵</span>
                <h2 className={`${appTitle} mt-5`}>Soundings</h2>
                <p className={`${appBody} mt-3`}>{MUSIC_DESC}</p>
              </div>
              <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
                <a
                  href={loginUrl}
                  className="flex flex-col items-center gap-3 rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-5 transition-colors hover:border-zinc-500 hover:bg-zinc-900"
                >
                  <svg viewBox="0 0 24 24" className="h-11 w-11 shrink-0" fill="#1DB954" aria-hidden>
                    <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
                  </svg>
                  <div className="text-center">
                    <span className="block text-base font-semibold text-white">Spotify</span>
                    <span className="mt-1 block text-sm leading-snug text-zinc-300">
                      Requires Premium · allowed-email list
                    </span>
                  </div>
                </a>
                <a
                  href={ytUrl}
                  className="flex flex-col items-center gap-3 rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-5 transition-colors hover:border-zinc-500 hover:bg-zinc-900"
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
                </a>
              </div>
              <div className="mt-8 border-t border-zinc-800 pt-8">
                <RequestAccessForm />
              </div>
              <div className="mt-6 flex flex-wrap justify-center gap-4 text-center text-sm">
                <a
                  href="/status"
                  className="text-zinc-400 underline-offset-4 transition-colors hover:text-white hover:underline"
                >
                  Spotify status
                </a>
                <a
                  href="/docs"
                  className="text-zinc-400 underline-offset-4 transition-colors hover:text-white hover:underline"
                >
                  Docs
                </a>
                <a
                  href="/journal.html"
                  className="text-zinc-400 underline-offset-4 transition-colors hover:text-white hover:underline"
                >
                  Journal
                </a>
              </div>
            </section>

            {/* Trailer Vision */}
            <section className="flex min-h-0 flex-col rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6 shadow-sm sm:p-8">
              <div className="flex flex-1 flex-col text-center">
                <span className="text-5xl leading-none">🎬</span>
                <h2 className={`${appTitle} mt-5`}>Trailer Vision</h2>
                <p className={`${appBody} mt-3`}>{FILM_DESC}</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/nano-banano-photo.png"
                  alt="Trailer Vision"
                  className="mt-5 w-full rounded-2xl shadow-sm"
                />
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
                    className="inline-flex w-full max-w-[18rem] items-center justify-center self-center rounded-xl bg-sky-600 px-6 py-3.5 text-base font-semibold text-white shadow-sm transition-colors hover:bg-sky-500"
                  >
                    Open Trailer Vision
                  </Link>
                </div>
              </div>
            </section>
        </div>

        <p className="mt-10 text-center text-sm leading-relaxed text-zinc-400 pb-8">
          Channels are shared — mix music and movies in one list.
        </p>
      </div>
    </div>
  )
}
