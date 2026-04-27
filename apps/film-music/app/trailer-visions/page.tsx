import Link from 'next/link'
import { ExtensionPlaceholder } from '@/app/components/ExtensionPlaceholder'

export default function MoviesHomePage() {
  return (
    <div>
      <div className="border-b border-zinc-200 bg-white px-4 py-6">
        <h1 className="text-base font-medium text-zinc-900">Trailer Vision</h1>
        <p className="mt-1 text-sm text-zinc-600">Trailers · channels · watchlist (extension wiring TBD)</p>
        <Link
          href="/trailer-visions/player"
          className="mt-4 inline-block rounded-lg bg-zinc-900 px-3 py-1.5 text-sm text-white"
        >
          Go to player
        </Link>
      </div>
      <ExtensionPlaceholder
        title="Home"
        mode="movies"
        note="The legacy app used the home page as the main player; here /trailer-visions/player is the first-class route."
      />
    </div>
  )
}
