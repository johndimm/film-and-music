import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { cookies, headers } from "next/headers";
import "./globals.css";
import PersistentPlayerHost from "./(earprint)/PersistentPlayerHost";
import { isYoutubeResolveTestServerEnabled } from "@/app/lib/youtubeResolveTestEnv";
import { soundingsStorage } from "@/app/lib/platform";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Soundings",
  description: "Music discovery that learns your taste",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  userScalable: true,
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const headerList = await headers();
  const accessToken = cookieStore.get("spotify_access_token")?.value ?? "";
  // Only force YouTube-only mode when the user has no Spotify session; a cookie alone
  // shouldn't override a real Spotify login (Settings can flip the source at runtime).
  const youtubeModeFromCookie =
    !accessToken && cookieStore.get(soundingsStorage.youtubeModeCookie)?.value === "1";
  const youtubeResolveTestFromServer = isYoutubeResolveTestServerEnabled();

  const requestHost =
    headerList.get("x-forwarded-host") ?? headerList.get("host") ?? "";
  if (process.env.NODE_ENV !== "production") {
    console.info("[soundings-boot]", {
      host: requestHost,
      spotifyAccessCookiePresent: Boolean(accessToken),
      youtubeModeCookieLatch: youtubeModeFromCookie,
    });
    // Host header is 0.0.0.0 only when the dev server binds to all interfaces (`npm run dev:network`).
    if (requestHost.startsWith("0.0.0.0")) {
      console.warn(
        "[soundings-boot] Request Host is 0.0.0.0 — Spotify OAuth redirects are normally registered for localhost. Open http://localhost:3000 in the browser, or switch default dev to `npm run dev` (localhost bind).",
      );
    }
  }

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full bg-zinc-950 antialiased`}
    >
      <body className="min-h-full flex flex-col bg-zinc-950 text-zinc-100">
        <PersistentPlayerHost
          accessToken={accessToken}
          youtubeResolveTestFromServer={youtubeResolveTestFromServer}
          youtubeModeFromCookie={youtubeModeFromCookie}
        >
          {children}
        </PersistentPlayerHost>
      </body>
    </html>
  );
}
