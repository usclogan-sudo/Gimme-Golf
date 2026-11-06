// "Updated 12s ago": how stale the screen might be.
//
// A phone on a golf course drops its socket without telling anyone. The line
// gives the reader a reason to pull down, and says "Reconnecting" while the
// channel controller is between attempts (lib/realtimeSync.ts).

import { useEffect, useState } from 'react'

export type ChannelState = 'open' | 'reconnecting' | 'closed'

export function freshnessLabel(lastAt: number | null, now: number, state: ChannelState = 'open'): string {
  if (state === 'reconnecting') return 'Reconnecting'
  if (lastAt === null) return 'Not updated yet'
  const secs = Math.max(0, Math.floor((now - lastAt) / 1000))
  if (secs < 10) return 'Updated just now'
  if (secs < 60) return `Updated ${secs}s ago`
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `Updated ${mins}m ago`
  const hours = Math.floor(mins / 60)
  return `Updated ${hours}h ago`
}

/** The label, re-evaluated every few seconds so "just now" ages on its own. */
export function useFreshness(lastAt: number | null, state: ChannelState = 'open', tickMs = 5000): string {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), tickMs)
    return () => clearInterval(t)
  }, [tickMs])
  // A new fetch should read "just now" immediately, not at the next tick.
  const effectiveNow = lastAt !== null && lastAt > now ? lastAt : now
  return freshnessLabel(lastAt, effectiveNow, state)
}

/** Touch devices pull to refresh; everyone else gets a button. */
export function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false
  return 'ontouchstart' in window || (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0)
}
