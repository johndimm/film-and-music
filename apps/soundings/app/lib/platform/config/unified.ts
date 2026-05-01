import type { PlatformShellConfig } from '../types'

/**
 * One shell: same tabs for everyone; **Channels** is a single list that can include
 * both music and movie channels. Player uses the **active** channel’s `kind` to load
 * the right adapter (Spotify/YouTube vs trailer/LLM).
 */
export const unifiedPlatformConfig: PlatformShellConfig = {
  mode: 'unified',
  productName: 'Film & music',
  basePath: '',
  productHref: '/player',
  tabs: [
    { href: '/player', label: 'Player' },
    { href: '/channels', label: 'Channels' },
    { href: '/soundings/constellations', label: 'Graph' },
    { href: '/settings', label: 'Settings' },
  ],
  secondaryTabs: [{ href: '/soundings/guide', label: 'Help' }],
  headerVariant: 'player-dark',
}
