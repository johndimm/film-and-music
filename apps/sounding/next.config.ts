import type { NextConfig } from 'next'

/** 
 * Turbopack (Next.js 16 default) requires relative strings starting with ../ or ./ 
 * for aliases to avoid "server relative import" errors. 
 */
const nextConfig: NextConfig = {
  transpilePackages: ['@film-music/constellations', '@film-music/taste-context', '@film-music/platform'],
  
  turbopack: {
    resolveAlias: {
      '@film-music/constellations': '../../packages/constellations',
      '@film-music/taste-context': '../../packages/taste-context',
      '@film-music/platform': '../../packages/film-music-platform/src',
    },
  },

  webpack(config) {
    config.resolve.alias = {
      ...config.resolve.alias,
      '@film-music/constellations': '../../packages/constellations',
      '@film-music/taste-context': '../../packages/taste-context',
      '@film-music/platform': '../../packages/film-music-platform/src',
    }
    return config
  },

  env: {
    YOUTUBE_RESOLVE_TEST: process.env.YOUTUBE_RESOLVE_TEST ?? '',
    NEXT_PUBLIC_YOUTUBE_RESOLVE_TEST: process.env.NEXT_PUBLIC_YOUTUBE_RESOLVE_TEST ?? '',
    YOUTUBE_EMBED_CHECK: process.env.YOUTUBE_EMBED_CHECK ?? '',
    YOUTUBE_SKIP_VIDEOS_LIST: process.env.YOUTUBE_SKIP_VIDEOS_LIST ?? '',
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
