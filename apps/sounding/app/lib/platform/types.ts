import type { ReactNode } from 'react'

/**
 * `unified` = one app shell where channels can be music and movies at the same time
 * (same list, player picks the right source from the active channel).
 */
export type MediaMode = 'music' | 'movies' | 'unified'

/** Top-level shell navigation (tabs): player, channels, history, settings, etc. */
export type ShellTab = {
  href: string
  label: string
}

/**
 * A channel in the **unified** list — one row can be music, another movies.
 * Legacy per-mode apps can filter by `kind` when persisting to storage.
 */
export type ChannelKind = 'music' | 'movies'

export type UnifiedChannel = {
  id: string
  title: string
  kind: ChannelKind
  /** Optional subtitle (e.g. "Spotify + YouTube" / "Trailer + RT") */
  sourceHint?: string
}

export type { SharedChannelTuning } from './types/channelTuning'

/**
 * Configuration for the shared chrome. Per-extension configs use a `basePath` of `/m` or `/v`.
 * The **unified** app uses `basePath: ''` and one shared `/channels` route for mixed channel lists.
 */
export type PlatformShellConfig = {
  mode: MediaMode
  productName: string
  basePath: string
  /** Where the product name links (defaults to `basePath` or `/` when basePath is empty) */
  productHref?: string
  /** Primary row — typically Player, Channels, History, … */
  tabs: ShellTab[]
  /** Optional second row (e.g. Help, docs) */
  secondaryTabs?: ShellTab[]
  /** Player route uses dark chrome (music) vs light (movies browse) */
  headerVariant: 'player-dark' | 'neutral'
}

/**
 * Future: each extension implements an adapter the base shell uses for
 * the query box, queue, suggestions, and playback — without the shell importing
 * Spotify vs YouTube vs movie LLM details.
 */
export type PlatformAdapter<TItem = unknown> = {
  mode: MediaMode
  /** Display name for the query / prompt input */
  queryPlaceholder: string
  // resolveQuery(q: string): Promise<...>
  // getQueue(): TItem[]
  // ...
}

/**
 * Layout slots the unified app can pass through later (composition over monolith).
 * Extensions render the real components; the shell only reserves regions if needed.
 */
export type PlatformShellSlots = {
  /** Above-the-fold prompt / search */
  querySlot?: ReactNode
  /** Main surface (player, channel editor, etc.) */
  mainSlot?: ReactNode
  /** Queue + suggestions column */
  sideSlot?: ReactNode
}
