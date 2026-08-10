import { describe, it, expect } from 'vitest'
import { fmtSigned, middleTruncate, formatFormats } from '../ResultCard'

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

describe('formatFormats', () => {
  it('single format uppercases', () => expect(formatFormats(['Skins'])).toBe('SKINS'))
  it('two formats join with a middot', () => expect(formatFormats(['Skins', 'Best Ball'])).toBe('SKINS · BEST BALL'))
  it('three or more collapse to "+N GAMES"', () =>
    expect(formatFormats(['Skins', 'Best Ball', 'Wolf'])).toBe('SKINS +2 GAMES'))
  it('drops empties', () => expect(formatFormats(['Skins', ''])).toBe('SKINS'))
})
