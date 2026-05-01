import { NextRequest, NextResponse } from 'next/server'
import { readLlmLogJsonFile, resolveLlmLogFilePath } from '@/app/lib/server/llmLogs'
import { llmLogViewerAuthorized } from '../_auth'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  if (!llmLogViewerAuthorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const { searchParams } = req.nextUrl
  const app = searchParams.get('app') ?? ''
  const userKey = searchParams.get('userKey') ?? ''
  const type = searchParams.get('type') ?? ''
  const filename = searchParams.get('filename') ?? ''
  const fullPath = resolveLlmLogFilePath({ app, userKey, type, filename })
  if (!fullPath) {
    return NextResponse.json({ error: 'invalid_path' }, { status: 400 })
  }

  const event = await readLlmLogJsonFile(fullPath)
  if (!event) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  return NextResponse.json(
    { event },
    {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    }
  )
}
