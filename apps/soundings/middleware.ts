import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

/**
 * Legacy `/soundings` → home at `/` (preserves query e.g. `?error=`).
 * Avoids a separate `app/soundings/` route folder next to the `soundings` app package name.
 */
export function middleware(request: NextRequest) {
  const url = request.nextUrl.clone()
  url.pathname = '/'
  return NextResponse.redirect(url)
}

export const config = {
  matcher: ['/soundings', '/soundings/'],
}
