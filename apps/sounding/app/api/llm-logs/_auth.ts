import type { NextRequest } from 'next/server'

/** Set `LLM_LOG_VIEWER_SECRET` in production; local dev allows without secret. */
export function llmLogViewerAuthorized(req: NextRequest): boolean {
  const secret = process.env.LLM_LOG_VIEWER_SECRET?.trim()
  if (secret) {
    const h = req.headers.get('x-llm-log-secret')
    return h === secret
  }
  return process.env.NODE_ENV === 'development'
}
