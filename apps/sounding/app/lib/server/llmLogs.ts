import 'server-only'

import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import zlib from 'node:zlib'

export type LlmLogLevel = 0 | 1 | 2

export type LlmLogEvent = {
  ts: string
  app: string
  type: string
  userKey: string
  requestId: string
  provider?: string
  modelId?: string
  systemPrompt?: string
  userMessage?: string
  responseText?: string
  error?: { message: string; stack?: string }
  meta?: Record<string, unknown>
}

const MONTH_MS = 30 * 24 * 60 * 60 * 1000
const MAX_FILES_BEFORE_COMPRESS = 1000

export function getLlmLogLevel(): LlmLogLevel {
  const raw = (process.env.LLM_LOG_LEVEL ?? '').trim()
  if (raw === '1') return 1
  if (raw === '2') return 2
  return 0
}

function defaultLogRoot(): string {
  // Vercel's filesystem is ephemeral, but /tmp is writable at runtime.
  if (process.env.VERCEL) return '/tmp/llm-logs'
  return path.join(process.cwd(), '.llm-logs')
}

/** Actual directory used when `LLM_LOG_DIR` is unset (normally `<cwd>/.llm-logs`). */
export function getLlmLogRootDir(): string {
  const explicit = (process.env.LLM_LOG_DIR ?? '').trim()
  return explicit || defaultLogRoot()
}

export function safeSegment(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'unknown'
}

/** Resolve a log file path from UI segments; rejects path traversal. */
export function resolveLlmLogFilePath(parts: { app: string; userKey: string; type: string; filename: string }): string | null {
  const root = path.resolve(getLlmLogRootDir())
  const name = path.basename(parts.filename)
  if (!name.endsWith('.json') || name.includes('..')) return null
  const dir = path.join(root, safeSegment(parts.app), safeSegment(parts.userKey), safeSegment(parts.type))
  const full = path.resolve(path.join(dir, name))
  const rel = path.relative(root, full)
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null
  return full
}

function makeRequestId(): string {
  return crypto.randomBytes(8).toString('hex')
}

function sha12(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex').slice(0, 12)
}

export function deriveUserKey(opts: {
  cookieToken?: string | null
  headerIp?: string | null
  headerUa?: string | null
  explicitUserId?: string | null
}): string {
  if (opts.explicitUserId) return `user-${safeSegment(opts.explicitUserId)}`
  if (opts.cookieToken) return `spotify-${sha12(opts.cookieToken)}`
  const ip = (opts.headerIp ?? '').split(',')[0]?.trim()
  const ua = (opts.headerUa ?? '').trim()
  if (ip || ua) return `anon-${sha12(`${ip}|${ua}`)}`
  return 'anon'
}

function baseDirFor(event: Pick<LlmLogEvent, 'app' | 'type' | 'userKey'>): string {
  const root = getLlmLogRootDir()
  return path.join(root, safeSegment(event.app), safeSegment(event.userKey), safeSegment(event.type))
}

async function gzipFile(src: string, dest: string): Promise<void> {
  const buf = await fs.readFile(src)
  const gz = await new Promise<Buffer>((resolve, reject) => {
    zlib.gzip(buf, { level: 9 }, (err, out) => (err ? reject(err) : resolve(out)))
  })
  await fs.writeFile(dest, gz)
}

async function maybeCompressAndPrune(dir: string): Promise<void> {
  let entries: { name: string; full: string; stat: { mtimeMs: number }; isGz: boolean }[] = []
  try {
    const names = await fs.readdir(dir)
    const stats = await Promise.all(
      names.map(async (name) => {
        const full = path.join(dir, name)
        const stat = await fs.stat(full).catch(() => null)
        if (!stat?.isFile()) return null
        return { name, full, stat: { mtimeMs: stat.mtimeMs }, isGz: name.endsWith('.gz') }
      })
    )
    entries = stats.filter(Boolean) as typeof entries
  } catch {
    return
  }

  const now = Date.now()
  // Delete old archives (gz) after ~1 month.
  await Promise.all(
    entries
      .filter((e) => e.isGz && now - e.stat.mtimeMs > MONTH_MS)
      .map((e) => fs.unlink(e.full).catch(() => undefined))
  )

  // Compress older raw logs if we have too many.
  const raw = entries.filter((e) => !e.isGz)
  if (raw.length <= MAX_FILES_BEFORE_COMPRESS) return

  const sortedOldestFirst = raw.sort((a, b) => a.stat.mtimeMs - b.stat.mtimeMs)
  const toCompress = sortedOldestFirst.slice(0, raw.length - MAX_FILES_BEFORE_COMPRESS)
  await Promise.all(
    toCompress.map(async (e) => {
      const gzPath = `${e.full}.gz`
      try {
        await gzipFile(e.full, gzPath)
        await fs.unlink(e.full)
      } catch {
        // Best-effort: never break app behavior due to log maintenance.
      }
    })
  )
}

export async function writeLlmLog(
  eventInput: Omit<LlmLogEvent, 'ts' | 'requestId'> & { ts?: string; requestId?: string },
  opts?: { level?: LlmLogLevel }
): Promise<void> {
  const level = opts?.level ?? getLlmLogLevel()
  if (level === 0) return

  const event: LlmLogEvent = {
    ...eventInput,
    ts: eventInput.ts ?? new Date().toISOString(),
    requestId: eventInput.requestId ?? makeRequestId(),
  }

  const dir = baseDirFor(event)
  const filename =
    level === 1
      ? 'latest.json'
      : `${event.ts.replace(/[:.]/g, '-')}-${event.requestId}.json`

  try {
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(path.join(dir, filename), JSON.stringify(event, null, 2), 'utf8')
  } catch (e) {
    console.warn('[llm-logs] failed to write', { dir, filename }, e)
    return
  }

  if (level === 2) {
    // Fire-and-forget maintenance; best-effort.
    void maybeCompressAndPrune(dir)
  }
}

/** One JSON log file on disk (under getLlmLogRootDir()). */
export type LlmLogFileRef = {
  app: string
  userKey: string
  type: string
  filename: string
  fullPath: string
  mtimeMs: number
}

function isJsonLogFile(name: string): boolean {
  return name.endsWith('.json') && !name.endsWith('.json.gz')
}

/** Walk `.llm-logs` and return every raw `.json` log file with mtime (newest-first sort helper). */
export async function listAllLlmLogFiles(): Promise<LlmLogFileRef[]> {
  const root = getLlmLogRootDir()
  const out: LlmLogFileRef[] = []
  let appNames: string[] = []
  try {
    appNames = await fs.readdir(root)
  } catch {
    return out
  }

  for (const app of appNames) {
    const appPath = path.join(root, app)
    const appSt = await fs.stat(appPath).catch(() => null)
    if (!appSt?.isDirectory()) continue
    let userNames: string[] = []
    try {
      userNames = await fs.readdir(appPath)
    } catch {
      continue
    }
    for (const userKey of userNames) {
      const userPath = path.join(appPath, userKey)
      const uSt = await fs.stat(userPath).catch(() => null)
      if (!uSt?.isDirectory()) continue
      let typeNames: string[] = []
      try {
        typeNames = await fs.readdir(userPath)
      } catch {
        continue
      }
      for (const type of typeNames) {
        const typePath = path.join(userPath, type)
        const tSt = await fs.stat(typePath).catch(() => null)
        if (!tSt?.isDirectory()) continue
        let files: string[] = []
        try {
          files = await fs.readdir(typePath)
        } catch {
          continue
        }
        for (const filename of files) {
          if (!isJsonLogFile(filename)) continue
          const fullPath = path.join(typePath, filename)
          const st = await fs.stat(fullPath).catch(() => null)
          if (!st?.isFile()) continue
          out.push({
            app,
            userKey,
            type,
            filename,
            fullPath,
            mtimeMs: st.mtimeMs,
          })
        }
      }
    }
  }
  return out
}

export async function readLlmLogJsonFile(fullPath: string): Promise<LlmLogEvent | null> {
  try {
    const raw = await fs.readFile(fullPath, 'utf8')
    return JSON.parse(raw) as LlmLogEvent
  } catch {
    return null
  }
}

/**
 * Known `type` strings written by `callLLM` / `writeLlmLog` in this repo:
 * - `trailer-vision.next-movie` — api/next-movie/route.ts (batch movie/TV picks; on Sounding deploy `app` is `sounding`)
 * - `soundings.next-song` — lib/llm.ts getNextSongQuery (music suggestions)
 * - `trailer-vision.taste-summary` — api/taste-summary/route.ts
 * - `trailer-vision.streaming` — api/streaming/route.ts
 * - `trailer-vision.suggest-artists` — api/suggest-artists/route.ts
 */
export const LLM_LOG_TYPE_INFO: Record<string, { title: string; detail: string }> = {
  'trailer-vision.next-movie': {
    title: 'Movie/TV suggestions (main batch)',
    detail: 'Recommends the next title cards from ratings, channel, watchlist — the primary JSON batch.',
  },
  'soundings.next-song': {
    title: 'Music — next song / DJ',
    detail: 'Soundings: suggests tracks and optional rolling profile from listen history.',
  },
  'trailer-vision.taste-summary': {
    title: 'Taste summary',
    detail: 'Short second-person taste profile from your rating stats.',
  },
  'trailer-vision.streaming': {
    title: 'Streaming lookup',
    detail: 'US streaming service names for one title (JSON array).',
  },
  'trailer-vision.suggest-artists': {
    title: 'Suggest artists',
    detail: 'Artist names for exploration from taste context.',
  },
}

const CATEGORY_TYPE_ORDER = [
  'trailer-vision.next-movie',
  'soundings.next-song',
  'trailer-vision.taste-summary',
  'trailer-vision.streaming',
  'trailer-vision.suggest-artists',
]

/** Newest file per `(app, type)` by mtime — any user; for “latest prompt in each category”. */
export function pickLatestFilePerAppType(files: LlmLogFileRef[]): LlmLogFileRef[] {
  const m = new Map<string, LlmLogFileRef>()
  for (const f of files) {
    const key = `${f.app}::${f.type}`
    const cur = m.get(key)
    if (!cur || f.mtimeMs > cur.mtimeMs) m.set(key, f)
  }
  const arr = [...m.values()]
  arr.sort((a, b) => {
    const ia = CATEGORY_TYPE_ORDER.indexOf(a.type)
    const ib = CATEGORY_TYPE_ORDER.indexOf(b.type)
    if (ia !== -1 && ib !== -1 && ia !== ib) return ia - ib
    if (ia !== -1 && ib === -1) return -1
    if (ib !== -1 && ia === -1) return 1
    return `${a.app}/${a.type}`.localeCompare(`${b.app}/${b.type}`)
  })
  return arr
}

