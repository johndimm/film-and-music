import Link from 'next/link'
import { ExtensionPlaceholder } from '@/app/components/ExtensionPlaceholder'

export default function MusicHomePage() {
  return (
    <div>
      <div className="border-b border-zinc-200 bg-white px-4 py-6">
        <h1 className="text-base font-medium text-zinc-900">Soundings</h1>
        <p className="mt-1 text-sm text-zinc-600">Music · channels · player · queue (extension wiring TBD)</p>
        <Link
          href="/soundings/player"
          className="mt-4 inline-block rounded-lg bg-zinc-900 px-3 py-1.5 text-sm text-white"
        >
          Go to player
        </Link>
      </div>
      <ExtensionPlaceholder title="Home" mode="music" note="This route can become a redirect to /soundings/player when the full player is mounted." />
    </div>
  )
}
