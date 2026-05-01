/**
 * Trailers / TMDB: walk an actor or director’s filmography (chronological).
 * See `apps/trailer-vision/app/api/career/route.ts` and `app/page.tsx` career mode.
 */
export type TrailerCareerFilm = {
  tmdbId: number
  title: string
  year: number | null
  type: 'movie' | 'tv'
  posterUrl: string | null
}

export type TrailerCareerMode = {
  personName: string
  role: 'actor' | 'director'
  films: TrailerCareerFilm[]
  index: number
}

/**
 * Music: LLM-built discography (Soundings), aligned with
 * `apps/soundings/app/api/career-discography/route.ts`.
 */
export type MusicCareerWork = {
  title: string
  year: number
  search: string
  reason?: string
  isCurrent?: boolean
}

export type MusicCareerMode = {
  artistName: string
  works: MusicCareerWork[]
  currentIndex: number
}
