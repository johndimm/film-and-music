import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { ActiveChannelProvider } from '@/app/lib/ActiveChannelContext'
import './globals.css'

const geist = Geist({ variable: '--font-sans', subsets: ['latin'] })
const geistMono = Geist_Mono({ variable: '--font-mono', subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Film & music',
  description: 'Soundings and Trailer Vision in one shell',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable}`}>
      <body className="min-h-dvh font-sans antialiased bg-zinc-50 text-zinc-900">
        <ActiveChannelProvider>{children}</ActiveChannelProvider>
      </body>
    </html>
  )
}
