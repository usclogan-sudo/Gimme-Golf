import { describe, it, expect } from 'vitest'
import { fmtSigned, middleTruncate, formatFormats, buildHeadline, splitHeadlineNames } from '../ResultCard'
import type { ResultCardStanding } from '../ResultCard'

describe('fmtSigned', () => {
  it('signs positives with a plus', () => expect(fmtSigned(50)).toBe('+50'))
  it('signs negatives with a true minus', () => expect(fmtSigned(-25)).toBe('−25'))
  it('renders zero as E', () => expect(fmtSigned(0)).toBe('E'))
})

describe('middleTruncate', () => {
  it('leaves short names alone', () => expect(middleTruncate('A-Aron')).toBe('A-Aron'))
  it('truncates long names with a middle ellipsis, never wrapping', () => {
    const out = middleTruncate('Christopher Wetherington', 18)
    expect(out).toContain('…')
    expect(out.length).toBe(18)
    expect(out.startsWith('Christ')).toBe(true)
    expect(out.endsWith('ington')).toBe(true)
  })
})

describe('split headline', () => {
  const row = (id: string, displayName: string): ResultCardStanding => ({ playerId: id, displayName, net: 20, position: 1 })

  it('uses first names when two players share the win, so it fits at phone width', () => {
    const h = buildHeadline([row('a', 'Jeff Logan'), row('b', 'Lee Wetherington')], false, false)
    expect(h.line1).toBe('Jeff and Lee')
    expect(h.line2).toBe('split it.')
    expect(h.figure).toBe('+20')
  })

  it('falls back to full names when the first names collide', () => {
    const h = buildHeadline([row('a', 'Jeff Logan'), row('b', 'Jeff Baker')], false, false)
    expect(h.line1).toBe('Jeff Logan and Jeff Baker')
  })

  it('treats the collision case-insensitively and keeps the 14-char cap on the fallback', () => {
    const names = splitHeadlineNames(['jeff Logan', 'Jeff Christopherson'])
    expect(names[0]).toBe('jeff Logan')
    expect(names[1].length).toBeLessThanOrEqual(14)
    expect(names[1]).toContain('…')
  })

  it('leaves the single-winner headline alone', () => {
    const h = buildHeadline([row('a', 'Jeff Logan')], false, false)
    expect(h.line1).toBe('Jeff Logan')
    expect(h.line2).toBe('takes it.')
  })
})

describe('formatFormats', () => {
  it('single format uppercases', () => expect(formatFormats(['Skins'])).toBe('SKINS'))
  it('two formats join with a middot', () => expect(formatFormats(['Skins', 'Best Ball'])).toBe('SKINS · BEST BALL'))
  it('three or more collapse to "+N GAMES"', () =>
    expect(formatFormats(['Skins', 'Best Ball', 'Wolf'])).toBe('SKINS +2 GAMES'))
  it('drops empties', () => expect(formatFormats(['Skins', ''])).toBe('SKINS'))
})
