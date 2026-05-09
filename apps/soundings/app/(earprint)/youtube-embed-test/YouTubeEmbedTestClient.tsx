'use client'

import { useCallback, useState } from 'react'
import Link from 'next/link'
import YoutubePlayer from '@/app/player/YoutubePlayer'

const YT_ERR: Record<number, string> = {
  2: 'invalid parameter',
  5: 'HTML5 / blocked',
  100: 'not found / removed',
  101: 'embedding not allowed (owner)',
  150: 'embedding not allowed (same as 101)',
}

interface Props {
  videoId: string
}

export default function YouTubeEmbedTestClient({ videoId }: Props) {
  const [playerError, setPlayerError] = useState<number | null>(null)
  const onPlayerError = useCallback((code: number) => {
    setPlayerError(code)
    console.warn('[yt-embed-test] YoutubePlayer error', code, YT_ERR[code])
  }, [])

  const plainEmbedSrc = `https://www.youtube.com/embed/${encodeURIComponent(videoId)}`

  return (
    <main className="mx-auto max-w-3xl space-y-10 px-4 py-8 text-zinc-200 bg-zinc-950 min-h-svh">
      <div className="space-y-2 text-sm">
        <h1 className="text-lg font-semibold text-white">YouTube embed diagnostic</h1>
        <p>
          Plain embed matches <strong className="text-zinc-100">Share → Embed</strong> style (minimal URL). Below
          that is Soundings&apos; embed (<code className="text-zinc-400">YoutubePlayer</code>), including{' '}
          <code className="text-zinc-400">autoplay=1</code>, <code className="text-zinc-400">enablejsapi=1</code>, and{' '}
          <code className="text-zinc-400">origin</code>.
        </p>
        <p className="text-zinc-500">
          Video id{' '}
          <code className="text-emerald-400/90">{videoId}</code> — try another{' '}
          <Link href="/youtube-embed-test?v=dQw4w9WgXcQ" className="text-emerald-500 hover:underline">
            example
          </Link>
          . Watch page:{' '}
          <a
            href={`https://www.youtube.com/watch?v=${videoId}`}
            className="text-emerald-500 hover:underline"
            target="_blank"
            rel="noreferrer"
          >
            youtube.com/watch?v={videoId}
          </a>
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">Plain YouTube iframe</h2>
        <iframe
          className="aspect-video w-full max-w-2xl bg-black"
          src={plainEmbedSrc}
          title="Plain YouTube embed"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">Soundings player</h2>
        {/** YoutubePlayer positions the iframe with `absolute inset-0`; parent needs non-zero box. */}
        <div className="relative aspect-video w-full max-w-2xl overflow-hidden rounded-sm bg-black">
          <YoutubePlayer key={videoId} videoId={videoId} onPlayerError={onPlayerError} />
        </div>
        <p className="text-xs text-zinc-500">
          IFrame API <code className="text-zinc-400">onError</code>:{' '}
          {playerError != null ? (
            <span className="font-mono text-amber-300">
              {playerError}
              {YT_ERR[playerError] ? ` (${YT_ERR[playerError]})` : ''}
            </span>
          ) : (
            <span className="text-zinc-600">none yet</span>
          )}
        </p>
      </section>
    </main>
  )
}
