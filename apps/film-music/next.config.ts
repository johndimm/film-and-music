import type { NextConfig } from 'next'

/**
 * Proxies Spotify/OAuth and REST to the deployed Soundings app so this host can reuse the same APIs
 * without duplicating routes. Set in the film-music Vercel project to your production Soundings URL
 * (no trailing slash), e.g. https://film-and-music-xxxx.vercel.app
 */
function soundingsBackendOrigin(): string {
  const raw =
    process.env.FILM_MUSIC_BACKEND_URL ?? process.env.SOUNDINGS_APP_URL ?? ''
  return raw.replace(/\/$/, '').trim()
}

const nextConfig: NextConfig = {
  transpilePackages: ['@film-music/platform'],
  async redirects() {
    return [
      /** One landing (`/`); canonical Soundings URL is home, not a second splash under `/soundings`. */
      { source: '/soundings', destination: '/', permanent: true },
      { source: '/soundings/', destination: '/', permanent: true },
      { source: '/soundings/channels', destination: '/channels', permanent: false },
      { source: '/trailer-visions/channels', destination: '/channels', permanent: false },
    ]
  },
  async rewrites() {
    const origin = soundingsBackendOrigin()
    if (!origin) return []
    return [
      { source: '/api/:path*', destination: `${origin}/api/:path*` },
      { source: '/callback', destination: `${origin}/callback` },
      { source: '/callback/:path*', destination: `${origin}/callback/:path*` },
    ]
  },
}

export default nextConfig
