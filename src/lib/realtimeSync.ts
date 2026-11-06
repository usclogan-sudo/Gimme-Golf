// Realtime channel lifecycle with catch up.
//
// Realtime only delivers while the socket is up and never replays what was
// missed. On 6 November a joiner's leaderboard showed the organiser's scores
// absent while the hole view, after a refetch, showed them present: the channel
// had dropped with the tab visible, nothing noticed, and nothing caught up.
//
// This controller owns one channel. It:
//   * opens the channel with a status callback, and on CHANNEL_ERROR, TIMED_OUT
//     or an unexpected CLOSED, tears down, refetches, and reopens with backoff;
//   * refetches again once a reopened channel reports SUBSCRIBED, so writes that
//     landed during the gap are picked up;
//   * closes the channel after a grace period when the tab is hidden, and on
//     return refetches regardless of how long the tab was away, then reopens;
//   * refetches on the browser `online` event.
//
// `open` must return a teardown; the controller tags each open so a CLOSED that
// belongs to a channel it closed itself is ignored.

export const RECONNECT_BACKOFF_MS = [1000, 2000, 5000, 10000, 30000]

export function reconnectDelay(attempt: number): number {
  return RECONNECT_BACKOFF_MS[Math.min(Math.max(attempt, 0), RECONNECT_BACKOFF_MS.length - 1)]
}

export type ChannelStatus = 'SUBSCRIBED' | 'TIMED_OUT' | 'CLOSED' | 'CHANNEL_ERROR' | string

export interface RealtimeSyncOptions {
  /** Open the channel, reporting each status to `onStatus`. Returns a teardown. */
  open: (onStatus: (status: ChannelStatus) => void) => () => void
  /** Fetch the current state from the server. Must not show a loading screen. */
  refetch: () => void
  /** How long a hidden tab keeps its channel before it is dropped. */
  hiddenGraceMs?: number
  reconnectDelayMs?: (attempt: number) => number
  /** Channel state for the UI: open, reconnecting (between attempts), closed. */
  onStateChange?: (state: 'open' | 'reconnecting' | 'closed') => void
}

export interface RealtimeSync {
  start(): void
  stop(): void
  refetch(): void
  isOpen(): boolean
  /** Reconnect attempts since the last successful subscribe. */
  attempts(): number
}

export function createRealtimeSync(opts: RealtimeSyncOptions): RealtimeSync {
  const hiddenGraceMs = opts.hiddenGraceMs ?? 5000
  const delayFor = opts.reconnectDelayMs ?? reconnectDelay
  let teardown: (() => void) | null = null
  let openToken = 0
  let stopped = false
  let attempt = 0
  let failedSinceSubscribed = false
  let retryTimer: ReturnType<typeof setTimeout> | null = null
  let hiddenTimer: ReturnType<typeof setTimeout> | null = null

  const hidden = () => typeof document !== 'undefined' && document.visibilityState === 'hidden'
  let lastState: 'open' | 'reconnecting' | 'closed' = 'closed'
  const setState = (s: 'open' | 'reconnecting' | 'closed') => {
    if (s === lastState) return
    lastState = s
    opts.onStateChange?.(s)
  }

  const close = () => {
    if (!teardown) return
    const t = teardown
    teardown = null
    openToken += 1 // any status the old channel reports from here on is ignored
    try { t() } catch { /* a channel that fails to close is already gone */ }
  }

  const open = () => {
    if (stopped || teardown) return
    const token = ++openToken
    teardown = opts.open(status => handleStatus(status, token))
  }

  const clearRetry = () => { if (retryTimer) { clearTimeout(retryTimer); retryTimer = null } }
  const clearHidden = () => { if (hiddenTimer) { clearTimeout(hiddenTimer); hiddenTimer = null } }

  const scheduleReopen = () => {
    if (retryTimer || stopped) return
    const delay = delayFor(attempt)
    attempt += 1
    retryTimer = setTimeout(() => {
      retryTimer = null
      if (!stopped && !hidden()) open()
    }, delay)
  }

  const handleStatus = (status: ChannelStatus, token: number) => {
    if (stopped || token !== openToken) return
    if (status === 'SUBSCRIBED') {
      attempt = 0
      clearRetry()
      setState('open')
      if (failedSinceSubscribed) {
        failedSinceSubscribed = false
        opts.refetch()
      }
      return
    }
    if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
      failedSinceSubscribed = true
      close()
      setState('reconnecting')
      opts.refetch()
      scheduleReopen()
    }
  }

  const onVisibilityChange = () => {
    if (stopped) return
    if (hidden()) {
      clearHidden()
      hiddenTimer = setTimeout(() => {
        hiddenTimer = null
        if (!stopped && hidden()) { close(); setState('closed') }
      }, hiddenGraceMs)
      return
    }
    clearHidden()
    // Back in front: catch up whatever happened while away, however brief, and
    // make sure a channel is up. `open` is a no-op if one already is.
    opts.refetch()
    open()
  }

  const onOnline = () => {
    if (stopped) return
    opts.refetch()
    open()
  }

  return {
    start() {
      if (stopped) return
      if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibilityChange)
      if (typeof window !== 'undefined') window.addEventListener('online', onOnline)
      if (!hidden()) open()
    },
    stop() {
      stopped = true
      clearRetry()
      clearHidden()
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibilityChange)
      if (typeof window !== 'undefined') window.removeEventListener('online', onOnline)
      close()
      setState('closed')
    },
    refetch() { if (!stopped) opts.refetch() },
    isOpen() { return teardown !== null },
    attempts() { return attempt },
  }
}
