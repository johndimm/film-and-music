import Link from 'next/link'
import { cookies } from 'next/headers'
import RequestAccessForm from '@/app/components/RequestAccessForm'
import SplashAuthCard from '@/app/SplashAuthCard'

const SHARED_DESC = 'Soundings: music. Trailer Vision: movies. Same deployment.'
const MUSIC_DESC =
  'Discovery with Spotify & YouTube: channels, queue, interactive graph.'
const FILM_DESC =
  'Describe your taste, browse trailers, rate what you watched, save a watchlist.'

/**
 * Mirrors `apps/soundings/app/page.tsx`: sibling apps Soundings and Trailer Vision under Film & Music.
 */
export default async function SplashPage() {
  const cookieStore = await cookies()
  const hasSpotify = cookieStore.has('spotify_access_token')
  const loginUrl = '/api/auth/login'
  const ytUrl = '/api/auth/youtube'

  const appTitle =
    'text-2xl font-bold tracking-tight text-white sm:text-3xl md:text-[1.875rem] md:leading-snug'

  const appBody = 'text-base leading-relaxed text-zinc-300 sm:text-[1.05rem]'

  return (
    <div className="min-h-dvh bg-zinc-950 px-4 py-6 text-zinc-100 sm:px-6 lg:py-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col">
        <header className="mb-6 shrink-0 text-center lg:mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl md:text-[2.35rem]">
            Film &amp; Music
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-base leading-relaxed text-zinc-400 sm:text-lg">{SHARED_DESC}</p>
        </header>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-stretch lg:gap-8">
          <section className="flex min-h-0 flex-col rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6 shadow-sm sm:p-8">
            <div className="text-center">
              <span className="text-5xl leading-none">🎵</span>
              <h2 className={`${appTitle} mt-5`}>Soundings</h2>
              <p className={`${appBody} mt-3`}>{MUSIC_DESC}</p>
            </div>
            <SplashAuthCard loginUrl={loginUrl} ytUrl={ytUrl} spotifySignedIn={hasSpotify} />
            <div className="mt-8 border-t border-zinc-800 pt-8">
              <RequestAccessForm />
            </div>
            <div className="mt-6 flex flex-wrap justify-center gap-4 text-center text-sm">
              <Link
                href="/status"
                className="text-zinc-400 underline-offset-4 transition-colors hover:text-white hover:underline"
              >
                Spotify status
              </Link>
              <Link
                href="/docs"
                className="text-zinc-400 underline-offset-4 transition-colors hover:text-white hover:underline"
              >
                Docs
              </Link>
              <Link
                href="/journal.html"
                className="text-zinc-400 underline-offset-4 transition-colors hover:text-white hover:underline"
              >
                Journal
              </Link>
            </div>
          </section>

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
        </div>
      </div>
    </div>
  )
}
