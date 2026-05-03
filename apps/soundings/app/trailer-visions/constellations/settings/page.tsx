'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import NavBar from '../../components/NavBar'
import {
  CONSTELLATIONS_GEMINI_MODEL_KEY,
  GEMINI_MODEL_OPTIONS,
  DEFAULT_GEMINI_MODEL,
} from '@/app/lib/constellations/services/aiUtils'
import { SOUNDINGS_CONSTELLATIONS_SAVED_KEY } from '@/app/lib/constellations/sessionHandoff'

export default function TrailerVisionConstellationsSettingsPage() {
  const router = useRouter()
  const [model, setModel] = useState(DEFAULT_GEMINI_MODEL)
  const [mounted, setMounted] = useState(false)
  const [clearConfirm, setClearConfirm] = useState(false)

  useEffect(() => {
    try {
      const saved = localStorage.getItem(CONSTELLATIONS_GEMINI_MODEL_KEY)
      if (saved) setModel(saved)
    } catch {}
    setMounted(true)
  }, [])

  const handleModelChange = (value: string) => {
    setModel(value)
    try {
      localStorage.setItem(CONSTELLATIONS_GEMINI_MODEL_KEY, value)
    } catch {}
  }

  const handleClearGraph = () => {
    try {
      localStorage.removeItem(SOUNDINGS_CONSTELLATIONS_SAVED_KEY)
    } catch {}
    router.push('/trailer-visions/constellations')
  }

  if (!mounted) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex flex-col">
        <NavBar />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col">
      <NavBar />

      <div className="flex-1 p-6 max-w-[800px] mx-auto w-full flex flex-col gap-10">

        <div className="flex items-center gap-3">
          <a
            href="/trailer-visions/constellations"
            className="text-sm text-zinc-400 hover:text-white transition-colors"
          >
            ← Back to Graph
          </a>
          <h1 className="text-lg font-semibold text-white">Graph Settings</h1>
        </div>

        <hr className="border-zinc-800" />

        {/* LLM Model */}
        <section className="flex flex-col gap-3">
          <div>
            <h2 className="text-sm font-semibold text-zinc-100">Graph Model</h2>
            <p className="text-xs text-zinc-500 mt-0.5">The Gemini model used to build the knowledge graph.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {GEMINI_MODEL_OPTIONS.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleModelChange(opt.value)}
                className={`px-4 py-2 rounded-lg border text-sm transition-colors ${
                  model === opt.value
                    ? 'bg-white text-black border-white'
                    : 'bg-zinc-900 text-zinc-300 border-zinc-700 hover:border-zinc-500 hover:text-white'
                }`}
              >
                {opt.label}
                <span className="ml-1.5 text-xs opacity-60">{opt.sub}</span>
              </button>
            ))}
          </div>
        </section>

        <hr className="border-zinc-800" />

        {/* Clear graph */}
        <section className="flex flex-col gap-3">
          <div>
            <h2 className="text-sm font-semibold text-zinc-100">Clear Graph</h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              Remove the saved graph from this browser. The graph will start fresh next time you open Graph.
            </p>
          </div>
          <div>
            <button
              type="button"
              onClick={() => setClearConfirm(true)}
              className="px-4 py-2 rounded-lg border border-red-800 text-red-400 text-sm hover:bg-red-950 transition-colors"
            >
              Clear graph
            </button>
          </div>
        </section>

      </div>

      {clearConfirm && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4"
          onClick={e => { if (e.target === e.currentTarget) setClearConfirm(false) }}
        >
          <div
            className="bg-zinc-900 border border-zinc-700 rounded-xl p-6 max-w-sm w-full shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold mb-2 text-white">Clear graph?</h3>
            <p className="text-sm text-zinc-400 mb-6">
              This removes the saved graph from your browser. You cannot undo this.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setClearConfirm(false)}
                className="px-4 py-2 text-sm rounded-lg border border-zinc-700 text-zinc-300 hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                onClick={handleClearGraph}
                className="px-4 py-2 text-sm rounded-lg bg-red-600 hover:bg-red-700 text-white"
              >
                Clear graph
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
