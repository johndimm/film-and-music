'use client'

import {
  FullPageConstellations,
  FullPageConstellationsHostLoading,
  newChannelFromGraphNode,
  useFullPageConstellationsHost,
} from '@/app/lib/constellations/host'
import {
  persistWindowConstellationsHandoffToSession,
  takeEmbedHandoffForInitialState,
} from '@/app/lib/constellations/sessionHandoff'
import type { GraphNode } from '@/app/lib/constellations/types'
import { readNowPlayingSnapshot } from '@/app/lib/nowPlayingBridge'
import { soundingsStorage } from '@/app/lib/platform'
import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'

export default function ConstellationsClient() {
  const router = useRouter()
  const [embedHandoff] = useState(() => takeEmbedHandoffForInitialState())
  const sp = useSearchParams()
  const qParam = (sp.get('q') ?? '').trim()
  const expandParam = (sp.get('expand') ?? '').trim()

  const { ready, externalSearch, autoExpandTitles, nowPlayingKey } = useFullPageConstellationsHost({
    qParam,
    expandParam,
    skipUrlAndPlayerBridge: Boolean(embedHandoff),
    getPlayerSnapshot: readNowPlayingSnapshot,
    nowPlayingBumperEvent: 'soundings-now-playing',
  })

  if (!ready) {
    return <FullPageConstellationsHostLoading surface="overlay" />
  }

  return (
    <FullPageConstellations
      layout="fixed-overlay"
      closeHref="/player"
      onClose={() => {
        persistWindowConstellationsHandoffToSession()
      }}
      externalSearch={externalSearch}
      onExternalSearchConsumed={() => {}}
      autoExpandMatchTitles={autoExpandTitles}
      nowPlayingKey={nowPlayingKey}
      initialSession={embedHandoff}
      onNewChannelFromNode={(node: GraphNode) =>
        newChannelFromGraphNode(node, {
          sessionStorageKey: soundingsStorage.pendingConstellationsNewChannel,
          navigate: (path) => router.push(path),
          path: '/player',
          logLabel: 'soundings-constellations',
        })
      }
    />
  )
}
