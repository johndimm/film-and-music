/**
 * Overlap between Soundings channel rows and Trailer Vision channels:
 * every “tuning” channel uses these for LLM / discovery constraints.
 */
export type SharedChannelTuning = {
  genres: string[]
  timePeriods: string[]
  popularity: number
}
