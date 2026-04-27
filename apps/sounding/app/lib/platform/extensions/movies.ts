import type { PlatformShellConfig } from '../types'

/** Trailer Vision — movies, channels, watchlist, same tab language as `apps/trailer-vision`. */
export const moviesPlatformConfig: PlatformShellConfig = {
  mode: 'movies',
  productName: 'Trailer Vision',
  basePath: '/trailer-visions',
  tabs: [
    { href: '/player', label: 'Player' },
    { href: '/channels', label: 'Channels' },
    { href: '/history', label: 'History' },
    { href: '/watchlist', label: 'Watchlist' },
    { href: '/settings', label: 'Settings' },
  ],
  secondaryTabs: [{ href: '/help', label: 'Help' }],
  headerVariant: 'neutral',
}
