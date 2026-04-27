import { AppShell, PlatformProvider, unifiedPlatformConfig } from '@film-music/platform'

/**
 * One chrome for the whole app: same tabs whether you’re on /player, /channels,
 * /soundings/constellations, or /trailer-visions/player — so music and movie features stay under one shell.
 */
export function UnifiedShellLayout({ children }: { children: React.ReactNode }) {
  return (
    <PlatformProvider value={unifiedPlatformConfig}>
      <AppShell config={unifiedPlatformConfig}>{children}</AppShell>
    </PlatformProvider>
  )
}
