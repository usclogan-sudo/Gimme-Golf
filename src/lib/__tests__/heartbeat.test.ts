// @vitest-environment happy-dom
//
// A tab that dies on a work-in-progress screen must say so on the next launch.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  HEARTBEAT_KEY, startHeartbeat, stopHeartbeat, readHeartbeat, reportUncleanExit, _resetHeartbeatForTests,
} from '../heartbeat'

vi.mock('../sentry', () => ({
  Sentry: { captureMessage: vi.fn() },
}))
import { Sentry } from '../sentry'

describe('heartbeat', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-06T20:00:00Z'))
    _resetHeartbeatForTests()
    vi.mocked(Sentry.captureMessage).mockClear()
  })
  afterEach(() => {
    _resetHeartbeatForTests()
    vi.useRealTimers()
  })

  it('writes the screen and a timestamp every second while running', () => {
    startHeartbeat('event-setup')
    expect(readHeartbeat()).toMatchObject({ screen: 'event-setup', lastBeatAt: Date.parse('2026-11-06T20:00:00Z') })
    vi.advanceTimersByTime(3000)
    expect(readHeartbeat()?.lastBeatAt).toBe(Date.parse('2026-11-06T20:00:03Z'))
    expect(readHeartbeat()?.startedAt).toBe(Date.parse('2026-11-06T20:00:00Z'))
  })

  it('leaving the screen normally clears the record, so nothing is reported next launch', () => {
    startHeartbeat('scorecard')
    vi.advanceTimersByTime(2000)
    stopHeartbeat()
    expect(localStorage.getItem(HEARTBEAT_KEY)).toBeNull()
    expect(reportUncleanExit()).toBeNull()
    expect(Sentry.captureMessage).not.toHaveBeenCalled()
  })

  it('pagehide marks the record clean, so a normal page exit is not reported', () => {
    startHeartbeat('join-round')
    vi.advanceTimersByTime(1000)
    window.dispatchEvent(new Event('pagehide'))
    expect(readHeartbeat()?.clean).toBe(true)
    _resetHeartbeatForTests_keepRecord()
    expect(reportUncleanExit()).toBeNull()
    expect(Sentry.captureMessage).not.toHaveBeenCalled()
  })

  it('a record with no pagehide is reported once with the screen and seconds alive', () => {
    startHeartbeat('event-setup')
    vi.advanceTimersByTime(42_000)
    // Simulate the tab dying: the interval stops but the record stays.
    _resetHeartbeatForTests_keepRecord()
    vi.setSystemTime(new Date('2026-11-06T20:10:00Z'))

    const reported = reportUncleanExit()
    expect(reported?.screen).toBe('event-setup')
    expect(Sentry.captureMessage).toHaveBeenCalledTimes(1)
    expect(Sentry.captureMessage).toHaveBeenCalledWith('tab died on event-setup', expect.objectContaining({
      level: 'warning',
      tags: { area: 'heartbeat', screen: 'event-setup' },
      extra: expect.objectContaining({ secondsAlive: 42 }),
    }))
    // Reported once: the record is cleared.
    expect(localStorage.getItem(HEARTBEAT_KEY)).toBeNull()
    expect(reportUncleanExit()).toBeNull()
  })

  it('re-targeting to another screen restarts the clock', () => {
    startHeartbeat('join-round')
    vi.advanceTimersByTime(5000)
    startHeartbeat('scorecard')
    expect(readHeartbeat()).toMatchObject({ screen: 'scorecard', startedAt: Date.parse('2026-11-06T20:00:05Z') })
  })
})

/** Stop the interval without clearing storage: what a killed tab leaves behind. */
function _resetHeartbeatForTests_keepRecord() {
  const record = localStorage.getItem(HEARTBEAT_KEY)
  _resetHeartbeatForTests()
  if (record) localStorage.setItem(HEARTBEAT_KEY, record)
}
