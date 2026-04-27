'use client'

import { UnifiedProductPlayer } from '@/app/components/UnifiedProductPlayer'
import { useActiveChannel } from '@/app/lib/ActiveChannelContext'

export default function UnifiedPlayerPage() {
  const { activeChannel } = useActiveChannel()
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {activeChannel ? (
        <p className="shrink-0 rounded-lg border border-zinc-800 bg-zinc-950/80 px-3 py-2 text-sm text-zinc-300">
          Active: <span className="font-medium text-white">{activeChannel.title}</span>{' '}
          <span
            className={activeChannel.kind === 'music' ? 'text-amber-400' : 'text-sky-400'}
          >
            ({activeChannel.kind === 'music' ? 'Music' : 'Movies'})
          </span>
        </p>
      ) : (
        <p className="shrink-0 text-sm text-zinc-500">
          No active channel — pick one on <span className="text-zinc-300">Channels</span>.
        </p>
      )}
      <UnifiedProductPlayer
        kind={activeChannel?.kind ?? null}
        channelId={activeChannel?.id}
      />
    </div>
  )
}
