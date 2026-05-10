'use client'

import AppHeader from '@/app/components/AppHeader'
import LlmLogViewer from '@/app/components/LlmLogViewer'

export default function SoundingsPlayerLogsPage() {
  return (
    <>
      <AppHeader />
      <LlmLogViewer shell="soundings" />
    </>
  )
}
