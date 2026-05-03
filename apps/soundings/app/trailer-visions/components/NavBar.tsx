"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import FilmMusicHomeLink from "@/app/components/FilmMusicHomeLink";

const BASE_LINKS = [
  { href: "/trailer-visions", label: "Player" },
  { href: "/trailer-visions/channels", label: "Channels" },
  { href: "/trailer-visions/history", label: "History" },
  { href: "/trailer-visions/watchlist", label: "Watchlist" },
  { href: "/trailer-visions/constellations", label: "Graph" },
  { href: "/trailer-visions/logs", label: "Logs" },
  { href: "/trailer-visions/help", label: "Help" },
];

function NavBarInner() {
  const pathname = usePathname();
  const sp = useSearchParams();
  if (sp.get("unifiedEmbed") === "1") return null;

  const settingsHref = pathname.startsWith("/trailer-visions/constellations")
    ? "/trailer-visions/constellations/settings"
    : "/trailer-visions/settings";

  const LINKS = [
    ...BASE_LINKS,
    { href: settingsHref, label: "Settings" },
  ];

  return (
    <nav className="sticky top-0 z-40 w-full min-w-0 shrink-0 border-b border-zinc-800 bg-black/90 backdrop-blur-sm">
      <div className="max-w-3xl mx-auto min-w-0 px-4 h-11 flex items-center gap-2">
        <div className="hidden sm:flex shrink-0 items-center gap-1.5 mr-1">
          <FilmMusicHomeLink variant="playerDark" />
          <span className="text-zinc-600 select-none" aria-hidden>/</span>
          <span className="font-bold text-zinc-100 text-sm tracking-tight">Trailer Vision</span>
        </div>
        <div className="min-w-0 flex-1 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex w-max min-h-11 items-center gap-1 pr-1 sm:pl-0">
            {/* Mobile-only: breadcrumb home (same subtle link as Soundings chrome) */}
            <div className="flex shrink-0 items-center gap-1.5 mr-2 sm:hidden">
              <FilmMusicHomeLink variant="playerDark" />
              <span className="text-zinc-600 select-none text-xs">/</span>
            </div>
            {LINKS.map(({ href, label }) => {
              const active =
                href === "/trailer-visions"
                  ? pathname === "/trailer-visions"
                  : pathname === href || pathname.startsWith(`${href}/`);
              return (
                <Link
                  key={href}
                  href={href}
                  className={`shrink-0 px-2.5 py-1 sm:px-3 rounded-lg text-sm font-medium transition-colors ${
                    active
                      ? "bg-zinc-700 text-white"
                      : "text-zinc-400 hover:text-white hover:bg-zinc-800"
                  }`}
                >
                  {label}
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </nav>
  );
}

/**
 * Hides the shell nav when the Film & music app embeds this app in an iframe (`?unifiedEmbed=1`)
 * to avoid a double header.
 */
export default function NavBar() {
  return (
    <Suspense fallback={null}>
      <NavBarInner />
    </Suspense>
  );
}
