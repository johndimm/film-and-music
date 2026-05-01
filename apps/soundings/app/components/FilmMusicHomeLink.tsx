import Link from 'next/link'

type Variant = 'playerDark' | 'surfaceLight'

const linkClass: Record<Variant, string> = {
  playerDark: 'text-zinc-500 hover:text-zinc-300',
  surfaceLight: 'text-zinc-500 hover:text-zinc-800',
}

/**
 * Subtle breadcrumb-style link to `/` (Film & Music landing) — pair with each product's primary brand title.
 */
export default function FilmMusicHomeLink({ variant }: { variant: Variant }) {
  return (
    <Link href="/" title="Film &amp; music — landing page" className={`text-xs shrink-0 transition-colors ${linkClass[variant]}`}>
      Film &amp; music
    </Link>
  )
}
