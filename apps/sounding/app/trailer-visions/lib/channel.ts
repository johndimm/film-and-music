import { type SharedChannelTuning, trailerVisionChannelIds, trailerVisionStorage } from "@/app/lib/platform";

export type ChannelMedium = "movie" | "tv";

const VALID_MEDIUMS = new Set<ChannelMedium>(["movie", "tv"]);

export interface Channel extends SharedChannelTuning {
  id: string;
  name: string;
  mediums: ChannelMedium[];
  language: string;
  artists: string;
  freeText: string;
}

export function normalizeChannel(c: Channel & { region?: string }): Channel {
  const { region: _r, ...rest } = c;
  const raw = (c as { mediums?: unknown }).mediums;
  const mediums = Array.isArray(raw)
    ? raw.filter((x): x is ChannelMedium => typeof x === "string" && VALID_MEDIUMS.has(x as ChannelMedium))
    : [];
  return { ...rest, mediums };
}

export function channelToFormInitial(ch: Channel): Omit<Channel, "id"> {
  const { id: _id, ...rest } = normalizeChannel(ch);
  return rest;
}

export const CHANNELS_KEY = trailerVisionStorage.channels;
export const ACTIVE_CHANNEL_KEY = trailerVisionStorage.activeChannel;

export const ALL_CHANNEL: Channel = {
  id: trailerVisionChannelIds.all,
  name: "All",
  mediums: [],
  genres: [],
  timePeriods: [],
  language: "",
  artists: "",
  freeText: "",
  popularity: 50,
};

export function popularityLabel(n: number): string {
  if (n <= 15) return "Hidden gems only";
  if (n <= 35) return "Mostly obscure";
  if (n <= 45) return "Lean obscure";
  if (n <= 55) return "Balanced";
  if (n <= 65) return "Lean mainstream";
  if (n <= 85) return "Mostly mainstream";
  return "Mainstream only";
}
