'use client'

import { Suspense } from 'react'
import dynamic from 'next/dynamic'

const PlayerClient = dynamic(() => import('./PlayerClient'), { ssr: false })

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
    <Suspense fallback={null}>
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
