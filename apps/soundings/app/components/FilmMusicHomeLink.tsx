import Link from 'next/link'
import { Home } from 'lucide-react'

type Variant = 'playerDark' | 'surfaceLight'

const linkClass: Record<Variant, string> = {
  playerDark: 'text-zinc-500 hover:text-zinc-300',
  surfaceLight: 'text-zinc-500 hover:text-zinc-800',
}

export default function FilmMusicHomeLink({ variant }: { variant: Variant }) {
  return (
    <Link prefetch={false} href="/" title="Home" className={`shrink-0 transition-colors ${linkClass[variant]}`}>
      <Home size={15} />
    </Link>
  )
}
