"use client";

import { useState, useEffect, useLayoutEffect, useCallback, useRef, useMemo, memo, type ReactNode } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import Link from "next/link";
import type { Channel } from "./channels/page";
import { ALL_CHANNEL, normalizeChannel, CHANNELS_KEY, ACTIVE_CHANNEL_KEY } from "./channels/page";
import { channelDraftFromPrompt, NEW_CHANNEL_PREFILL_KEY } from "./lib/channelFromPrompt";
import RTBadge from "./components/RTBadge";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { clampStarRating, migrateRatingValue } from "@film-music/taste-context";
import {
  CAREER_API,
  careerPersonNameMatch,
  careerUi,
  LlmBulletedText,
  LEGACY_PREFETCH_QUEUE_KEY,
  normalizePassedStorage,
  passedRowsToTitles,
  prefetchQueueStorageKey,
  type PassedRow,
  type TrailerCareerFilm,
  type TrailerCareerMode,
  trailerVisionStorage,
} from "@film-music/platform";
import {
  applyFactoryBootstrap,
  hasNoChannelsPersisted,
  isFactoryStarterPackFullyMerged,
  mergeFactoryChannelsAndQueues,
} from "./lib/factoryChannels";
import { graphNodeToChannelSeeds } from "@film-music/constellations/graphNodeToChannelNotes";
import type { GraphNode } from "@film-music/constellations/types";
import { canonicalTitleKey } from "./lib/canonicalTitleKey";
import { pickHistoryEntryForCardTitle } from "./lib/historyLookup";
import {
  mergeLlmDiscardFatigueIntoExcluded,
  recordDuplicateLlmSuggestionDiscard,
} from "./lib/llmSuggestionFatigue";
import { pushUnseenInterestEntry, type UnseenInterestEntry } from "./lib/unseenInterestLog";

const TrailerVisionConstellationsEmbed = dynamic(
  () => import("./components/TrailerVisionConstellationsEmbed"),
  { ssr: false }
);

function migrateRatingEntry(e: RatingEntry): RatingEntry {
  const u = migrateRatingValue(e.userRating);
  const p = migrateRatingValue(e.predictedRating);
  return { ...e, userRating: u, predictedRating: p, error: Math.abs(u - p) };
}

// ── YouTube IFrame API minimal type shim ──────────────────────────────────────
declare global {
  interface Window {
    YT: {
      Player: new (
        el: HTMLElement,
        opts: {
          videoId: string;
          width?: string | number;
          height?: string | number;
          playerVars?: Record<string, unknown>;
          events?: {
            onReady?: (e: { target: YTPlayer }) => void;
            onStateChange?: (e: { data: number; target: YTPlayer }) => void;
            /** 2 invalid param, 5 HTML5, 100 not found/removed, 101/150 embed not allowed */
            onError?: (e: { data: number; target: YTPlayer }) => void;
          };
        }
      ) => YTPlayer;
      PlayerState: { ENDED: number; PLAYING: number; PAUSED: number; BUFFERING: number; CUED: number };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}
interface YTPlayer {
  getCurrentTime(): number;
  getDuration(): number;
  getVolume(): number;
  isMuted(): boolean;
  setVolume(v: number): void;
  unMute(): void;
  loadVideoById(videoId: string, startSeconds?: number): void;
  seekTo?(seconds: number, allowSeekAhead: boolean): void;
  destroy(): void;
  getPlayerState?(): number;
  playVideo?(): void;
  pauseVideo?(): void;
  stopVideo?(): void;
}

/** Guards JS API calls: `YT.Player` is a stub until the iframe attaches; callers must also avoid detached iframes (Strict Mode / Fast Refresh). */
function ytPlayerIframeConnected(p: YTPlayer | null | undefined): p is YTPlayer {
  if (!p) return false;
  const gf = (p as unknown as { getIframe?: () => HTMLIFrameElement | null }).getIframe;
  if (typeof gf !== "function") return false;
  try {
    const el = gf();
    return Boolean(el?.isConnected);
  } catch {
    return false;
  }
}

// Loads https://www.youtube.com/iframe_api once; resolves when YT.Player is available.
let _ytApiLoaded = false;
let _ytApiReady = false;
const _ytReadyCallbacks: Array<() => void> = [];

function flushYtReady() {
  if (!window.YT?.Player) return;
  if (_ytApiReady) return;
  _ytApiReady = true;
  _ytReadyCallbacks.forEach((cb) => cb());
  _ytReadyCallbacks.length = 0;
}

function loadYouTubeApi(): Promise<void> {
  return new Promise((resolve) => {
    if (_ytApiReady && window.YT?.Player) {
      resolve();
      return;
    }
    _ytReadyCallbacks.push(resolve);
    if (_ytApiLoaded) {
      // Script tag already injected but callback may be delayed or blocked — poll for YT.
      const t = window.setInterval(() => {
        if (window.YT?.Player) {
          window.clearInterval(t);
          flushYtReady();
        }
      }, 50);
      window.setTimeout(() => window.clearInterval(t), 20_000);
      return;
    }
    _ytApiLoaded = true;
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      flushYtReady();
    };
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(tag);
    // If the script was cached and YT appears before the global callback runs.
    window.setTimeout(() => {
      if (window.YT?.Player) flushYtReady();
    }, 0);
  });
}

function pauseYouTubePlayer(p: YTPlayer | null | undefined) {
  if (!p) return;
  try {
    p.pauseVideo?.();
  } catch {
    /* ignore */
  }
}

function silenceYouTubePlayer(p: YTPlayer | null | undefined) {
  if (!p) return;
  pauseYouTubePlayer(p);
  try {
    p.stopVideo?.();
  } catch {
    /* ignore */
  }
}

/** Server merges full rating list in memory; client avoids resending it every request (delta / reuse). */
const LS_LLM_SESSION = trailerVisionStorage.llmSessionId;
const LS_LLM_SYNCED = trailerVisionStorage.llmHistorySynced;

function getLlmSessionId(): string {
  let id = localStorage.getItem(LS_LLM_SESSION);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(LS_LLM_SESSION, id);
  }
  return id;
}

function getSyncedRatingCount(): number {
  const n = Number.parseInt(localStorage.getItem(LS_LLM_SYNCED) || "0", 10);
  return Number.isFinite(n) ? n : 0;
}

function setSyncedRatingCount(n: number) {
  localStorage.setItem(LS_LLM_SYNCED, String(n));
}

function buildHistorySyncPayload(hist: RatingEntry[]): Record<string, unknown> {
  const sessionId = getLlmSessionId();
  let synced = getSyncedRatingCount();
  if (synced > hist.length) synced = 0;

  if (hist.length === 0) {
    return { sessionId, historySync: "full", history: [] };
  }
  if (synced === 0) {
    return { sessionId, historySync: "full", history: hist };
  }
  if (synced < hist.length) {
    return {
      sessionId,
      historySync: "delta",
      baseLength: synced,
      historyAppend: hist.slice(synced),
    };
  }
  return {
    sessionId,
    historySync: "reuse",
    baseLength: hist.length,
  };
}

export interface RatingEntry {
  title: string;
  type: "movie" | "tv";
  userRating: number;
  predictedRating: number;
  error: number;
  rtScore?: string | null;
  channelId?: string;
  posterUrl?: string | null;
  trailerKey?: string | null;
  ratingMode?: "seen" | "unseen";
  /** ISO timestamp when this red-star rating was saved (optional for older rows). */
  ratedAt?: string;
}

interface CurrentMovie {
  title: string;
  type: "movie" | "tv";
  year: number | null;
  director: string | null;
  predictedRating: number;
  actors: string[];
  plot: string;
  posterUrl: string | null;
  trailerKey: string | null;
  rtScore: string | null;
  reason: string | null;
  streaming?: string[];
}

export interface WatchlistEntry {
  title: string;
  type: "movie" | "tv";
  year: number | null;
  director: string | null;
  actors: string[];
  plot: string;
  posterUrl: string | null;
  rtScore: string | null;
  streaming: string[];
  addedAt: string;
}

/**
 * Titles per LLM POST. Server max is 8; 7 is a good balance of throughput vs latency.
 * (At 5, the visible queue could barely exceed one batch before capping—felt too short for niche channels.)
 */
const LLM_BATCH_SIZE = 7;
/** Max concurrent in-flight replenish requests at once. */
const MAX_REPLENISH_IN_FLIGHT = 3;
/**
 * Only start (or chain) LLM replenish calls while prefetch has fewer than this many titles —
 * excludes the visible card so lists stay fresh and queues don’t balloon to full batches repeatedly.
 */
const PREFETCH_REFILL_THRESHOLD = 3;

/**
 * Rotating lenses that force the LLM to explore different corners of cinema on each batch.
 * Without this it defaults to the same few hundred popular titles.
 */
const DIVERSITY_LENSES = [
  "films from the 1940s or 1950s",
  "films from the 1960s or 1970s",
  "films from the 1980s",
  "films from the 1990s",
  "films from the 2000s",
  "films from the 2010s or 2020s",
  "non-English language films (French, Italian, Spanish, German, etc.)",
  "Japanese cinema (anime or live-action)",
  "South Korean cinema",
  "Scandinavian or Eastern European cinema",
  "Latin American or Middle Eastern or African cinema",
  "British cinema",
  "documentary films",
  "horror or psychological thriller",
  "science fiction or speculative fiction",
  "comedy or satire",
  "animation (any country, any era)",
  "cult classics or midnight movies",
  "festival darlings (Cannes, Venice, Sundance, TIFF)",
  "overlooked or underseen gems with low name recognition",
  "director-driven auteur films",
  "crime, noir, or heist films",
  "war films or historical epics",
  "romance or coming-of-age stories",
];

/** YouTube search for clips when the card has no embedded trailer (poster-only layout). */
function youtubeSearchUrlForMovie(title: string, type: "movie" | "tv", year: number | null): string {
  const q = [title, year != null ? String(year) : null, type === "tv" ? "TV series trailer" : "movie trailer"]
    .filter(Boolean)
    .join(" ");
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;
}

const STORAGE_KEY = trailerVisionStorage.history;
const SKIPPED_KEY = trailerVisionStorage.skipped;
/** Titles advanced with "Next" — excluded from picks, not a rating or "not interested". */
const PASSED_KEY = trailerVisionStorage.passed;
const WATCHLIST_KEY = trailerVisionStorage.watchlist;
const NOTSEEN_KEY = trailerVisionStorage.notseen;
const NOT_INTERESTED_KEY = trailerVisionStorage.notInterested; // {title, rtScore}[] for high-RT taste signal
const TASTE_SUMMARY_KEY = trailerVisionStorage.tasteSummary;   // string: LLM's running taste profile
const SETTINGS_KEY = trailerVisionStorage.settings;
const RECONSIDER_KEY = trailerVisionStorage.reconsider;
/** Per channel + title: last trailer watch position (0–1) when you leave the channel, restored when you return. */
const TRAILER_RESUME_KEY = trailerVisionStorage.trailerResumeFrac;

function loadSetting<T>(key: string, fallback: T): T {
  try {
    const s = localStorage.getItem(SETTINGS_KEY);
    if (!s) return fallback;
    const obj = JSON.parse(s);
    return key in obj ? (obj[key] as T) : fallback;
  } catch {
    return fallback;
  }
}

interface NotSeenEvent {
  afterRating: number;
  kind: "want" | "skip";
}

/** Resolve mouse/touch X position within a button to a half-star value (0.5 increments). */
function halfStarValue(clientX: number, rect: DOMRect, n: number): number {
  return clientX - rect.left < rect.width / 2 ? n - 0.5 : n;
}

/** A row of 5 clickable stars supporting half-star precision. */
const StarRow = memo(function StarRow({
  filled,
  color,
  label,
  onRate,
  compact = false,
  /** Smaller controls when Prev/Next share the row (mobile) — keeps stars from overlapping */
  careerNavTight = false,
  hideLabel = false,
}: {
  filled: number;
  color: "red" | "blue";
  label: string;
  onRate: (stars: number) => void;
  /** Tighter label + stars for single-line toolbar layout */
  compact?: boolean;
  careerNavTight?: boolean;
  /** When mode is chosen above (Interest / Rating toggle), hide visible label to avoid repeating text */
  hideLabel?: boolean;
}) {
  const [hover, setHover] = useState(0);
  /** Value from last click — keeps stars lit after pointer leaves (hover clears on mouseleave). */
  const [committed, setCommitted] = useState(0);
  useEffect(() => {
    setCommitted(filled);
    setHover(0);
  }, [filled]);
  const active = hover || filled || committed;
  const filledColor = color === "red" ? "text-red-500" : "text-blue-500";

  const starSizeClass =
    compact && careerNavTight
      ? "text-3xl sm:text-4xl"
      : compact
        ? "text-5xl sm:text-6xl"
        : "text-3xl";
  const labelClass =
    compact && careerNavTight
      ? "text-left text-xs w-14 sm:w-16 sm:text-sm"
      : compact
        ? "text-left text-sm w-16 sm:w-20 sm:text-base"
        : "text-right text-sm w-28";
  return (
    <div
      className={`flex min-w-0 flex-wrap items-center ${compact ? "justify-center gap-x-2 gap-y-1 sm:gap-x-3 sm:gap-y-0" : "gap-3"}`}
    >
      {hideLabel ? (
        <span className="sr-only">{label}</span>
      ) : (
        <span
          className={`font-medium text-zinc-200 shrink-0 leading-snug ${labelClass}`}
        >
          {label}
        </span>
      )}
      <div className={`flex min-w-0 shrink items-center ${compact ? "gap-0.5 sm:gap-1" : "gap-1"}`} onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            /* pointerdown preventDefault: blocks focus() scroll on tap (mouse + touch); keyboard still uses keydown to focus */
            onPointerDown={(e) => e.preventDefault()}
            onMouseMove={(e) => setHover(halfStarValue(e.clientX, e.currentTarget.getBoundingClientRect(), n))}
            onClick={(e) => {
              const v = halfStarValue(e.clientX, e.currentTarget.getBoundingClientRect(), n);
              setCommitted(v);
              onRate(v);
            }}
            className={`relative leading-none select-none ${starSizeClass}`}
            style={{ touchAction: "manipulation" }}
          >
            <span className="text-zinc-600">★</span>
            {active >= n && (
              <span className={`absolute inset-0 ${filledColor}`}>★</span>
            )}
            {active >= n - 0.5 && active < n && (
              <span className={`absolute inset-0 overflow-hidden ${filledColor}`} style={{ width: "50%" }}>★</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
});

const chevronPathNext =
  "M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z";
const chevronPathPrev =
  "M17 10a.75.75 0 01-.75.75H6.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L6.612 9.25H16.25A.75.75 0 0117 10z";

const PassNextButton = memo(function PassNextButton({
  onPass,
  compact = false,
  prominent = false,
  /** Trailer strip: next to star row — larger than compact, emerald (not indigo poster Next) */
  muted = false,
  /** Poster / career: match Prev/Next as mirrored pair (icon on outer side). */
  direction = "next",
  disabled = false,
}: {
  onPass: () => void;
  compact?: boolean;
  /** Larger, hero-style — use when Next is the primary control above the rating row */
  prominent?: boolean;
  muted?: boolean;
  direction?: "next" | "prev";
  /** Kept enabled for layout; no-op at start of list (e.g. career first film). */
  disabled?: boolean;
}) {
  const isPrev = direction === "prev";
  const sizing = prominent
    ? "gap-2 rounded-xl px-8 py-3.5 text-base font-semibold shadow-lg sm:px-10 sm:py-4 sm:text-lg"
    : compact
      ? "gap-1 rounded-lg px-2.5 py-1.5 text-xs shadow-md"
      : muted
        ? "gap-2 rounded-xl px-5 py-2.5 text-base font-semibold shadow-md sm:px-6 sm:py-3 sm:text-base"
        : "gap-2 rounded-xl px-5 py-3 text-sm font-bold shadow-lg sm:px-6 sm:py-3.5 sm:text-base";
  const iconClass = prominent
    ? "h-5 w-5 sm:h-6 sm:w-6"
    : compact
      ? "h-3.5 w-3.5"
      : muted
        ? "h-5 w-5"
        : "h-5 w-5";
  const surface = compact
    ? "border border-zinc-600 bg-zinc-800 text-white hover:bg-zinc-700 focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900"
    : muted
      ? "border-2 border-emerald-300/50 bg-emerald-600 text-white shadow-lg shadow-emerald-950/30 hover:border-emerald-200/80 hover:bg-emerald-500 active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
      : "border-2 border-indigo-200/90 bg-indigo-600 text-white shadow-lg shadow-indigo-950/40 hover:border-white/90 hover:bg-indigo-500 hover:shadow-xl active:scale-[0.98] active:brightness-95 focus-visible:ring-2 focus-visible:ring-indigo-300 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900";
  const iconColor = muted ? "text-zinc-200" : "text-white";
  const icon = (
    <svg className={`${iconColor} ${iconClass}`} viewBox="0 0 20 20" fill="currentColor" aria-hidden>
      <path fillRule="evenodd" d={isPrev ? chevronPathPrev : chevronPathNext} clipRule="evenodd" />
    </svg>
  );
  const label = isPrev ? "Prev" : "Next";
  const nextTitle = isPrev
    ? (disabled ? "First title in this list" : "Previous title")
    : (disabled ? "No more titles in this list" : "Go to the next title");
  const nextAria = isPrev
    ? (disabled ? "No previous title" : "Previous title")
    : (disabled ? "No next title" : "Next title");
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onPass}
      className={`inline-flex items-center justify-center shrink-0 touch-manipulation transition-all select-none ${surface} focus-visible:outline-none ${sizing} ${
        disabled ? "cursor-not-allowed opacity-40" : ""
      }`}
      title={nextTitle}
      aria-label={nextAria}
    >
      {isPrev ? (
        <>
          {icon}
          {label}
        </>
      ) : (
        <>
          {label}
          {icon}
        </>
      )}
    </button>
  );
});

/**
 * Single control for trailer + fullscreen: Interest (not seen → blue stars) vs Rating (seen → red stars).
 * Same labels as `StarRow` — no duplicate “Seen it / Not yet” copy.
 */
const RatingModeToggle = memo(function RatingModeToggle({
  value,
  onChange,
  density,
  rowClassName,
}: {
  value: "unseen" | null;
  onChange: (v: "unseen" | null) => void;
  /** bar: under the video; overlay: fullscreen top-right chrome */
  density: "bar" | "overlay";
  rowClassName?: string;
}) {
  const wrap =
    density === "overlay"
      ? "flex shrink-0 overflow-hidden rounded-lg border border-zinc-600/85 bg-black/82 p-0.5 shadow-lg backdrop-blur-sm"
      : "inline-flex overflow-hidden rounded-lg border border-zinc-600/80 bg-zinc-900/90 p-0.5 shadow-sm";
  const seg =
    "min-w-[4.5rem] rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors sm:min-w-[5rem] sm:px-3 sm:text-sm";
  const inactive = "text-zinc-400 hover:bg-zinc-800/90 hover:text-zinc-200";
  const inner = (
    <div
      role="group"
      aria-label="Scoring mode — Interest if you have not seen this title, Rating if you have"
      className={wrap}
    >
      <button
        type="button"
        aria-pressed={value === "unseen"}
        onClick={() => onChange("unseen")}
        className={`${seg} ${value === "unseen" ? "bg-blue-600/90 text-white shadow-sm" : inactive}`}
      >
        Interest
      </button>
      <button
        type="button"
        aria-pressed={value === null}
        onClick={() => onChange(null)}
        className={`${seg} ${value === null ? "bg-red-600/90 text-white shadow-sm" : inactive}`}
      >
        Rating
      </button>
    </div>
  );
  if (density === "overlay") return inner;
  return (
    <div className={`flex flex-wrap items-center gap-x-4 gap-y-2 sm:gap-x-5 ${rowClassName ?? "justify-center"}`}>{inner}</div>
  );
});

// Persists volume across trailer cards (module-level, not localStorage — session only)
let _lastVolume: number | null = null;

/** Reserves the same space as the loaded movie card so initial fetch does not reflow the layout. */
function MovieCardSkeleton({ mode }: { mode: "trailers" | "posters" }) {
  const ratingBlock = (
    <div className="rounded-xl border border-zinc-700 bg-zinc-900 px-2 py-2 sm:px-3 sm:py-2.5">
      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
          <div className="h-9 w-[13.5rem] animate-pulse rounded-lg bg-zinc-700 sm:w-[14rem]" />
        </div>
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-3">
          <div className="h-12 w-56 max-w-[min(100%,22rem)] animate-pulse rounded-lg bg-zinc-800 sm:h-14 sm:w-64" />
          <div className="h-10 w-20 animate-pulse rounded-lg bg-zinc-700" />
        </div>
      </div>
    </div>
  );

  if (mode === "trailers") {
    const trailerBarSkeleton = (
      <div className="border-b border-zinc-800/90 bg-zinc-950/60 py-2.5 sm:py-3" aria-hidden>
        <div className="mx-auto flex min-w-0 max-w-3xl flex-col gap-3">
          <div className="flex min-w-0 w-full flex-wrap items-center justify-between gap-x-3 gap-y-2 px-px">
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              <div className="h-9 w-[13.5rem] animate-pulse rounded-lg bg-zinc-800 sm:w-[14rem]" />
            </div>
            <div className="flex shrink-0 gap-2">
              <div className="h-8 w-[4.75rem] animate-pulse rounded-lg bg-zinc-800 sm:w-[5.25rem]" />
              <div className="h-8 w-[3rem] animate-pulse rounded-lg bg-zinc-800" />
            </div>
          </div>
          <div className="flex min-w-0 items-center justify-between gap-3">
            <div className="mx-auto h-10 max-w-md flex-1 animate-pulse rounded-lg bg-zinc-800" />
            <div className="h-11 w-20 shrink-0 animate-pulse rounded-xl bg-zinc-800" />
          </div>
        </div>
      </div>
    );
    return (
      <div className="bg-black" aria-busy="true" aria-label="Loading movie">
        <div className="relative aspect-video w-full shrink-0 overflow-hidden bg-black">
          <div className="absolute inset-0 animate-pulse bg-zinc-800/40" aria-hidden />
        </div>
        {trailerBarSkeleton}
        <div className="flex flex-col gap-4 p-4 sm:pb-6 sm:p-6">
          <div className="flex min-w-0 items-start justify-between gap-3 animate-pulse">
            <div className="min-w-0 flex-1 space-y-3">
              <div className="h-3 w-28 rounded bg-zinc-700" />
              <div className="h-8 max-w-lg rounded bg-zinc-700" />
            </div>
            <div className="flex gap-2 pt-0.5">
              <div className="h-7 w-24 rounded bg-zinc-800" />
              <div className="h-7 w-12 rounded bg-zinc-800" />
            </div>
          </div>
          <div className="space-y-3 animate-pulse">
            <div className="h-4 w-full rounded bg-zinc-800" />
            <div className="h-4 w-full rounded bg-zinc-800" />
            <div className="h-4 w-2/3 rounded bg-zinc-800" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6" aria-busy="true" aria-label="Loading movie">
      <div className="flex gap-4 sm:items-start">
        <div
          className="h-[10.5rem] w-28 shrink-0 animate-pulse rounded-xl bg-zinc-700 sm:h-[18rem] sm:w-48"
          aria-hidden
        />
        <div className="min-w-0 flex-1 space-y-3 animate-pulse">
          <div className="h-3 w-24 rounded bg-zinc-700" />
          <div className="h-8 w-4/5 rounded bg-zinc-700" />
          <div className="h-4 w-full rounded bg-zinc-800" />
          <div className="h-4 w-full rounded bg-zinc-800" />
        </div>
      </div>
      {ratingBlock}
    </div>
  );
}

// ── Home hero (isolated from card state so clicks don’t re-render the banner) ──
const HomeHero = memo(function HomeHero() {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-zinc-200/90 shadow-sm ring-1 ring-black/5" style={{ aspectRatio: "1376 / 614" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/nano-banano-photo.png"
        alt=""
        className="pointer-events-none absolute inset-0 w-full h-full select-none"
        style={{ objectFit: "cover", objectPosition: "center" }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 z-[1]"
        aria-hidden
        style={{
          background:
            "linear-gradient(to right, rgba(0, 0, 0, 0.55) 0%, rgba(0, 0, 0, 0.2) 45%, transparent 68%)",
        }}
      />
      <div className="absolute inset-0 z-10 flex flex-col justify-center items-start px-4 py-6 sm:px-6 sm:py-8">
        <div className="max-w-xl text-left">
          <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl md:text-4xl [text-shadow:1px_0_0_rgba(0,0,0,0.85),-1px_0_0_rgba(0,0,0,0.85),0_1px_0_rgba(0,0,0,0.85),0_-1px_0_rgba(0,0,0,0.85),1px_1px_0_rgba(0,0,0,0.75),-1px_-1px_0_rgba(0,0,0,0.75),1px_-1px_0_rgba(0,0,0,0.75),-1px_1px_0_rgba(0,0,0,0.75),0_2px_12px_rgba(0,0,0,0.45)]">
            Trailer Vision
          </h1>
          <p className="mt-2 text-base font-semibold leading-snug text-white sm:text-lg [text-shadow:1px_0_0_rgba(0,0,0,0.8),-1px_0_0_rgba(0,0,0,0.8),0_1px_0_rgba(0,0,0,0.8),0_-1px_0_rgba(0,0,0,0.8),1px_1px_0_rgba(0,0,0,0.65),-1px_-1px_0_rgba(0,0,0,0.65),0_1px_10px_rgba(0,0,0,0.4)]">
            Discover great films that are new to you
          </p>
        </div>
      </div>
    </div>
  );
});

/** LLM / prefetch status — shown next to the upcoming queue inside the card (not the page header). */
const LlmPrefetchStatusBar = memo(function LlmPrefetchStatusBar({
  careerMode,
  llmActive,
  llmPrefetchInFlight,
  isAdvancingCard,
  queueLength,
}: {
  careerMode: boolean;
  llmActive: boolean;
  llmPrefetchInFlight: number;
  isAdvancingCard: boolean;
  queueLength: number;
}) {
  return (
    <div
      className={`flex w-full items-center gap-2.5 rounded-xl border px-3 py-2 text-xs font-medium shadow-sm backdrop-blur-sm sm:text-sm sm:gap-3 ${
        careerMode
          ? "border-amber-600/35 bg-amber-950/80 text-amber-100"
          : llmActive
            ? "border-indigo-500/55 bg-indigo-950/90 text-indigo-100 shadow-indigo-950/40"
            : "border-zinc-700/90 bg-zinc-900/90 text-zinc-400"
      }`}
      role="status"
      aria-live="polite"
    >
      <span
        className={`h-2.5 w-2.5 shrink-0 rounded-full ${
          careerMode ? "bg-amber-400" : llmActive ? "animate-pulse bg-amber-400 shadow-[0_0_12px_theme(colors.amber.400)]" : "bg-zinc-600"
        }`}
        aria-hidden
      />
      <span className="min-w-0 flex-1 leading-snug">
        {careerMode ? (
          <>Career mode — browsing filmography (LLM suggestions off)</>
        ) : llmActive ? (
          <>
            <span className="font-semibold text-zinc-50">LLM working</span>
            <span className="text-indigo-200/90">
              {" "}
              —{" "}
              {[
                llmPrefetchInFlight > 0 &&
                  `${llmPrefetchInFlight} prefetch request${llmPrefetchInFlight === 1 ? "" : "s"}`,
                isAdvancingCard && "opening next card",
              ]
                .filter(Boolean)
                .join(" · ") || "…"}
              {" · "}queue&nbsp;<span className="tabular-nums">{queueLength}</span>
            </span>
          </>
        ) : (
          <>
            <span className="font-semibold text-zinc-300">LLM idle</span>
            <span className="text-zinc-500">
              {" "}
              — queue&nbsp;<span className="tabular-nums">{queueLength}</span> title
              {queueLength === 1 ? "" : "s"}
              {queueLength < PREFETCH_REFILL_THRESHOLD ? " · refilling in background when needed" : ""}
            </span>
          </>
        )}
      </span>
    </div>
  );
});

const PrefetchQueuePanel = memo(function PrefetchQueuePanel({
  prefetchQueueUi,
  channels,
  activeChannelId,
  onPlayAtIndex,
  onRemoveAtIndex,
}: {
  prefetchQueueUi: CurrentMovie[];
  channels: Channel[];
  activeChannelId: string;
  onPlayAtIndex: (index: number) => void;
  onRemoveAtIndex: (index: number) => void;
}) {
  return (
    <div className="rounded-xl border border-zinc-700 bg-zinc-900 p-3 sm:p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-zinc-100">Upcoming queue</h2>
        <span className="text-xs text-zinc-500 tabular-nums">
          {prefetchQueueUi.length} title{prefetchQueueUi.length === 1 ? "" : "s"}
          {channels.length > 0 && activeChannelId ? (
            <span className="ml-1.5 inline-flex items-center gap-1 rounded-md bg-indigo-950/80 px-2 py-0.5 ring-1 ring-indigo-500/40">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-indigo-300/90">Channel</span>
              <span className="font-semibold text-indigo-100">
                {channels.find((c) => c.id === activeChannelId)?.name ?? "—"}
              </span>
            </span>
          ) : null}
        </span>
      </div>
      <p className="text-xs text-zinc-500 mt-1">
        Click a title to play it now. Remove drops it from the list. Saved per channel when Settings backup includes the prefetch queue.
      </p>
      {prefetchQueueUi.length === 0 ? (
        <p className="text-sm text-zinc-500 mt-3">Nothing queued yet — titles appear here as the model responds.</p>
      ) : (
        <ul className="mt-3 divide-y divide-zinc-700 max-h-56 overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-800">
          {prefetchQueueUi.map((m, index) => (
            <li
              key={`${canonicalTitleKey(m.title)}-${index}`}
              className="flex items-stretch gap-1 py-1 px-1 text-sm"
            >
              <button
                type="button"
                onClick={() => onPlayAtIndex(index)}
                className="min-w-0 flex-1 flex flex-col gap-0.5 rounded-lg px-2 py-1.5 text-left text-zinc-200 hover:bg-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                aria-label={`Play ${m.title} now`}
              >
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate font-medium" title={m.title}>
                    {m.title}
                    {m.year != null && <span className="text-zinc-500 font-normal"> · {m.year}</span>}
                  </span>
                  <span className="shrink-0 text-[10px] uppercase tracking-wide text-zinc-500">
                    {m.type === "tv" ? "TV" : "Film"}
                  </span>
                </div>
                {m.reason && (
                  <LlmBulletedText text={m.reason} lineClamp={2} className="text-xs text-zinc-400" />
                )}
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemoveAtIndex(index);
                }}
                className="shrink-0 self-center rounded-lg px-2 py-1 text-xs font-medium text-zinc-400 hover:bg-red-900/40 hover:text-red-400 transition-colors"
                aria-label={`Remove ${m.title} from queue`}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
});

/** Map 0–1 watch fraction to 0–5 stars in half-star steps; returns 0 until 5% watched. */
function progressToStars(frac: number): number {
  if (frac < 0.05) return 0;
  return Math.round(frac * 5 * 2) / 2;
}

/**
 * When enabled, trailer watch time pre-fills stars and "Next" without a tap can submit that rating.
 * Default off: stars only change when you choose them; "Next" with no pick records pass-without-rating.
 * Enable: set NEXT_PUBLIC_WATCH_PROGRESS_AUTO_RATING=1 (or "true") and rebuild.
 */
const WATCH_PROGRESS_AUTO_RATING =
  process.env.NEXT_PUBLIC_WATCH_PROGRESS_AUTO_RATING === "1" ||
  process.env.NEXT_PUBLIC_WATCH_PROGRESS_AUTO_RATING === "true";

// ── TrailerPlayer ─────────────────────────────────────────────────────────────
/** One YT.Player host per component; swap trailers with loadVideoById (see player lifecycle comment in useEffect). */
const TRAILER_RESUME_MIN = 0.02;

const TrailerPlayer = memo(function TrailerPlayer({
  videoId,
  onProgress,
  onPlaybackError,
  resumeFromFraction,
}: {
  videoId: string;
  onProgress?: (frac: number) => void;
  /** Called when the iframe reports an error (removed video, embed disabled, etc.) — parent should drop trailerKey. */
  onPlaybackError?: () => void;
  /** 0–1. When resuming a channel, seek here once after the video is ready (e.g. last watch point before you switched away). */
  resumeFromFraction?: number;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  /** Host div for YT.Player — reused across React Strict Mode’s mount → fake-unmount → remount. */
  const hostDivRef = useRef<HTMLDivElement | null>(null);
  /** Prevents binding two YT.Player instances to the same host (breaks postMessage / shows black video). */
  const ytHostBoundRef = useRef(false);
  /** False while an effect cleanup runs (Strict Mode); gates state callbacks and deferred `new YT.Player`, not onReady. */
  const effectActiveRef = useRef(true);
  const playerRef = useRef<YTPlayer | null>(null);
  const videoIdRef = useRef(videoId);
  const onProgressRef = useRef(onProgress);
  const onPlaybackErrorRef = useRef(onPlaybackError);
  const resumeFromFractionRef = useRef(resumeFromFraction);
  const resumeDoneKeyRef = useRef<string | null>(null);
  const errorReportedForVideoIdRef = useRef<string | null>(null);
  useEffect(() => { onProgressRef.current = onProgress; }, [onProgress]);
  useEffect(() => { onPlaybackErrorRef.current = onPlaybackError; }, [onPlaybackError]);
  useEffect(() => { resumeFromFractionRef.current = resumeFromFraction; }, [resumeFromFraction]);

  useEffect(() => {
    videoIdRef.current = videoId;
    errorReportedForVideoIdRef.current = null;
    resumeDoneKeyRef.current = null;
  }, [videoId]);

  const tryApplyResume = (target: YTPlayer) => {
    const frac = resumeFromFractionRef.current;
    if (frac === undefined || frac < TRAILER_RESUME_MIN || frac > 0.98) return;
    const id = videoIdRef.current;
    const key = `${id}:${frac.toFixed(3)}`;
    if (resumeDoneKeyRef.current === key) return;
    try {
      const d = target.getDuration();
      if (d > 0 && !Number.isNaN(d)) {
        const sec = Math.min(Math.max(0, frac * d), Math.max(0, d - 0.5));
        target.seekTo?.(sec, true);
        resumeDoneKeyRef.current = key;
        target.playVideo?.();
      }
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    effectActiveRef.current = true;
    const w = wrapperRef.current;
    if (!w) return;

    const attachProgressPoll = () => {
      const wrap = wrapperRef.current as HTMLDivElement & { _poll?: number } | null;
      if (!wrap) return;
      if (typeof wrap._poll === "number") window.clearInterval(wrap._poll);
      wrap._poll = window.setInterval(() => {
        try {
          const p = playerRef.current;
          if (!ytPlayerIframeConnected(p)) return;
          const dur = p.getDuration();
          if (dur > 0) onProgressRef.current?.(Math.min(p.getCurrentTime() / dur, 1));
        } catch {
          /* ignore */
        }
      }, 500);
    };

    let host = hostDivRef.current;
    if (host && !host.isConnected) {
      try {
        playerRef.current?.destroy();
      } catch {
        /* ignore */
      }
      playerRef.current = null;
      ytHostBoundRef.current = false;
      hostDivRef.current = null;
      host = null;
    }
    if (!host) {
      host = document.createElement("div");
      host.style.position = "absolute";
      host.style.inset = "0";
      host.style.backgroundColor = "#000";
      w.appendChild(host);
      hostDivRef.current = host;
    }

    loadYouTubeApi().then(() => {
      if (!effectActiveRef.current || !host!.isConnected) return;
      if (ytHostBoundRef.current) return;
      ytHostBoundRef.current = true;

      // Must match the parent page origin (including http://localhost:PORT) so the JS API
      // postMessage targets line up. Omitting it on localhost often triggers www-widgetapi errors.
      const origin =
        typeof window !== "undefined" ? window.location.origin : undefined;
      new window.YT.Player(host!, {
        videoId: videoIdRef.current,
        width: "100%",
        height: "100%",
        playerVars: {
          autoplay: 1,
          mute: 1,
          controls: 1,
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
          enablejsapi: 1,
          /** Hides YT fullscreen; embed can still FS in some cases — we bounce iframe FS to app chrome (see Home fullscreen listener). */
          fs: 0,
          ...(origin ? { origin } : {}),
        },
        events: {
          onStateChange: (e: { data: number; target: YTPlayer }) => {
            if (!effectActiveRef.current) return;
            const Y = window.YT;
            if (!Y?.PlayerState) return;
            const s = e.data;
            if (s === Y.PlayerState.PLAYING || s === Y.PlayerState.BUFFERING || s === Y.PlayerState.CUED) {
              tryApplyResume(e.target);
            }
          },
          onError: () => {
            if (!effectActiveRef.current) return;
            const id = videoIdRef.current;
            if (errorReportedForVideoIdRef.current === id) return;
            errorReportedForVideoIdRef.current = id;
            onPlaybackErrorRef.current?.();
          },
          onReady: (e: { target: YTPlayer }) => {
            playerRef.current = e.target;
            if (_lastVolume !== null) e.target.setVolume(_lastVolume);
            e.target.unMute();
            try {
              e.target.loadVideoById(videoIdRef.current);
            } catch {
              /* ignore */
            }
            // Resume after a new load: state changes may be flaky on some devices.
            window.setTimeout(() => tryApplyResume(e.target), 500);
            attachProgressPoll();
          },
        },
      });
    });

    if (ytHostBoundRef.current && playerRef.current) attachProgressPoll();

    return () => {
      effectActiveRef.current = false;
      const poll = (wrapperRef.current as HTMLDivElement & { _poll?: number } | null)?._poll;
      if (poll) window.clearInterval(poll);
      try {
        const p = playerRef.current;
        if (p && !p.isMuted()) {
          _lastVolume = p.getVolume();
        }
        pauseYouTubePlayer(p);
      } catch {
        /* ignore */
      }
    };
  }, []);

  useEffect(() => {
    const p = playerRef.current;
    if (!p) return;
    try {
      p.loadVideoById(videoId);
    } catch {
      /* ignore */
    }
  }, [videoId]);

  // Pause while the tab is hidden (avoid stopVideo — it can leave the iframe blank until reload). Stop on unload/unmount.
  useEffect(() => {
    const onVisibility = () => {
      try {
        const p = playerRef.current;
        if (!ytPlayerIframeConnected(p)) return;
        if (document.visibilityState === "hidden") {
          pauseYouTubePlayer(p);
          return;
        }
        const state = p.getPlayerState?.();
        const Y = window.YT;
        const playing = Y?.PlayerState?.PLAYING ?? 1;
        const buffering = Y?.PlayerState?.BUFFERING ?? 3;
        if (state !== playing && state !== buffering) p.playVideo?.();
      } catch {
        /* ignore */
      }
    };
    const onLeave = () => silenceYouTubePlayer(playerRef.current);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onLeave);
    window.addEventListener("beforeunload", onLeave);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onLeave);
      window.removeEventListener("beforeunload", onLeave);
    };
  }, []);

  /** Pause when scrolled mostly off-screen; resume when scrolled back while tab-visible. Skip when inside browser fullscreen (ancestor element). */
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const rootEl = wrapperRef.current;
    if (!rootEl) return;

    const resumeIfStalledWhileVisibleAndInView = () => {
      try {
        if (document.visibilityState !== "visible") return;
        const fs = document.fullscreenElement;
        const re = wrapperRef.current;
        if (fs && re && (fs === re || fs.contains(re))) return;
        const p = playerRef.current;
        if (!ytPlayerIframeConnected(p)) return;
        const state = p.getPlayerState?.();
        const Y = window.YT;
        const playing = Y?.PlayerState?.PLAYING ?? 1;
        const buffering = Y?.PlayerState?.BUFFERING ?? 3;
        if (state !== playing && state !== buffering) p.playVideo?.();
      } catch {
        /* ignore */
      }
    };

    const IN_VIEW_THRESHOLD = 0.12;

    const io = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        try {
          const fs = document.fullscreenElement;
          const re = wrapperRef.current;
          if (fs && re && (fs === re || fs.contains(re))) {
            resumeIfStalledWhileVisibleAndInView();
            return;
          }
        } catch {
          /* ignore */
        }
        if (!entry.isIntersecting || entry.intersectionRatio < IN_VIEW_THRESHOLD) {
          pauseYouTubePlayer(playerRef.current);
        } else if (document.visibilityState === "visible") {
          resumeIfStalledWhileVisibleAndInView();
        }
      },
      { root: null, rootMargin: "0px", threshold: [0, 0.06, IN_VIEW_THRESHOLD, 0.5, 1] },
    );
    io.observe(rootEl);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={wrapperRef}
      className="relative aspect-video w-full shrink-0 overflow-hidden bg-black"
      style={{ backgroundColor: "#000" }}
    />
  );
});

const ShareButton = memo(function ShareButton({
  onClick,
  toast,
  videoChrome,
}: {
  onClick: () => void;
  toast: "copying" | "copied" | null;
  /** Styles for dark overlay on the trailer (vs metadata row below the video). */
  videoChrome?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={toast === "copying"}
      className={`shrink-0 flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] font-medium transition-colors disabled:opacity-50 sm:px-2.5 sm:text-xs ${
        videoChrome
          ? "text-zinc-100 hover:bg-white/15"
          : "text-zinc-400 hover:text-white hover:bg-zinc-800"
      }`}
      title="Share this title"
    >
      {toast === "copied" ? (
        <svg className="h-4 w-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
      ) : (
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>
      )}
      {toast === "copied" ? "Copied!" : "Share"}
    </button>
  );
});

type OnPersonClick = (name: string, role: "actor" | "director") => void;

function PersonLink({
  name,
  role,
  onClick,
  careerHighlight = false,
}: {
  name: string;
  role: "actor" | "director";
  onClick: OnPersonClick;
  /** Career mode: this credit matches the person whose filmography is open. */
  careerHighlight?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => onClick(name, role)}
      className={
        careerHighlight
          ? "text-left font-semibold text-indigo-200 ring-1 ring-indigo-400/50 rounded-sm px-1 -my-0.5 bg-indigo-950/55 hover:bg-indigo-900/60 hover:text-indigo-100 transition-colors"
          : "hover:text-indigo-300 hover:underline underline-offset-2 transition-colors text-left"
      }
    >
      {name}
    </button>
  );
}

function StreamingGuessPills({ services }: { services?: string[] | null }) {
  if (!services?.length) return null;
  return (
    <div className="mt-2 min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">US streaming (model estimate)</p>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {services.map((s) => (
          <span
            key={s}
            className="rounded-full border border-indigo-500/35 bg-indigo-950/50 px-2 py-0.5 text-xs font-medium text-indigo-200"
          >
            {s}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Trailer layout: title block only — isolated from rating state. */
const TrailerMetadata = memo(function TrailerMetadata({
  movie,
  onPersonClick,
  careerPersonName = null,
}: {
  movie: CurrentMovie;
  onPersonClick: OnPersonClick;
  /** When set (career mode), that person’s name is highlighted in the credit lines. */
  careerPersonName?: string | null;
}) {
  return (
    <div className="min-w-0 w-full max-w-full">
      <div className="flex min-w-0 items-center gap-2 flex-wrap">
        <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
          {movie.type === "tv" ? "TV Series" : "Movie"}
          {movie.year && <span className="ml-1 font-normal">· {movie.year}</span>}
        </span>
        {movie.rtScore && <RTBadge score={movie.rtScore} />}
      </div>
      <h2 className="text-2xl font-bold text-white mt-1 leading-tight w-full min-w-0 break-words">
        {!movie.trailerKey ? (
          <a
            href={youtubeSearchUrlForMovie(movie.title, movie.type, movie.year)}
            target="_blank"
            rel="noopener noreferrer"
            className="underline decoration-zinc-600 decoration-2 underline-offset-2 hover:text-indigo-400 hover:decoration-indigo-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 rounded-sm"
            aria-label={`Search YouTube for ${movie.title} trailer`}
          >
            {movie.title}
          </a>
        ) : (
          movie.title
        )}
      </h2>
      {movie.director && (
        <p className="mt-1 text-sm text-zinc-300">
          <span className="text-zinc-400">{movie.type === "tv" ? "Created by" : "Dir."}</span>{" "}
          <PersonLink
            name={movie.director}
            role="director"
            onClick={onPersonClick}
            careerHighlight={!!careerPersonName && careerPersonNameMatch(careerPersonName, movie.director)}
          />
        </p>
      )}
      {movie.actors.length > 0 && (
        <p className="mt-0.5 text-sm text-zinc-300">
          {movie.actors.map((a, i) => (
            <span key={a}>
              {i > 0 && " · "}
              <PersonLink
                name={a}
                role="actor"
                onClick={onPersonClick}
                careerHighlight={!!careerPersonName && careerPersonNameMatch(careerPersonName, a)}
              />
            </span>
          ))}
        </p>
      )}
      {movie.plot && (
        <p className="mt-2 text-sm text-zinc-300 leading-relaxed w-full min-w-0 break-words">{movie.plot}</p>
      )}
      <StreamingGuessPills services={movie.streaming} />
    </div>
  );
});

/** Poster layout: poster + metadata — isolated from rating state. */
const PosterMovieTop = memo(function PosterMovieTop({
  movie,
  onOpenPoster,
  onPersonClick,
  careerPersonName = null,
  detailsLoading = false,
}: {
  movie: CurrentMovie;
  onOpenPoster: (url: string) => void;
  onPersonClick: OnPersonClick;
  careerPersonName?: string | null;
  /** True while a new title’s details are still being fetched (keeps layout stable vs swapping to a short placeholder). */
  detailsLoading?: boolean;
}) {
  return (
    <div className="flex min-w-0 w-full flex-col sm:flex-row gap-4 sm:items-start">
      {movie.posterUrl && !movie.trailerKey && (
        <div className="w-full sm:w-auto shrink-0 self-center sm:self-start flex justify-center sm:justify-start">
          <button
            type="button"
            onClick={() => onOpenPoster(movie.posterUrl!)}
            className={`relative rounded-xl overflow-hidden shadow-sm transition-shadow block ${
              detailsLoading
                ? "cursor-wait"
                : "cursor-zoom-in hover:shadow-md"
            }`}
            disabled={detailsLoading}
            aria-busy={detailsLoading}
          >
            {detailsLoading && (
              <span className="absolute inset-0 z-10 flex items-center justify-center bg-black/50 text-sm font-medium text-zinc-200">
                Loading…
              </span>
            )}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={movie.posterUrl}
              alt={`${movie.title} poster`}
              referrerPolicy="no-referrer"
              className="w-32 sm:w-48 h-[12rem] sm:h-auto object-cover object-center sm:object-top"
            />
          </button>
        </div>
      )}
      {!movie.posterUrl && (
        <div className="w-full sm:w-48 sm:shrink-0 h-[10.5rem] sm:h-[18rem] self-center sm:self-start max-w-xs mx-auto sm:max-w-none sm:mx-0 rounded-xl bg-zinc-100 border border-zinc-200 flex flex-col items-center justify-center gap-1 text-zinc-400 text-xs px-2 text-center">
          <span className="text-2xl" aria-hidden>
            🎬
          </span>
          <span>No poster</span>
        </div>
      )}
      <div className="w-full min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
            {movie.type === "tv" ? "TV Series" : "Movie"}
            {movie.year && <span className="ml-1 font-normal">· {movie.year}</span>}
          </span>
          {movie.rtScore && <RTBadge score={movie.rtScore} />}
        </div>
        <h2 className="text-xl sm:text-2xl font-bold text-white mt-0.5 leading-tight w-full min-w-0 break-words">
          {!movie.trailerKey ? (
            <a
              href={youtubeSearchUrlForMovie(movie.title, movie.type, movie.year)}
              target="_blank"
              rel="noopener noreferrer"
              className="underline decoration-zinc-600 decoration-2 underline-offset-2 hover:text-indigo-400 hover:decoration-indigo-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 rounded-sm"
              aria-label={`Search YouTube for ${movie.title} trailer`}
            >
              {movie.title}
            </a>
          ) : (
            movie.title
          )}
        </h2>
        {movie.director && (
          <p className="mt-1 text-sm text-zinc-300">
            <span className="text-zinc-400">{movie.type === "tv" ? "Created by" : "Dir."}</span>{" "}
            <PersonLink
              name={movie.director}
              role="director"
              onClick={onPersonClick}
              careerHighlight={!!careerPersonName && careerPersonNameMatch(careerPersonName, movie.director)}
            />
          </p>
        )}
        {movie.actors.length > 0 && (
          <p className="mt-0.5 text-sm text-zinc-300">
            {movie.actors.map((a, i) => (
              <span key={a}>
                {i > 0 && " · "}
                <PersonLink
                  name={a}
                  role="actor"
                  onClick={onPersonClick}
                  careerHighlight={!!careerPersonName && careerPersonNameMatch(careerPersonName, a)}
                />
              </span>
            ))}
          </p>
        )}
        {movie.plot && (
          <p className="mt-2 text-sm text-zinc-300 leading-relaxed line-clamp-3 sm:line-clamp-none">{movie.plot}</p>
        )}
        <StreamingGuessPills services={movie.streaming} />
      </div>
    </div>
  );
});

/** Trailer: directly under the video, above title row — border separates from metadata. */
const TRAILER_BAR_OUTER =
  "w-full border-b border-zinc-800/90 bg-zinc-950/60 py-2.5 sm:py-3";

const MovieRatingBlock = memo(function MovieRatingBlock({
  passCurrentCardStable,
  onRate,
  movieTitle,
  starKeyPrefix,
  watchFrac = 0,
  defaultSeen = false,
  previousRating,
  previousMode,
  showNextInRating = true,
  /** Under video vs poster: same inner controls; wrapper only (strip vs rounded card). */
  layout = "card",
  careerPrevNav = null,
  careerNextDisabled = false,
  /** Fullscreen trailer: Interest/Rating toggle, stars, and Next in top overlay (same state as trailer bar). */
  trailerFullscreen = false,
  /** Same row as Interest/Rating mode (e.g. Fullscreen + Share) — trailer bar only. */
  trailerBarTopEnd = null,
  /** When fullscreen: portal stars + Next into this element (top-right over video). */
  fullscreenTopChromeMount = null,
}: {
  passCurrentCardStable: () => void;
  onRate: (stars: number, mode: "seen" | "unseen") => void;
  movieTitle: string;
  starKeyPrefix: "tr" | "po";
  watchFrac?: number;
  /** If true, default to "Seen it"; otherwise default to "Not yet". */
  defaultSeen?: boolean;
  /** Pre-existing rating from history — locks stars immediately, no auto-progress. */
  previousRating?: number;
  previousMode?: "seen" | "unseen";
  showNextInRating?: boolean;
  layout?: "card" | "trailerBar";
  /** Career mode: show Prev; disabled at first film to keep 3-col layout. */
  careerPrevNav?: { onPass: () => void; disabled: boolean } | null;
  /** Career mode: disable Next on last film in filmography (passCurrentCard is a no-op there). */
  careerNextDisabled?: boolean;
  trailerFullscreen?: boolean;
  trailerBarTopEnd?: ReactNode;
  fullscreenTopChromeMount?: HTMLElement | null;
}) {
  const hasPrev = previousRating !== undefined && previousRating > 0;
  const initialSeen = hasPrev ? (previousMode === "unseen" ? "unseen" : null) : (defaultSeen ? null : "unseen");
  const [seenStatus, setSeenStatus] = useState<"unseen" | null>(() => initialSeen);
  const [userLocked, setUserLocked] = useState(() => hasPrev);
  const [lockedValue, setLockedValue] = useState(() => hasPrev ? previousRating! : 0);
  /** Only re-sync "seen" / lock state when the **title** changes — not on unrelated parent re-renders. */
  const lastResetMovieTitleRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (lastResetMovieTitleRef.current === movieTitle) return;
    lastResetMovieTitleRef.current = movieTitle;
    const prev = previousRating !== undefined && previousRating > 0;
    setSeenStatus(prev ? (previousMode === "unseen" ? "unseen" : null) : (defaultSeen ? null : "unseen"));
    setUserLocked(prev);
    setLockedValue(prev ? previousRating! : 0);
  }, [movieTitle, defaultSeen, previousRating, previousMode]);
  const onSeenStatusChange = useCallback((v: "unseen" | null) => {
    setSeenStatus(v);
  }, []);

  const autoFilled = WATCH_PROGRESS_AUTO_RATING ? progressToStars(watchFrac) : 0;
  const displayFilled = userLocked ? lockedValue : autoFilled;

  const navPairTight = Boolean(careerPrevNav && showNextInRating);
  const starBlock = seenStatus === null ? (
    <StarRow
      key={`${starKeyPrefix}-seen-${movieTitle}`}
      compact
      careerNavTight={navPairTight}
      hideLabel
      filled={displayFilled}
      color="red"
      label="Rating"
      onRate={(v) => { setUserLocked(true); setLockedValue(v); onRate(v, "seen"); }}
    />
  ) : (
    <StarRow
      key={`${starKeyPrefix}-unseen-${movieTitle}`}
      compact
      careerNavTight={navPairTight}
      hideLabel
      filled={displayFilled}
      color="blue"
      label="Interest"
      onRate={(v) => { setUserLocked(true); setLockedValue(v); onRate(v, "unseen"); }}
    />
  );

  const navPair = navPairTight;

  const navRow = (
    <div
      className={
        navPair
          ? "grid w-full min-w-0 grid-cols-2 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center gap-x-2 gap-y-2 sm:gap-y-0 sm:gap-x-3"
          : `flex min-w-0 flex-wrap items-center justify-center gap-x-4 gap-y-3 sm:gap-x-5 ${
              showNextInRating ? "" : "justify-center"
            }`
      }
    >
      {careerPrevNav && (
        <div className="shrink-0 max-sm:col-start-1 max-sm:row-start-1 sm:col-start-1 sm:row-start-1 self-center">
          <PassNextButton
            onPass={careerPrevNav.onPass}
            disabled={careerPrevNav.disabled}
            prominent
            direction="prev"
          />
        </div>
      )}
      <div
        className={
          navPair
            ? "min-w-0 w-full max-sm:col-span-2 max-sm:row-start-2 sm:col-start-2 sm:row-start-1 flex justify-center"
            : "min-w-0 flex shrink"
        }
      >
        {starBlock}
      </div>
      {showNextInRating && (
        <div className="shrink-0 max-sm:col-start-2 max-sm:row-start-1 sm:col-start-3 self-center">
          <PassNextButton onPass={passCurrentCardStable} prominent disabled={careerNextDisabled} />
        </div>
      )}
    </div>
  );

  const seenOrNotPair =
    layout === "trailerBar" && trailerBarTopEnd ? (
      <div className="flex min-w-0 w-full flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <RatingModeToggle
          density="bar"
          value={seenStatus}
          onChange={onSeenStatusChange}
          rowClassName="justify-start"
        />
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">{trailerBarTopEnd}</div>
      </div>
    ) : (
      <RatingModeToggle density="bar" value={seenStatus} onChange={onSeenStatusChange} />
    );

  const ratingBody = (
    <div className="flex min-w-0 flex-col gap-3">
      {seenOrNotPair}
      {navRow}
    </div>
  );

  const fullscreenTopChrome =
    trailerFullscreen && fullscreenTopChromeMount && showNextInRating ? (
      <div className="flex max-w-full flex-wrap items-center justify-end gap-2 sm:gap-3">
        <RatingModeToggle density="overlay" value={seenStatus} onChange={onSeenStatusChange} />
        <div className="rounded-xl border border-zinc-600/85 bg-black/82 px-2 py-1 shadow-lg backdrop-blur-sm sm:px-2.5 sm:py-1.5">
          {starBlock}
        </div>
        <PassNextButton onPass={passCurrentCardStable} prominent disabled={careerNextDisabled} />
      </div>
    ) : null;

  if (layout === "trailerBar") {
    if (trailerFullscreen) {
      return (
        <>
          {fullscreenTopChrome && fullscreenTopChromeMount
            ? createPortal(fullscreenTopChrome, fullscreenTopChromeMount)
            : null}
        </>
      );
    }
    return (
      <div className={TRAILER_BAR_OUTER}>
        <div className="mx-auto w-full min-w-0 max-w-3xl px-2 sm:px-3">{ratingBody}</div>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-zinc-900 border border-zinc-700 px-2 py-2 sm:px-3 sm:py-2.5">
      {ratingBody}
    </div>
  );
});

function isSameFilmAsCurrent(prev: CurrentMovie | null, film: TrailerCareerFilm): boolean {
  if (!prev) return false;
  return (
    prev.title.toLowerCase().trim() === film.title.toLowerCase().trim() &&
    prev.type === film.type &&
    (prev.year ?? null) === (film.year ?? null)
  );
}

function currentMovieEquals(a: CurrentMovie, b: CurrentMovie): boolean {
  if (a === b) return true;
  return (
    a.title === b.title &&
    a.type === b.type &&
    a.year === b.year &&
    a.director === b.director &&
    a.predictedRating === b.predictedRating &&
    a.plot === b.plot &&
    a.posterUrl === b.posterUrl &&
    a.trailerKey === b.trailerKey &&
    a.rtScore === b.rtScore &&
    a.reason === b.reason &&
    a.actors.length === b.actors.length &&
    a.actors.every((s, i) => s === b.actors[i])
  );
}

const CareerFilmographyPanel = memo(function CareerFilmographyPanel({
  career,
  onSelect,
  onExit,
  loading,
}: {
  career: TrailerCareerMode;
  onSelect: (index: number) => void;
  onExit: () => void;
  loading: boolean;
}) {
  const listRef = useRef<HTMLUListElement>(null);
  /** Reveal the active row only after metadata loading settles — avoids list scroll + page layout reflow (hero height) compounding. */
  useLayoutEffect(() => {
    if (loading) return;
    const list = listRef.current;
    if (!list) return;
    const li = list.children[career.index] as HTMLElement | undefined;
    if (!li) return;
    const listRect = list.getBoundingClientRect();
    const liRect = li.getBoundingClientRect();
    const liTop = liRect.top - listRect.top;
    const liBottom = liRect.bottom - listRect.top;
    if (liTop < 0) {
      list.scrollTop += liTop;
    } else if (liBottom > list.clientHeight) {
      list.scrollTop += liBottom - list.clientHeight;
    }
  }, [career.index, career.films.length, loading]);

  return (
    <div className="rounded-xl bg-zinc-900 border border-zinc-700 overflow-hidden">
        <div className="px-3 py-2.5 border-b border-zinc-700 bg-zinc-800/60 sm:px-4 sm:py-3">
        <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-lg font-bold leading-snug text-zinc-50 sm:text-xl break-words">
            {career.personName}
          </p>
          <p className="min-h-[1.25rem] mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-zinc-500">
            <span>{career.role === "director" ? "Director" : "Actor"} · {career.index + 1} of {career.films.length}</span>
            {loading && <span className="text-indigo-400 animate-pulse">Loading…</span>}
          </p>
        </div>
        <button
          type="button"
          onClick={onExit}
          className="shrink-0 text-xs text-zinc-500 hover:text-white transition-colors"
        >
          {careerUi.exitTrailer}
        </button>
        </div>
      </div>
      <ul
        ref={listRef}
        className="max-h-52 overflow-y-auto divide-y divide-zinc-800 [overflow-anchor:none]"
      >
        {career.films.map((film, i) => (
          <li key={film.tmdbId}>
            <button
              type="button"
              onClick={() => onSelect(i)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors ${
                i === career.index
                  ? "bg-indigo-900/60 text-white"
                  : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
              }`}
            >
              {film.posterUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={film.posterUrl} alt="" referrerPolicy="no-referrer" className="w-6 h-9 rounded object-cover shrink-0" />
              ) : (
                <div className="w-6 h-9 rounded bg-zinc-700 shrink-0" />
              )}
              <span className="text-xs font-medium truncate flex-1">{film.title}</span>
              <span className="text-xs text-zinc-500 shrink-0">{film.year}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
});

const ChannelsToolbar = memo(function ChannelsToolbar({
  channels,
  activeChannelId,
  onLoadStarter,
  onMergeStarters,
  showMergeStarterPack,
  onSelectChannel,
  onRequestDeleteChannel,
}: {
  channels: Channel[];
  activeChannelId: string;
  onLoadStarter: () => void;
  /** Same as Settings → Merge starter channels: add missing factory channels, keep current active channel. */
  onMergeStarters: () => void;
  showMergeStarterPack: boolean;
  onSelectChannel: (id: string) => void;
  onRequestDeleteChannel: (ch: Channel) => void;
}) {
  return (
    <div
      className="flex flex-nowrap items-center gap-2 overflow-x-auto overscroll-x-contain pb-1 [-webkit-overflow-scrolling:touch] [scrollbar-color:rgba(63,63,70,0.65)_transparent] [scrollbar-width:thin] lg:flex-col lg:items-stretch lg:overflow-y-auto lg:overflow-x-visible lg:pb-0 lg:[scrollbar-width:auto] lg:max-h-[min(72vh,560px)]"
      role="toolbar"
      aria-label="Channels"
    >
      {!channels.some((ch) => ch.id !== "all") ? (
        <>
          <button
            type="button"
            onClick={onLoadStarter}
            className="shrink-0 rounded-full border border-indigo-700 bg-indigo-950 px-4 py-2 text-sm font-semibold text-indigo-200 shadow-sm transition-colors hover:border-indigo-500 hover:bg-indigo-900 lg:w-full lg:rounded-xl lg:py-2.5"
          >
            Load starter channels
          </button>
          <Link
            href="/channels?new=1"
            className="flex size-8 shrink-0 items-center justify-center rounded-full border border-dashed border-zinc-700 bg-zinc-900 text-lg font-light leading-none text-zinc-400 transition-colors hover:border-indigo-500 hover:bg-indigo-950 hover:text-indigo-400 lg:size-9 lg:shrink-0 lg:self-center"
            title="Create a new channel"
            aria-label="Create a new channel"
          >
            +
          </Link>
        </>
      ) : (
        <>
          {showMergeStarterPack && (
            <button
              type="button"
              onClick={onMergeStarters}
              className="shrink-0 rounded-full border border-zinc-600 bg-zinc-900 px-2.5 py-1.5 text-xs font-medium text-zinc-300 transition-colors hover:border-zinc-500 hover:bg-zinc-800 hover:text-zinc-100 lg:w-full lg:shrink-0 lg:rounded-xl lg:py-2 lg:text-left"
              title="Add bundled example channels you don’t already have (same as Settings → Starter channel pack)"
            >
              Merge starter pack
            </button>
          )}
          {channels.map((ch) => {
            const deletable = ch.id !== "all";
            return (
              <div key={ch.id} className="group relative shrink-0 lg:w-full lg:min-w-0">
                <button
                  type="button"
                  onClick={() => onSelectChannel(ch.id)}
                  aria-pressed={activeChannelId === ch.id}
                  aria-current={activeChannelId === ch.id ? "true" : undefined}
                  className={`max-w-[240px] rounded-full py-1.5 pl-3.5 text-left text-sm font-semibold transition-colors lg:flex lg:max-w-none lg:w-full lg:items-center lg:rounded-xl lg:py-2 lg:pl-3 ${
                    deletable ? "pr-9" : "pr-3.5"
                  } ${
                    activeChannelId === ch.id
                      ? "bg-indigo-600 text-white shadow-md ring-2 ring-indigo-400/90 ring-offset-2 ring-offset-black lg:ring-offset-zinc-950"
                      : "border border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-zinc-500 hover:bg-zinc-800"
                  }`}
                >
                  <span className="block truncate">{ch.name}</span>
                </button>
                {deletable && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onRequestDeleteChannel(ch);
                    }}
                    className={`absolute right-1 top-1/2 z-10 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-sm leading-none opacity-100 transition-opacity sm:pointer-events-none sm:opacity-0 sm:group-hover:pointer-events-auto sm:group-hover:opacity-100 lg:pointer-events-auto lg:opacity-100 ${
                      activeChannelId === ch.id
                        ? "text-zinc-300 hover:bg-white/10 hover:text-red-300"
                        : "text-zinc-500 hover:bg-red-900/30 hover:text-red-400"
                    }`}
                    aria-label={`Delete channel ${ch.name}`}
                  >
                    ×
                  </button>
                )}
              </div>
            );
          })}
          <Link
            href="/channels?new=1"
            className="flex size-8 shrink-0 items-center justify-center rounded-full border border-dashed border-zinc-700 bg-zinc-900 text-lg font-light leading-none text-zinc-400 transition-colors hover:border-indigo-500 hover:bg-indigo-950 hover:text-indigo-400 lg:size-9 lg:shrink-0 lg:self-center"
            title="Create a new channel"
            aria-label="Create a new channel"
          >
            +
          </Link>
        </>
      )}
    </div>
  );
});

/** Cross-vendor fullscreen leaf (often the YouTube iframe, not our wrapper). */
function getDocumentFullscreenElement(): Element | null {
  const d = document as Document & {
    webkitFullscreenElement?: Element | null;
    mozFullScreenElement?: Element | null;
    msFullscreenElement?: Element | null;
  };
  return (
    document.fullscreenElement ??
    d.webkitFullscreenElement ??
    d.mozFullScreenElement ??
    d.msFullscreenElement ??
    null
  );
}

export default function Home() {
  /** Persisted lists — refs only on this page (nothing in the tree reads them for render). Updates skip full-tree re-renders. */
  const historyRef = useRef<RatingEntry[]>([]);
  /** Bumped when saveHistory runs so lookups re-run (refs alone do not re-render). */
  const [historyVersion, setHistoryVersion] = useState(0);
  const skippedRef = useRef<string[]>([]);
  const passedRef = useRef<PassedRow[]>([]);
  const watchlistRef = useRef<WatchlistEntry[]>([]);
  const notSeenRef = useRef<NotSeenEvent[]>([]);
  const notInterestedRef = useRef<{ title: string; rtScore?: string | null }[]>([]);
  const [tasteSummary, setTasteSummary] = useState<string | null>(null);
  const [current, setCurrent] = useState<CurrentMovie | null>(null);
  const currentRef = useRef<CurrentMovie | null>(null);
  currentRef.current = current;
  const [trailerResumeByChannel, setTrailerResumeByChannel] = useState<Record<string, Record<string, number>>>({});
  const [initialLoading, setInitialLoading] = useState(true);
  /** True while fetchNext is loading the next title (after first card). Not tied to card opacity — avoids collapsing the layout. */
  const [isAdvancingCard, setIsAdvancingCard] = useState(false);
  /** Active POST /api/next-movie replenish calls (background prefetch). Mirrors replenish start/finally — not refs so the UI updates. */
  const [llmPrefetchInFlight, setLlmPrefetchInFlight] = useState(0);
  const advanceFetchDepthRef = useRef(0);
  const [pendingRating, setPendingRating] = useState<{ stars: number; mode: "seen" | "unseen" } | null>(null);
  const pendingRatingRef = useRef(pendingRating);
  pendingRatingRef.current = pendingRating;
  /** Delayed advance after star rating — cleared if user uses Next or queue before it fires. */
  const advanceAfterRatingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Home hydration (localStorage + first fetchNext) must run once; `fetchNext` in deps was re-firing the effect and popping an extra title each time its identity changed. */
  const homeHydrationEffectRanRef = useRef(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<"both" | "movie" | "tv">(() => loadSetting("mediaType", "both" as const));
  const [displayMode, setDisplayMode] = useState<"trailers" | "posters">(() => loadSetting("displayMode", "trailers" as const));
  const [llm, setLlm] = useState<string>(() => loadSetting("llm", "deepseek"));
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [isTrailerFullscreen, setIsTrailerFullscreen] = useState(false);
  const [fullscreenTopChromeMount, setFullscreenTopChromeMount] = useState<HTMLDivElement | null>(null);
  const [shareToast, setShareToast] = useState<"copying" | "copied" | null>(null);
  const [careerMode, setCareerMode] = useState<TrailerCareerMode | null>(null);
  const [careerLoading, setCareerLoading] = useState(false);
  const careerModeRef = useRef<TrailerCareerMode | null>(null);
  careerModeRef.current = careerMode;
  const [watchFrac, setWatchFrac] = useState(0);
  const watchFracRef = useRef(0);
  watchFracRef.current = watchFrac;
  const cardRef = useRef<HTMLDivElement>(null);
  const videoContainerRef = useRef<HTMLDivElement>(null);
  /** Prevents re-entrant bounce when YouTube iframe fullscreen is being replaced with app fullscreen. */
  const youtubeIframeFsBounceRef = useRef(false);
  /** In career+trailers, min height of the top media block while the next title loads (avoids 16:9 video → short placeholder jump). */
  const careerTrailerBlockRef = useRef<HTMLDivElement>(null);
  const [careerTrailerBlockStableH, setCareerTrailerBlockStableH] = useState(0);
  const prefetchRef = useRef<CurrentMovie[]>([]);
  const [prefetchQueueUi, setPrefetchQueueUi] = useState<CurrentMovie[]>([]);
  const replenishGenRef = useRef(0);
  const savedPrefetchChannelRef = useRef<string | null>(null);
  const replenishInFlight = useRef(0);
  /** In-flight replenish count for the current gen — reset to 0 on every gen bump so fetchNext knows when to kick off a fresh batch. */
  const replenishGenInFlight = useRef(0);
  const batchYieldRef = useRef<number[]>([]); // rolling yield fractions (fresh / requested)

  const tasteSummaryRef = useRef(tasteSummary);

  const [userRequest, setUserRequest] = useState<string>(() => loadSetting("userRequest", ""));
  const userRequestRef = useRef("");
  userRequestRef.current = userRequest;
  /** Same-channel prompt edits flush prefetch after debounce; channel switches reset baseline here (reload handled elsewhere). */
  const prevPromptFlushBaselineRef = useRef<{ channelId: string; prompt: string } | undefined>(undefined);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [factoryPackFullyMerged, setFactoryPackFullyMerged] = useState<boolean | null>(null);
  const [channelPendingDelete, setChannelPendingDelete] = useState<Channel | null>(null);
  /** Top bar text is only for creating a new channel; it does not reflect the active channel. */
  const [newChannelDraft, setNewChannelDraft] = useState("");

  useEffect(() => {
    setFactoryPackFullyMerged(isFactoryStarterPackFullyMerged());
  }, [channels]);
  const channelsRef = useRef<Channel[]>([]);
  const [activeChannelId, setActiveChannelId] = useState<string>("");
  const activeChannelIdRef = useRef<string>("");
  activeChannelIdRef.current = activeChannelId;
  channelsRef.current = channels;

  /** Stored “What you want” (All → settings userRequest; else channel freeText) — used to flush prefetch when it changes elsewhere; not tied to the home new-channel field. */
  const channelPromptValue = useMemo(() => {
    if (activeChannelId === "all") return userRequest;
    const ch = channels.find((c) => c.id === activeChannelId);
    return ch?.freeText ?? "";
  }, [activeChannelId, userRequest, channels]);

  const replenishOptsRef = useRef<{ mediaType: string; llm: string }>({ mediaType: "both", llm: "deepseek" });
  const zeroYieldStreakRef = useRef(0); // consecutive batches with 0 fresh items — stop daisy-chaining when high
  const lensIndexRef = useRef(0);       // rotates through DIVERSITY_LENSES so each batch explores a different area
  tasteSummaryRef.current = tasteSummary;

  const loadPrefetchIntoRefForChannel = useCallback((channelId: string) => {
    const k = prefetchQueueStorageKey(channelId);
    let raw = localStorage.getItem(k);
    if (!raw) {
      raw = localStorage.getItem(LEGACY_PREFETCH_QUEUE_KEY);
      if (raw) {
        try {
          localStorage.setItem(k, raw);
          localStorage.removeItem(LEGACY_PREFETCH_QUEUE_KEY);
        } catch {
          /* ignore */
        }
      }
    }
    if (!raw) {
      prefetchRef.current = [];
      return;
    }
    try {
      const q = JSON.parse(raw) as CurrentMovie[];
      if (Array.isArray(q) && q.every((m) => m && typeof m.title === "string")) {
        prefetchRef.current = q;
      } else {
        prefetchRef.current = [];
      }
    } catch {
      prefetchRef.current = [];
    }
  }, []);

  const persistPrefetchQueue = useCallback(() => {
    const ch = activeChannelIdRef.current?.trim() || "all";
    try {
      localStorage.setItem(prefetchQueueStorageKey(ch), JSON.stringify(prefetchRef.current));
    } catch {
      /* ignore quota */
    }
    setPrefetchQueueUi([...prefetchRef.current]);
  }, []);

  const handleTrailerPlaybackError = useCallback(() => {
    const c = currentRef.current;
    if (!c?.trailerKey) return;
    const k = canonicalTitleKey(c.title);
    prefetchRef.current = prefetchRef.current.map((m) =>
      canonicalTitleKey(m.title) === k ? { ...m, trailerKey: null } : m
    );
    persistPrefetchQueue();
    setCurrent({ ...c, trailerKey: null });
  }, [persistPrefetchQueue]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setLightboxUrl(null); }
      if (e.key === "ArrowRight") {
        const active = document.activeElement;
        if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA")) return;
        passCurrentCardRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const syncTrailerFullscreenFromDom = useCallback(() => {
    const el = getDocumentFullscreenElement();
    const root = videoContainerRef.current;
    setIsTrailerFullscreen(!!(root && el && (root === el || root.contains(el))));
  }, []);

  useEffect(() => {
    const onFullscreenEvent = () => {
      const root = videoContainerRef.current;
      const el = getDocumentFullscreenElement();

      // YouTube's chrome fullscreen targets the iframe; our Next/Exit sit on the outer wrapper. Bounce to app fullscreen.
      if (
        root &&
        el &&
        el !== root &&
        root.contains(el) &&
        el instanceof HTMLIFrameElement &&
        currentRef.current?.trailerKey &&
        !youtubeIframeFsBounceRef.current
      ) {
        youtubeIframeFsBounceRef.current = true;
        void (async () => {
          try {
            await document.exitFullscreen?.();
          } catch {
            /* ignore */
          }
          await new Promise<void>((r) => {
            requestAnimationFrame(() => r());
          });
          try {
            await root.requestFullscreen?.();
          } catch {
            /* ignore */
          } finally {
            youtubeIframeFsBounceRef.current = false;
            syncTrailerFullscreenFromDom();
          }
        })();
        return;
      }

      syncTrailerFullscreenFromDom();
      requestAnimationFrame(() => {
        syncTrailerFullscreenFromDom();
      });
    };

    document.addEventListener("fullscreenchange", onFullscreenEvent);
    document.addEventListener("webkitfullscreenchange", onFullscreenEvent as EventListener);
    onFullscreenEvent();
    return () => {
      document.removeEventListener("fullscreenchange", onFullscreenEvent);
      document.removeEventListener("webkitfullscreenchange", onFullscreenEvent as EventListener);
    };
  }, [syncTrailerFullscreenFromDom]);

  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = sessionStorage.getItem(TRAILER_RESUME_KEY);
      if (raw) {
        setTrailerResumeByChannel(JSON.parse(raw) as Record<string, Record<string, number>>);
      }
    } catch {
      /* ignore */
    }
  }, []);

  // Reset watch progress when the title or video changes (including when switching back to a channel with the same video id)
  const currentTrailerKey = current?.trailerKey;
  useEffect(() => {
    setWatchFrac((w) => (w === 0 ? w : 0));
  }, [currentTrailerKey, current?.title]);

  useLayoutEffect(() => {
    if (!careerMode || displayMode !== "trailers" || careerLoading || isTrailerFullscreen) return;
    const el = careerTrailerBlockRef.current;
    if (!el) return;
    const h = Math.round(el.getBoundingClientRect().height);
    if (h > 0) setCareerTrailerBlockStableH(h);
  }, [
    careerMode,
    displayMode,
    careerLoading,
    isTrailerFullscreen,
    current?.title,
    current?.trailerKey,
    current?.posterUrl,
  ]);

  useEffect(() => {
    if (!careerMode) setCareerTrailerBlockStableH(0);
  }, [careerMode]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        historyRef.current = (JSON.parse(stored) as RatingEntry[]).map(migrateRatingEntry);
      }
      const storedSkipped = localStorage.getItem(SKIPPED_KEY);
      if (storedSkipped) skippedRef.current = JSON.parse(storedSkipped);
      const storedPassed = localStorage.getItem(PASSED_KEY);
      if (storedPassed) {
        try {
          passedRef.current = normalizePassedStorage(JSON.parse(storedPassed));
        } catch {
          passedRef.current = [];
        }
      }
      const storedWatchlist = localStorage.getItem(WATCHLIST_KEY);
      if (storedWatchlist) watchlistRef.current = JSON.parse(storedWatchlist);
      const storedNotSeen = localStorage.getItem(NOTSEEN_KEY);
      if (storedNotSeen) notSeenRef.current = JSON.parse(storedNotSeen);
      const storedNotInterested = localStorage.getItem(NOT_INTERESTED_KEY);
      if (storedNotInterested) notInterestedRef.current = JSON.parse(storedNotInterested);
      const storedTasteSummary = localStorage.getItem(TASTE_SUMMARY_KEY);
      if (storedTasteSummary) { setTasteSummary(storedTasteSummary); tasteSummaryRef.current = storedTasteSummary; }
      if (hasNoChannelsPersisted()) {
        applyFactoryBootstrap();
      }
      let loadedChannels: Channel[] = [];
      const readChannelsFromStorage = (): Channel[] => {
        const raw = localStorage.getItem(CHANNELS_KEY);
        if (!raw) return [];
        const rows = (JSON.parse(raw) as Channel[]).map(normalizeChannel);
        if (!rows.find((c) => c.id === "all")) {
          const withAll = [ALL_CHANNEL, ...rows];
          localStorage.setItem(CHANNELS_KEY, JSON.stringify(withAll));
          return withAll;
        }
        return rows;
      };

      const storedChannels = localStorage.getItem(CHANNELS_KEY);
      if (storedChannels) {
        try {
          loadedChannels = readChannelsFromStorage();
        } catch {
          applyFactoryBootstrap();
          try {
            loadedChannels = readChannelsFromStorage();
          } catch {
            loadedChannels = [];
          }
        }
        if (loadedChannels.length > 0) {
          setChannels(loadedChannels);
          channelsRef.current = loadedChannels;
        }
      }
      // Only the "All" row (no example channels): merge factory pack so the first session isn't empty.
      if (loadedChannels.length > 0 && !loadedChannels.some((c) => c.id !== "all")) {
        mergeFactoryChannelsAndQueues();
        try {
          loadedChannels = readChannelsFromStorage();
        } catch {
          /* keep previous */
        }
        if (loadedChannels.length > 0) {
          setChannels(loadedChannels);
          channelsRef.current = loadedChannels;
          const firstNonAll = loadedChannels.find((c) => c.id !== "all");
          const nActive = firstNonAll?.id ?? loadedChannels[0]?.id ?? "all";
          try {
            localStorage.setItem(ACTIVE_CHANNEL_KEY, nActive);
          } catch {
            /* ignore */
          }
          setActiveChannelId(nActive);
          activeChannelIdRef.current = nActive;
        }
      } else {
        const storedActiveChannel = localStorage.getItem(ACTIVE_CHANNEL_KEY);
        const firstNonAll = loadedChannels.find((c) => c.id !== "all");
        const defaultChannelId = firstNonAll?.id ?? (loadedChannels.length > 0 ? loadedChannels[0].id : "all");
        const activeId =
          storedActiveChannel && loadedChannels.find((c) => c.id === storedActiveChannel)
            ? storedActiveChannel
            : defaultChannelId;
        setActiveChannelId(activeId);
        activeChannelIdRef.current = activeId;
      }
      // applyFactoryBootstrap can fail silently if bundle data is missing; merge still seeds from factory JSON.
      if (loadedChannels.length === 0) {
        mergeFactoryChannelsAndQueues();
        try {
          loadedChannels = readChannelsFromStorage();
          if (loadedChannels.length > 0) {
            setChannels(loadedChannels);
            channelsRef.current = loadedChannels;
            const firstNonAll = loadedChannels.find((c) => c.id !== "all");
            const nActive = firstNonAll?.id ?? loadedChannels[0]?.id ?? "all";
            try {
              localStorage.setItem(ACTIVE_CHANNEL_KEY, nActive);
            } catch {
              /* ignore */
            }
            setActiveChannelId(nActive);
            activeChannelIdRef.current = nActive;
          }
        } catch {
          /* ignore */
        }
      }
    } catch {}
  }, []);

  const saveHistory = (h: RatingEntry[]) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(h));
    historyRef.current = h;
    setHistoryVersion((v) => v + 1);
  };

  /** Fire-and-forget: ask the LLM to summarize taste. Called after ratings hit 1, 5, 10, 15 ... */
  const updateTasteSummary = useCallback((hist: RatingEntry[], currentLlm: string) => {
    const wl = watchlistRef.current;
    const ni = notInterestedRef.current;
    fetch("/api/taste-summary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        history: hist,
        watchlistSignals: wl.map((w) => ({ title: w.title, rtScore: w.rtScore })),
        notInterestedSignals: ni,
        existingSummary: tasteSummaryRef.current ?? undefined,
        llm: currentLlm,
      }),
    })
      .then((r) => r.ok ? r.json() : null)
      .then((d: { tasteSummary?: string | null } | null) => {
        if (d?.tasteSummary) {
          localStorage.setItem(TASTE_SUMMARY_KEY, d.tasteSummary);
          tasteSummaryRef.current = d.tasteSummary;
          setTasteSummary(d.tasteSummary);
        }
      })
      .catch(() => {});
  }, []);

  // Single POST: LLM returns many titles; duplicate filtering happens here.
  // Reads history/watchlist from refs at request time so in-flight calls stay aligned with the latest ratings.
  const fetchMovieBatch = useCallback(async (opts: {
    mediaType: string;
    llm: string;
    /** Merged skip list (base skipped + prefetch queue titles + retry dupes). */
    skipped: string[];
  }): Promise<CurrentMovie[] | null> => {
    const timeoutMs = 180_000;
    for (let attempt = 0; attempt < 2; attempt++) {
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), timeoutMs);
      try {
        const hist = historyRef.current;
        const wl = watchlistRef.current;
        const ni = notInterestedRef.current;
        const trailersSurfaced =
          hist.length + passedRef.current.length + notSeenRef.current.length;
        const res = await fetch("/api/next-movie", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            ...buildHistorySyncPayload(hist),
            skipped: opts.skipped,
            watchlistTitles: wl.map((w) => ({ title: w.title, rtScore: w.rtScore })),
            notInterestedItems: ni,
            trailersSurfaced,
            tasteSummary: tasteSummaryRef.current ?? undefined,
            diversityLens: DIVERSITY_LENSES[lensIndexRef.current % DIVERSITY_LENSES.length],
            userRequest: userRequestRef.current.trim() || undefined,
            activeChannel: (() => {
              const id = activeChannelIdRef.current?.trim();
              if (!id) return undefined;
              let ch = channelsRef.current.find((c) => c.id === id);
              if (!ch) {
                try {
                  const raw = localStorage.getItem(CHANNELS_KEY);
                  if (raw) {
                    ch = (JSON.parse(raw) as Channel[])
                      .map(normalizeChannel)
                      .find((c) => c.id === id);
                  }
                } catch {
                  /* ignore */
                }
              }
              return ch;
            })(),
            mediaType: opts.mediaType,
            llm: opts.llm,
            count: LLM_BATCH_SIZE,
          }),
        });
        if (res.status === 409) {
          setSyncedRatingCount(0);
          continue;
        }
        if (!res.ok) continue;
        setSyncedRatingCount(historyRef.current.length);
        const data = (await res.json()) as { movies?: CurrentMovie[] };
        const movies = data.movies?.filter((m) => m?.title) ?? [];
        if (movies.length > 0) return movies;
      } catch (e) {
        if (e instanceof Error && e.name === "AbortError") {
          console.warn("next-movie request timed out after", timeoutMs, "ms");
        }
      } finally {
        window.clearTimeout(timer);
      }
    }
    return null;
  }, []);

  // LLM round-trip. Daisy-chains another batch while under PREFETCH_REFILL_THRESHOLD unless stuck on dupes.
  const replenish = useCallback(async (
    opts: { mediaType: string; llm: string },
    extraRetrySkips: string[] = []
  ): Promise<Set<string>> => {
    /** Career mode walks a fixed TMDB filmography; do not mix in channel LLM picks. */
    if (careerModeRef.current) return new Set();
    if (prefetchRef.current.length >= PREFETCH_REFILL_THRESHOLD) return new Set();
    if (replenishGenInFlight.current >= MAX_REPLENISH_IN_FLIGHT) return new Set();
    replenishOptsRef.current = opts;

    const genAtStart = replenishGenRef.current;
    replenishInFlight.current++;
    replenishGenInFlight.current++;
    setLlmPrefetchInFlight((n) => n + 1);
    lensIndexRef.current++; // advance lens so concurrent batches each explore a different area
    const seenThisBatch = new Set<string>();

    try {
      const skippedForApi = [
        ...skippedRef.current,
        ...passedRowsToTitles(passedRef.current),
        ...extraRetrySkips,
        ...prefetchRef.current.map((m) => m.title),
      ];

      const movies = await fetchMovieBatch({
        mediaType: opts.mediaType,
        llm: opts.llm,
        skipped: skippedForApi,
      });

      if (genAtStart !== replenishGenRef.current) return seenThisBatch;

      let freshCount = 0;

      if (movies) {
        // After await, re-check against latest refs — avoids a slower in-flight request
        // re-adding a title the user just rated while another replenish was in flight.
        const excluded = new Set<string>();
        for (const h of historyRef.current) excluded.add(canonicalTitleKey(h.title));
        for (const s of skippedRef.current) excluded.add(canonicalTitleKey(s));
        for (const p of passedRef.current) excluded.add(canonicalTitleKey(p.title));
        for (const w of watchlistRef.current) excluded.add(canonicalTitleKey(w.title));
        for (const m of prefetchRef.current) excluded.add(canonicalTitleKey(m.title));
        mergeLlmDiscardFatigueIntoExcluded(excluded);

        for (const movie of movies) {
          const key = canonicalTitleKey(movie.title);
          seenThisBatch.add(key);
          if (prefetchRef.current.some((m) => canonicalTitleKey(m.title) === key)) {
            recordDuplicateLlmSuggestionDiscard(movie.title);
            continue;
          }
          if (excluded.has(key)) {
            recordDuplicateLlmSuggestionDiscard(movie.title);
            continue;
          }
          excluded.add(key);
          prefetchRef.current = [...prefetchRef.current, movie];
          freshCount++;
        }
      }

      batchYieldRef.current = [...batchYieldRef.current.slice(-4), freshCount / LLM_BATCH_SIZE];
      zeroYieldStreakRef.current = freshCount > 0 ? 0 : zeroYieldStreakRef.current + 1;
      persistPrefetchQueue();
    } finally {
      replenishInFlight.current--;
      if (genAtStart === replenishGenRef.current) replenishGenInFlight.current = Math.max(0, replenishGenInFlight.current - 1);
      setLlmPrefetchInFlight((n) => Math.max(0, n - 1));
      // Daisy-chain — replenish() no-ops if queue is already at/above refill threshold or at concurrency cap.
      // zeroYieldStreak >= 3 means the LLM is stuck — no point hammering it further.
      if (genAtStart === replenishGenRef.current && zeroYieldStreakRef.current < 3) {
        replenish(replenishOptsRef.current);
      }
    }

    return seenThisBatch;
  }, [fetchMovieBatch, persistPrefetchQueue]);

  // Pop instantly from prefetch queue; if empty, wait for replenish first
  const fetchNext = useCallback(async (
    opts: { mediaType: string; llm: string },
    isFirst = false
  ) => {
    setFetchError(null);
    if (!isFirst) {
      advanceFetchDepthRef.current += 1;
      setIsAdvancingCard(true);
    }
    try {
      // Drain the queue, skipping any title the user already decided on (guards against stale prefetch entries).
      while (prefetchRef.current.length > 0) {
        const [next, ...rest] = prefetchRef.current;
        prefetchRef.current = rest;
        const excluded = new Set<string>();
        for (const h of historyRef.current) excluded.add(canonicalTitleKey(h.title));
        for (const s of skippedRef.current) excluded.add(canonicalTitleKey(s));
        for (const p of passedRef.current) excluded.add(canonicalTitleKey(p.title));
        for (const w of watchlistRef.current) excluded.add(canonicalTitleKey(w.title));
        mergeLlmDiscardFatigueIntoExcluded(excluded);
        if (excluded.has(canonicalTitleKey(next.title))) continue; // already seen — discard silently
        if (opts.mediaType !== "both" && next.type !== opts.mediaType) continue; // Movies vs TV filter
        persistPrefetchQueue();
        setCurrent(next);
        setInitialLoading(false);
        replenish(opts);
        return;
      }
      persistPrefetchQueue();

      // Queue empty — refill until something lands or we're truly stuck / timed out.
      // (Old bug: waited only while replenishGenInFlight > 0, so when a batch finished empty the counter hit 0
      // and we bailed immediately — requiring a second click to kick replenish again.)
      try {
        zeroYieldStreakRef.current = 0; // reset so the daisy-chain can run on this gesture
        const deadline = Date.now() + 90_000;
        while (prefetchRef.current.length === 0 && Date.now() < deadline) {
          if (
            replenishGenInFlight.current === 0 &&
            zeroYieldStreakRef.current < 3 &&
            !careerModeRef.current
          ) {
            void replenish(opts);
          }
          if (replenishGenInFlight.current === 0 && zeroYieldStreakRef.current >= 3) break;
          await new Promise((r) => setTimeout(r, 200));
        }

        while (prefetchRef.current.length > 0) {
          const [candidate, ...rest] = prefetchRef.current;
          prefetchRef.current = rest;
          const excluded = new Set<string>();
          for (const h of historyRef.current) excluded.add(canonicalTitleKey(h.title));
          for (const s of skippedRef.current) excluded.add(canonicalTitleKey(s));
          for (const p of passedRef.current) excluded.add(canonicalTitleKey(p.title));
          for (const w of watchlistRef.current) excluded.add(canonicalTitleKey(w.title));
          mergeLlmDiscardFatigueIntoExcluded(excluded);
          if (excluded.has(canonicalTitleKey(candidate.title))) continue;
          if (opts.mediaType !== "both" && candidate.type !== opts.mediaType) continue;
          persistPrefetchQueue();
          setCurrent(candidate);
          setInitialLoading(false);
          setFetchError(null);
          void replenish(opts);
          return;
        }
        persistPrefetchQueue();
        setInitialLoading(false);
        setFetchError("Couldn't find a new title. Try again.");
      } catch (e) {
        console.error("fetchNext failed:", e);
        setInitialLoading(false);
        setFetchError("Something went wrong. Try again.");
      }
    } finally {
      if (!isFirst) {
        advanceFetchDepthRef.current -= 1;
        if (advanceFetchDepthRef.current === 0) setIsAdvancingCard(false);
      }
    }
  }, [replenish, persistPrefetchQueue]);

  const fetchNextRef = useRef(fetchNext);
  fetchNextRef.current = fetchNext;

  const clearAdvanceAfterRating = useCallback(() => {
    const t = advanceAfterRatingTimeoutRef.current;
    if (t != null) {
      clearTimeout(t);
      advanceAfterRatingTimeoutRef.current = null;
    }
  }, []);

  const scheduleAdvanceAfterRating = useCallback(() => {
    clearAdvanceAfterRating();
    advanceAfterRatingTimeoutRef.current = setTimeout(() => {
      advanceAfterRatingTimeoutRef.current = null;
      void fetchNext({ mediaType, llm });
    }, 500);
  }, [clearAdvanceAfterRating, fetchNext, mediaType, llm]);

  useEffect(() => () => clearAdvanceAfterRating(), [clearAdvanceAfterRating]);

  const removeFromPrefetchQueue = useCallback(
    (index: number) => {
      const q = prefetchRef.current;
      if (index < 0 || index >= q.length) return;
      prefetchRef.current = q.filter((_, i) => i !== index);
      persistPrefetchQueue();
      if (zeroYieldStreakRef.current < 3) replenish({ mediaType, llm });
    },
    [mediaType, llm, replenish, persistPrefetchQueue]
  );

  const playPrefetchAtIndex = useCallback(
    (index: number) => {
      const q = prefetchRef.current;
      if (index < 0 || index >= q.length) return;
      const movie = q[index];
      if (current && canonicalTitleKey(movie.title) === canonicalTitleKey(current.title)) return;
      clearAdvanceAfterRating();
      replenishGenRef.current += 1;
      replenishGenInFlight.current = 0;
      prefetchRef.current = q.filter((_, i) => i !== index);
      persistPrefetchQueue();
      setCurrent(movie);
      setInitialLoading(false);
      setFetchError(null);
      zeroYieldStreakRef.current = 0;
      replenish({ mediaType, llm });
    },
    [mediaType, llm, replenish, persistPrefetchQueue, current]
  );

  useEffect(() => {
    if (homeHydrationEffectRanRef.current) return;
    homeHydrationEffectRanRef.current = true;

    const stored = localStorage.getItem(STORAGE_KEY);
    const hist: RatingEntry[] = stored ? (JSON.parse(stored) as RatingEntry[]).map(migrateRatingEntry) : [];
    const storedSkipped = localStorage.getItem(SKIPPED_KEY);
    const skip: string[] = storedSkipped ? JSON.parse(storedSkipped) : [];
    const storedWl = localStorage.getItem(WATCHLIST_KEY);
    const wl: WatchlistEntry[] = storedWl ? JSON.parse(storedWl) : [];
    const storedNi = localStorage.getItem(NOT_INTERESTED_KEY);
    const ni: { title: string; rtScore?: string | null }[] = storedNi ? JSON.parse(storedNi) : [];
    const storedNotSeen = localStorage.getItem(NOTSEEN_KEY);
    notSeenRef.current = storedNotSeen ? (JSON.parse(storedNotSeen) as NotSeenEvent[]) : [];
    historyRef.current = hist;
    setHistoryVersion((v) => v + 1);
    skippedRef.current = skip;
    const storedPassed = localStorage.getItem(PASSED_KEY);
    try {
      passedRef.current = storedPassed ? normalizePassedStorage(JSON.parse(storedPassed)) : [];
    } catch {
      passedRef.current = [];
    }

    watchlistRef.current = wl;
    notInterestedRef.current = ni;

    let chs: Channel[] = [];
    try {
      const cRaw = localStorage.getItem(CHANNELS_KEY);
      if (cRaw) {
        chs = (JSON.parse(cRaw) as Channel[]).map(normalizeChannel);
        if (!chs.find((c) => c.id === "all")) {
          chs = [ALL_CHANNEL, ...chs];
        }
      }
    } catch {
      /* ignore */
    }

    if (chs.length === 0) {
      if (hasNoChannelsPersisted()) {
        applyFactoryBootstrap();
      } else {
        mergeFactoryChannelsAndQueues();
      }
      try {
        const cRawFix = localStorage.getItem(CHANNELS_KEY);
        if (cRawFix) {
          chs = (JSON.parse(cRawFix) as Channel[]).map(normalizeChannel);
          if (!chs.find((c) => c.id === "all")) {
            chs = [ALL_CHANNEL, ...chs];
            localStorage.setItem(CHANNELS_KEY, JSON.stringify(chs));
          }
        }
      } catch {
        /* ignore */
      }
    }

    // No named channels (only "All" or list empty): same as the "Load starter channels" control —
    // merge the bundled example channels and prefetch so the first visit doesn't sit empty.
    if (chs.length > 0 && !chs.some((c) => c.id !== "all")) {
      mergeFactoryChannelsAndQueues();
      try {
        const cRaw2 = localStorage.getItem(CHANNELS_KEY);
        if (cRaw2) {
          chs = (JSON.parse(cRaw2) as Channel[]).map(normalizeChannel);
          if (!chs.find((c) => c.id === "all")) {
            chs = [ALL_CHANNEL, ...chs];
            localStorage.setItem(CHANNELS_KEY, JSON.stringify(chs));
          }
        }
      } catch {
        /* ignore */
      }
      const firstNonAll = chs.find((c) => c.id !== "all");
      const activeAfterMerge = firstNonAll?.id ?? chs[0]?.id ?? "all";
      try {
        localStorage.setItem(ACTIVE_CHANNEL_KEY, activeAfterMerge);
      } catch {
        /* ignore */
      }
      setChannels(chs);
      setActiveChannelId(activeAfterMerge);
      activeChannelIdRef.current = activeAfterMerge;
      savedPrefetchChannelRef.current = activeAfterMerge;
      replenishGenRef.current += 1;
      replenishGenInFlight.current = 0;
    }

    const defaultCh = chs.length > 0 ? chs[0].id : "all";
    const storedActive = localStorage.getItem(ACTIVE_CHANNEL_KEY);
    const activeForPrefetch = storedActive || defaultCh;
    activeChannelIdRef.current = activeForPrefetch;
    if (chs.length > 0) {
      channelsRef.current = chs;
    }
    loadPrefetchIntoRefForChannel(activeForPrefetch);
    persistPrefetchQueue();

    // Handle incoming share link (?share=id), then fall through to reconsider / fetchNext.
    const shareId = new URLSearchParams(window.location.search).get("share");
    void (async () => {
      if (shareId) {
        window.history.replaceState({}, "", "/");
        let handled = false;
        try {
          const res = await fetch(`/api/share?id=${encodeURIComponent(shareId)}`);
          if (res.ok) {
            const payload = await res.json() as { channel?: Channel | null; current?: CurrentMovie | null };
            // Full export when nothing stored; otherwise add any missing bundled channels.
            // Share fetch runs after mount, so hasNoChannelsPersisted() is usually false even on first
            // visit—merge is what repopulates the rest of the factory pack (e.g. after following ?share=).
            if (hasNoChannelsPersisted()) applyFactoryBootstrap();
            mergeFactoryChannelsAndQueues();
            if (payload.channel) {
              const raw = localStorage.getItem(CHANNELS_KEY);
              let chs: Channel[] = raw ? (JSON.parse(raw) as Channel[]).map(normalizeChannel) : [];
              if (!chs.find((c) => c.id === "all")) chs = [ALL_CHANNEL, ...chs];
              if (!chs.find((c) => c.id === payload.channel!.id)) {
                chs = [...chs, normalizeChannel(payload.channel)];
                localStorage.setItem(CHANNELS_KEY, JSON.stringify(chs));
              }
              setChannels(chs);
              channelsRef.current = chs;
              const activeId = payload.channel.id;
              localStorage.setItem(ACTIVE_CHANNEL_KEY, activeId);
              setActiveChannelId(activeId);
              activeChannelIdRef.current = activeId;
              savedPrefetchChannelRef.current = activeId;
            } else {
              const raw = localStorage.getItem(CHANNELS_KEY);
              if (raw) {
                let list: Channel[] = (JSON.parse(raw) as Channel[]).map(normalizeChannel);
                if (!list.find((c) => c.id === "all")) {
                  list = [ALL_CHANNEL, ...list];
                  localStorage.setItem(CHANNELS_KEY, JSON.stringify(list));
                }
                setChannels(list);
                channelsRef.current = list;
              }
            }
            if (payload.current) {
              setCurrent(payload.current);
              setInitialLoading(false);
              replenish({ mediaType, llm });
              handled = true;
            }
          }
        } catch {}
        if (handled) return;
      }

      // Check if the Ratings page asked us to reconsider a title
      const pendingReconsider = localStorage.getItem(RECONSIDER_KEY);
      if (pendingReconsider) {
        localStorage.removeItem(RECONSIDER_KEY);
        try {
          const m = JSON.parse(pendingReconsider);
          const movie: CurrentMovie = {
            title: m.title,
            type: m.type ?? "movie",
            year: m.year ?? null,
            director: m.director ?? null,
            predictedRating: migrateRatingValue(typeof m.predictedRating === "number" ? m.predictedRating : 3),
            actors: m.actors ?? [],
            plot: m.plot ?? "",
            posterUrl: m.posterUrl ?? null,
            trailerKey: m.trailerKey ?? null,
            rtScore: m.rtScore ?? null,
            reason: null,
            streaming: Array.isArray(m.streaming) ? (m.streaming as string[]).filter((s): s is string => typeof s === "string" && !!s.trim()) : undefined,
          };
          setCurrent(movie);
          setInitialLoading(false);
          replenish({ mediaType, llm });
          return;
        } catch {}
      }

      fetchNextRef.current({ mediaType, llm }, true);
    })();
    // Mount once: this effect also called fetchNext(…, true) at the end. Including fetchNext
    // in the dependency array re-ran the whole effect when fetchNext was recreated, popping an extra title.
  }, []) /* eslint-disable-line react-hooks/exhaustive-deps -- explicit single hydration + initial pick */;


  // Reset pending rating when a new card loads
  useEffect(() => {
    setPendingRating((p) => (p == null ? p : null));
  }, [current?.title]);

  // Submit pending rating on unmount (Next.js client-side navigation) or page unload
  useEffect(() => {
    const handleUnload = () => {
      const p = pendingRatingRef.current;
      if (p) submitRatingRef.current(p.stars, p.mode);
    };
    window.addEventListener("beforeunload", handleUnload);
    return () => {
      handleUnload();
      window.removeEventListener("beforeunload", handleUnload);
    };
  }, []);

  // On mobile, nudge the card into view when a new title loads — only if needed; avoid smooth scroll (feels like a jump on tap)
  const isFirstCard = useRef(true);
  useEffect(() => {
    if (!current?.title) return;
    if (isFirstCard.current) {
      isFirstCard.current = false;
      return;
    }
    if (careerModeRef.current) return;
    if (window.innerWidth >= 640) return;
    const el = cardRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const vh = window.innerHeight;
    if (rect.top >= 0 && rect.bottom <= vh) return;
    el.scrollIntoView({ behavior: "auto", block: "nearest" });
  }, [current?.title]);

  // When mediaType or the current card disagrees with the filter, drop wrong-type queue rows and advance.
  useEffect(() => {
    if (!current) return;
    if (mediaType === "both" || current.type === mediaType) return;
    replenishGenRef.current += 1;
    replenishGenInFlight.current = 0;
    prefetchRef.current = prefetchRef.current.filter((m) => m.type === mediaType);
    persistPrefetchQueue();
    batchYieldRef.current = [];
    void fetchNext({ mediaType, llm }, prefetchRef.current.length > 0);
  }, [mediaType, current?.type, current?.title, llm, fetchNext, persistPrefetchQueue]);

  // When the top prompt changes on the active channel (debounced 600ms), flush prefetch and
  // replenish so queued titles match the new text — without swapping the visible card (no fetchNext).
  // First paint and channel switches only reset baseline; switches load their queue in another effect.
  useEffect(() => {
    if (!activeChannelId) return;
    const baseline = prevPromptFlushBaselineRef.current;
    if (baseline === undefined) {
      prevPromptFlushBaselineRef.current = { channelId: activeChannelId, prompt: channelPromptValue };
      return;
    }
    if (baseline.channelId !== activeChannelId) {
      prevPromptFlushBaselineRef.current = { channelId: activeChannelId, prompt: channelPromptValue };
      return;
    }
    if (baseline.prompt === channelPromptValue) return;
    prevPromptFlushBaselineRef.current = { channelId: activeChannelId, prompt: channelPromptValue };
    const t = setTimeout(() => {
      replenishGenRef.current += 1;
      replenishGenInFlight.current = 0;
      prefetchRef.current = [];
      persistPrefetchQueue();
      batchYieldRef.current = [];
      zeroYieldStreakRef.current = 0;
      if (!careerModeRef.current) void replenish({ mediaType, llm });
    }, 600);
    return () => clearTimeout(t);
  }, [activeChannelId, channelPromptValue, mediaType, llm, persistPrefetchQueue, replenish]);

  // When active channel changes: save the previous channel's queue, load the new channel's queue.
  useEffect(() => {
    if (!activeChannelId) return;
    localStorage.setItem(ACTIVE_CHANNEL_KEY, activeChannelId);

    const prev = savedPrefetchChannelRef.current;
    if (prev !== null && prev !== activeChannelId) {
      const leaving = currentRef.current;
      if (leaving?.trailerKey) {
        const t = canonicalTitleKey(leaving.title);
        setTrailerResumeByChannel((m) => {
          const ch = { ...(m[prev] || {}), [t]: watchFracRef.current };
          const next = { ...m, [prev]: ch };
          try {
            sessionStorage.setItem(TRAILER_RESUME_KEY, JSON.stringify(next));
          } catch {
            /* ignore */
          }
          return next;
        });
      }
      replenishGenRef.current += 1;
      replenishGenInFlight.current = 0;
      try {
        localStorage.setItem(prefetchQueueStorageKey(prev), JSON.stringify(prefetchRef.current));
      } catch {
        /* ignore */
      }
      loadPrefetchIntoRefForChannel(activeChannelId);
      persistPrefetchQueue();
      batchYieldRef.current = [];
      zeroYieldStreakRef.current = 0;
      savedPrefetchChannelRef.current = activeChannelId;
      // Show the first saved title for this channel (or wait / fetch if the queue is empty).
      const hasQueued = prefetchRef.current.length > 0;
      void fetchNext({ mediaType, llm }, hasQueued);
      return;
    }
    savedPrefetchChannelRef.current = activeChannelId;
  }, [activeChannelId, mediaType, llm, fetchNext, loadPrefetchIntoRefForChannel, persistPrefetchQueue]);

  const confirmDeleteChannelFromHome = useCallback(() => {
    const ch = channelPendingDelete;
    if (!ch || ch.id === "all") {
      setChannelPendingDelete(null);
      return;
    }
    const id = ch.id;
    const next = channels.filter((c) => c.id !== id);
    try {
      localStorage.removeItem(prefetchQueueStorageKey(id));
    } catch {
      /* ignore */
    }
    localStorage.setItem(CHANNELS_KEY, JSON.stringify(next));
    setChannels(next);

    if (activeChannelId === id) {
      const fallback = next[0]?.id ?? "all";
      replenishGenRef.current += 1;
      replenishGenInFlight.current = 0;
      savedPrefetchChannelRef.current = fallback;
      loadPrefetchIntoRefForChannel(fallback);
      persistPrefetchQueue();
      batchYieldRef.current = [];
      zeroYieldStreakRef.current = 0;
      localStorage.setItem(ACTIVE_CHANNEL_KEY, fallback);
      setActiveChannelId(fallback);
      activeChannelIdRef.current = fallback;
      void fetchNext({ mediaType, llm }, prefetchRef.current.length > 0);
    }
    setChannelPendingDelete(null);
  }, [
    channelPendingDelete,
    channels,
    activeChannelId,
    mediaType,
    llm,
    loadPrefetchIntoRefForChannel,
    persistPrefetchQueue,
    fetchNext,
  ]);

  const mergeStartersKeepActive = useCallback(() => {
    mergeFactoryChannelsAndQueues();
    try {
      const raw = localStorage.getItem(CHANNELS_KEY);
      if (!raw) return;
      let next: Channel[] = (JSON.parse(raw) as Channel[]).map(normalizeChannel);
      if (!next.some((c) => c.id === "all")) {
        next = [ALL_CHANNEL, ...next];
        localStorage.setItem(CHANNELS_KEY, JSON.stringify(next));
      }
      setChannels(next);
      channelsRef.current = next;
    } catch {
      /* ignore */
    }
  }, []);

  const loadStarterChannelsFromFactory = useCallback(() => {
    mergeFactoryChannelsAndQueues();
    try {
      const raw = localStorage.getItem(CHANNELS_KEY);
      let next: Channel[] = raw ? (JSON.parse(raw) as Channel[]).map(normalizeChannel) : [];
      if (!next.some((c) => c.id === "all")) {
        next = [ALL_CHANNEL, ...next];
        localStorage.setItem(CHANNELS_KEY, JSON.stringify(next));
      }
      setChannels(next);
      const firstNonAll = next.find((c) => c.id !== "all");
      const active = firstNonAll?.id ?? next[0]?.id ?? "all";
      activeChannelIdRef.current = active;
      setActiveChannelId(active);
      replenishGenRef.current += 1;
      replenishGenInFlight.current = 0;
      savedPrefetchChannelRef.current = active;
      loadPrefetchIntoRefForChannel(active);
      persistPrefetchQueue();
      batchYieldRef.current = [];
      zeroYieldStreakRef.current = 0;
      void fetchNext({ mediaType, llm }, prefetchRef.current.length > 0);
    } catch {
      /* ignore */
    }
  }, [loadPrefetchIntoRefForChannel, persistPrefetchQueue, fetchNext, mediaType, llm]);

  const handleRate = (rating: number, ratingMode: "seen" | "unseen" = "seen") => {
    rating = clampStarRating(rating);
    if (!current) return;
    const predicted = migrateRatingValue(current.predictedRating);
    const error = Math.abs(rating - predicted);
    const channelId = activeChannelIdRef.current || undefined;
    const entry: RatingEntry = {
      title: current.title,
      type: current.type,
      userRating: rating,
      predictedRating: predicted,
      error,
      rtScore: current.rtScore,
      channelId,
      posterUrl: current.posterUrl,
      trailerKey: current.trailerKey,
      ratingMode,
      ratedAt: new Date().toISOString(),
    };
    const newHistory = [...historyRef.current, entry];
    saveHistory(newHistory);
    zeroYieldStreakRef.current = 0; // new exclusion may unblock the LLM
    // Update taste profile after 1st rating, then every 5 (1, 5, 10, 15 …)
    const n = newHistory.length;
    if (n === 1 || n % 5 === 0) updateTasteSummary(newHistory, llm);
    if (!careerModeRef.current) replenish({ mediaType, llm });
  };

  /** Single entry point for all star clicks. Red = seen (goes to history). Blue = unseen (4-5 → watchlist, 1-3 → not-interested). */
  const submitRating = (stars: number, mode: "seen" | "unseen") => {
    if (mode === "seen") {
      handleRate(stars, "seen");
    } else {
      recordNotSeen(stars >= 4 ? "want" : "skip", stars);
    }
  };

  /** Advance — submits any pending star rating, otherwise marks title as passed (no rating). */
  const passCurrentCard = () => {
    if (!current) return;
    clearAdvanceAfterRating();
    const p = pendingRatingRef.current;
    if (p) {
      submitRatingRef.current(p.stars, p.mode);
      setPendingRating((x) => (x == null ? x : null));
    } else {
      const autoStars = WATCH_PROGRESS_AUTO_RATING ? progressToStars(watchFracRef.current) : 0;
      if (autoStars > 0) {
        submitRatingRef.current(autoStars, "seen");
      } else {
        const t = current.title;
        const row: PassedRow = {
          title: t,
          type: current.type,
          at: new Date().toISOString(),
          channelId: activeChannelIdRef.current?.trim() || undefined,
        };
        const newPassed = [...passedRef.current, row];
        localStorage.setItem(PASSED_KEY, JSON.stringify(newPassed));
        passedRef.current = newPassed;
      }
    }
    const cm = careerModeRef.current;
    if (cm) {
      if (cm.index < cm.films.length - 1) void careerNavigate(cm.index + 1);
    } else {
      zeroYieldStreakRef.current = 0;
      fetchNext({ mediaType, llm });
    }
  };

  const recordNotSeen = (kind: "want" | "skip", interestStars: number) => {
    if (!current) return;
    const snapshot = current;
    const chId = activeChannelIdRef.current?.trim() || "all";
    const starsNorm = migrateRatingValue(interestStars);

    let newWatchlist = watchlistRef.current;
    if (kind === "want") {
      const streamingFromBatch = snapshot.streaming?.filter((s) => typeof s === "string" && s.trim()) ?? [];
      const entry: WatchlistEntry = {
        title: snapshot.title,
        type: snapshot.type,
        year: snapshot.year,
        director: snapshot.director,
        actors: snapshot.actors,
        plot: snapshot.plot,
        posterUrl: snapshot.posterUrl,
        rtScore: snapshot.rtScore,
        streaming: streamingFromBatch,
        addedAt: new Date().toISOString(),
      };
      newWatchlist = [entry, ...watchlistRef.current.filter((w) => w.title !== snapshot.title)];
      localStorage.setItem(WATCHLIST_KEY, JSON.stringify(newWatchlist));
      watchlistRef.current = newWatchlist;

      if (streamingFromBatch.length === 0) {
        fetch("/api/streaming", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: snapshot.title, year: snapshot.year, llm }),
        })
          .then((r) => (r.ok ? r.json() : { services: [] }))
          .then(({ services }: { services: string[] }) => {
            if (!services.length) return;
            const updated = watchlistRef.current.map((w) =>
              w.title === snapshot.title ? { ...w, streaming: services } : w);
            watchlistRef.current = updated;
            localStorage.setItem(WATCHLIST_KEY, JSON.stringify(updated));
          })
          .catch(() => {});
      }
    }

    const nsEvent: NotSeenEvent = { afterRating: historyRef.current.length, kind };
    const newNotSeen = [...notSeenRef.current, nsEvent];
    notSeenRef.current = newNotSeen;
    localStorage.setItem(NOTSEEN_KEY, JSON.stringify(newNotSeen));

    const logRow: UnseenInterestEntry = {
      title: snapshot.title,
      type: snapshot.type,
      year: snapshot.year,
      director: snapshot.director,
      actors: snapshot.actors,
      plot: snapshot.plot,
      posterUrl: snapshot.posterUrl,
      rtScore: snapshot.rtScore,
      interestStars: starsNorm,
      kind,
      channelId: chId,
      at: new Date().toISOString(),
    };
    pushUnseenInterestEntry(logRow);

    const newSkipped = [...skippedRef.current, snapshot.title];
    localStorage.setItem(SKIPPED_KEY, JSON.stringify(newSkipped));
    skippedRef.current = newSkipped;

    // For "not interested" items, store with RT score so the server can surface high-RT dismissals
    // as a taste signal (user diverges from critical consensus).
    let newNotInterested = notInterestedRef.current;
    if (kind === "skip") {
      newNotInterested = [...notInterestedRef.current, { title: snapshot.title, rtScore: snapshot.rtScore }];
      localStorage.setItem(NOT_INTERESTED_KEY, JSON.stringify(newNotInterested));
      notInterestedRef.current = newNotInterested;
    }

    watchlistRef.current = newWatchlist;
    zeroYieldStreakRef.current = 0; // new exclusion may unblock the LLM
    if (!careerModeRef.current) replenish({ mediaType, llm });
  };

  const submitRatingRef = useRef(submitRating);
  submitRatingRef.current = submitRating;
  const handlePendingChange = useCallback((stars: number, mode: "seen" | "unseen") => {
    setPendingRating({ stars, mode });
  }, []);

  const passCurrentCardRef = useRef(passCurrentCard);
  passCurrentCardRef.current = passCurrentCard;
  const passCurrentCardStable = useCallback(() => {
    passCurrentCardRef.current();
  }, []);

  const openPosterLightbox = useCallback((url: string) => {
    setLightboxUrl(url);
  }, []);

  const careerNavigate = useCallback(async (index: number, films?: TrailerCareerFilm[]) => {
    const cm = careerModeRef.current;
    const filmList = films ?? cm?.films ?? [];
    if (!filmList[index]) return;
    const film = filmList[index];
    setCareerMode((prev) => {
      if (!prev) return null;
      if (prev.index === index) return prev;
      return { ...prev, index };
    });
    // Same title as the card already showing (e.g. opened an actor for this movie) — keep trailer so the player does not stop/restart.
    setCurrent((prev) => {
      if (isSameFilmAsCurrent(prev, film)) {
        const posterUrl = film.posterUrl ?? prev!.posterUrl;
        if (prev!.posterUrl === posterUrl) return prev;
        return { ...prev!, posterUrl };
      }
      return {
        ...(prev ?? {
          title: film.title,
          type: film.type,
          year: film.year,
          director: null,
          predictedRating: 3,
          actors: [],
          plot: "",
          rtScore: null,
          reason: null,
          trailerKey: null,
          streaming: undefined,
        }),
        title: film.title,
        type: film.type,
        year: film.year,
        posterUrl: film.posterUrl,
        trailerKey: null,
      };
    });
    setCareerLoading((s) => (s ? s : true));
    try {
      const res = await fetch(
        `${CAREER_API.trailerMovie}?tmdbId=${film.tmdbId}&type=${film.type}`,
      );
      if (res.ok) {
        const full = await res.json() as CurrentMovie;
        setCurrent((p) => {
          if (p && isSameFilmAsCurrent(p, film)) {
            const merged: CurrentMovie = { ...full, trailerKey: full.trailerKey ?? p.trailerKey };
            return currentMovieEquals(merged, p) ? p : merged;
          }
          if (p && currentMovieEquals(full, p)) return p;
          return full;
        });
      }
    } catch { /* ignore */ } finally {
      setCareerLoading((s) => (s ? false : s));
    }
  }, []);

  const handleCareerPrev = useCallback(() => {
    const cm = careerModeRef.current;
    if (cm) void careerNavigate(cm.index - 1);
  }, [careerNavigate]);

  const handleCareerListSelect = useCallback((i: number) => {
    void careerNavigate(i);
  }, [careerNavigate]);

  const careerPrevNav = useMemo((): { onPass: () => void; disabled: boolean } | null => {
    if (!careerMode) return null;
    return { onPass: handleCareerPrev, disabled: careerMode.index === 0 };
  }, [careerMode, careerMode?.index, handleCareerPrev]);

  const careerAtLastFilm = useMemo(
    () => Boolean(careerMode && careerMode.films.length > 0 && careerMode.index === careerMode.films.length - 1),
    [careerMode],
  );

  const enterCareerMode = useCallback(async (name: string, role: "actor" | "director") => {
    setCareerLoading((s) => (s ? s : true));
    try {
      const res = await fetch(
        `${CAREER_API.trailerPerson}?name=${encodeURIComponent(name)}&role=${role}`,
      );
      if (!res.ok) return;
      const data = await res.json() as { personName: string; films: TrailerCareerFilm[] };
      if (!data.films?.length) return;
      const currentTitle = current?.title ?? "";
      const startIndex = data.films.findIndex(
        (f) => f.title.toLowerCase() === currentTitle.toLowerCase()
      );
      const index = startIndex >= 0 ? startIndex : 0;
      const cm: TrailerCareerMode = { personName: data.personName, role, films: data.films, index };
      // Drop in-flight LLM queue so it cannot mix with filmography picks.
      replenishGenRef.current += 1;
      replenishGenInFlight.current = 0;
      prefetchRef.current = [];
      batchYieldRef.current = [];
      zeroYieldStreakRef.current = 0;
      persistPrefetchQueue();
      setCareerMode(cm);
      careerModeRef.current = cm;
      await careerNavigate(index, data.films);
    } catch { /* ignore */ } finally {
      setCareerLoading((s) => (s ? false : s));
    }
  }, [current?.title, careerNavigate, persistPrefetchQueue]);

  const exitCareerMode = useCallback(() => {
    setCareerMode(null);
    careerModeRef.current = null;
    const o = replenishOptsRef.current;
    zeroYieldStreakRef.current = 0;
    void replenish({ mediaType: o.mediaType, llm: o.llm });
    if (prefetchRef.current.length === 0) {
      void fetchNext({ mediaType: o.mediaType, llm: o.llm });
    }
  }, [replenish, fetchNext]);

  const handleShare = useCallback(async () => {
    if (!current) return;
    const ch = channelsRef.current.find((c) => c.id === activeChannelIdRef.current);
    setShareToast("copying");
    try {
      const res = await fetch("/api/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel: ch ?? null, current }),
      });
      const { id } = await res.json() as { id: string };
      const url = `${window.location.origin}/?share=${id}`;
      await navigator.clipboard.writeText(url);
      setShareToast("copied");
      setTimeout(() => setShareToast(null), 2500);
    } catch {
      setShareToast(null);
    }
  }, [current]);

  const selectChannel = useCallback((id: string) => {
    setActiveChannelId(id);
  }, []);

  const requestDeleteChannel = useCallback((ch: Channel) => {
    setChannelPendingDelete(ch);
  }, []);

  const createChannelFromHomePrompt = useCallback(() => {
    const t = newChannelDraft.replace(/\s+/g, " ").trim();
    if (!t) return;
    let list: Channel[] = [];
    try {
      const raw = localStorage.getItem(CHANNELS_KEY);
      list = raw ? (JSON.parse(raw) as Channel[]).map(normalizeChannel) : [];
      if (!list.some((c) => c.id === "all")) {
        list = [ALL_CHANNEL, ...list];
      }
    } catch {
      list = [ALL_CHANNEL];
    }
    const data = channelDraftFromPrompt(t);
    const ch = normalizeChannel({ ...data, id: crypto.randomUUID() });
    const next = [...list, ch];
    try {
      localStorage.setItem(CHANNELS_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
    setChannels(next);
    channelsRef.current = next;
    localStorage.setItem(ACTIVE_CHANNEL_KEY, ch.id);
    setActiveChannelId(ch.id);
    activeChannelIdRef.current = ch.id;
    savedPrefetchChannelRef.current = ch.id;
    replenishGenRef.current += 1;
    replenishGenInFlight.current = 0;
    loadPrefetchIntoRefForChannel(ch.id);
    prefetchRef.current = [];
    persistPrefetchQueue();
    batchYieldRef.current = [];
    zeroYieldStreakRef.current = 0;
    void fetchNext({ mediaType, llm }, true);
    setNewChannelDraft("");
  }, [
    newChannelDraft,
    loadPrefetchIntoRefForChannel,
    persistPrefetchQueue,
    fetchNext,
    mediaType,
    llm,
  ]);

  const createChannelFromConstellationsPayload = useCallback(
    (rawNotes: string, nameFromGraph?: string) => {
      const trimmed = rawNotes.trim();
      if (!trimmed) return;
      let list: Channel[] = [];
      try {
        const raw = localStorage.getItem(CHANNELS_KEY);
        list = raw ? (JSON.parse(raw) as Channel[]).map(normalizeChannel) : [];
        if (!list.some((c) => c.id === "all")) {
          list = [ALL_CHANNEL, ...list];
        }
      } catch {
        list = [ALL_CHANNEL];
      }
      const base = channelDraftFromPrompt(trimmed);
      const n = (nameFromGraph && nameFromGraph.replace(/\s+/g, " ").trim()) || "";
      const displayName = (n.length > 0 ? n : base.name).slice(0, 80);
      const ch = normalizeChannel({ ...base, name: displayName, freeText: trimmed, id: crypto.randomUUID() });
      const next = [...list, ch];
      try {
        localStorage.setItem(CHANNELS_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      setChannels(next);
      channelsRef.current = next;
      localStorage.setItem(ACTIVE_CHANNEL_KEY, ch.id);
      setActiveChannelId(ch.id);
      activeChannelIdRef.current = ch.id;
      savedPrefetchChannelRef.current = ch.id;
      replenishGenRef.current += 1;
      replenishGenInFlight.current = 0;
      loadPrefetchIntoRefForChannel(ch.id);
      prefetchRef.current = [];
      persistPrefetchQueue();
      batchYieldRef.current = [];
      zeroYieldStreakRef.current = 0;
      void fetchNext({ mediaType, llm }, true);
    },
    [loadPrefetchIntoRefForChannel, persistPrefetchQueue, fetchNext, mediaType, llm]
  );

  const createChannelFromGraphNode = useCallback(
    (node: GraphNode) => {
      const { name, notes } = graphNodeToChannelSeeds(node);
      createChannelFromConstellationsPayload(notes, name);
    },
    [createChannelFromConstellationsPayload]
  );

  useEffect(() => {
    const key = trailerVisionStorage.pendingConstellationsNewChannel;
    let raw: string | null = null;
    try {
      raw = sessionStorage.getItem(key);
    } catch {
      return;
    }
    if (!raw) return;
    let parsed: { v?: number; notes?: string; name?: string };
    try {
      parsed = JSON.parse(raw) as { v?: number; notes?: string; name?: string };
    } catch {
      try {
        sessionStorage.removeItem(key);
      } catch {
        /* empty */
      }
      return;
    }
    if (parsed.v !== 1 || !parsed.notes?.trim()) {
      try {
        sessionStorage.removeItem(key);
      } catch {
        /* empty */
      }
      return;
    }
    const notes = parsed.notes.trim();
    const nameOpt = typeof parsed.name === "string" && parsed.name.trim() ? parsed.name.trim() : undefined;
    try {
      sessionStorage.removeItem(key);
    } catch {
      /* empty */
    }
    createChannelFromConstellationsPayload(notes, nameOpt);
  }, [createChannelFromConstellationsPayload]);

  const constellationsNowPlayingKey = useMemo((): string | null => {
    if (!current) return null;
    const person = careerMode?.personName?.trim() ?? "";
    return `${activeChannelId}::${person}::${current.title}::${current.type}`;
  }, [activeChannelId, careerMode, current]);

  const constellationsAutoExpand = useMemo((): string[] => {
    if (!current) return [];
    const out: string[] = [current.title];
    const d = current.director?.replace(/\s+/g, " ").trim();
    if (d) out.push(d);
    return out;
  }, [current]);

  const constellationsExternalSearch = useMemo((): { term: string; id: string | number } | null => {
    if (!current) return null;
    const t = current.title.replace(/\s+/g, " ").trim();
    if (!t) return null;
    const ch = (activeChannelId && activeChannelId.length > 0 ? activeChannelId : "all").toString();
    return { term: t, id: `trailer:${ch}:${canonicalTitleKey(t)}` };
  }, [activeChannelId, current]);

  const historyMatchForCurrentCard = useMemo(() => {
    if (!current?.title) return undefined;
    return pickHistoryEntryForCardTitle(historyRef.current, current.title, activeChannelId);
  }, [current?.title, activeChannelId, historyVersion]);

  const llmActive = llmPrefetchInFlight > 0 || isAdvancingCard;

  return (
    <div className="flex min-h-screen w-full flex-col bg-black px-3 py-3 sm:px-4 sm:py-5 lg:px-8 lg:py-6">
      <div className="mx-auto flex w-full max-w-[min(100%,90rem)] flex-col gap-4 lg:grid lg:grid-cols-[minmax(12rem,19rem)_minmax(0,1fr)] lg:items-start lg:gap-x-8 lg:gap-y-0 xl:grid-cols-[minmax(13rem,20rem)_minmax(0,1fr)] xl:gap-x-12">
        <aside className="min-w-0 space-y-3 lg:sticky lg:top-11 lg:z-10 lg:self-start lg:pr-1">
          <p className="hidden text-[11px] font-semibold uppercase tracking-wide text-zinc-500 lg:block">
            Channels
          </p>
          <ChannelsToolbar
            channels={channels}
            activeChannelId={activeChannelId}
            onLoadStarter={loadStarterChannelsFromFactory}
            onMergeStarters={mergeStartersKeepActive}
            showMergeStarterPack={factoryPackFullyMerged === false}
            onSelectChannel={selectChannel}
            onRequestDeleteChannel={requestDeleteChannel}
          />

          <div className="rounded-2xl border border-zinc-800/90 bg-zinc-950/80 p-2 sm:p-2.5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2">
              <label htmlFor="channel-what-you-want" className="sr-only">
                Optional text for a new channel — does not edit the current channel
              </label>
              <div className="relative min-w-0 flex-1">
                <input
                  id="channel-what-you-want"
                  type="text"
                  autoComplete="off"
                  value={newChannelDraft}
                  onChange={(e) => setNewChannelDraft(e.target.value.replace(/\r?\n/g, " "))}
                  placeholder="Optional seed for a new channel…"
                  className="h-9 w-full rounded-lg border border-zinc-600 bg-zinc-900 py-0 pl-2.5 pr-8 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 sm:h-10 sm:pl-3 sm:pr-9"
                />
                {newChannelDraft.length > 0 && (
                  <button
                    type="button"
                    onPointerDown={(e) => e.preventDefault()}
                    onClick={() => setNewChannelDraft("")}
                    className="absolute right-1 top-1/2 z-10 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-base leading-none text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200 sm:right-1.5 sm:h-7 sm:w-7"
                    title="Clear"
                    aria-label="Clear"
                  >
                    ×
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={createChannelFromHomePrompt}
                disabled={!newChannelDraft.trim()}
                title="Create a new channel with this text"
                className="h-9 w-full shrink-0 rounded-lg bg-indigo-600 px-2 text-xs font-semibold text-white transition-colors hover:bg-indigo-500 disabled:pointer-events-none disabled:opacity-40 sm:h-10 sm:w-auto sm:px-3 sm:text-sm lg:w-full"
              >
                New channel
              </button>
            </div>
          </div>
        </aside>

        <div className="flex min-w-0 flex-col gap-4 sm:gap-5 lg:min-h-0">
        {/* Movie card */}
        <div
          ref={cardRef}
          className="bg-zinc-950 rounded-2xl border border-zinc-800 shadow-sm overflow-hidden scroll-mt-4 sm:scroll-mt-8 md:scroll-mt-14"
        >
          {initialLoading ? (
            <>
              <div className="border-b border-zinc-800 px-4 pb-3 pt-4 sm:px-6 sm:pt-5">
                <LlmPrefetchStatusBar
                  careerMode={!!careerMode}
                  llmActive={llmActive}
                  llmPrefetchInFlight={llmPrefetchInFlight}
                  isAdvancingCard={isAdvancingCard}
                  queueLength={prefetchQueueUi.length}
                />
              </div>
              <MovieCardSkeleton mode={displayMode} />
            </>
          ) : current ? (
            <div>
              {careerMode && (
                <div
                  className="flex flex-col gap-2 border-b border-indigo-500/35 bg-indigo-950/45 px-3 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-3 sm:px-4 sm:py-3.5"
                  title="LLM pick queue is paused. Only the filmography list below is used until you exit."
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-2xl font-bold leading-tight tracking-tight text-indigo-50 sm:text-3xl break-words">
                      {careerMode.personName}
                    </p>
                    <p className="mt-1 text-sm text-indigo-300/90">
                      {careerMode.role === "director" ? "Director" : "Actor"} filmography · {careerMode.index + 1} of {careerMode.films.length}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={exitCareerMode}
                    className="shrink-0 self-end rounded-lg border border-indigo-500/50 bg-indigo-900/50 px-2.5 py-1.5 text-xs font-semibold text-indigo-100 transition-colors hover:bg-indigo-800/80 sm:self-center"
                  >
                    {careerUi.exitTrailer}
                  </button>
                </div>
              )}
              {displayMode === "trailers" ? (
                /* ── TRAILER LAYOUT (always in “trailers” mode — never swap in a full poster page while a trailer may load) ── */
                <div
                  ref={careerTrailerBlockRef}
                  className="bg-black"
                  style={
                    careerMode && careerLoading && careerTrailerBlockStableH > 0
                      ? { minHeight: careerTrailerBlockStableH }
                      : undefined
                  }
                >
                  {current.trailerKey ? (
                    <div ref={videoContainerRef} data-trailer-fs-root className="flex flex-col bg-black">
                      {/* Single aspect box from TrailerPlayer — avoid nested aspect-video (broken height / jitter). */}
                      <div className="relative w-full shrink-0">
                        <TrailerPlayer
                          videoId={current.trailerKey}
                          onProgress={setWatchFrac}
                          onPlaybackError={handleTrailerPlaybackError}
                          resumeFromFraction={trailerResumeByChannel[activeChannelId]?.[canonicalTitleKey(current.title)]}
                        />
                        {isTrailerFullscreen && (
                          <>
                            <button
                              type="button"
                              onPointerDown={(e) => e.preventDefault()}
                              onClick={() => document.exitFullscreen?.()}
                              className="absolute left-3 top-3 z-50 rounded-xl bg-black/55 p-2.5 text-white/85 hover:bg-black/80 hover:text-white transition-colors select-none sm:left-4 sm:top-4"
                              title="Exit fullscreen"
                              aria-label="Exit fullscreen"
                            >
                              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 9L4 4m0 0v4m0-4h4M15 9l5-5m0 0v4m0-4h-4M9 15l-5 5m0 0v-4m0 4h4M15 15l5 5m0 0v-4m0 4h-4" />
                              </svg>
                            </button>
                            <div
                              ref={setFullscreenTopChromeMount}
                              className="pointer-events-auto absolute right-3 top-3 z-50 flex max-w-[calc(100%-5rem)] items-center sm:right-4 sm:top-4"
                              aria-label="Fullscreen trailer actions"
                            />
                          </>
                        )}
                      </div>
                      <MovieRatingBlock
                        layout="trailerBar"
                        trailerFullscreen={isTrailerFullscreen}
                        fullscreenTopChromeMount={fullscreenTopChromeMount}
                        trailerBarTopEnd={
                          !isTrailerFullscreen ? (
                            <>
                              <button
                                type="button"
                                onPointerDown={(e) => e.preventDefault()}
                                onClick={() => {
                                  const el = videoContainerRef.current;
                                  if (!el?.requestFullscreen) return;
                                  void Promise.resolve(el.requestFullscreen())
                                    .finally(() => {
                                      syncTrailerFullscreenFromDom();
                                    })
                                    .catch(() => {});
                                }}
                                className="flex shrink-0 items-center gap-1.5 rounded-lg border border-zinc-700/80 bg-zinc-900/80 px-2.5 py-1.5 text-[11px] font-medium text-zinc-100 transition-colors hover:bg-zinc-800 sm:text-xs"
                                title="Fullscreen — ratings and Next stay below the video"
                                aria-label="Enter fullscreen"
                              >
                                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-5h-4m4 0v4m0-4l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                                </svg>
                                Fullscreen
                              </button>
                              <ShareButton onClick={handleShare} toast={shareToast} />
                            </>
                          ) : null
                        }
                        passCurrentCardStable={passCurrentCardStable}
                        onRate={handlePendingChange}
                        movieTitle={current.title}
                        starKeyPrefix="tr"
                        watchFrac={watchFrac}
                        defaultSeen={activeChannelId === "all"}
                        previousRating={historyMatchForCurrentCard?.userRating}
                        previousMode={historyMatchForCurrentCard?.ratingMode}
                        careerPrevNav={careerPrevNav}
                        careerNextDisabled={careerAtLastFilm}
                      />
                    </div>
                  ) : current.posterUrl && !current.trailerKey ? (
                    <div className="relative border-b border-zinc-800/80 bg-zinc-950">
                      {isTrailerFullscreen && (
                        <>
                          <button
                            type="button"
                            onPointerDown={(e) => e.preventDefault()}
                            onClick={() => document.exitFullscreen?.()}
                            className="absolute left-3 top-3 z-50 rounded-xl bg-black/55 p-2.5 text-white/85 hover:bg-black/80 hover:text-white transition-colors select-none sm:left-4 sm:top-4"
                            title="Exit fullscreen"
                            aria-label="Exit fullscreen"
                          >
                            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 9L4 4m0 0v4m0-4h4M15 9l5-5m0 0v4m0-4h-4M9 15l-5 5m0 0v-4m0 4h4M15 15l5 5m0 0v-4m0 4h-4" />
                            </svg>
                          </button>
                          <div
                            ref={setFullscreenTopChromeMount}
                            className="pointer-events-auto absolute right-3 top-3 z-50 flex max-w-[calc(100%-5rem)] items-center sm:right-4 sm:top-4"
                            aria-label="Fullscreen trailer actions"
                          />
                        </>
                      )}
                      <div className="flex min-w-0 items-start justify-between gap-3 p-4 sm:p-6">
                        <div className="min-w-0 flex-1">
                          <PosterMovieTop
                            movie={current}
                            onOpenPoster={openPosterLightbox}
                            onPersonClick={enterCareerMode}
                            careerPersonName={careerMode?.personName ?? null}
                            detailsLoading={careerLoading}
                          />
                        </div>
                        <div className="shrink-0 pt-0.5">
                          <ShareButton onClick={handleShare} toast={shareToast} />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div ref={videoContainerRef} className="relative bg-black">
                      <div className="flex aspect-video w-full items-center justify-center bg-zinc-950 text-sm text-zinc-500">
                        {careerLoading ? "Loading trailer…" : null}
                      </div>
                    </div>
                  )}
                  {!current.trailerKey && (
                    <MovieRatingBlock
                      layout="trailerBar"
                      trailerFullscreen={isTrailerFullscreen}
                      fullscreenTopChromeMount={fullscreenTopChromeMount}
                      passCurrentCardStable={passCurrentCardStable}
                      onRate={handlePendingChange}
                      movieTitle={current.title}
                      starKeyPrefix="tr"
                      watchFrac={watchFrac}
                      defaultSeen={activeChannelId === "all"}
                      previousRating={historyMatchForCurrentCard?.userRating}
                      previousMode={historyMatchForCurrentCard?.ratingMode}
                      careerPrevNav={careerPrevNav}
                      careerNextDisabled={careerAtLastFilm}
                    />
                  )}
                  <div className="flex flex-col gap-4 p-4 sm:pb-6 sm:p-6">
                    {current.trailerKey && (
                      <div className="min-w-0 w-full">
                        <TrailerMetadata
                          movie={current}
                          onPersonClick={enterCareerMode}
                          careerPersonName={careerMode?.personName ?? null}
                        />
                      </div>
                    )}
                    {!current.trailerKey && !current.posterUrl && (
                      <div className="flex justify-end">
                        <ShareButton onClick={handleShare} toast={shareToast} />
                      </div>
                    )}
                    {current.reason && (
                      <div className="border-l-2 border-zinc-600 pl-3">
                        <LlmBulletedText text={current.reason} className="text-sm text-zinc-400 leading-relaxed" />
                      </div>
                    )}

                    <LlmPrefetchStatusBar
                      careerMode={!!careerMode}
                      llmActive={llmActive}
                      llmPrefetchInFlight={llmPrefetchInFlight}
                      isAdvancingCard={isAdvancingCard}
                      queueLength={prefetchQueueUi.length}
                    />

                    {careerMode ? (
                      <CareerFilmographyPanel
                        career={careerMode}
                        onSelect={handleCareerListSelect}
                        onExit={exitCareerMode}
                        loading={careerLoading}
                      />
                    ) : (
                      <PrefetchQueuePanel
                        prefetchQueueUi={prefetchQueueUi}
                        channels={channels}
                        activeChannelId={activeChannelId}
                        onPlayAtIndex={playPrefetchAtIndex}
                        onRemoveAtIndex={removeFromPrefetchQueue}
                      />
                    )}
                  </div>
                  {current.trailerKey && current.posterUrl && !isTrailerFullscreen && (
                    <div className="flex w-full min-w-0 justify-center border-t border-zinc-800 bg-zinc-950 px-3 pb-4 pt-3 sm:px-6 sm:pb-5 sm:pt-3">
                      <button
                        type="button"
                        onPointerDown={(e) => e.preventDefault()}
                        onClick={() => openPosterLightbox(current.posterUrl!)}
                        className="w-1/2 min-w-0 max-w-full cursor-zoom-in overflow-hidden rounded-lg border border-zinc-800/90 shadow-sm transition-shadow hover:border-zinc-600"
                        title="View poster"
                        aria-label={`View ${current.title} poster full size`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={current.posterUrl}
                          alt={`${current.title} poster`}
                          referrerPolicy="no-referrer"
                          className="mx-auto block h-auto w-full max-h-72 object-contain object-top sm:max-h-80"
                        />
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                /* ── POSTER MODE (user chose “posters” in settings — large poster + metadata) ── */
                <div className="flex flex-col gap-4 p-4 sm:p-6">
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <PosterMovieTop
                        movie={current}
                        onOpenPoster={openPosterLightbox}
                        onPersonClick={enterCareerMode}
                        careerPersonName={careerMode?.personName ?? null}
                        detailsLoading={careerLoading}
                      />
                    </div>
                    <div className="shrink-0 pt-0.5">
                      <ShareButton onClick={handleShare} toast={shareToast} />
                    </div>
                  </div>
                  {current.reason && (
                    <div className="border-l-2 border-zinc-600 pl-3">
                      <LlmBulletedText text={current.reason} className="text-sm text-zinc-400 leading-relaxed" />
                    </div>
                  )}

                  <MovieRatingBlock
                    passCurrentCardStable={passCurrentCardStable}
                    onRate={handlePendingChange}
                    movieTitle={current.title}
                    starKeyPrefix="po"
                    defaultSeen={activeChannelId === "all"}
                    previousRating={historyMatchForCurrentCard?.userRating}
                    previousMode={historyMatchForCurrentCard?.ratingMode}
                    careerPrevNav={careerPrevNav}
                    careerNextDisabled={careerAtLastFilm}
                  />
                  <LlmPrefetchStatusBar
                    careerMode={!!careerMode}
                    llmActive={llmActive}
                    llmPrefetchInFlight={llmPrefetchInFlight}
                    isAdvancingCard={isAdvancingCard}
                    queueLength={prefetchQueueUi.length}
                  />
                  {careerMode ? (
                    <CareerFilmographyPanel
                      career={careerMode}
                      onSelect={handleCareerListSelect}
                      onExit={exitCareerMode}
                      loading={careerLoading}
                    />
                  ) : (
                    <PrefetchQueuePanel
                      prefetchQueueUi={prefetchQueueUi}
                      channels={channels}
                      activeChannelId={activeChannelId}
                      onPlayAtIndex={playPrefetchAtIndex}
                      onRemoveAtIndex={removeFromPrefetchQueue}
                    />
                  )}
                </div>
              )}
            </div>
          ) : null}
        </div>

        {current ? (
          <div className="w-full overflow-hidden rounded-2xl border border-zinc-800/90 bg-zinc-950/80">
            <TrailerVisionConstellationsEmbed
              nowPlayingKey={constellationsNowPlayingKey}
              autoExpandMatchTitles={constellationsAutoExpand}
              externalSearch={constellationsExternalSearch}
              onNewChannelFromNode={createChannelFromGraphNode}
            />
          </div>
        ) : null}

        {/* Taste profile card */}
        <div className="bg-zinc-950 rounded-2xl border border-zinc-800 shadow-sm p-4">
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">AI&apos;s model of your taste</p>
          {tasteSummary ? (
            <div style={{ borderLeft: "3px solid #a78bfa", paddingLeft: "12px" }}>
              <LlmBulletedText text={tasteSummary} className="text-sm text-zinc-300 leading-relaxed marker:text-zinc-500" />
            </div>
          ) : (
            <p className="text-sm text-zinc-600 italic">Rate a few titles to build your taste profile.</p>
          )}
          <div className="flex gap-3 mt-3 pt-3 border-t border-zinc-800">
            <Link
              href={`/channels${activeChannelId && activeChannelId !== "all" ? `?select=${activeChannelId}` : ""}`}
              className="text-sm font-medium text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              Edit Channel
            </Link>
            <span className="text-zinc-700 text-sm select-none">·</span>
            <Link href="/channel-history" className="text-sm font-medium text-indigo-400 hover:text-indigo-300 transition-colors">Channel History</Link>
          </div>
        </div>

        </div>
      </div>

      {/* Fetch error with retry */}
      {fetchError && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 px-4 py-2.5 rounded-full bg-red-900 text-white text-sm shadow-lg">
          <span>{fetchError}</span>
          <button
            onClick={() => fetchNext({ mediaType, llm })}
            className="font-semibold underline underline-offset-2 hover:no-underline"
          >
            Retry
          </button>
        </div>
      )}

      {/* Lightbox */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 cursor-zoom-out"
          onClick={() => setLightboxUrl(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightboxUrl}
            alt="Poster"
            className="max-h-[90vh] max-w-[90vw] rounded-2xl shadow-2xl object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      <ConfirmDialog
        open={channelPendingDelete !== null}
        title="Delete channel"
        tone="danger"
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onCancel={() => setChannelPendingDelete(null)}
        onConfirm={confirmDeleteChannelFromHome}
      >
        {channelPendingDelete ? (
          <>
            Delete <span className="font-medium text-zinc-800">&quot;{channelPendingDelete.name}&quot;</span>? This
            cannot be undone.
          </>
        ) : null}
      </ConfirmDialog>
    </div>
  );
}
