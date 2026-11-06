// @vitest-environment happy-dom
//
// A dropped realtime channel must be noticed, refetched and reopened; coming
// back to the tab must catch up whatever the gap missed.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createRealtimeSync, reconnectDelay, RECONNECT_BACKOFF_MS } from '../realtimeSync'

type Status = (s: string) => void

function harness(opts: { hiddenGraceMs?: number } = {}) {
  const teardowns: ReturnType<typeof vi.fn>[] = []
  const statusCallbacks: Status[] = []
  const open = vi.fn((onStatus: Status) => {
    statusCallbacks.push(onStatus)
    const teardown = vi.fn()
    teardowns.push(teardown)
    return teardown
  })
  const refetch = vi.fn()
  const sync = createRealtimeSync({ open, refetch, hiddenGraceMs: opts.hiddenGraceMs })
  return { sync, open, refetch, teardowns, status: (i: number, s: string) => statusCallbacks[i](s) }
}

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true })
  document.dispatchEvent(new Event('visibilitychange'))
}

describe('reconnectDelay', () => {
  it('walks the backoff table and holds at the last step', () => {
    expect(reconnectDelay(0)).toBe(RECONNECT_BACKOFF_MS[0])
    expect(reconnectDelay(2)).toBe(RECONNECT_BACKOFF_MS[2])
    expect(reconnectDelay(99)).toBe(RECONNECT_BACKOFF_MS[RECONNECT_BACKOFF_MS.length - 1])
  })
})

describe('createRealtimeSync', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
  })
  afterEach(() => vi.useRealTimers())

  it('opens on start and does nothing more while subscribed', () => {
    const h = harness()
    h.sync.start()
    expect(h.open).toHaveBeenCalledTimes(1)
    h.status(0, 'SUBSCRIBED')
    expect(h.refetch).not.toHaveBeenCalled()
    expect(h.sync.isOpen()).toBe(true)
  })

  it('on CHANNEL_ERROR: tears down, refetches, reopens after backoff, refetches again once subscribed', () => {
    const h = harness()
    h.sync.start()
    h.status(0, 'SUBSCRIBED')

    h.status(0, 'CHANNEL_ERROR')
    expect(h.teardowns[0]).toHaveBeenCalledTimes(1)
    expect(h.refetch).toHaveBeenCalledTimes(1)
    expect(h.sync.isOpen()).toBe(false)
    expect(h.open).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(RECONNECT_BACKOFF_MS[0] - 1)
    expect(h.open).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1)
    expect(h.open).toHaveBeenCalledTimes(2)
    expect(h.sync.attempts()).toBe(1)

    // The reopened channel comes up: catch up on the gap, counter resets.
    h.status(1, 'SUBSCRIBED')
    expect(h.refetch).toHaveBeenCalledTimes(2)
    expect(h.sync.attempts()).toBe(0)
  })

  it('backs off further on repeated failures', () => {
    const h = harness()
    h.sync.start()
    h.status(0, 'TIMED_OUT')
    vi.advanceTimersByTime(RECONNECT_BACKOFF_MS[0])
    expect(h.open).toHaveBeenCalledTimes(2)
    h.status(1, 'TIMED_OUT')
    vi.advanceTimersByTime(RECONNECT_BACKOFF_MS[0])
    expect(h.open).toHaveBeenCalledTimes(2) // not yet: second delay is longer
    vi.advanceTimersByTime(RECONNECT_BACKOFF_MS[1] - RECONNECT_BACKOFF_MS[0])
    expect(h.open).toHaveBeenCalledTimes(3)
  })

  it('ignores the CLOSED a channel reports because the controller closed it', () => {
    const h = harness({ hiddenGraceMs: 100 })
    h.sync.start()
    h.status(0, 'SUBSCRIBED')
    setVisibility('hidden')
    vi.advanceTimersByTime(100)
    expect(h.teardowns[0]).toHaveBeenCalledTimes(1)
    h.status(0, 'CLOSED') // late report from the channel we tore down
    expect(h.refetch).not.toHaveBeenCalled()
    vi.advanceTimersByTime(60_000)
    expect(h.open).toHaveBeenCalledTimes(1) // no reopen while hidden
  })

  it('refetches on return from hidden however brief, and reopens only if the channel was dropped', () => {
    const h = harness({ hiddenGraceMs: 5000 })
    h.sync.start()
    h.status(0, 'SUBSCRIBED')

    setVisibility('hidden')
    vi.advanceTimersByTime(1000) // shorter than the grace: channel kept
    setVisibility('visible')
    expect(h.refetch).toHaveBeenCalledTimes(1)
    expect(h.open).toHaveBeenCalledTimes(1)

    setVisibility('hidden')
    vi.advanceTimersByTime(5000) // past the grace: channel dropped
    expect(h.teardowns[0]).toHaveBeenCalledTimes(1)
    setVisibility('visible')
    expect(h.refetch).toHaveBeenCalledTimes(2)
    expect(h.open).toHaveBeenCalledTimes(2)
  })

  it('refetches on the browser online event', () => {
    const h = harness()
    h.sync.start()
    h.status(0, 'SUBSCRIBED')
    window.dispatchEvent(new Event('online'))
    expect(h.refetch).toHaveBeenCalledTimes(1)
    expect(h.open).toHaveBeenCalledTimes(1)
  })

  it('stop tears down, cancels a pending reopen, and ignores later statuses', () => {
    const h = harness()
    h.sync.start()
    h.status(0, 'CHANNEL_ERROR')
    h.sync.stop()
    vi.advanceTimersByTime(60_000)
    expect(h.open).toHaveBeenCalledTimes(1)
    h.sync.refetch()
    expect(h.refetch).toHaveBeenCalledTimes(1) // only the one from the error
  })
})
