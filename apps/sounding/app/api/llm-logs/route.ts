import { NextRequest, NextResponse } from 'next/server'
import {
  getLlmLogRootDir,
  getLlmLogLevel,
  listAllLlmLogFiles,
  LLM_LOG_TYPE_INFO,
  pickLatestFilePerAppType,
  readLlmLogJsonFile,
} from '@/app/lib/server/llmLogs'
import { llmLogViewerAuthorized } from './_auth'

export const dynamic = 'force-dynamic'

/** Strip server paths from client payload. */
function publicFileRef(f: {
  app: string
  userKey: string
  type: string
  filename: string
  mtimeMs: number
}) {
  return {
    app: f.app,
    userKey: f.userKey,
    type: f.type,
    filename: f.filename,
    mtimeMs: f.mtimeMs,
  }
}

export async function GET(req: NextRequest) {
  if (!llmLogViewerAuthorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const all = await listAllLlmLogFiles()
  const sorted = [...all].sort((a, b) => b.mtimeMs - a.mtimeMs)
  const latest = sorted[0] ?? null
  let defaultPayload: {
    app: string
    userKey: string
    type: string
    filename: string
    mtimeMs: number
    event: Awaited<ReturnType<typeof readLlmLogJsonFile>>
  } | null = null

  if (latest) {
    const event = await readLlmLogJsonFile(latest.fullPath)
    defaultPayload = {
      ...publicFileRef(latest),
      event,
    }
  }

  const perCategory = pickLatestFilePerAppType(all)
  const latestByCategory = await Promise.all(
    perCategory.map(async (ref) => {
      const event = await readLlmLogJsonFile(ref.fullPath)
      const info = LLM_LOG_TYPE_INFO[ref.type] ?? { title: ref.type, detail: '' }
      return {
        key: `${ref.app}::${ref.type}`,
        app: ref.app,
        type: ref.type,
        title: info.title,
        detail: info.detail,
        ref: publicFileRef(ref),
        event,
      }
    })
  )

  return NextResponse.json(
    {
      logRoot: getLlmLogRootDir(),
      vercel: Boolean(process.env.VERCEL),
      llmLogLevel: getLlmLogLevel(),
      default: defaultPayload,
      latestByCategory,
      files: sorted.map(publicFileRef),
    },
    {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    }
  )
}
