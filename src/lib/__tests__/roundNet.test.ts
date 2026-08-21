import { describe, it, expect } from 'vitest'
import type { Player, CourseSnapshot, HoleScore, SkinsConfig, Game, SideBet, Round } from '../../types'
import { computeRoundPlayerNets } from '../roundNet'

const players: Player[] = [
  { id: 'p1', name: 'Alice', handicapIndex: 0, tee: 'White', ghinNumber: '' },
  { id: 'p2', name: 'Bob', handicapIndex: 0, tee: 'White', ghinNumber: '' },
  { id: 'p3', name: 'Carol', handicapIndex: 0, tee: 'White', ghinNumber: '' },
]

const snapshot: CourseSnapshot = {
  courseId: 'c1',
  courseName: 'Test Course',
  tees: [{ name: 'White', rating: 72, slope: 113 }],
  holes: Array.from({ length: 18 }, (_, i) => ({ number: i + 1, par: 4, strokeIndex: i + 1, yardages: { White: 400 } })),
}

const hs = (playerId: string, holeNumber: number, grossScore: number): HoleScore => ({
  id: `${playerId}-h${holeNumber}`, roundId: 'r1', playerId, holeNumber, grossScore,
})

// Alice birdies every hole; Bob & Carol bogey → Alice wins every gross skin.
const scores: HoleScore[] = players.flatMap(p =>
  Array.from({ length: 18 }, (_, i) => hs(p.id, i + 1, p.id === 'p1' ? 3 : 5)),
)

const mkRound = (game: Game | undefined, junkConfig?: any): Round => ({
  id: 'r1',
  players,
  courseSnapshot: snapshot,
  holesMode: 'full_18',
  game,
  junkConfig,
} as unknown as Round)

const skinsGame: Game = {
  id: 'g1', type: 'skins', buyInCents: 100, stakesMode: 'standard',
  config: { mode: 'gross', carryovers: true } as SkinsConfig,
}

describe('computeRoundPlayerNets', () => {
  it('nets a skins pot zero-sum: sole winner takes the pot minus their ante', () => {
    const { netByPlayer, hasGame } = computeRoundPlayerNets({ round: mkRound(skinsGame), roundScores: scores, roundPlayers: [] })
    expect(hasGame).toBe(true)
    // Pot = 100 × 3 = 300. Alice wins all skins → +300 − 100 ante = +200; others −100.
    expect(netByPlayer.p1).toBe(200)
    expect(netByPlayer.p2).toBe(-100)
    expect(netByPlayer.p3).toBe(-100)
    // Zero-sum
    expect(netByPlayer.p1 + netByPlayer.p2 + netByPlayer.p3).toBe(0)
  })

  it('folds resolved side bets into the net on top of the game', () => {
    const sideBets: SideBet[] = [
      { id: 'sb1', roundId: 'r1', status: 'resolved', winnerPlayerId: 'p2', participants: ['p2', 'p3'], amountCents: 50, description: 'closest to pin' } as unknown as SideBet,
    ]
    const { netByPlayer } = computeRoundPlayerNets({ round: mkRound(skinsGame), roundScores: scores, roundPlayers: [], sideBets })
    // Skins: p1 +200, p2 −100, p3 −100. Side bet: p2 +50 from p3.
    expect(netByPlayer.p1).toBe(200)
    expect(netByPlayer.p2).toBe(-50)
    expect(netByPlayer.p3).toBe(-150)
    expect(netByPlayer.p1 + netByPlayer.p2 + netByPlayer.p3).toBe(0)
  })

  it('reports hasGame=false and all-zero net for a round with no game', () => {
    const { netByPlayer, hasGame } = computeRoundPlayerNets({ round: mkRound(undefined), roundScores: scores, roundPlayers: [] })
    expect(hasGame).toBe(false)
    expect(netByPlayer.p1).toBe(0)
    expect(netByPlayer.p2).toBe(0)
    expect(netByPlayer.p3).toBe(0)
  })
})
