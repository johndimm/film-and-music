import { NextRequest, NextResponse } from 'next/server'
import { spotifyRedirectUriPolicyMessage } from '@/app/lib/spotify/redirectPolicy'

const SCOPES = [
  'streaming',
  'user-read-email',
  'user-read-private',
  'user-modify-playback-state',
  'user-read-playback-state',
].join(' ')

export const dynamic = 'force-dynamic'

/**
 * Spotify OAuth. By default we do NOT send `prompt=consent` — that forces the full consent
 * screen every time and feels broken on repeat logins. Use `?consent=1` when you need a fresh
 * refresh token or re-authorization (Spotify may omit refresh_token on re-auth without it).
 */
export async function GET(req: NextRequest) {
  const clientId = process.env.SPOTIFY_CLIENT_ID?.trim()
  const redirectUri = process.env.SPOTIFY_REDIRECT_URI?.trim()
  if (!clientId || !redirectUri) {
    const missing: string[] = []
    if (!clientId) missing.push('SPOTIFY_CLIENT_ID')
    if (!redirectUri) missing.push('SPOTIFY_REDIRECT_URI')
    return new NextResponse(
      `Spotify login is not configured. Set ${missing.join(' and ')} in a .env file:\n` +
        `  • apps/soundings/.env.local  (or)\n` +
        `  • .env.local at the monorepo root (next to package.json)\n` +
        `Copy apps/soundings/.env.example to one of those paths and add your Spotify app values. ` +
        `Register the same SPOTIFY_REDIRECT_URI in the Spotify Developer Dashboard (use http://127.0.0.1:3000/callback for local dev, not localhost). ` +
        `Restart the dev server after saving.`,
      { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8' } }
    )
  }

  const policy = spotifyRedirectUriPolicyMessage(redirectUri)
  if (policy) {
    return new NextResponse(policy, { status: 400, headers: { 'content-type': 'text/plain; charset=utf-8' } })
  }

  const state = crypto.randomUUID()
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    scope: SCOPES,
    redirect_uri: redirectUri,
    state,
  })

  const forceConsent = req.nextUrl.searchParams.get('consent') === '1'
  if (forceConsent) {
    params.set('prompt', 'consent')
  }

  return NextResponse.redirect(`https://accounts.spotify.com/authorize?${params}`)
}
