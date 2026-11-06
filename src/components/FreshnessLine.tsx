import { useState } from 'react'
import { isTouchDevice } from '../lib/freshness'

/**
 * One quiet line: "Updated 12s ago" or "Reconnecting", with a Refresh control
 * on non-touch devices (touch devices pull to refresh instead; see
 * PullToRefresh). `tone` picks light-on-dark for headers.
 */
export function FreshnessLine({
  label, onRefresh, tone = 'light', showRefresh,
}: {
  label: string
  onRefresh?: () => void | Promise<void>
  tone?: 'light' | 'dark'
  /** Force the control on or off; defaults to "not a touch device". */
  showRefresh?: boolean
}) {
  const [busy, setBusy] = useState(false)
  const reconnecting = label === 'Reconnecting'
  const text = tone === 'dark' ? 'text-gray-300' : 'text-gray-400 dark:text-gray-500'
  const control = showRefresh ?? !isTouchDevice()
  const refresh = async () => {
    if (!onRefresh || busy) return
    setBusy(true)
    try { await onRefresh() } finally { setBusy(false) }
  }
  return (
    <p className={`text-[11px] ${text} flex items-center gap-2`} aria-live="polite">
      <span className={reconnecting ? 'inline-flex items-center gap-1' : ''}>
        {reconnecting && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />}
        {busy ? 'Refreshing…' : label}
      </span>
      {control && onRefresh && (
        <button
          type="button"
          onClick={refresh}
          disabled={busy}
          className="underline underline-offset-2 disabled:opacity-50"
          aria-label="Refresh"
        >
          Refresh
        </button>
      )}
    </p>
  )
}
