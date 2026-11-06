import { describe, it, expect } from 'vitest'
import { approvedOnly, pendingCountByPlayer, missingScorePlayers, isApprovedScore } from '../scores'
import type { HoleScore, Player } from '../../types'

const s = (playerId: string, holeNumber: number, scoreStatus?: HoleScore['scoreStatus']): HoleScore =>
  ({ id: `${playerId}-${holeNumber}`, roundId: 'r', playerId, holeNumber, grossScore: 4, scoreStatus }) as HoleScore

const players: Player[] = ['jeff', 'ann', 'bo', 'test'].map(id => ({ id, name: id, handicapIndex: 0, tee: 'White', ghinNumber: '' }))

describe('scores', () => {
  it('approved means not pending and not rejected; no status counts as approved', () => {
    expect(isApprovedScore(s('a', 1))).toBe(true)
    expect(isApprovedScore(s('a', 1, 'approved'))).toBe(true)
    expect(isApprovedScore(s('a', 1, 'pending'))).toBe(false)
    expect(isApprovedScore(s('a', 1, 'rejected'))).toBe(false)
    expect(approvedOnly([s('a', 1), s('a', 2, 'pending'), s('a', 3, 'rejected'), s('a', 4, 'approved')]).map(x => x.holeNumber)).toEqual([1, 4])
  })

  it('counts pending scores per player', () => {
    const scores = [s('jeff', 1, 'approved'), s('test', 1, 'pending'), s('test', 2, 'pending'), s('ann', 1, 'rejected')]
    expect(pendingCountByPlayer(scores)).toEqual({ test: 2 })
  })

  it('a pending score counts as present for the hole; a rejected one is still owed', () => {
    const scores = [s('jeff', 1, 'approved'), s('ann', 1, 'approved'), s('test', 1, 'pending'), s('bo', 1, 'rejected')]
    expect(missingScorePlayers(players, scores, 1).map(p => p.id)).toEqual(['bo'])
    expect(missingScorePlayers(players, scores, 2).map(p => p.id)).toEqual(['jeff', 'ann', 'bo', 'test'])
  })
})
