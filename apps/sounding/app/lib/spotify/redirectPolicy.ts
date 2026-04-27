/**
 * Spotify has tightened redirect URI rules: `localhost` and non-HTTPS non-loopback
 * URIs are rejected as unsafe. See:
 * https://developer.spotify.com/documentation/web-api/tutorials/migration-insecure-redirect-uri
 */
export function spotifyRedirectUriPolicyMessage(uri: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(uri)
  } catch {
    return 'SPOTIFY_REDIRECT_URI is not a valid URL.'
  }

  const host = parsed.hostname.toLowerCase()
  if (host === 'localhost') {
    return (
      'Spotify treats http://localhost/... as unsafe. Use the loopback IP instead, e.g. ' +
      'http://127.0.0.1:3000/callback (match port and path to your app). ' +
      'Add that exact URI in the Spotify Developer Dashboard, and set the same value in .env.local.'
    )
  }

  if (parsed.protocol === 'http:' && host !== '127.0.0.1' && host !== '::1' && host !== '[::1]') {
    return (
      'HTTP is only allowed for loopback (127.0.0.1 or ::1). For a public host, use HTTPS and register that redirect URI in the dashboard.'
    )
  }

  return null
}
