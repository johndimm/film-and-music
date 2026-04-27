import path from "path"
import { config as loadEnvFile } from "dotenv"
import type { NextConfig } from "next"

const monorepoRoot = path.join(__dirname, "../..")
loadEnvFile({ path: path.join(monorepoRoot, ".env") })
loadEnvFile({ path: path.join(monorepoRoot, ".env.local") })

const nextConfig: NextConfig = {
  transpilePackages: ["@film-music/constellations", "@film-music/taste-context", "@film-music/platform"],
  env: {
    VITE_ENABLE_WEB_SEARCH: process.env.VITE_ENABLE_WEB_SEARCH ?? process.env.NEXT_PUBLIC_ENABLE_WEB_SEARCH ?? "",
    VITE_ENABLE_ACADEMIC_CORPORA:
      process.env.VITE_ENABLE_ACADEMIC_CORPORA ?? process.env.NEXT_PUBLIC_ENABLE_ACADEMIC_CORPORA ?? "",
    VITE_CACHE_URL: process.env.VITE_CACHE_URL ?? process.env.NEXT_PUBLIC_VITE_CACHE_URL ?? "",
    VITE_GEMINI_MODEL: process.env.VITE_GEMINI_MODEL ?? process.env.NEXT_PUBLIC_GEMINI_MODEL ?? "",
    VITE_GEMINI_MODEL_CLASSIFY:
      process.env.VITE_GEMINI_MODEL_CLASSIFY ?? process.env.NEXT_PUBLIC_GEMINI_MODEL_CLASSIFY ?? "",
    VITE_API_KEY: process.env.VITE_API_KEY ?? process.env.NEXT_PUBLIC_GEMINI_API_KEY ?? "",
    VITE_GEMINI_API_KEY: process.env.VITE_GEMINI_API_KEY ?? process.env.NEXT_PUBLIC_GEMINI_API_KEY ?? "",
  },
}

export default nextConfig
