import type { NextConfig } from 'next'
import path from 'path'

// `next build` runs with cwd = the app directory (apps/sounding).
// We add fallbacks for the workspace-hoisted node_modules so webpack can
// always find dependencies regardless of where npm placed them.
const appDir = process.cwd()
const repoRoot = path.resolve(appDir, '../..')

const nextConfig: NextConfig = {
  transpilePackages: [],

  webpack: (config) => {
    const existing: string[] = Array.isArray(config.resolve.modules) ? config.resolve.modules : []
    const fallbacks = [
      path.join(appDir, 'node_modules'),
      path.join(repoRoot, 'node_modules'),
      'node_modules',
    ]
    config.resolve.modules = Array.from(new Set([...existing, ...fallbacks]))
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
