import { NextRequest, NextResponse } from 'next/server'
import { soundingsStorage } from '@/app/lib/platform'
import { preferredRedirectOrigin } from '@/app/lib/baseUrl'

const YOUTUBE_MODE_COOKIE = soundingsStorage.youtubeModeCookie

export async function GET(req: NextRequest) {
  const base = preferredRedirectOrigin(req.nextUrl.origin)
  const target = new URL('/player', base)
  // Symmetric with the Spotify callback's `?spotify_login=1`: signals to the client that
  // this is a fresh YouTube login, so leftover Spotify-era localStorage (source field,
  // per-channel queues full of Spotify tracks) should be reset.
  target.searchParams.set('youtube_login', '1')
  const response = NextResponse.redirect(target, { status: 303 })
  response.cookies.set(YOUTUBE_MODE_COOKIE, '1', {
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  })
  return response
}
