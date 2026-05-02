'use client'

import dynamic from 'next/dynamic'
import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import '@/app/lib/constellations/index.css'
import {
  invalidateEmbedHandoffMemory,
  persistWindowConstellationsHandoffToSession,
  takeEmbedHandoffForInitialState,
} from '@/app/lib/constellations/sessionHandoff'
import type { GraphNode } from '@/app/lib/constellations/types'
import {
  useFullPageConstellationsHost,
} from '@/app/lib/constellations/useFullPageConstellationsHost'
import { readNowPlayingSnapshot } from '@/app/lib/nowPlayingBridge'

const ConstellationsApp = dynamic(() => import('@/app/lib/constellations/host').then(m => m.App), { ssr: false })

function PlayerConstellationsInner({
  onNewChannelFromNode,
}: {
  onNewChannelFromNode?: (node: GraphNode) => void
}) {
  const sp = useSearchParams()
  const qParam = (sp.get('q') ?? '').trim()
  const expandParam = (sp.get('expand') ?? '').trim()
  const [embedReturnHandoff] = useState(() => takeEmbedHandoffForInitialState())

  useEffect(() => {
    if (!embedReturnHandoff) return undefined
    // Defer invalidation past React StrictMode’s synchronous unmount/remount so the remount still
    // reads `embedHandoffMem`; clear timeout on teardown so Strict cleanup does not wipe early.
    const t = window.setTimeout(() => {
      invalidateEmbedHandoffMemory()
    }, 0)
    return () => window.clearTimeout(t)
  }, [embedReturnHandoff])

  const { ready, externalSearch, autoExpandTitles, nowPlayingKey } = useFullPageConstellationsHost({
    qParam,
    expandParam,
    skipUrlAndPlayerBridge: false,
    getPlayerSnapshot: readNowPlayingSnapshot,
    nowPlayingBumperEvent: 'soundings-now-playing',
  })

  if (!ready) {
    return (
      <div className="w-full h-[min(75vh,900px)] min-h-[320px] bg-slate-950 flex items-center justify-center text-slate-400 text-sm">
        Loading graph…
      </div>
    )
  }

  return (
    <div className="h-[min(75vh,900px)] w-full min-h-[480px] relative overflow-hidden">
      <ConstellationsApp
        embedded
        hideHeader
        hideControlPanel
        showExtensionWhenPanelHidden={false}
        hideSidebar
        externalSearch={externalSearch}
        onExternalSearchConsumed={() => {}}
        autoExpandMatchTitles={autoExpandTitles}
        nowPlayingKey={nowPlayingKey}
        initialSession={embedReturnHandoff}
        onNewChannelFromNode={onNewChannelFromNode}
      />
    </div>
  )
}

/**
 * Constellations graph on the main player page — same app as /constellations, embedded and
 * sized to the container.
 */
export default function PlayerConstellationsEmbed({
  onNewChannelFromNode,
}: {
  onNewChannelFromNode?: (node: GraphNode) => void
}) {
  const router = useRouter()

  const goFullScreen = () => {
    persistWindowConstellationsHandoffToSession()
    router.push('/constellations')
  }

  return (
    <div id="soundings-constellations" className="w-full shrink-0">
      <div className="mx-auto w-full max-w-[800px] px-4 pb-2 pt-2">
        <p className="mb-1.5 text-right text-xs text-zinc-500">
          <button
            type="button"
            onClick={goFullScreen}
            className="cursor-pointer border-0 bg-transparent p-0 font-inherit text-emerald-400/90 underline decoration-emerald-500/30 hover:text-emerald-300"
          >
            Open full screen
          </button>
          <span className="text-zinc-600"> — search, files, and details</span>
        </p>
        <Suspense
          fallback={
            <div className="h-[min(75vh,900px)] min-h-[320px] bg-slate-950 flex items-center justify-center text-slate-400 text-sm">
              Loading graph…
            </div>
          }
        >
          <PlayerConstellationsInner onNewChannelFromNode={onNewChannelFromNode} />
        </Suspense>
      </div>
    </div>
  )
}
