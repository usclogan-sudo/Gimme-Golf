import { describe, it, expect } from 'vitest'
import { freshnessLabel } from '../freshness'

const T0 = Date.parse('2026-11-06T20:00:00Z')

describe('freshnessLabel', () => {
  it('reads Reconnecting whatever the age while the channel is between attempts', () => {
    expect(freshnessLabel(T0, T0 + 5_000, 'reconnecting')).toBe('Reconnecting')
    expect(freshnessLabel(null, T0, 'reconnecting')).toBe('Reconnecting')
  })

  it('says so before the first fetch lands', () => {
    expect(freshnessLabel(null, T0)).toBe('Not updated yet')
    expect(freshnessLabel(null, T0, 'closed')).toBe('Not updated yet')
  })

  it('ages from just now through seconds, minutes and hours', () => {
    expect(freshnessLabel(T0, T0)).toBe('Updated just now')
    expect(freshnessLabel(T0, T0 + 9_999)).toBe('Updated just now')
    expect(freshnessLabel(T0, T0 + 12_000)).toBe('Updated 12s ago')
    expect(freshnessLabel(T0, T0 + 59_999)).toBe('Updated 59s ago')
    expect(freshnessLabel(T0, T0 + 2 * 60_000)).toBe('Updated 2m ago')
    expect(freshnessLabel(T0, T0 + 59 * 60_000 + 59_000)).toBe('Updated 59m ago')
    expect(freshnessLabel(T0, T0 + 3 * 3_600_000)).toBe('Updated 3h ago')
  })

  it('a closed channel still reports the age of the last data', () => {
    expect(freshnessLabel(T0, T0 + 30_000, 'closed')).toBe('Updated 30s ago')
  })

  it('never goes negative when the clock is behind the fetch', () => {
    expect(freshnessLabel(T0 + 5_000, T0)).toBe('Updated just now')
  })
})
