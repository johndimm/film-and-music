import type { MediaMode } from '@film-music/platform'

export function ExtensionPlaceholder({
  title,
  mode,
  note,
}: {
  title: string
  mode: MediaMode
  note?: string
}) {
  const legacy =
    mode === 'unified'
      ? 'apps/soundings and apps/trailer-vision'
      : mode === 'music'
        ? 'apps/soundings'
        : 'apps/trailer-vision'
  return (
    <div className="mx-auto max-w-lg px-4 py-10">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{title}</p>
      <h1 className="mt-1 text-lg font-semibold text-zinc-900">Extension surface</h1>
      <p className="mt-3 text-sm text-zinc-600">
        Mount the real UI from <code className="rounded bg-zinc-100 px-1">{legacy}</code> here, or move those
        modules into <code className="rounded bg-zinc-100 px-1">@film-music/platform</code> / feature packages and
        import them for <span className="font-medium">{mode}</span> mode.
      </p>
      {note ? <p className="mt-2 text-sm text-zinc-500">{note}</p> : null}
    </div>
  )
}
