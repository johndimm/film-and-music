import { NextRequest, NextResponse } from 'next/server'
import { storeSpotifyTokensInResponse, type SpotifyTokenResponse } from '@/app/lib/spotify/tokens'
import { spotifyRedirectUriPolicyMessage } from '@/app/lib/spotify/redirectPolicy'
import { soundingsStorage } from '@/app/lib/platform'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const code = searchParams.get('code')
  const error = searchParams.get('error')

  // Never swap localhost ↔ 127.0.0.1 here — Set-Cookie is scoped to the host Spotify actually
  // redirected the browser to, and it must match `SPOTIFY_REDIRECT_URI`. Use this origin only.
  const baseUrl = req.nextUrl.origin

  if (error || !code) {
    return Response.redirect(`${baseUrl}/?error=spotify_auth_failed`, 302)
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID?.trim()
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET?.trim()
  const redirectUri = process.env.SPOTIFY_REDIRECT_URI?.trim()

  if (!clientId || !clientSecret || !redirectUri) {
    console.error('callback: missing spotify credentials', {
      hasId: !!clientId,
      hasSecret: !!clientSecret,
      hasRedirect: !!redirectUri,
    })
    return Response.redirect(`${baseUrl}/?error=spotify_config_missing`, 302)
  }

  const policy = spotifyRedirectUriPolicyMessage(redirectUri)
  if (policy) {
    console.error('callback: invalid SPOTIFY_REDIRECT_URI policy', policy)
    return Response.redirect(`${baseUrl}/?error=spotify_redirect_uri_config`, 302)
  }

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: code!,
    redirect_uri: redirectUri,
  })

  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
    },
    body,
  })

  if (!response.ok) {
    const errBody = await response.text().catch(() => '')
    console.error('callback: token exchange failed', { status: response.status, body: errBody })
    return Response.redirect(`${baseUrl}/?error=token_exchange_failed`, 302)
  }

  const tokens = (await response.json()) as SpotifyTokenResponse & { scope?: string }
  const requestIsHttps = req.nextUrl.protocol === 'https:'
  console.info('callback: token exchange result', {
    has_access_token: Boolean(tokens.access_token),
    has_refresh_token: Boolean(tokens.refresh_token),
    expires_in: tokens.expires_in,
    scope: tokens.scope,
  })

  // `?spotify_login=1` signals to the client that the user just completed Spotify auth,
  // so it can reset any leftover YouTube-mode localStorage (the source field, per-channel
  // queues populated with YouTube tracks, etc.) and then strip the query parameter.
  const redirectUrl = new URL('/player', baseUrl)
  redirectUrl.searchParams.set('spotify_login', '1')
  const res = NextResponse.redirect(redirectUrl, {
    status: 302,
    headers: { 'Cache-Control': 'no-store' },
  })
  // Single Set-Cookie path on the redirect response (avoids duplicate / merge quirks with cookies()).
  storeSpotifyTokensInResponse(res.cookies, tokens, requestIsHttps)
  // Selecting "Login with Spotify" is an explicit vote for Spotify mode — clear the
  // YouTube-only marker so we don't fight the user's intent (landing page, player-page
  // gate, layout seeding all key off this cookie).
  res.cookies.set(soundingsStorage.youtubeModeCookie, '', {
    path: '/',
    maxAge: 0,
  })
  console.info('callback: cookies set on redirect response → /player?spotify_login=1')
  return res
}
