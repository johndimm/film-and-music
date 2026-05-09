import AppHeader from '@/app/components/AppHeader'
import { extractYoutubeVideoIdLoose } from '@/app/lib/youtubeVideoId'
import YouTubeEmbedTestClient from './YouTubeEmbedTestClient'

/** Example id used when `?v` is missing — Warner Classics classical clip discussed in QA. */
const DEFAULT_VIDEO_ID = 'ZYtFPFyUafM'

export default async function YouTubeEmbedTestPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const q = await searchParams
  const raw = typeof q.v === 'string' ? q.v : Array.isArray(q.v) ? q.v[0] : undefined
  const videoId = extractYoutubeVideoIdLoose(raw?.trim() || '') ?? DEFAULT_VIDEO_ID

  return (
    <>
      <AppHeader />
      <YouTubeEmbedTestClient videoId={videoId} />
    </>
  )
}
