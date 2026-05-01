'use client'

import { createContext, useContext, type ReactNode } from 'react'
import type { PlatformShellConfig, MediaMode } from './types'

const PlatformContext = createContext<PlatformShellConfig | null>(null)

export function PlatformProvider({
  value,
  children,
}: {
  value: PlatformShellConfig
  children: ReactNode
}) {
  return <PlatformContext.Provider value={value}>{children}</PlatformContext.Provider>
}

export function usePlatformConfig(): PlatformShellConfig {
  const v = useContext(PlatformContext)
  if (!v) throw new Error('usePlatformConfig must be used under PlatformProvider')
  return v
}

export function useMediaMode(): MediaMode {
  return usePlatformConfig().mode
}
