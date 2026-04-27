import Link from 'next/link'

export default function SplashPage() {
  return (
    <div className="min-h-dvh bg-zinc-950 text-zinc-100 flex flex-col items-center justify-center px-6 py-16">
      <div className="max-w-2xl w-full space-y-12">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight">Film &amp; Music</h1>
          <p className="mt-3 text-zinc-400 text-sm max-w-sm mx-auto">
            Two apps for discovering what to watch and what to listen to.
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          <Link
            href="/soundings"
            className="group rounded-2xl border border-zinc-800 bg-zinc-900 p-6 hover:border-amber-500/50 hover:bg-zinc-800 transition-colors"
          >
            <div className="flex items-center gap-3 mb-3">
              <span className="text-2xl">🎵</span>
              <h2 className="text-lg font-semibold">Soundings</h2>
            </div>
            <p className="text-sm text-zinc-400 leading-relaxed">
              Music discovery powered by Spotify and YouTube. Build channels around artists
              you love, explore connections through an interactive graph, and let your taste
              guide what plays next.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {['Spotify', 'YouTube', 'Channels', 'Graph'].map((tag) => (
                <span
                  key={tag}
                  className="rounded-md bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-400"
                >
                  {tag}
                </span>
              ))}
            </div>
            <p className="mt-4 text-xs font-medium text-amber-400 group-hover:underline">
              Open Soundings →
            </p>
          </Link>

          <Link
            href="/trailer-visions"
            className="group rounded-2xl border border-zinc-800 bg-zinc-900 p-6 hover:border-sky-500/50 hover:bg-zinc-800 transition-colors"
          >
            <div className="flex items-center gap-3 mb-3">
              <span className="text-2xl">🎬</span>
              <h2 className="text-lg font-semibold">Trailer Vision</h2>
            </div>
            <p className="text-sm text-zinc-400 leading-relaxed">
              AI-powered movie recommendations. Describe your taste, browse personalized
              trailer queues, rate what you've seen, and build a watchlist for what's next.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {['AI Recs', 'Trailers', 'Watchlist', 'Ratings'].map((tag) => (
                <span
                  key={tag}
                  className="rounded-md bg-sky-500/10 px-2 py-0.5 text-xs font-medium text-sky-400"
                >
                  {tag}
                </span>
              ))}
            </div>
            <p className="mt-4 text-xs font-medium text-sky-400 group-hover:underline">
              Open Trailer Vision →
            </p>
          </Link>
        </div>

        <p className="text-center text-xs text-zinc-600">
          Channels are shared — mix music and movies in one list.
        </p>
      </div>
    </div>
  )
}
