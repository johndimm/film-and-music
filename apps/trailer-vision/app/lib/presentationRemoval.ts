"use client";

import type { PresentationRow } from "@film-music/platform";
import { normalizePassedStorage, trailerVisionStorage } from "@film-music/platform";
import { migrateRatingValue } from "@film-music/taste-context";
import { loadUnseenInterestLog, type UnseenInterestEntry, UNSEEN_INTEREST_LOG_KEY } from "./unseenInterestLog";

const STORAGE_KEY = trailerVisionStorage.history;
const PASSED_KEY = trailerVisionStorage.passed;
const SKIPPED_KEY = trailerVisionStorage.skipped;
const WATCHLIST_KEY = trailerVisionStorage.watchlist;
const NOT_INTERESTED_KEY = trailerVisionStorage.notInterested;
const NOTSEEN_KEY = trailerVisionStorage.notseen;

interface NotSeenEvent {
  afterRating: number;
  kind: "want" | "skip";
}

function stripLastSkippedTitle(skipped: string[], title: string): string[] {
  const idx = skipped.lastIndexOf(title);
  if (idx < 0) return skipped;
  return skipped.filter((_, i) => i !== idx);
}

/**
 * Removes one presentation row from the appropriate localStorage structures.
 * For `interest`, returns the removed log entry so the caller can build RECONSIDER.
 */
export function removePresentationRowFromStorage(row: PresentationRow): {
  removedInterest?: UnseenInterestEntry;
} {
  if (typeof window === "undefined") return {};

  const prov = row.provenance;
  if (prov.kind === "seen") {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    let list: unknown;
    try {
      list = JSON.parse(raw) as unknown;
    } catch {
      return {};
    }
    if (!Array.isArray(list)) return {};
    const next = list.filter((_, i) => i !== prov.historyIndex);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    return {};
  }

  if (prov.kind === "pass") {
    const raw = localStorage.getItem(PASSED_KEY);
    let passed = normalizePassedStorage(raw ? JSON.parse(raw) : []);
    passed = passed.filter((_, i) => i !== prov.passIndex);
    localStorage.setItem(PASSED_KEY, JSON.stringify(passed));
    return {};
  }

  const log = loadUnseenInterestLog();
  const idx = prov.unseenIndex;
  if (idx < 0 || idx >= log.length) return {};
  const removed = log[idx];
  const newLog = log.filter((_, i) => i !== idx);
  localStorage.setItem(UNSEEN_INTEREST_LOG_KEY, JSON.stringify(newLog));

  try {
    const nsRaw = localStorage.getItem(NOTSEEN_KEY);
    const ns: NotSeenEvent[] = nsRaw ? JSON.parse(nsRaw) : [];
    if (idx < ns.length) {
      const nn = ns.filter((_, i) => i !== idx);
      localStorage.setItem(NOTSEEN_KEY, JSON.stringify(nn));
    }
  } catch {
    /* ignore */
  }

  try {
    if (removed.kind === "want") {
      const wlRaw = localStorage.getItem(WATCHLIST_KEY);
      const wl: { title: string }[] = wlRaw ? JSON.parse(wlRaw) : [];
      const nextWl = wl.filter((w) => w.title !== removed.title);
      localStorage.setItem(WATCHLIST_KEY, JSON.stringify(nextWl));
    }
    if (removed.kind === "skip") {
      const niRaw = localStorage.getItem(NOT_INTERESTED_KEY);
      const ni: { title: string }[] = niRaw ? JSON.parse(niRaw) : [];
      const nextNi = ni.filter((x) => x.title !== removed.title);
      localStorage.setItem(NOT_INTERESTED_KEY, JSON.stringify(nextNi));
    }
    const skRaw = localStorage.getItem(SKIPPED_KEY);
    const skipped: string[] = skRaw ? JSON.parse(skRaw) : [];
    localStorage.setItem(SKIPPED_KEY, JSON.stringify(stripLastSkippedTitle(skipped, removed.title)));
  } catch {
    /* ignore */
  }

  return { removedInterest: removed };
}

/** Payload shape expected by home page RECONSIDER_KEY */
export function reconsiderMoviePayloadFromPresentationRow(row: PresentationRow, removedInterest?: UnseenInterestEntry): Record<string, unknown> {
  if (row.outcome === "seen") {
    return {
      title: row.title,
      type: row.medium,
      year: null,
      director: null,
      predictedRating: migrateRatingValue(row.predictedRating ?? 3),
      actors: [],
      plot: "",
      posterUrl: row.posterUrl ?? null,
      trailerKey: null,
      rtScore: row.rtScore ?? null,
    };
  }
  if (row.outcome === "interest" && removedInterest) {
    const e = removedInterest;
    const pr = migrateRatingValue(e.interestStars);
    return {
      title: e.title,
      type: e.type,
      year: e.year,
      director: e.director,
      predictedRating: pr,
      actors: e.actors ?? [],
      plot: e.plot ?? "",
      posterUrl: e.posterUrl,
      trailerKey: null,
      rtScore: e.rtScore ?? null,
    };
  }
  return {
    title: row.title,
    type: row.medium,
    year: null,
    director: null,
    predictedRating: 3,
    actors: [],
    plot: "",
    posterUrl: row.posterUrl ?? null,
    trailerKey: null,
    rtScore: row.rtScore ?? null,
  };
}
