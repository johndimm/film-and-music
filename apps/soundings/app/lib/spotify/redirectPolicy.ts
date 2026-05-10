/**
 * Spotify requires HTTPS for public origins; plain HTTP is only allowed on loopback.
 * Prefer `http://localhost:PORT/callback` in dev — matches `npm run dev` host and plays
 * nicer with YouTube embeds than `127.0.0.1`. `127.0.0.1` remains valid if your dashboard URI uses it.
 */
export function spotifyRedirectUriPolicyMessage(uri: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(uri)
  } catch {
    return 'SPOTIFY_REDIRECT_URI is not a valid URL.'
  }

  const host = parsed.hostname.toLowerCase()
  const isLoopback =
    host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]'

  if (parsed.protocol === 'http:' && !isLoopback) {
    return (
      'HTTP is only allowed on loopback (localhost, 127.0.0.1, or ::1). For a public host, use HTTPS ' +
      'and register that redirect URI in the Spotify Developer Dashboard.'
    )
  }

  return null
}
