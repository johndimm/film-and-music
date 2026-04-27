import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  transpilePackages: ['@film-music/platform'],
  async redirects() {
    return [
      { source: '/soundings/channels', destination: '/channels', permanent: false },
      { source: '/trailer-visions/channels', destination: '/channels', permanent: false },
    ]
  },
}

export default nextConfig
