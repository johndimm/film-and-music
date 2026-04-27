import type { PlatformShellConfig } from '../types'

/** Soundings — music, Spotify / YouTube, graph, same tab language as `apps/sounding`. */
export const musicPlatformConfig: PlatformShellConfig = {
  mode: 'music',
  productName: 'Soundings',
  basePath: '/soundings',
  tabs: [
    { href: '/player', label: 'Player' },
    { href: '/channels', label: 'Channels' },
    { href: '/ratings', label: 'History' },
    { href: '/constellations', label: 'Graph' },
    { href: '/settings', label: 'Settings' },
  ],
  secondaryTabs: [{ href: '/guide', label: 'Help' }],
  headerVariant: 'player-dark',
}
