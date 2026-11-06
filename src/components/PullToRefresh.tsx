import { useRef, useState, type ReactNode } from 'react'

const THRESHOLD_PX = 70
const MAX_PULL_PX = 120

/**
 * Pull down from the top of the page to refresh. Touch only; a desktop user
 * has the Refresh control in FreshnessLine. The page scrolls, not this element,
 * so the gesture only counts when the window is already at the top.
 */
export function PullToRefresh({ onRefresh, children }: { onRefresh: () => void | Promise<void>; children: ReactNode }) {
  const startY = useRef<number | null>(null)
  const [pull, setPull] = useState(0)
  const [refreshing, setRefreshing] = useState(false)

  const atTop = () => (typeof window === 'undefined' ? true : window.scrollY <= 0)

  const onTouchStart = (e: React.TouchEvent) => {
    if (refreshing || !atTop()) return
    startY.current = e.touches[0]?.clientY ?? null
  }
  const onTouchMove = (e: React.TouchEvent) => {
    if (startY.current === null || refreshing) return
    const y = e.touches[0]?.clientY ?? startY.current
    const dy = y - startY.current
    if (dy <= 0 || !atTop()) { setPull(0); return }
    setPull(Math.min(dy, MAX_PULL_PX))
  }
  const onTouchEnd = async () => {
    const pulled = pull
    startY.current = null
    setPull(0)
    if (pulled < THRESHOLD_PX || refreshing) return
    setRefreshing(true)
    try { await onRefresh() } finally { setRefreshing(false) }
  }

  const label = refreshing ? 'Refreshing…' : pull >= THRESHOLD_PX ? 'Release to refresh' : 'Pull to refresh'
  const height = refreshing ? 32 : Math.round(pull * 0.5)

  return (
    <div onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} onTouchCancel={onTouchEnd}>
      <div
        className="overflow-hidden flex items-end justify-center text-[11px] text-gray-400 dark:text-gray-500 transition-[height]"
        style={{ height }}
        aria-hidden={height === 0}
        data-testid="pull-indicator"
      >
        {height > 0 && <span className="pb-1">{label}</span>}
      </div>
      {children}
    </div>
  )
}
