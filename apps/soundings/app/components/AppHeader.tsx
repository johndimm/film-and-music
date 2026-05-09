'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import FilmMusicHomeLink from '@/app/components/FilmMusicHomeLink'

const GRAPH_HREF = '/player#soundings-constellations'

const PAGE_LINKS = [
  { href: '/player', label: 'Player' },
  { href: '/channels', label: 'Channels' },
  { href: '/ratings', label: 'History' },
  { href: GRAPH_HREF, label: 'Graph' },
]

const RESOURCE_LINKS = [
  { href: '/guide', label: 'Help' },
  { href: '/youtube-embed-test', label: 'YT embed test' },
]

const POPOUT_FEATURES = 'popup=yes,width=440,height=860,scrollbars=yes,resizable=yes'

export default function AppHeader() {
  const pathname = usePathname()
  const isPlayer =
    pathname.startsWith('/player') ||
    pathname.startsWith('/constellations') ||
    pathname.startsWith('/youtube-embed-test')
  const settingsHref = pathname.startsWith('/constellations') ? '/constellations/settings' : '/settings'

  const openPopOutPlayer = () => {
    if (typeof window === 'undefined') return
    const u = `${window.location.origin}${pathname.startsWith('/player') ? pathname : '/player'}`
    const w = window.open(u, 'soundings-player-popout', POPOUT_FEATURES)
    if (!w || w.closed) {
      window.alert('Pop-up was blocked. Allow pop-ups for this site to use the detached player.')
    }
  }

  const isActive = (href: string) => {
    if (href === GRAPH_HREF) {
      return pathname.startsWith('/player')
    }
    return pathname === href || pathname.startsWith(href + '/')
  }

  return (
    <header className={`border-b ${isPlayer ? 'bg-black border-zinc-900' : 'bg-white border-zinc-200'}`}>
    <div className="flex items-center gap-2 px-4 py-2 max-w-[800px] mx-auto flex-wrap">
      <FilmMusicHomeLink variant={isPlayer ? 'playerDark' : 'surfaceLight'} />
      <span className={isPlayer ? 'text-zinc-700 select-none' : 'text-zinc-300 select-none'} aria-hidden>/</span>
      <Link
        href="/player"
        className={`text-base font-bold transition-colors ${isPlayer ? 'text-white hover:text-zinc-300' : 'text-black hover:text-zinc-600'}`}
      >
        Soundings
      </Link>

      <nav className="flex items-center gap-1 flex-1 flex-wrap">
        {PAGE_LINKS.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            className={`text-xs px-2.5 py-1 rounded transition-colors ${
              isActive(href)
                ? isPlayer ? 'bg-zinc-800 text-white' : 'bg-zinc-100 text-black'
                : isPlayer ? 'text-zinc-400 hover:text-white hover:bg-zinc-900' : 'text-zinc-500 hover:text-black hover:bg-zinc-100'
            }`}
          >
            {label}
          </Link>
        ))}
        <Link
          href={settingsHref}
          className={`text-xs px-2.5 py-1 rounded transition-colors ${
            isActive(settingsHref)
              ? isPlayer ? 'bg-zinc-800 text-white' : 'bg-zinc-100 text-black'
              : isPlayer ? 'text-zinc-400 hover:text-white hover:bg-zinc-900' : 'text-zinc-500 hover:text-black hover:bg-zinc-100'
          }`}
        >
          Settings
        </Link>

        <span className={`mx-1 ${isPlayer ? 'text-zinc-700' : 'text-zinc-300'}`}>·</span>

        {RESOURCE_LINKS.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            className={`text-xs transition-colors px-1 ${
              isActive(href)
                ? isPlayer ? 'text-zinc-300' : 'text-zinc-700'
                : isPlayer ? 'text-zinc-500 hover:text-zinc-300' : 'text-zinc-400 hover:text-zinc-700'
            }`}
          >
            {label}
          </Link>
        ))}
      </nav>

      {isPlayer ? (
        <button
          type="button"
          onClick={openPopOutPlayer}
          title="Open the player in a separate window — you can close this tab; playback stays in that window."
          className="text-xs font-medium shrink-0 rounded px-2 py-1 border border-zinc-700 bg-zinc-900 text-zinc-200 transition-colors hover:border-zinc-500 hover:bg-zinc-800"
        >
          Pop out
        </button>
      ) : null}

      <a
        href="/api/auth/logout"
        className={`text-xs transition-colors ${isPlayer ? 'text-zinc-500 hover:text-white' : 'text-zinc-400 hover:text-black'}`}
      >
        Logout
      </a>
    </div>
    </header>
  )
}
