'use client'

import dynamic from 'next/dynamic'
import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import '@film-music/constellations/index.css'
import { SOUNDINGS_CONSTELLATIONS_HANDOFF_KEY } from '@film-music/constellations/sessionHandoff'
import type { GraphNode } from '@film-music/constellations/types'
import { readNowPlayingSnapshot } from '@/app/lib/nowPlayingBridge'

const ConstellationsApp = dynamic(() => import('@film-music/constellations/host').then(m => m.App), { ssr: false })

function PlayerConstellationsInner({
  onNewChannelFromNode,
}: {
  onNewChannelFromNode?: (node: GraphNode) => void
}) {
  const sp = useSearchParams()
  const qParam = (sp.get('q') ?? '').trim()
  const expandParam = (sp.get('expand') ?? '').trim()

  const [hydrated, setHydrated] = useState(false)
  const [npRev, setNpRev] = useState(0)
  const [externalSearch, setExternalSearch] = useState<{ term: string; id: string | number } | null>(null)
  const [autoExpandTitles, setAutoExpandTitles] = useState<string[]>([])
  const [nowPlayingKey, setNowPlayingKey] = useState<string | null>(null)

  useEffect(() => {
    setHydrated(true)
  }, [])

  useEffect(() => {
    const bump = () => setNpRev((n) => n + 1)
    window.addEventListener('soundings-now-playing', bump)
    return () => window.removeEventListener('soundings-now-playing', bump)
  }, [])

  useEffect(() => {
    if (!hydrated) return
    const extra = expandParam
      ? expandParam
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : []
    const snap = readNowPlayingSnapshot()
    const album = snap?.album?.trim()
    const track = snap?.track?.trim()
    // Album first so the graph matches “album” / composite work nodes, not a song title
    // that may not exist as a node (e.g. track “Move” vs album “Birth of the Cool”).
    const mergedExpand = [...extra, ...(album ? [album] : []), ...(track ? [track] : [])]
    if (album || track) {
      setNowPlayingKey(`${npRev}::${album || ''}::${track || ''}`)
    } else {
      setNowPlayingKey(null)
    }

    if (qParam) {
      setExternalSearch(null)
    } else if (snap?.artist?.trim()) {
      const t = snap.artist.trim()
      // Stable id so Constellations’ externalSearch effect does not re-fire when only the
      // now-playing bridge updates (e.g. progress ticks) or dimensions resize.
      setExternalSearch({ term: t, id: `np:${t.toLowerCase()}` })
    } else {
      setExternalSearch(null)
    }
    setAutoExpandTitles(mergedExpand)
  }, [hydrated, qParam, expandParam, npRev])

  if (!hydrated) {
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
    try {
      const fn = (window as { __soundingsConstellationsGetHandoff?: () => unknown })
        .__soundingsConstellationsGetHandoff
      if (typeof fn === 'function') {
        const payload = fn()
        if (payload && typeof payload === 'object' && (payload as { v?: number }).v === 1) {
          const g = (payload as { graph?: { nodes?: unknown[] } }).graph
          if (g?.nodes?.length) {
            try {
              sessionStorage.setItem(
                SOUNDINGS_CONSTELLATIONS_HANDOFF_KEY,
                JSON.stringify(payload)
              )
            } catch (e) {
              console.warn('[constellations] handoff too large for sessionStorage', e)
            }
          }
        }
      }
    } catch (e) {
      console.warn('[constellations] handoff', e)
    }
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
