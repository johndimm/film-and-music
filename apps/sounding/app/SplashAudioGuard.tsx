'use client'

import { useEffect } from 'react'

const YT_PAUSE_MSG = JSON.stringify({
  event: 'command',
  func: 'pauseVideo',
  args: '',
})

/**
 * Belt-and-suspenders while `/` splash is mounted: pause/mute any stray `audio` / `video` elements
 * and ask YouTube embeds (postMessage API) to stop. Helps when something attached media after hydrate
 * or pathname checks briefly showed a non‑landing path.
 */
export default function SplashAudioGuard() {
  useEffect(() => {
    let ticks = 0
    const maxTicks = 24
    let intervalId = 0

    const run = () => {
      ticks += 1
      if (ticks > maxTicks) {
        window.clearInterval(intervalId)
        return
      }

      document.querySelectorAll('audio, video').forEach((node) => {
        const el = node as HTMLMediaElement
        try {
          el.muted = true
          void el.pause()
        } catch {
          /* ignore */
        }
      })

      document.querySelectorAll('iframe[src*="youtube.com/embed"]').forEach((node) => {
        const frame = node as HTMLIFrameElement
        try {
          frame.contentWindow?.postMessage(YT_PAUSE_MSG, '*')
        } catch {
          /* ignore */
        }
      })
    }

    run()
    intervalId = window.setInterval(run, 350)
    return () => window.clearInterval(intervalId)
  }, [])

  return null
}
