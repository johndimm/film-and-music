'use client'

import { useState } from 'react'
import { useActiveChannel } from '@/app/lib/ActiveChannelContext'
import type { ChannelKind, UnifiedChannel } from '@film-music/platform'

function KindBadge({ kind }: { kind: ChannelKind }) {
  if (kind === 'music') {
    return (
      <span className="rounded-md bg-amber-500/20 px-2 py-0.5 text-xs font-medium text-amber-300">
        Music
      </span>
    )
  }
  return (
    <span className="rounded-md bg-sky-500/20 px-2 py-0.5 text-xs font-medium text-sky-300">
      Movies
    </span>
  )
}

function ChannelRow({
  c,
  active,
  onSelect,
}: {
  c: UnifiedChannel
  active: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-3 text-left text-sm transition-colors ${
        active
          ? 'border-amber-500/50 bg-zinc-900'
          : 'border-zinc-800 bg-zinc-950/80 hover:border-zinc-600'
      }`}
    >
      <div>
        <p className="font-medium text-zinc-100">{c.title}</p>
        {c.sourceHint ? <p className="text-xs text-zinc-500">{c.sourceHint}</p> : null}
      </div>
      <KindBadge kind={c.kind} />
    </button>
  )
}

export default function UnifiedChannelsPage() {
  const { channels, activeChannelId, setActiveChannelId, addChannel } = useActiveChannel()
  const [title, setTitle] = useState('')
  const [kind, setKind] = useState<ChannelKind>('music')

  return (
    <div className="mx-auto max-w-lg px-4 py-6 text-zinc-100">
      <h1 className="text-base font-semibold">Channels</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Music and movie channels in one list. The active channel is used on the Player (and in future, for queue + suggestions).
      </p>

      <ul className="mt-5 flex flex-col gap-2">
        {channels.map((c) => (
          <li key={c.id}>
            <ChannelRow
              c={c}
              active={c.id === activeChannelId}
              onSelect={() => setActiveChannelId(c.id)}
            />
          </li>
        ))}
      </ul>

      <form
        className="mt-6 rounded-xl border border-dashed border-zinc-700 p-3"
        onSubmit={(e) => {
          e.preventDefault()
          if (!title.trim()) return
          addChannel(title, kind)
          setTitle('')
        }}
      >
        <p className="text-xs font-medium text-zinc-500">Add channel</p>
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <input
            className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Name"
          />
          <select
            className="rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm"
            value={kind}
            onChange={(e) => setKind(e.target.value as ChannelKind)}
          >
            <option value="music">Music</option>
            <option value="movies">Movies</option>
          </select>
          <button
            type="submit"
            className="rounded-lg bg-zinc-100 px-3 py-1.5 text-sm font-medium text-zinc-900"
          >
            Add
          </button>
        </div>
      </form>
    </div>
  )
}
