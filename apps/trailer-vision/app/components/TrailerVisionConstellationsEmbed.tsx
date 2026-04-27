"use client";

import dynamic from "next/dynamic";
import { Suspense, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import "@film-music/constellations/index.css";
import { SOUNDINGS_CONSTELLATIONS_HANDOFF_KEY } from "@film-music/constellations/sessionHandoff";
import type { GraphNode } from "@film-music/constellations/types";

const ConstellationsApp = dynamic(
  () => import("@film-music/constellations/App"),
  { ssr: false }
);

function Inner({
  nowPlayingKey,
  autoExpandMatchTitles,
  externalSearch,
  onNewChannelFromNode,
}: {
  nowPlayingKey: string | null;
  autoExpandMatchTitles: string[];
  externalSearch: { term: string; id: string | number } | null;
  onNewChannelFromNode?: (node: GraphNode) => void;
}) {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
  }, []);

  if (!hydrated) {
    return (
      <div className="flex h-[min(75vh,900px)] min-h-[320px] w-full items-center justify-center bg-slate-950 text-sm text-slate-400">
        Loading graph…
      </div>
    );
  }

  return (
    <div className="relative h-[min(75vh,900px)] w-full min-h-[480px] overflow-hidden">
      <ConstellationsApp
        embedded
        hideHeader
        hideControlPanel
        showExtensionWhenPanelHidden={false}
        hideSidebar
        externalSearch={externalSearch}
        onExternalSearchConsumed={() => {}}
        autoExpandMatchTitles={autoExpandMatchTitles}
        nowPlayingKey={nowPlayingKey}
        onNewChannelFromNode={onNewChannelFromNode}
      />
    </div>
  );
}

/**
 * Constellations graph under the main trailer / poster block — same package as Soundings, props-driven
 * (no now-playing bridge).
 */
export default function TrailerVisionConstellationsEmbed({
  nowPlayingKey,
  autoExpandMatchTitles,
  externalSearch,
  onNewChannelFromNode,
}: {
  nowPlayingKey: string | null;
  autoExpandMatchTitles: string[];
  externalSearch: { term: string; id: string | number } | null;
  onNewChannelFromNode?: (node: GraphNode) => void;
}) {
  const router = useRouter();

  return (
    <div id="trailer-vision-constellations" className="w-full shrink-0">
      <div className="mx-auto w-full max-w-[800px] px-4 pb-4 pt-3">
        <h2 className="text-sm font-semibold tracking-tight text-zinc-300">Graph</h2>
        <p className="mb-2 mt-0.5 text-xs text-zinc-500">
          Compact graph preview. The{" "}
          <span className="text-zinc-400">Constellations</span> tab in the nav is the full
          app (search, save/load, details panel), or{" "}
          <button
            type="button"
            className="cursor-pointer border-0 bg-transparent p-0 font-inherit text-xs text-emerald-400/90 underline hover:text-emerald-300"
            onClick={() => {
              try {
                const fn = (
                  window as { __soundingsConstellationsGetHandoff?: () => unknown }
                ).__soundingsConstellationsGetHandoff;
                if (typeof fn === "function") {
                  const payload = fn();
                  if (payload && typeof payload === "object" && (payload as { v?: number }).v === 1) {
                    const g = (payload as { graph?: { nodes?: unknown[] } }).graph;
                    if (g?.nodes?.length) {
                      try {
                        sessionStorage.setItem(
                          SOUNDINGS_CONSTELLATIONS_HANDOFF_KEY,
                          JSON.stringify(payload)
                        );
                      } catch (e) {
                        console.warn("[constellations] handoff too large for sessionStorage", e);
                      }
                    }
                  }
                }
              } catch (e) {
                console.warn("[constellations] handoff", e);
              }
              router.push("/constellations");
            }}
          >
            continue with this graph
          </button>
          .
        </p>
        <Suspense
          fallback={
            <div className="flex h-[min(75vh,900px)] min-h-[320px] w-full items-center justify-center bg-slate-950 text-sm text-slate-400">
              Loading graph…
            </div>
          }
        >
          <Inner
            nowPlayingKey={nowPlayingKey}
            autoExpandMatchTitles={autoExpandMatchTitles}
            externalSearch={externalSearch}
            onNewChannelFromNode={onNewChannelFromNode}
          />
        </Suspense>
      </div>
    </div>
  );
}
