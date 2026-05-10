/**
 * Canonical base URL for the app — derived from SPOTIFY_REDIRECT_URI so that
 * localhost vs 127.0.0.1 inconsistencies don't break cookie auth.
 *
 * e.g. SPOTIFY_REDIRECT_URI = http://127.0.0.1:8000/callback → http://127.0.0.1:8000
 */
export function getBaseUrl(): string {
  const redirectUri = process.env.SPOTIFY_REDIRECT_URI
  if (redirectUri) {
    try {
      return new URL(redirectUri).origin
    } catch {}
  }
  return ''
}

function loopbackHostname(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname === '[::1]'
  )
}

/**
 * Uses `req.nextUrl.origin` for same-port loopback redirects so browsing `localhost` is not
 * snapped to `127.0.0.1` (or vice versa) when `SPOTIFY_REDIRECT_URI` still uses the other host.
 * Non-loopback stays on env origin for stable production URLs.
 */
export function preferredRedirectOrigin(requestOrigin: string): string {
  const fromEnv = getBaseUrl()
  if (!fromEnv) return requestOrigin
  try {
    const reqUrl = new URL(requestOrigin)
    const envUrl = new URL(fromEnv)
    const sameLoopbackPorts =
      loopbackHostname(reqUrl.hostname) &&
      loopbackHostname(envUrl.hostname) &&
      reqUrl.port === envUrl.port
    if (sameLoopbackPorts) return requestOrigin
  } catch {
    // fall through to env origin
  }
  return fromEnv
}
