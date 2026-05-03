"use client";

import {
  FullPageConstellations,
  FullPageConstellationsHostLoading,
  newChannelFromGraphNode,
  useFullPageConstellationsHost,
} from "@/app/lib/constellations/host";
import { takeEmbedHandoffForInitialState } from "@/app/lib/constellations/sessionHandoff";
import type { GraphNode } from "@/app/lib/constellations/types";
import { trailerVisionStorage } from "@/app/lib/platform";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

export default function TrailerVisionConstellationsClient() {
  const router = useRouter();
  const sp = useSearchParams();
  const [embedHandoff] = useState(() => takeEmbedHandoffForInitialState());
  const qParam = (sp.get("q") ?? "").trim();
  const expandParam = (sp.get("expand") ?? "").trim();

  const { ready, externalSearch, autoExpandTitles, nowPlayingKey } = useFullPageConstellationsHost({
    qParam,
    expandParam,
    skipUrlAndPlayerBridge: Boolean(embedHandoff),
  });

  if (!ready) {
    return <FullPageConstellationsHostLoading surface="in-layout" />;
  }

  return (
    <FullPageConstellations
      layout="below-app-chrome"
      hideHeader
      settingsHref="/trailer-visions/constellations/settings"
      closeHref="/trailer-visions"
      externalSearch={externalSearch}
      onExternalSearchConsumed={() => {}}
      autoExpandMatchTitles={autoExpandTitles}
      nowPlayingKey={nowPlayingKey}
      initialSession={embedHandoff}
      onNewChannelFromNode={(node: GraphNode) =>
        newChannelFromGraphNode(node, {
          sessionStorageKey: trailerVisionStorage.pendingConstellationsNewChannel,
          navigate: (path) => router.push(path),
          path: "/trailer-visions",
          logLabel: "trailer-vision-constellations",
        })
      }
    />
  );
}
