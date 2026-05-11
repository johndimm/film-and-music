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
  { href: '/player/logs', label: 'LLM logs' },
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

  const linkPill = (_href: string, _label: string, active: boolean) =>
    `shrink-0 whitespace-nowrap text-xs px-3 py-2 rounded-md transition-colors min-h-[40px] inline-flex items-center ${
      active
        ? isPlayer
          ? 'bg-zinc-800 text-white'
          : 'bg-zinc-100 text-black'
        : isPlayer
          ? 'text-zinc-400 hover:text-white hover:bg-zinc-900'
          : 'text-zinc-500 hover:text-black hover:bg-zinc-100'
    }`

  const linkPlain = (_href: string, _label: string, active: boolean) =>
    `shrink-0 whitespace-nowrap text-xs px-2.5 py-2 rounded-md transition-colors min-h-[40px] inline-flex items-center ${
      active
        ? isPlayer
          ? 'text-zinc-300'
          : 'text-zinc-700'
        : isPlayer
          ? 'text-zinc-500 hover:text-zinc-300'
          : 'text-zinc-400 hover:text-zinc-700'
    }`

  return (
    <header className={`border-b ${isPlayer ? 'bg-black border-zinc-900' : 'bg-white border-zinc-200'}`}>
      <div className="mx-auto flex w-full max-w-[min(100%,56rem)] flex-col gap-2 px-3 py-2 sm:px-4 lg:flex-row lg:items-center lg:gap-3">
        <div className="flex items-center justify-between gap-2 lg:contents">
          <div className="flex min-w-0 shrink-0 items-center gap-2 lg:order-1">
            <FilmMusicHomeLink variant={isPlayer ? 'playerDark' : 'surfaceLight'} />
            <span className={isPlayer ? 'text-zinc-700 select-none' : 'text-zinc-300 select-none'} aria-hidden>
              /
            </span>
            <Link
              prefetch={false}
              href="/player"
              className={`truncate text-base font-bold transition-colors ${
                isPlayer ? 'text-white hover:text-zinc-300' : 'text-black hover:text-zinc-600'
              }`}
            >
              Soundings
            </Link>
          </div>
          <div className="flex shrink-0 items-center gap-2 lg:order-3">
            {isPlayer ? (
              <button
                type="button"
                onClick={openPopOutPlayer}
                title="Open the player in a separate window — you can close this tab; playback stays in that window."
                className="min-h-[40px] rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-2 text-xs font-medium text-zinc-200 transition-colors hover:border-zinc-500 hover:bg-zinc-800"
              >
                Pop out
              </button>
            ) : null}
            <a
              href="/api/auth/logout"
              className={`inline-flex min-h-[40px] items-center px-1 text-xs transition-colors ${
                isPlayer ? 'text-zinc-500 hover:text-white' : 'text-zinc-400 hover:text-black'
              }`}
            >
              Logout
            </a>
          </div>
        </div>

        <nav
          className={`flex w-full min-w-0 flex-nowrap items-center gap-1 overflow-x-auto overscroll-x-contain pb-0.5 [-webkit-overflow-scrolling:touch] [scrollbar-width:thin] lg:order-2 lg:min-w-0 lg:flex-1 lg:flex-wrap lg:justify-end lg:overflow-visible lg:pb-0 xl:justify-start ${
            isPlayer ? '[scrollbar-color:rgba(113,113,122,0.5)_transparent]' : ''
          }`}
        >
          {PAGE_LINKS.map(({ href, label }) => (
            <Link key={href} prefetch={false} href={href} className={linkPill(href, label, isActive(href))}>
              {label}
            </Link>
          ))}
          <Link prefetch={false} href={settingsHref} className={linkPill(settingsHref, 'Settings', isActive(settingsHref))}>
            Settings
          </Link>
          <span className={`shrink-0 px-0.5 ${isPlayer ? 'text-zinc-700' : 'text-zinc-300'}`} aria-hidden>
            ·
          </span>
          {RESOURCE_LINKS.map(({ href, label }) => (
            <Link key={href} prefetch={false} href={href} className={linkPlain(href, label, isActive(href))}>
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  )
}
