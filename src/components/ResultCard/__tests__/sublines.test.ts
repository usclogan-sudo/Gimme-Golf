import { describe, it, expect } from 'vitest'
import { selectSubline, SUBLINES, hashStr, type SublineInput } from '../sublines'

const base: SublineInput = {
  roundId: 'round-abc',
  winner: 'A-Aron',
  runnerUp: 'Admin',
  lastPlace: 'Test',
  pointsInPlay: 100,
  margin: 20,
  isAllSquare: false,
}

describe('hashStr', () => {
  it('is deterministic', () => {
    expect(hashStr('round-abc')).toBe(hashStr('round-abc'))
  })
  it('is non-negative', () => {
    expect(hashStr('anything-🙂')).toBeGreaterThanOrEqual(0)
  })
})

describe('selectSubline bucket selection', () => {
  it('picks firstWin above everything when flagged', () => {
    const line = selectSubline({ ...base, isFirstWin: true })
    expect(SUBLINES.firstWin.some((t) => line === t.replace('{winner}', 'A-Aron'))).toBe(true)
  })

  it('picks allSquare when there is no winner and no settlements', () => {
    const line = selectSubline({ ...base, isAllSquare: true, winner: null, margin: 0, pointsInPlay: 0 })
    expect(SUBLINES.allSquare).toContain(line)
  })

  it('picks inProgress above every result bucket mid-round', () => {
    const line = selectSubline({ ...base, inProgress: true, isFirstWin: true, isAllSquare: true })
    const filled = SUBLINES.inProgress.map((t) => t.replace('{winner}', 'A-Aron'))
    expect(filled).toContain(line)
  })

  it('picks blowout when margin exceeds 50% of points in play', () => {
    const line = selectSubline({ ...base, pointsInPlay: 100, margin: 60 })
    const filled = SUBLINES.blowout.map((t) => t.replace('{winner}', 'A-Aron'))
    expect(filled).toContain(line)
  })

  it('picks squeaker when margin is within 10% of points in play', () => {
    const line = selectSubline({ ...base, pointsInPlay: 100, margin: 8 })
    const filled = SUBLINES.squeaker.map((t) =>
      t.replace('{winner}', 'A-Aron').replace('{runnerUp}', 'Admin'),
    )
    expect(filled).toContain(line)
  })

  it('falls back to standard otherwise', () => {
    const line = selectSubline({ ...base, pointsInPlay: 100, margin: 25 })
    const filled = SUBLINES.standard.map((t) =>
      t.replace('{winner}', 'A-Aron').replace('{lastPlace}', 'Test'),
    )
    expect(filled).toContain(line)
  })
})

describe('selectSubline determinism & safety', () => {
  it('returns the same line for the same round', () => {
    expect(selectSubline(base)).toBe(selectSubline({ ...base }))
  })

  it('varies by roundId', () => {
    // Different salts should (usually) land on different lines across many rounds.
    const a = new Set(Array.from({ length: 20 }, (_, i) => selectSubline({ ...base, roundId: `r-${i}` })))
    expect(a.size).toBeGreaterThan(1)
  })

  it('never emits an unfilled placeholder', () => {
    for (let i = 0; i < 50; i++) {
      const line = selectSubline({ ...base, roundId: `r-${i}` })
      expect(line).not.toMatch(/\{.*\}/)
    }
  })

  it('drops {lastPlace} templates when there is no last place (2-player round)', () => {
    for (let i = 0; i < 50; i++) {
      const line = selectSubline({ ...base, roundId: `two-${i}`, lastPlace: null, margin: 25, pointsInPlay: 100 })
      expect(line).not.toContain('last place')
      expect(line).not.toMatch(/\{.*\}/)
    }
  })

  it('has at least 20 standard lines (copy depth requirement §3e)', () => {
    expect(SUBLINES.standard.length).toBeGreaterThanOrEqual(20)
  })
})
