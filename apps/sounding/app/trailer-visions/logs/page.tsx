'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

type FileRef = {
  app: string
  userKey: string
  type: string
  filename: string
  mtimeMs: number
}

type LlmEvent = Record<string, unknown>

type CategoryLatest = {
  key: string
  app: string
  type: string
  title: string
  detail: string
  ref: FileRef
  event: LlmEvent | null
}

type IndexResponse = {
  logRoot: string
  default: (FileRef & { event: LlmEvent | null }) | null
  latestByCategory: CategoryLatest[]
  files: FileRef[]
}

function str(v: unknown): string {
  if (typeof v === 'string') return v
  if (v == null) return ''
  return String(v)
}

/** Avoid rendering megabyte strings into the DOM (was crashing the log page). */
const LOG_VIEW_CHAR_CAP = 200_000

function capForView(s: string, label: string): string {
  if (s.length <= LOG_VIEW_CHAR_CAP) return s
  return `${s.slice(0, LOG_VIEW_CHAR_CAP)}\n\n… [truncated: ${label} was ${s.length.toLocaleString()} characters]`
}

function stripCodeFences(s: string): string {
  return s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
}

/** Pretty-print JSON model responses (movie/TV batch, streaming array, etc.); fall back to text. */
function formatLlmResponseForDisplay(raw: string): string {
  const t = stripCodeFences(raw)
  if (!t) return ''
  try {
    return JSON.stringify(JSON.parse(t), null, 2)
  } catch {
    /* ignore */
  }
  const i = t.indexOf('{')
  const j = t.lastIndexOf('}')
  if (i >= 0 && j > i) {
    try {
      return JSON.stringify(JSON.parse(t.slice(i, j + 1)), null, 2)
    } catch {
      /* ignore */
    }
  }
  const a = t.indexOf('[')
  const b = t.lastIndexOf(']')
  if (a >= 0 && b > a) {
    try {
      return JSON.stringify(JSON.parse(t.slice(a, b + 1)), null, 2)
    } catch {
      /* ignore */
    }
  }
  return t
}

function LogTextPanel({
  label,
  text,
  maxHeightClass,
}: {
  label: string
  text: string
  maxHeightClass: string
}) {
  const safe = capForView(text, label)
  return (
    <div className="flex min-h-0 min-w-0 flex-col gap-1.5">
      <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-zinc-500">{label}</span>
      <pre
        className={`min-h-0 min-w-0 ${maxHeightClass} overflow-x-auto overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-zinc-800/80 bg-black/30 p-3 font-mono text-sm leading-relaxed text-zinc-300`}
      >
        {safe || '—'}
      </pre>
    </div>
  )
}

function LogEventPanels({ event }: { event: LlmEvent | null }) {
  if (!event) {
    return <p className="text-base text-zinc-500">No log loaded.</p>
  }
  const sys = str(event.systemPrompt)
  const usr = str(event.userMessage)
  const resRaw = str(event.responseText)
  const formatted = formatLlmResponseForDisplay(resRaw)
  const errObj = event.error as { message?: string } | undefined
  const err = errObj && typeof errObj.message === 'string' ? errObj.message : ''

  return (
    <div className="min-w-0 space-y-3">
      {err ? (
        <p className="rounded-lg border border-red-900/60 bg-red-950/40 px-3 py-2 text-sm text-red-200">{err}</p>
      ) : null}
      <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2">
        <LogTextPanel label="System" text={sys} maxHeightClass="max-h-52" />
        <LogTextPanel label="User" text={usr} maxHeightClass="max-h-52" />
      </div>
      <LogTextPanel label="Response" text={formatted || (err ? '(see error above)' : '')} maxHeightClass="max-h-[28rem]" />
    </div>
  )
}

function uniqSorted(xs: string[]): string[] {
  return [...new Set(xs)].sort()
}

export default function LlmLogsPage() {
  const browseRef = useRef<HTMLDivElement>(null)
  const [secret, setSecret] = useState('')
  const [index, setIndex] = useState<IndexResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const [app, setApp] = useState('')
  const [userKey, setUserKey] = useState('')
  const [type, setType] = useState('')
  const [filename, setFilename] = useState('')
  const [event, setEvent] = useState<LlmEvent | null>(null)

  const headers = useMemo(() => {
    const h: Record<string, string> = {}
    if (secret.trim()) h['x-llm-log-secret'] = secret.trim()
    return h
  }, [secret])

  const loadIndex = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/llm-logs', { headers, cache: 'no-store' })
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string }
        setError(j.error === 'unauthorized' ? 'Unauthorized — set LLM_LOG_VIEWER_SECRET in .env and paste it above.' : `HTTP ${res.status}`)
        setIndex(null)
        return
      }
      const raw = (await res.json()) as Partial<IndexResponse> & { files: FileRef[] }
      const data: IndexResponse = {
        logRoot: raw.logRoot ?? '',
        default: raw.default ?? null,
        latestByCategory: raw.latestByCategory ?? [],
        files: raw.files,
      }
      setIndex(data)
      const d = data.default
      if (d) {
        setApp(d.app)
        setUserKey(d.userKey)
        setType(d.type)
        setFilename(d.filename)
        setEvent(d.event)
      } else {
        setApp('')
        setUserKey('')
        setType('')
        setFilename('')
        setEvent(null)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [headers])

  useEffect(() => {
    void loadIndex()
  }, [loadIndex])

  const apps = useMemo(() => (index ? uniqSorted(index.files.map((f) => f.app)) : []), [index])

  const usersForApp = useMemo(() => {
    if (!index || !app) return []
    return uniqSorted(index.files.filter((f) => f.app === app).map((f) => f.userKey))
  }, [index, app])

  const typesForUser = useMemo(() => {
    if (!index || !app || !userKey) return []
    return uniqSorted(index.files.filter((f) => f.app === app && f.userKey === userKey).map((f) => f.type))
  }, [index, app, userKey])

  const filesForType = useMemo(() => {
    if (!index || !app || !userKey || !type) return []
    return index.files
      .filter((f) => f.app === app && f.userKey === userKey && f.type === type)
      .sort((a, b) => b.mtimeMs - a.mtimeMs)
  }, [index, app, userKey, type])

  const loadFile = useCallback(
    async (a: string, u: string, t: string, fn: string) => {
      if (!a || !u || !t || !fn) return
      const q = new URLSearchParams({ app: a, userKey: u, type: t, filename: fn })
      const res = await fetch(`/api/llm-logs/file?${q}`, { headers, cache: 'no-store' })
      if (!res.ok) {
        setError(`File load failed (${res.status})`)
        return
      }
      const data = (await res.json()) as { event: LlmEvent }
      setEvent(data.event)
      setError(null)
    },
    [headers]
  )

  /** Load file when selection changes; reuse embedded default payload to avoid a duplicate fetch on first paint. */
  useEffect(() => {
    if (!app || !userKey || !type || !filename || !index) return
    if (
      index.default &&
      index.default.app === app &&
      index.default.userKey === userKey &&
      index.default.type === type &&
      index.default.filename === filename &&
      index.default.event
    ) {
      setEvent(index.default.event as LlmEvent)
      return
    }
    void loadFile(app, userKey, type, filename)
  }, [app, userKey, type, filename, index, loadFile])

  const newestUnderApp = useCallback(
    (a: string) => {
      const under = index?.files.filter((f) => f.app === a).sort((x, y) => y.mtimeMs - x.mtimeMs)
      return under?.[0] ?? null
    },
    [index]
  )

  const newestUnderUser = useCallback(
    (a: string, u: string) => {
      const under = index?.files.filter((f) => f.app === a && f.userKey === u).sort((x, y) => y.mtimeMs - x.mtimeMs)
      return under?.[0] ?? null
    },
    [index]
  )

  const openInFullBrowser = useCallback((cat: CategoryLatest) => {
    setApp(cat.ref.app)
    setUserKey(cat.ref.userKey)
    setType(cat.ref.type)
    setFilename(cat.ref.filename)
    if (cat.event) setEvent(cat.event as LlmEvent)
    window.requestAnimationFrame(() => {
      browseRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }, [])

  return (
    <div className="min-h-screen min-w-0 bg-zinc-950 p-4 text-base text-zinc-100 sm:p-6">
      <div className="mx-auto max-w-5xl min-w-0 space-y-5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <Link
            href="/trailer-visions/settings"
            className="text-sm font-medium text-indigo-400 transition-colors hover:text-indigo-300"
          >
            ← Back to Settings
          </Link>
        </div>
        <header className="flex flex-col gap-4 border-b border-zinc-800 pb-4 lg:flex-row lg:items-start lg:justify-between lg:gap-6">
          <div className="min-w-0 max-w-full flex-1 space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight text-white">LLM logs</h1>
            <p className="text-base leading-relaxed text-zinc-400 break-words">
              <strong className="text-zinc-200">Latest by category</strong> is the newest log per app+type (any user). The
              main suggestion query is <code className="break-all text-zinc-300">trailer-vision.next-movie</code> (movie/TV batch).
              On this Sounding deploy it is stored under app <code className="break-all text-zinc-300">sounding</code>. Other LLM
              calls: <code className="break-all text-zinc-300">soundings.next-song</code> (music),{' '}
              <code className="break-all text-zinc-300">trailer-vision.taste-summary</code>,{' '}
              <code className="break-all text-zinc-300">trailer-vision.streaming</code>,{' '}
              <code className="break-all text-zinc-300">trailer-vision.suggest-artists</code>.
            </p>
            <details className="text-base text-zinc-500">
              <summary className="cursor-pointer text-zinc-400 hover:text-zinc-300">Where each call is implemented</summary>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>
                  <code>trailer-vision.next-movie</code> — <code>api/next-movie/route.ts</code> (batch picks)
                </li>
                <li>
                  <code>soundings.next-song</code> — <code>lib/llm.ts</code> (<code>getNextSongQuery</code>)
                </li>
                <li>
                  <code>trailer-vision.taste-summary</code> — <code>api/taste-summary/route.ts</code>
                </li>
                <li>
                  <code>trailer-vision.streaming</code> — <code>api/streaming/route.ts</code>
                </li>
                <li>
                  <code>trailer-vision.suggest-artists</code> — <code>api/suggest-artists/route.ts</code>
                </li>
              </ul>
            </details>
          </div>
          <div className="flex w-full shrink-0 flex-wrap items-center gap-2 lg:w-auto lg:max-w-sm lg:justify-end">
            <input
              type="password"
              placeholder="Viewer secret (prod)"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-base sm:min-w-[12rem] sm:flex-none"
            />
            <button
              type="button"
              onClick={() => void loadIndex()}
              className="rounded-lg bg-zinc-100 px-4 py-2 text-base font-medium text-zinc-900 hover:bg-white"
            >
              Refresh
            </button>
          </div>
        </header>

        {error && <p className="rounded-lg border border-red-900/80 bg-red-950/50 px-3 py-2 text-base text-red-200">{error}</p>}

        {loading && <p className="text-base text-zinc-500">Loading…</p>}

        {index && !loading && (
          <>
            <p className="text-sm text-zinc-500">
              Log root: <code className="text-zinc-400">{index.logRoot}</code> · {index.files.length} file(s)
            </p>

            {(index.latestByCategory ?? []).length > 0 && (
              <section className="space-y-4">
                <h2 className="text-lg font-semibold text-zinc-200">Latest prompt &amp; response by category</h2>
                <div className="grid gap-4 lg:grid-cols-1">
                  {index.latestByCategory.map((cat) => {
                    return (
                      <article
                        key={cat.key}
                        className="min-w-0 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 shadow-sm"
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0 flex-1 space-y-1.5">
                            <h3 className="break-words text-lg font-semibold text-white">{cat.title}</h3>
                            <p className="text-sm text-zinc-500 break-words">
                              <code className="break-all text-zinc-400">{cat.app}</code> ·{' '}
                              <code className="break-all text-zinc-400">{cat.type}</code>
                            </p>
                            {cat.detail ? <p className="text-sm leading-snug text-zinc-400 break-words">{cat.detail}</p> : null}
                            <p className="text-sm leading-snug text-zinc-500 break-words">
                              User <code className="break-all text-zinc-400">{cat.ref.userKey}</code> ·{' '}
                              {new Date(cat.ref.mtimeMs).toLocaleString()} ·{' '}
                              <span className="break-all">{cat.ref.filename}</span>
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => openInFullBrowser(cat)}
                            className="w-full shrink-0 rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm font-medium text-zinc-100 hover:bg-zinc-700 sm:w-auto"
                          >
                            Show below ↓
                          </button>
                        </div>
                        <div className="mt-4">
                          <LogEventPanels event={cat.event} />
                        </div>
                      </article>
                    )
                  })}
                </div>
              </section>
            )}

            <div ref={browseRef} className="scroll-mt-8 space-y-3 pt-2">
              <div>
                <h2 className="text-lg font-semibold text-zinc-200">Browse all files</h2>
                <p className="text-sm leading-relaxed text-zinc-500">
                  Defaults to the newest file on disk. Responses are pretty-printed when they are JSON (e.g. movie/TV batch).
                  Very large fields are truncated to keep the page stable.
                </p>
              </div>

            <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="flex min-w-0 flex-col gap-1.5 text-sm text-zinc-400">
                App
                <select
                  className="min-w-0 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-base text-white"
                  value={app}
                  onChange={(e) => {
                    const v = e.target.value
                    setApp(v)
                    const pick = newestUnderApp(v)
                    if (pick) {
                      setUserKey(pick.userKey)
                      setType(pick.type)
                      setFilename(pick.filename)
                    }
                  }}
                >
                  {apps.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex min-w-0 flex-col gap-1.5 text-sm text-zinc-400">
                User
                <select
                  className="min-w-0 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-base text-white"
                  value={userKey}
                  onChange={(e) => {
                    const v = e.target.value
                    setUserKey(v)
                    const pick = newestUnderUser(app, v)
                    if (pick) {
                      setType(pick.type)
                      setFilename(pick.filename)
                    }
                  }}
                >
                  {usersForApp.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex min-w-0 flex-col gap-1.5 text-sm text-zinc-400">
                Type
                <select
                  className="min-w-0 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-base text-white"
                  value={type}
                  onChange={(e) => {
                    const v = e.target.value
                    setType(v)
                    const under = index.files
                      .filter((f) => f.app === app && f.userKey === userKey && f.type === v)
                      .sort((a, b) => b.mtimeMs - a.mtimeMs)
                    if (under[0]) setFilename(under[0].filename)
                  }}
                >
                  {typesForUser.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex min-w-0 flex-col gap-1.5 text-sm text-zinc-400">
                File (newest first)
                <select
                  className="min-w-0 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-base text-white"
                  value={filename}
                  onChange={(e) => setFilename(e.target.value)}
                >
                  {filesForType.map((f) => (
                    <option key={f.filename} value={f.filename}>
                      {f.filename} · {new Date(f.mtimeMs).toLocaleString()}
                    </option>
                  ))}
                </select>
              </label>
            </div>

              <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-5">
                <LogEventPanels event={event} />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
