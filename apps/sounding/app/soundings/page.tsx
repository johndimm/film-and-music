import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getBaseUrl } from '@/app/lib/baseUrl'

/**
 * Legacy `/soundings` splash: canonical entry is `/` (see apps/sounding/app/page.tsx).
 */
export default async function SoundingsRouteRedirect({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const cookieStore = await cookies()
  const hasToken = cookieStore.has('spotify_access_token')
  const { error } = await searchParams
  const base = getBaseUrl()

  if (hasToken && !error) {
    redirect(base ? `${base}/player` : '/player')
  }

  if (typeof error === 'string' && error.length > 0) {
    redirect(`/?${new URLSearchParams({ error }).toString()}`)
  }
  redirect('/')
}
