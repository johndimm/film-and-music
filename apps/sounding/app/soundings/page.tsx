import { redirect } from 'next/navigation'

/**
 * Legacy `/soundings` URL → canonical Film & Music home at `/`.
 * Do not send logged-in users straight to `/player`; that duplicated the old splash jump that felt like an unwanted redirect to Soundings-only.
 */
export default async function SoundingsRouteRedirect({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams

  if (typeof error === 'string' && error.length > 0) {
    redirect(`/?${new URLSearchParams({ error }).toString()}`)
  }
  redirect('/')
}
