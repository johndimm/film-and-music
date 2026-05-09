import type { NextConfig } from 'next'
import { createRequire } from 'node:module'
import path from 'path'
import { fileURLToPath } from 'node:url'

// Anchor paths to this file. process.cwd() is not reliable on Vercel (can be the monorepo
// root when `npm run -w` is used, which breaks ../.. math for node_modules).
const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '../..')
const requireFromHere = createRequire(import.meta.url)

function resolveLucideDir(): string {
  const searchRoots = [here, repoRoot]
  for (const root of searchRoots) {
    try {
      return path.dirname(
        requireFromHere.resolve('lucide-react/package.json', { paths: [root] }),
      )
    } catch {
      /* try next */
    }
  }
  throw new Error(
    'lucide-react is not installed. On Vercel, set Root Directory to the monorepo root, ' +
      'or add apps/soundings/vercel.json (install from repo root) as documented in vercel.json.',
  )
}

const nextConfig: NextConfig = {
  transpilePackages: [],

  /**
   * `http://127.0.0.1` and `http://localhost` differ by Origin hostname. Dev-only `/_next/*`
   * checks compare **`hostname` only** (no port): `allowedDevOrigins` must include `127.0.0.1`,
   * not `127.0.0.1:3000`, or alternate-host requests stay blocked.
   * @see https://nextjs.org/docs/app/api-reference/config/next-config-js/allowedDevOrigins
   */
  allowedDevOrigins: ['127.0.0.1'],

  outputFileTracingRoot: repoRoot,

  async redirects() {
    return [{ source: '/logs', destination: '/trailer-visions/logs', permanent: false }]
  },

  ...(process.env.NODE_ENV === 'development'
    ? {
        /**
         * YouTube probes compute-pressure from nested scripts; declaring it on top-level avoids
         * noisy devtools “Permissions policy violation” lines (harmless playback-wise).
         */
        async headers() {
          return [
            {
              source: '/(.*)',
              headers: [{ key: 'Permissions-Policy', value: 'compute-pressure=*' }],
            },
          ]
        },
      }
    : {}),

  webpack: (config) => {
    config.resolve = config.resolve ?? {}
    const lucideDir = resolveLucideDir()
    config.resolve.alias = {
      ...config.resolve.alias,
      'lucide-react': lucideDir,
    }
    const existing: string[] = Array.isArray(config.resolve.modules) ? config.resolve.modules : []
    const fallbacks = [path.join(here, 'node_modules'), path.join(repoRoot, 'node_modules'), 'node_modules']
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
