import { NextRequest, NextResponse } from 'next/server'
import { clearSpotifyTokensFromResponse } from '@/app/lib/spotify/tokens'
import { preferredRedirectOrigin } from '@/app/lib/baseUrl'
import { soundingsStorage } from '@/app/lib/platform'

export async function GET(req: NextRequest) {
  const base = preferredRedirectOrigin(req.nextUrl.origin)
  const url = new URL('/', base)
  const response = NextResponse.redirect(url, { status: 302 })
  clearSpotifyTokensFromResponse(response.cookies, req.nextUrl.protocol === 'https:')
  // Also forget YouTube-only mode so logging out always returns users to the landing picker,
  // regardless of how they signed in.
  response.cookies.set(soundingsStorage.youtubeModeCookie, '', { path: '/', maxAge: 0 })
  return response
}
