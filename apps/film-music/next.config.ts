import type { NextConfig } from 'next'

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
}

export default nextConfig
