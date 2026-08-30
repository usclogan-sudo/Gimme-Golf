import { describe, it, expect } from 'vitest'
import { getCardCompleteness, describeMissing } from '../cardCompleteness'
import type { Round, HoleScore, Player, CourseSnapshot } from '../../types'

const players: Player[] = [
  { id: 'p1', name: 'Alice', handicapIndex: 10, tee: 'White', ghinNumber: '' },
  { id: 'p2', name: 'Bob', handicapIndex: 20, tee: 'White', ghinNumber: '' },
]

const snapshot: CourseSnapshot = {
  courseId: 'c1',
  courseName: 'Test Course',
  tees: [{ name: 'White', rating: 72, slope: 130 }],
  holes: Array.from({ length: 18 }, (_, i) => ({
    number: i + 1, par: 4, strokeIndex: i + 1, yardages: { White: 400 },
  })),
}

const mkRound = (over: Partial<Round> = {}): Round => ({
  id: 'r1', courseId: 'c1', date: new Date('2026-08-30'), status: 'active',
  currentHole: 1, courseSnapshot: snapshot, players, ...over,
})

const hs = (playerId: string, holeNumber: number): HoleScore =>
  ({ id: `${playerId}-${holeNumber}`, roundId: 'r1', playerId, holeNumber, grossScore: 4 })

/** Every roster player scored on holes `nums`. */
const fill = (nums: number[]) => players.flatMap(p => nums.map(n => hs(p.id, n)))
const all18 = Array.from({ length: 18 }, (_, i) => i + 1)
const front9 = Array.from({ length: 9 }, (_, i) => i + 1)
const back9 = Array.from({ length: 9 }, (_, i) => i + 10)

describe('§2.3 card completeness', () => {
  it('is complete when every player has a score on every configured hole', () => {
    const c = getCardCompleteness(mkRound(), fill(all18))
    expect(c.complete).toBe(true)
    expect(c.totalHoles).toBe(18)
    expect(c.holesFullyScored).toBe(18)
    expect(c.missing).toEqual([])
  })

  it('is incomplete while any single score is missing', () => {
    const scores = fill(all18).filter(s => !(s.playerId === 'p2' && s.holeNumber === 7))
    const c = getCardCompleteness(mkRound(), scores)
    expect(c.complete).toBe(false)
    expect(c.holesFullyScored).toBe(17)
  })

  it('names every player and hole with a missing entry', () => {
    const scores = fill(all18).filter(s =>
      !(s.playerId === 'p2' && (s.holeNumber === 7 || s.holeNumber === 12)) &&
      !(s.playerId === 'p1' && s.holeNumber === 3))
    const c = getCardCompleteness(mkRound(), scores)
    expect(c.missing).toEqual([
      { playerId: 'p1', playerName: 'Alice', holeNumbers: [3] },
      { playerId: 'p2', playerName: 'Bob', holeNumbers: [7, 12] },
    ])
    expect(describeMissing(c)).toBe(
      '15 of 18 holes scored. Missing: Alice — hole 3; Bob — holes 7, 12.')
  })

  it('resolves the instant the last score is entered', () => {
    const partial = fill(all18).filter(s => !(s.playerId === 'p2' && s.holeNumber === 18))
    expect(getCardCompleteness(mkRound(), partial).complete).toBe(false)
    // Same inputs plus the final entry — no refetch, no other state change.
    expect(getCardCompleteness(mkRound(), [...partial, hs('p2', 18)]).complete).toBe(true)
    expect(describeMissing(getCardCompleteness(mkRound(), [...partial, hs('p2', 18)]))).toBeNull()
  })

  it('treats a nine-hole round as complete at nine', () => {
    const c = getCardCompleteness(mkRound({ holesMode: 'front_9' }), fill(front9))
    expect(c.complete).toBe(true)
    expect(c.totalHoles).toBe(9)
  })

  it('scores the back nine for a back_9 round, not holes 1–9', () => {
    const round = mkRound({ holesMode: 'back_9' })
    expect(getCardCompleteness(round, fill(front9)).complete).toBe(false)
    const c = getCardCompleteness(round, fill(back9))
    expect(c.complete).toBe(true)
    expect(c.totalHoles).toBe(9)
  })

  it('does not count the unplayed nine against a nine-hole round', () => {
    const c = getCardCompleteness(mkRound({ holesMode: 'front_9' }), fill(front9))
    expect(c.missing).toEqual([])
  })

  it('follows a shotgun start hole set', () => {
    const c = getCardCompleteness(mkRound({ startingHole: 7 }), fill(all18))
    expect(c.complete).toBe(true)
    expect(c.totalHoles).toBe(18)
  })

  it('counts a mid-round joiner missing the early holes as incomplete', () => {
    // §2.3 makes no exception for a late arrival: the rack needs a full card.
    const late: Player = { id: 'p3', name: 'Carol', handicapIndex: 8, tee: 'White', ghinNumber: '' }
    const round = mkRound({ players: [...players, late] })
    const scores = [...fill(all18), ...back9.map(n => hs('p3', n))]
    const c = getCardCompleteness(round, scores)
    expect(c.complete).toBe(false)
    expect(c.missing).toEqual([
      { playerId: 'p3', playerName: 'Carol', holeNumbers: front9 },
    ])
  })

  it('is never complete without a roster or a course snapshot', () => {
    expect(getCardCompleteness(mkRound({ players: [] }), []).complete).toBe(false)
    expect(getCardCompleteness(mkRound({ courseSnapshot: undefined }), []).complete).toBe(false)
    expect(describeMissing(getCardCompleteness(mkRound({ players: [] }), [])))
      .toBe('This round has no course or roster yet.')
  })

  it('reports an untouched card as fully missing', () => {
    const c = getCardCompleteness(mkRound(), [])
    expect(c.complete).toBe(false)
    expect(c.holesFullyScored).toBe(0)
    expect(c.missing).toHaveLength(2)
    expect(c.missing[0].holeNumbers).toEqual(all18)
  })
})
