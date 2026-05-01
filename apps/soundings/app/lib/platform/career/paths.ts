/** App Router API paths for career / filmography features (relative to origin). */
export const CAREER_API = {
  /** Soundings — Haiku discography JSON */
  musicDiscography: '/api/career-discography',
  /** Trailer Vision — TMDB person + combined credits */
  trailerPerson: '/api/career',
  /** Trailer Vision — single title detail for current career step */
  trailerMovie: '/api/career/movie',
} as const
