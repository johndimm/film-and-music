'use client'

import { useState } from 'react'

export default function RequestAccessForm() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setStatus('sending')
    try {
      const res = await fetch('/api/request-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      setStatus(res.ok ? 'sent' : 'error')
    } catch {
      setStatus('error')
    }
  }

  if (status === 'sent') {
    return (
      <p className="text-center text-base text-zinc-300">Request sent — you&apos;ll hear back soon.</p>
    )
  }

  return (
    <form onSubmit={submit} className="flex w-full flex-col items-center gap-3">
      <p className="text-base font-medium text-zinc-300">Request beta access</p>
      <div className="flex gap-2 w-full">
        <input
          type="email"
          required
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="your@email.com"
          className="flex-1 rounded-lg border border-zinc-600 bg-zinc-900 px-3 py-2.5 text-base text-white placeholder-zinc-500 focus:border-zinc-400 focus:outline-none"
        />
        <button
          type="submit"
          disabled={status === 'sending'}
          className="rounded-lg bg-zinc-700 px-4 py-2.5 text-base font-medium text-white transition-colors hover:bg-zinc-600 disabled:opacity-50"
        >
          {status === 'sending' ? 'Sending…' : 'Send'}
        </button>
      </div>
      {status === 'error' && <p className="text-base text-red-400">Something went wrong. Try again.</p>}
    </form>
  )
}
