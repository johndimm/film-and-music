'use client'

import { useMemo } from 'react'
import type { ChannelKind } from '@film-music/platform'

/**
 * Embeds the full Soundings or Trailer Vision app in an iframe. Those apps run as their own
 * Next processes (ports 8000 / 3000 by default) so their bundled `@/app` resolution stays correct.
 *
 * Set in `.env.local`:
 *   NEXT_PUBLIC_SOUNDINGS_ORIGIN=http://127.0.0.1:8000
 *   NEXT_PUBLIC_TRAILER_VISION_ORIGIN=http://127.0.0.1:3000
 *
 * Dev: `npm run dev:sounding` + `npm run dev:trailer-vision` alongside `npm run dev:unified`.
 */
const DEFAULT_SOUNDINGS = 'http://127.0.0.1:8000'
const DEFAULT_TRAILER = 'http://127.0.0.1:3000'

function buildSrc(kind: ChannelKind, channelId: string | undefined): string {
  const base =
    kind === 'music'
      ? (process.env.NEXT_PUBLIC_SOUNDINGS_ORIGIN ?? DEFAULT_SOUNDINGS).replace(/\/$/, '')
      : (process.env.NEXT_PUBLIC_TRAILER_VISION_ORIGIN ?? DEFAULT_TRAILER).replace(/\/$/, '')
  const path = kind === 'music' ? '/player' : '/'
  const u = new URL(path, base.endsWith('/') ? base : `${base}/`)
  u.searchParams.set('unifiedEmbed', '1')
  if (channelId) u.searchParams.set('unifiedChannelId', channelId)
  return u.toString()
}

export function UnifiedProductPlayer({
  kind,
  channelId,
}: {
  kind: ChannelKind | null
  channelId?: string
}) {
  const src = useMemo(() => (kind ? buildSrc(kind, channelId) : ''), [kind, channelId])

  if (!kind) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-950/80 px-4 py-8 text-center text-sm text-zinc-400">
        Choose a channel on the <span className="text-zinc-200">Channels</span> tab. The player loads
        Soundings for <span className="text-amber-400">music</span> channels and Trailer Vision for{' '}
        <span className="text-sky-400">movies</span>.
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <p className="mb-2 text-xs text-zinc-500">
        Embedded app: {kind === 'music' ? 'Soundings' : 'Trailer Vision'} — run the matching dev server
        if this stays blank (
        <code className="text-zinc-400">
          {kind === 'music' ? 'npm run dev:sounding' : 'npm run dev:trailer-vision'}
        </code>
        ).
      </p>
      <iframe
        title={kind === 'music' ? 'Soundings player' : 'Trailer Vision'}
        src={src}
        className="min-h-[min(85dvh,900px)] w-full flex-1 rounded-lg border border-zinc-800 bg-black"
        allow="autoplay; encrypted-media; fullscreen"
      />
    </div>
  )
}
