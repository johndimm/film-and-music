'use client'

import { Suspense } from 'react'
import dynamic from 'next/dynamic'

/** Matches player shell so oauth → /player does not flash a white viewport while lazy-loading. */
function PlayerClientLoadingPlaceholder() {
  return (
    <div
      className="min-h-dvh w-full shrink-0 bg-zinc-950"
      aria-busy="true"
      aria-live="polite"
      aria-label="Loading Soundings"
    />
  )
}

const PlayerClient = dynamic(() => import('./PlayerClient'), {
  ssr: false,
  loading: PlayerClientLoadingPlaceholder,
})

export default function PlayerClientWrapper({
  accessToken,
  guideDemo,
  youtubeResolveTestFromServer,
  youtubeOnly,
  hideAppChrome,
}: {
  accessToken: string
  guideDemo?: string | null
  youtubeResolveTestFromServer: boolean
  youtubeOnly?: boolean
  /** Set when film-music embeds this app in an iframe (query `?unifiedEmbed=1`). */
  hideAppChrome?: boolean
}) {
  return (
    <Suspense fallback={<PlayerClientLoadingPlaceholder />}>
      <PlayerClient
        accessToken={accessToken}
        guideDemo={guideDemo}
        youtubeResolveTestFromServer={youtubeResolveTestFromServer}
        youtubeOnly={youtubeOnly}
        hideAppChrome={hideAppChrome}
      />
    </Suspense>
  )
}
