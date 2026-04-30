/**
 * Single source of truth for localStorage / sessionStorage key strings.
 * **Do not rename values** without a migration path — user data is keyed by these.
 */

export const soundingsStorage = {
  /** Channel rows JSON (incl. per-channel history). */
  channels: 'earprint-channels',
  activeChannel: 'earprint-active-channel',
  /** Legacy flat history; migrated into channels on first load. */
  history: 'earprint-history',
  settings: 'earprint-settings',
  legacyFactoryChannels: 'earprint-factory-channels',
  nowPlaying: 'earprint-now-playing',
  pendingShare: 'earprint-pending-share',
  /** Queued on /constellations: create this channel when /player loads (JSON `{ v:1, notes: string }`). */
  pendingConstellationsNewChannel: 'earprint-pending-constellations-new-channel',
  devFactoryOverride: 'earprint-factory-dev-override',
  autoNextAtEnd: 'earprint-auto-next-at-end',
  youtubeModeCookie: 'earprint_youtube_mode',
} as const

export const soundingsEventNames = {
  /** Card enqueue from ratings map → player */
  enqueue: 'earprint:enqueue',
} as const

/** Prefix for share deep-link KV: `${prefix}${hash}` */
export const SOUNDING_SHARE_KEY_PREFIX = 'earprint:share:' as const

export const soundingsChannelIds = {
  all: 'earprint-all',
} as const

// ── Trailer Vision (movie-recs) ──────────────────────────────────────────────

export const trailerVisionStorage = {
  channels: 'movie-recs-channels',
  activeChannel: 'movie-recs-active-channel',
  settings: 'movie-recs-settings',
  history: 'movie-recs-history',
  skipped: 'movie-recs-skipped',
  passed: 'movie-recs-passed',
  watchlist: 'movie-recs-watchlist',
  notseen: 'movie-recs-notseen',
  notInterested: 'movie-recs-not-interested',
  /** LLM’s running second-person profile */
  tasteSummary: 'movie-recs-taste-summary',
  /** Blue-star unseen interest / channel-tagged events */
  unseenInterestLog: 'movie-recs-unseen-interest-log',
  llmSessionId: 'movie-recs-llm-session-id',
  llmHistorySynced: 'movie-recs-llm-history-synced',
  reconsider: 'movie-recs-reconsider',
  trailerResumeFrac: 'movie-recs-trailer-resume-frac',
  newChannelPrefill: 'movie-recs-new-channel-prefill',
  artistSuggestionsV1: 'movie-recs-artist-suggestions-v1',
  /** Single legacy key and prefix for `prefix:channelId` prefetch queues. */
  prefetchQueuePrefix: 'movie-recs-prefetch-queue',
  /** Queued on /constellations: create this channel when home loads (JSON `{ v:1, name?, notes }`). */
  pendingConstellationsNewChannel: 'movie-recs-pending-constellations-new-channel',
  /** {@link canonicalTitleKey} → times the LLM suggested a title we already had queued or decided on. */
  llmDiscardFatigueCounts: 'movie-recs-llm-discard-fatigue-counts-v1',
} as const

export const trailerVisionChannelIds = {
  all: 'all',
} as const

/**
 * All Trailer Vision “taste + lists” keys often cleared together (see settings reset).
 * Prefetch keys are per-channel — use {@link listTrailerVisionPrefetchStorageKeys} at runtime.
 */
export const TRAILER_VISION_RESET_DATA_KEYS: readonly string[] = [
  trailerVisionStorage.history,
  trailerVisionStorage.skipped,
  trailerVisionStorage.passed,
  trailerVisionStorage.notseen,
  trailerVisionStorage.unseenInterestLog,
  trailerVisionStorage.watchlist,
  trailerVisionStorage.notInterested,
  trailerVisionStorage.tasteSummary,
  trailerVisionStorage.llmSessionId,
  trailerVisionStorage.llmHistorySynced,
  trailerVisionStorage.llmDiscardFatigueCounts,
] as const
