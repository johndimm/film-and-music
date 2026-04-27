import path from 'path'
import type { NextConfig } from 'next'

const pkgs = path.resolve(__dirname, '../../packages')
const webpackAliases = {
  '@film-music/platform': path.join(pkgs, 'film-music-platform/src'),
}

/** Ensures .env.local values are visible to server + client bundles after `next dev` / `next build`. */
const nextConfig: NextConfig = {
  transpilePackages: ['@film-music/constellations', '@film-music/taste-context', '@film-music/platform'],
  // Turbopack (Next.js 16 default): relative paths from apps/sounding/.
  turbopack: {
    resolveAlias: {
      '@film-music/platform': '../../packages/film-music-platform/src',
    },
  },
  // Webpack fallback (used by Vercel production builds and `next build --webpack`).
  webpack(config) {
    config.resolve.alias = { ...config.resolve.alias, ...webpackAliases }
    return config
  },
  env: {
    YOUTUBE_RESOLVE_TEST: process.env.YOUTUBE_RESOLVE_TEST ?? '',
    NEXT_PUBLIC_YOUTUBE_RESOLVE_TEST: process.env.NEXT_PUBLIC_YOUTUBE_RESOLVE_TEST ?? '',
    /** Server: opt-in extra videos.list after search (see app/lib/youtube.ts). */
    YOUTUBE_EMBED_CHECK: process.env.YOUTUBE_EMBED_CHECK ?? '',
    YOUTUBE_SKIP_VIDEOS_LIST: process.env.YOUTUBE_SKIP_VIDEOS_LIST ?? '',
    /** Pass through to @film-music/constellations (see `readBundledEnv` / `getEnvVar`). */
    VITE_ENABLE_WEB_SEARCH: process.env.VITE_ENABLE_WEB_SEARCH ?? process.env.NEXT_PUBLIC_ENABLE_WEB_SEARCH ?? '',
    VITE_ENABLE_ACADEMIC_CORPORA:
      process.env.VITE_ENABLE_ACADEMIC_CORPORA ?? process.env.NEXT_PUBLIC_ENABLE_ACADEMIC_CORPORA ?? '',
    VITE_CACHE_URL: process.env.VITE_CACHE_URL ?? process.env.NEXT_PUBLIC_VITE_CACHE_URL ?? '',
    VITE_GEMINI_MODEL: process.env.VITE_GEMINI_MODEL ?? process.env.NEXT_PUBLIC_GEMINI_MODEL ?? '',
    VITE_GEMINI_MODEL_CLASSIFY:
      process.env.VITE_GEMINI_MODEL_CLASSIFY ?? process.env.NEXT_PUBLIC_GEMINI_MODEL_CLASSIFY ?? '',
    VITE_API_KEY: process.env.VITE_API_KEY ?? process.env.NEXT_PUBLIC_GEMINI_API_KEY ?? '',
    VITE_GEMINI_API_KEY: process.env.VITE_GEMINI_API_KEY ?? process.env.NEXT_PUBLIC_GEMINI_API_KEY ?? '',
  },
}

export default nextConfig
