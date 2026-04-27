'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { UnifiedChannel, ChannelKind } from '@film-music/platform'

const STORAGE_KEY = 'film-music-unified-channels'
const ACTIVE_KEY = 'film-music-active-channel-id'

function defaultChannels(): UnifiedChannel[] {
  return [
    { id: 'ch-m-1', title: 'Evening focus', kind: 'music', sourceHint: 'Spotify + YouTube' },
    { id: 'ch-m-2', title: 'Indie discover', kind: 'music' },
    { id: 'ch-v-1', title: 'This week at the cinema', kind: 'movies', sourceHint: 'Trailers + RT' },
    { id: 'ch-v-2', title: '80s rewatch', kind: 'movies' },
  ]
}

function loadChannels(): UnifiedChannel[] {
  if (typeof window === 'undefined') return defaultChannels()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const p = JSON.parse(raw) as unknown
      if (Array.isArray(p) && p.length > 0) return p as UnifiedChannel[]
    }
  } catch {
    /* ignore */
  }
  return defaultChannels()
}

type ActiveChannelContextValue = {
  channels: UnifiedChannel[]
  setChannels: (ch: UnifiedChannel[] | ((prev: UnifiedChannel[]) => UnifiedChannel[])) => void
  activeChannel: UnifiedChannel | null
  activeChannelId: string | null
  setActiveChannelId: (id: string | null) => void
  addChannel: (title: string, kind: ChannelKind) => void
}

const ActiveChannelContext = createContext<ActiveChannelContextValue | null>(null)

export function ActiveChannelProvider({ children }: { children: ReactNode }) {
  const [channels, setChannelsState] = useState<UnifiedChannel[]>(loadChannels)
  const [activeChannelId, setActiveChannelIdState] = useState<string | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const id = localStorage.getItem(ACTIVE_KEY)
      if (id) setActiveChannelIdState(id)
    } catch {
      /* ignore */
    }
  }, [])

  const setChannels = useCallback(
    (next: UnifiedChannel[] | ((prev: UnifiedChannel[]) => UnifiedChannel[])) => {
      setChannelsState((prev) => {
        const n = typeof next === 'function' ? next(prev) : next
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(n))
        } catch {
          /* ignore */
        }
        return n
      })
    },
    []
  )

  const setActiveChannelId = useCallback((id: string | null) => {
    setActiveChannelIdState(id)
    if (typeof window === 'undefined') return
    try {
      if (id) localStorage.setItem(ACTIVE_KEY, id)
      else localStorage.removeItem(ACTIVE_KEY)
    } catch {
      /* ignore */
    }
  }, [])

  const activeChannel = useMemo(() => {
    if (!activeChannelId) return null
    return channels.find((c) => c.id === activeChannelId) ?? null
  }, [channels, activeChannelId])

  const addChannel = useCallback(
    (title: string, kind: ChannelKind) => {
      const id = `ch-${kind}-${Date.now().toString(36)}`
      setChannels((prev) => [...prev, { id, title: title.trim() || 'Untitled', kind }])
      setActiveChannelId(id)
    },
    [setActiveChannelId, setChannels]
  )

  const value = useMemo(
    () => ({
      channels,
      setChannels,
      activeChannel,
      activeChannelId,
      setActiveChannelId,
      addChannel,
    }),
    [channels, setChannels, activeChannel, activeChannelId, setActiveChannelId, addChannel]
  )

  return <ActiveChannelContext.Provider value={value}>{children}</ActiveChannelContext.Provider>
}

export function useActiveChannel(): ActiveChannelContextValue {
  const v = useContext(ActiveChannelContext)
  if (!v) throw new Error('useActiveChannel must be used under ActiveChannelProvider')
  return v
}
