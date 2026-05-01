'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { PlatformShellConfig } from '../types'

function joinBase(base: string, href: string) {
  if (href === '/') return base || '/'
  const b = base.endsWith('/') ? base.slice(0, -1) : base
  const h = href.startsWith('/') ? href : `/${href}`
  return `${b}${h}`
}

export function AppShell({
  config,
  children,
}: {
  config: PlatformShellConfig
  children: ReactNode
}) {
  const pathname = usePathname()
  const { basePath, productName, productHref, tabs, secondaryTabs, headerVariant } = config
  const brandTarget = productHref ?? (basePath || '/')
  const isPlayerish =
    headerVariant === 'player-dark' &&
    (pathname === joinBase(basePath, '/player') || pathname.startsWith(joinBase(basePath, '/player') + '/'))

  const bar =
    headerVariant === 'player-dark' && isPlayerish
      ? 'bg-black border-zinc-900 text-white'
      : headerVariant === 'player-dark'
        ? 'bg-zinc-950 border-zinc-800 text-zinc-100'
        : 'bg-white border-zinc-200 text-zinc-900'

  const linkIdle =
    headerVariant === 'player-dark' && isPlayerish
      ? 'text-zinc-400 hover:text-white hover:bg-zinc-900'
      : headerVariant === 'player-dark'
        ? 'text-zinc-500 hover:text-white hover:bg-zinc-800'
        : 'text-zinc-500 hover:text-black hover:bg-zinc-100'

  const linkActive =
    headerVariant === 'player-dark' && isPlayerish
      ? 'bg-zinc-800 text-white'
      : headerVariant === 'player-dark'
        ? 'bg-zinc-800 text-white'
        : 'bg-zinc-100 text-black'

  const isActive = (href: string) => {
    const full = joinBase(basePath, href)
    if (href === '/player') {
      return pathname === full || pathname.startsWith(`${full}/`)
    }
    if (href === '/') {
      return pathname === basePath || pathname === `${basePath}/`
    }
    return pathname === full || pathname.startsWith(`${full}/`)
  }

  return (
    <div className="min-h-dvh flex flex-col">
      <header className={`border-b ${bar}`}>
        <div className="flex max-w-3xl mx-auto min-w-0 items-center gap-2 px-4 py-2 flex-wrap">
          <Link
            href={brandTarget}
            className={`text-base font-bold mr-1 shrink-0 ${
              isPlayerish ? 'text-white hover:text-zinc-300' : 'text-inherit'
            }`}
          >
            {productName}
          </Link>
          <nav className="flex flex-1 flex-wrap items-center gap-1 min-w-0">
            {tabs.map((tab) => {
              const full = joinBase(basePath, tab.href)
              const active = isActive(tab.href)
              return (
                <Link
                  key={full}
                  href={full}
                  className={`shrink-0 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                    active ? linkActive : linkIdle
                  }`}
                >
                  {tab.label}
                </Link>
              )
            })}
            {secondaryTabs && secondaryTabs.length > 0 && (
              <span
                className={
                  isPlayerish ? 'mx-0.5 text-zinc-600' : 'mx-0.5 text-zinc-300'
                }
              >
                ·
              </span>
            )}
            {secondaryTabs?.map((tab) => {
              const full = joinBase(basePath, tab.href)
              const active = pathname === full || pathname.startsWith(`${full}/`)
              return (
                <Link
                  key={full}
                  href={full}
                  className={`px-1 text-xs transition-colors ${
                    active
                      ? isPlayerish
                        ? 'text-zinc-300'
                        : 'text-zinc-700'
                      : isPlayerish
                        ? 'text-zinc-500 hover:text-zinc-300'
                        : 'text-zinc-400 hover:text-zinc-700'
                  }`}
                >
                  {tab.label}
                </Link>
              )
            })}
          </nav>
          <Link
            href="/"
            className={`ml-auto shrink-0 text-xs ${
              isPlayerish ? 'text-zinc-500 hover:text-zinc-300' : 'text-zinc-400 hover:text-zinc-600'
            }`}
          >
            Film &amp; music
          </Link>
        </div>
      </header>
      <main className="flex-1 min-h-0">{children}</main>
    </div>
  )
}
