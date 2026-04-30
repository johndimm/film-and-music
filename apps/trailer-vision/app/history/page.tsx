"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import type { RatingEntry } from "../page";
import { StaticStars } from "../components/Stars";
import { migrateRatingValue } from "@film-music/taste-context";
import { starDelta, formatStarDelta } from "../lib/ratingDelta";
import {
  buildPresentationRows,
  normalizePassedStorage,
  trailerVisionStorage,
  type PassedRow,
  type PresentationHistorySeen,
  type PresentationRow,
} from "@film-music/platform";
import { Channel, normalizeChannel, CHANNELS_KEY } from "../channels/page";
import { loadUnseenInterestLog, type UnseenInterestEntry } from "../lib/unseenInterestLog";
import {
  reconsiderMoviePayloadFromPresentationRow,
  removePresentationRowFromStorage,
} from "../lib/presentationRemoval";

const STORAGE_KEY = trailerVisionStorage.history;
const PASSED_KEY = trailerVisionStorage.passed;
const RECONSIDER_KEY = trailerVisionStorage.reconsider;

type SortField = "when" | "title" | "channel";
type SortDir = "asc" | "desc";

function HistorySortBtn({
  field,
  label,
  sortField,
  sortDir,
  onPick,
}: {
  field: SortField;
  label: string;
  sortField: SortField;
  sortDir: SortDir;
  onPick: (field: SortField) => void;
}) {
  const active = sortField === field;
  return (
    <button
      type="button"
      onClick={() => onPick(field)}
      className={`flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
        active ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
      }`}
    >
      {label}
      {active && (
        <span className="text-xs opacity-80">{sortDir === "asc" ? "↑" : "↓"}</span>
      )}
    </button>
  );
}

function presentationSeenFromRating(e: RatingEntry): PresentationHistorySeen {
  const u = migrateRatingValue(e.userRating);
  const p = migrateRatingValue(e.predictedRating);
  return {
    title: e.title,
    type: e.type,
    userRating: u,
    predictedRating: p,
    rtScore: e.rtScore,
    channelId: e.channelId,
    posterUrl: e.posterUrl,
    ratedAt: e.ratedAt,
  };
}

export default function HistoryPage() {
  const router = useRouter();
  const [history, setHistory] = useState<RatingEntry[]>([]);
  const [unseenLog, setUnseenLog] = useState<UnseenInterestEntry[]>([]);
  const [passedRows, setPassedRows] = useState<PassedRow[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [sortField, setSortField] = useState<SortField>("when");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  useEffect(() => {
    queueMicrotask(() => {
      try {
        const h = localStorage.getItem(STORAGE_KEY);
        if (h) {
          const parsed = JSON.parse(h) as unknown;
          if (Array.isArray(parsed)) {
            setHistory(
              (parsed as RatingEntry[]).map((e) => {
                const u = migrateRatingValue(e.userRating);
                const p = migrateRatingValue(e.predictedRating);
                return { ...e, userRating: u, predictedRating: p, error: Math.abs(u - p) };
              })
            );
          }
        }
        setUnseenLog(loadUnseenInterestLog());
        const pRaw = localStorage.getItem(PASSED_KEY);
        try {
          setPassedRows(pRaw ? normalizePassedStorage(JSON.parse(pRaw)) : []);
        } catch {
          setPassedRows([]);
        }
        const ch = localStorage.getItem(CHANNELS_KEY);
        if (ch) setChannels((JSON.parse(ch) as Channel[]).map(normalizeChannel));
      } catch {}
    });
  }, []);

  const presentationSeen = useMemo(
    () => history.map((e) => presentationSeenFromRating(e)),
    [history],
  );

  const rows = useMemo(
    () =>
      buildPresentationRows({
        history: presentationSeen,
        unseenLog,
        passed: passedRows,
      }),
    [presentationSeen, unseenLog, passedRows],
  );

  const channelMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const ch of channels) m.set(ch.id, ch.name);
    return m;
  }, [channels]);

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      let cmp = 0;
      if (sortField === "when") {
        cmp = a.sortMs - b.sortMs;
      } else if (sortField === "title") {
        cmp = a.title.localeCompare(b.title);
      } else {
        const ca = channelMap.get(a.channelId ?? "") ?? "";
        const cb = channelMap.get(b.channelId ?? "") ?? "";
        cmp = ca.localeCompare(cb);
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [rows, sortField, sortDir, channelMap]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir(field === "when" || field === "title" ? "desc" : "asc");
    }
  };

  const openReconsider = (row: PresentationRow) => {
    const { removedInterest } = removePresentationRowFromStorage(row);
    const payload = reconsiderMoviePayloadFromPresentationRow(row, removedInterest);
    localStorage.setItem(RECONSIDER_KEY, JSON.stringify(payload));
    router.push("/");
  };

  const outcomeLabel = (row: PresentationRow) => {
    if (row.outcome === "seen") return "Seen";
    if (row.outcome === "interest") return row.interestKind === "want" ? "Interested" : "Not interested";
    return "Next only";
  };

  const outcomeTone = (row: PresentationRow) => {
    if (row.outcome === "seen") return "bg-red-500/15 text-red-800";
    if (row.outcome === "interest") return row.interestKind === "want" ? "bg-blue-500/15 text-blue-800" : "bg-zinc-200 text-zinc-700";
    return "bg-zinc-100 text-zinc-600";
  };

  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col items-center py-6 sm:py-10 px-4">
      <div className="w-full max-w-3xl space-y-4">
        <div className="flex items-baseline justify-between">
          <h1 className="text-xl font-bold text-zinc-900">History</h1>
          {rows.length > 0 && (
            <span className="text-sm text-zinc-400">
              {rows.length} title{rows.length === 1 ? "" : "s"} presented
            </span>
          )}
        </div>

        {rows.length === 0 ? (
          <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-8 text-center text-zinc-400 text-sm space-y-2">
            <p>Nothing yet. Every trailer card you advance past — rated or not — will show up here.</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
            <div className="flex flex-wrap items-center gap-1.5 px-4 py-3 border-b border-zinc-100 bg-zinc-50/80">
              <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mr-1">
                Sort
              </span>
              <HistorySortBtn field="when" label="When" sortField={sortField} sortDir={sortDir} onPick={toggleSort} />
              <HistorySortBtn field="title" label="Title" sortField={sortField} sortDir={sortDir} onPick={toggleSort} />
              <HistorySortBtn field="channel" label="Channel" sortField={sortField} sortDir={sortDir} onPick={toggleSort} />
            </div>

            <ul className="divide-y divide-zinc-50">
              {sorted.map((row) => {
                const chName = row.channelId ? channelMap.get(row.channelId) : undefined;
                return (
                  <li
                    key={row.key}
                    onClick={() => openReconsider(row)}
                    className="px-4 py-2.5 flex items-center gap-3 text-sm min-w-0 cursor-pointer hover:bg-zinc-50 active:bg-zinc-100 transition-colors"
                    title="Click to re-open on the player"
                  >
                    {row.posterUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={row.posterUrl}
                        alt={row.title}
                        referrerPolicy="no-referrer"
                        className="w-7 h-10 rounded object-cover flex-shrink-0"
                      />
                    ) : (
                      <div className="w-7 h-10 rounded bg-zinc-100 flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <span className="font-medium text-zinc-800 truncate block">{row.title}</span>
                      <div className="flex items-center gap-2 text-xs text-zinc-400 flex-wrap mt-0.5">
                        <span>{row.medium === "tv" ? "TV" : "Film"}</span>
                        {chName ? <span className="text-zinc-500">· {chName}</span> : null}
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${outcomeTone(row)}`}
                        >
                          {outcomeLabel(row)}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {row.outcome === "seen" &&
                        row.userRating != null &&
                        row.predictedRating != null && (
                          <>
                            <span
                              className={`w-12 text-right tabular-nums text-sm font-semibold ${
                                starDelta(row.userRating, row.predictedRating) > 0
                                  ? "text-emerald-700"
                                  : starDelta(row.userRating, row.predictedRating) < 0
                                    ? "text-rose-700"
                                    : "text-zinc-500"
                              }`}
                              title="Your rating minus predicted"
                            >
                              {formatStarDelta(starDelta(row.userRating, row.predictedRating))}
                            </span>
                            <div className="w-20 flex justify-end">
                              <StaticStars rating={row.userRating} color="red" />
                            </div>
                          </>
                        )}
                      {row.outcome === "interest" &&
                        row.interestStars != null &&
                        migrateRatingValue(row.interestStars) > 0 && (
                          <div className="w-20 flex justify-end">
                            <StaticStars rating={migrateRatingValue(row.interestStars)} color="blue" />
                          </div>
                        )}
                      {(row.outcome === "pass" || (row.outcome === "interest" && migrateRatingValue(row.interestStars ?? 0) <= 0)) && (
                        <span className="text-xs tabular-nums text-zinc-400 w-20 text-right">—</span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
