import type {
  Player,
  CourseSnapshot,
  HoleScore,
  SkinsConfig,
  StablefordConfig,
  JunkConfig,
  JunkRecord,
  SideBet,
  Game,
  RoundPlayer,
} from '../../types'

import {
  calcCourseHandicap,
  strokesOnHole,
  buildCourseHandicaps,
  calculateSkins,
  calculateStableford,
  calculateQuota,
  calculateJunks,
  calculateSkinsPayouts,
  calculateBBBPayouts,
  calculateWolfPayouts,
  buildDirectSettlements,
  buildSettlements,
  buildUnifiedSettlements,
  netFromPayouts,
  isUnitGame,
  unitGameNet,
  calculateSideBetSettlements,
  fmtMoney,
  fmtAmount,
  venmoLink,
  cashAppLink,
  zelleLink,
  paypalLink,
} from '../gameLogic'

// ─── Shared Fixtures ────────────────────────────────────────────────────────

const players: Player[] = [
  { id: 'p1', name: 'Alice', handicapIndex: 10, tee: 'White', ghinNumber: '' },
  { id: 'p2', name: 'Bob', handicapIndex: 20, tee: 'White', ghinNumber: '' },
  { id: 'p3', name: 'Carol', handicapIndex: 5, tee: 'White', ghinNumber: '' },
]

const snapshot: CourseSnapshot = {
  courseId: 'c1',
  courseName: 'Test Course',
  tees: [{ name: 'White', rating: 72, slope: 130 }],
  holes: Array.from({ length: 18 }, (_, i) => ({
    number: i + 1,
    par: 4,
    strokeIndex: i + 1,
    yardages: { White: 400 },
  })),
}

/** Helper: create a HoleScore */
function hs(playerId: string, holeNumber: number, grossScore: number): HoleScore {
  return { id: `${playerId}-h${holeNumber}`, roundId: 'r1', playerId, holeNumber, grossScore }
}

// ─── Handicap Math ──────────────────────────────────────────────────────────

describe('calcCourseHandicap', () => {
  it('applies USGA formula: index × (slope/113) + (rating − par)', () => {
    // 10 × (130/113) + (72 − 72) = 10 × 1.15044… = 11.504… → 12
    expect(calcCourseHandicap(10, 130, 72, 72)).toBe(12)
  })

  it('includes rating-par differential', () => {
    // 15 × (120/113) + (71.5 − 72) = 15.929… + (−0.5) = 15.429… → 15
    expect(calcCourseHandicap(15, 120, 71.5, 72)).toBe(15)
  })

  it('returns 0 for a scratch golfer on a par course', () => {
    expect(calcCourseHandicap(0, 113, 72, 72)).toBe(0)
  })
})

describe('strokesOnHole', () => {
  it('returns 0 when courseHcp < strokeIndex', () => {
    expect(strokesOnHole(5, 10)).toBe(0)
  })

  it('returns 1 when courseHcp >= strokeIndex but < 18 + strokeIndex', () => {
    expect(strokesOnHole(10, 10)).toBe(1)
    expect(strokesOnHole(18, 10)).toBe(1)
  })

  it('returns 2 when courseHcp >= 18 + strokeIndex (two strokes)', () => {
    expect(strokesOnHole(28, 10)).toBe(2)
    expect(strokesOnHole(36, 1)).toBe(2)
  })
})

describe('buildCourseHandicaps', () => {
  it('maps each player to their course handicap using tee data', () => {
    const roundPlayers: RoundPlayer[] = [
      { id: 'rp1', roundId: 'r1', playerId: 'p1', teePlayed: 'White' },
      { id: 'rp2', roundId: 'r1', playerId: 'p2', teePlayed: 'White' },
    ]
    const result = buildCourseHandicaps(players.slice(0, 2), roundPlayers, snapshot)
    // Alice: 10 × (130/113) + (72−72) = 12
    expect(result['p1']).toBe(12)
    // Bob: 20 × (130/113) + (72−72) = 23
    expect(result['p2']).toBe(23)
  })

  it('falls back to rounded handicapIndex when tee not found', () => {
    const roundPlayers: RoundPlayer[] = [
      { id: 'rp1', roundId: 'r1', playerId: 'p1', teePlayed: 'Gold' }, // Gold doesn't exist
    ]
    const result = buildCourseHandicaps([players[0]], roundPlayers, snapshot)
    expect(result['p1']).toBe(10)
  })
})

// ─── Skins ──────────────────────────────────────────────────────────────────

describe('calculateSkins', () => {
  const courseHcps: Record<string, number> = { p1: 12, p2: 23, p3: 6 }

  it('awards a skin to the outright low scorer on a hole', () => {
    const scores = [
      hs('p1', 1, 3), hs('p2', 1, 5), hs('p3', 1, 4), // hole 1: Alice wins (3)
    ]
    const config: SkinsConfig = { mode: 'gross', carryovers: true }
    const result = calculateSkins(players, scores, snapshot, config, courseHcps)
    expect(result.skinsWon['p1']).toBe(1)
    expect(result.skinsWon['p2']).toBe(0)
    expect(result.skinsWon['p3']).toBe(0)
  })

  it('carries over on a tie when carryovers enabled', () => {
    const scores = [
      hs('p1', 1, 4), hs('p2', 1, 4), hs('p3', 1, 5), // hole 1: tie → carry
      hs('p1', 2, 3), hs('p2', 2, 5), hs('p3', 2, 4), // hole 2: Alice wins 2 skins
    ]
    const config: SkinsConfig = { mode: 'gross', carryovers: true }
    const result = calculateSkins(players, scores, snapshot, config, courseHcps)
    expect(result.skinsWon['p1']).toBe(2) // 1 carried + 1 for hole 2
    expect(result.holeResults[0].winnerId).toBeNull()
    expect(result.holeResults[1].winnerId).toBe('p1')
    expect(result.holeResults[1].skinsInPlay).toBe(2)
  })

  it('does not carry on a tie when carryovers disabled', () => {
    const scores = [
      hs('p1', 1, 4), hs('p2', 1, 4), hs('p3', 1, 5), // hole 1: tie → no carry
      hs('p1', 2, 3), hs('p2', 2, 5), hs('p3', 2, 4), // hole 2: Alice wins 1 skin
    ]
    const config: SkinsConfig = { mode: 'gross', carryovers: false }
    const result = calculateSkins(players, scores, snapshot, config, courseHcps)
    expect(result.skinsWon['p1']).toBe(1)
    expect(result.holeResults[1].skinsInPlay).toBe(1) // no carry
  })

  it('applies net strokes in net mode', () => {
    // Hole 1 strokeIndex=1: Bob gets 1 stroke (courseHcp 23 >= 1), Carol gets 0 (courseHcp 6 < 1... wait, 6 >= 1)
    // Actually Carol courseHcp=6, strokeIndex=1: 6 >= 1 → 1 stroke
    // Alice courseHcp=12, strokeIndex=1: 12 >= 1 → 1 stroke
    // Bob courseHcp=23, strokeIndex=1: 23 >= 1 → 1 stroke
    // All get 1 stroke on hole 1, so net = gross - 1
    // Let's use hole 15 (strokeIndex=15): Alice 12 < 15 → 0 strokes, Bob 23 >= 15 → 1, Carol 6 < 15 → 0
    const scores = [
      hs('p1', 15, 4), hs('p2', 15, 4), hs('p3', 15, 4), // all gross 4
    ]
    const config: SkinsConfig = { mode: 'net', carryovers: true }
    const result = calculateSkins(players, scores, snapshot, config, courseHcps)
    // Net: Alice 4-0=4, Bob 4-1=3, Carol 4-0=4 → Bob wins
    expect(result.skinsWon['p2']).toBe(1)
  })

  it('skips holes where a player has no score', () => {
    const scores = [
      hs('p1', 1, 3), hs('p3', 1, 4), // p2 missing on hole 1
    ]
    const config: SkinsConfig = { mode: 'gross', carryovers: true }
    const result = calculateSkins(players, scores, snapshot, config, courseHcps)
    expect(result.holeResults[0].winnerId).toBeNull()
    expect(result.skinsWon['p1']).toBe(0)
  })

  // P0 (live UX audit 2026-07-09): a partial round reportedly voided to "all
  // holes tied, pot refunded" at Settle Up. Assert the CALC handles a partial
  // round — if green, the bug is data persistence at settle time, not the calc.
  it('P0: partial round (holes 1-3 scored, 4-18 unplayed) tallies real skins', () => {
    const scores = [
      hs('p1', 1, 3), hs('p2', 1, 5), hs('p3', 1, 4), // hole 1: p1 wins outright
      hs('p1', 2, 4), hs('p2', 2, 4), hs('p3', 2, 5), // hole 2: p1/p2 tie → carry
      hs('p1', 3, 5), hs('p2', 3, 3), hs('p3', 3, 6), // hole 3: p2 wins (+carry)
      // holes 4-18: no scores (round ended early)
    ]
    const config: SkinsConfig = { mode: 'gross', carryovers: true }
    const result = calculateSkins(players, scores, snapshot, config, courseHcps)
    expect(result.totalSkins).toBeGreaterThan(0) // NOT all-tied / refunded
    expect(result.skinsWon['p1']).toBe(1)
    expect(result.skinsWon['p2']).toBe(2) // 1 + carried skin
  })

  it('reports pendingCarry when all 18 holes tie with carryovers', () => {
    // All 18 holes tied
    const scores = snapshot.holes.flatMap(h => [
      hs('p1', h.number, 4), hs('p2', h.number, 4), hs('p3', h.number, 4),
    ])
    const config: SkinsConfig = { mode: 'gross', carryovers: true }
    const result = calculateSkins(players, scores, snapshot, config, courseHcps)
    // Each tie increments carry. Final carry distributed among tied players on hole 18.
    // Hole 1: carry 0, tie → carry=1. Hole 2: carry 1, tie → carry=2. … Hole 17: tie → carry=17.
    // Hole 18: carry=17, all tied → split 17 among 3: 5+5+5=15 with 2 remainder → first 2 get extra
    // Actually re-reading the code: the last-hole tie distribution happens after the main loop
    // In the main loop, hole 18 ties → carry = 18 (incremented from 17)
    // Then the post-loop code runs: valid18 min score found, all 3 tied → perPlayer = 6, rem = 0
    // Wait: carry after main loop = 18-1 = 17 ties means carry goes 0→1→2→...→17
    // Hole 18 ties again → carry becomes 18
    // Post-loop: carry=18, 3 players tied, perPlayer=6, rem=0
    expect(result.skinsWon['p1']).toBe(6)
    expect(result.skinsWon['p2']).toBe(6)
    expect(result.skinsWon['p3']).toBe(6)
    expect(result.pendingCarry).toBe(0)
  })

  it('handles carry resolved on subsequent winner', () => {
    const scores = [
      hs('p1', 1, 4), hs('p2', 1, 4), hs('p3', 1, 4), // tie → carry
      hs('p1', 2, 4), hs('p2', 2, 4), hs('p3', 2, 4), // tie → carry
      hs('p1', 3, 3), hs('p2', 3, 5), hs('p3', 3, 4), // Alice wins 3 skins
    ]
    const config: SkinsConfig = { mode: 'gross', carryovers: true }
    const result = calculateSkins(players, scores, snapshot, config, courseHcps)
    expect(result.skinsWon['p1']).toBe(3) // 2 carried + 1 for hole 3
    expect(result.holeResults[2].skinsInPlay).toBe(3)
  })
})

// ─── Stableford ─────────────────────────────────────────────────────────────

describe('calculateStableford', () => {
  const courseHcps: Record<string, number> = { p1: 12, p2: 23, p3: 6 }

  it('awards correct points: eagle=4, birdie=3, par=2, bogey=1, double+=0', () => {
    // All par-4 holes
    const scores = [
      hs('p1', 1, 2), // eagle → 4 pts
      hs('p1', 2, 3), // birdie → 3 pts
      hs('p1', 3, 4), // par → 2 pts
      hs('p1', 4, 5), // bogey → 1 pt
      hs('p1', 5, 6), // double bogey → 0 pts
      hs('p1', 6, 7), // triple bogey → 0 pts
    ]
    const config: StablefordConfig = { mode: 'gross' }
    const result = calculateStableford([players[0]], scores, snapshot, config, courseHcps)
    expect(result.holePoints['p1'][1]).toBe(4)
    expect(result.holePoints['p1'][2]).toBe(3)
    expect(result.holePoints['p1'][3]).toBe(2)
    expect(result.holePoints['p1'][4]).toBe(1)
    expect(result.holePoints['p1'][5]).toBe(0)
    expect(result.holePoints['p1'][6]).toBe(0)
    expect(result.points['p1']).toBe(10)
  })

  it('awards 5 points for albatross (double eagle)', () => {
    const scores = [hs('p1', 1, 1)] // 1 on a par 4 = albatross (−3)
    const config: StablefordConfig = { mode: 'gross' }
    const result = calculateStableford([players[0]], scores, snapshot, config, courseHcps)
    expect(result.holePoints['p1'][1]).toBe(5)
  })

  it('applies net strokes in net mode', () => {
    // Hole 15 (strokeIndex=15): Bob courseHcp=23 → gets 1 stroke, Alice courseHcp=12 → 0 strokes
    // Bob gross 5 (bogey) → net 5-1=4 (par) → 2 pts
    // Alice gross 5 → net 5-0=5 (bogey) → 1 pt
    const scores = [hs('p1', 15, 5), hs('p2', 15, 5)]
    const config: StablefordConfig = { mode: 'net' }
    const result = calculateStableford(players.slice(0, 2), scores, snapshot, config, courseHcps)
    expect(result.holePoints['p2'][15]).toBe(2) // Bob: net par
    expect(result.holePoints['p1'][15]).toBe(1) // Alice: net bogey
  })

  it('determines winner by highest total points', () => {
    const scores = [
      hs('p1', 1, 4), hs('p2', 1, 5), // Alice par=2, Bob bogey=1
      hs('p1', 2, 3), hs('p2', 2, 4), // Alice birdie=3, Bob par=2
    ]
    const config: StablefordConfig = { mode: 'gross' }
    const result = calculateStableford(players.slice(0, 2), scores, snapshot, config, courseHcps)
    expect(result.points['p1']).toBe(5)
    expect(result.points['p2']).toBe(3)
    expect(result.winner).toBe('p1')
  })
})

// ─── Quota ──────────────────────────────────────────────────────────────────

describe('calculateQuota', () => {
  it('scores Stableford GROSS — handicap is not double-applied via the quota target', () => {
    // Two players both shoot even-par gross (4 on every par-4 hole). p2 gets a
    // stroke a hole via course handicap; if Quota scored NET it would count those
    // strokes AGAIN (on top of the 36−hcp target), inflating the high handicapper.
    const qp = [players[0], players[1]] // p1, p2
    const scores: HoleScore[] = []
    for (let h = 1; h <= 18; h++) {
      scores.push(hs('p1', h, 4))
      scores.push(hs('p2', h, 4))
    }
    const courseHcps = { p1: 0, p2: 18 }
    const config = { mode: 'net' as const, quotas: { p1: 36, p2: 18 } }
    const result = calculateQuota(qp, scores, snapshot, config, courseHcps)
    // GROSS stableford: par = 2 pts/hole × 18 = 36 for BOTH (strokes ignored).
    expect(result.stablefordPoints['p1']).toBe(36)
    expect(result.stablefordPoints['p2']).toBe(36) // 36, NOT the net-inflated 54
    // netPoints = gross stableford − quota target
    expect(result.netPoints['p1']).toBe(0)
    expect(result.netPoints['p2']).toBe(18)
  })
})

// ─── Junks ──────────────────────────────────────────────────────────────────

describe('calculateJunks', () => {
  it('positive junk (sandy): earner gets valueCents from every other player', () => {
    const config: JunkConfig = { valueCents: 100, types: ['sandy', 'greenie', 'snake', 'barkie', 'ctp'] }
    const records: JunkRecord[] = [
      { id: 'j1', roundId: 'r1', holeNumber: 5, playerId: 'p1', junkType: 'sandy' },
    ]
    const result = calculateJunks(players, records, config)
    // p1 gets 100 × 2 others = +200. Each other pays −100.
    expect(result.netCents['p1']).toBe(200)
    expect(result.netCents['p2']).toBe(-100)
    expect(result.netCents['p3']).toBe(-100)
  })

  it('snake: player pays everyone else', () => {
    const config: JunkConfig = { valueCents: 100, types: ['sandy', 'greenie', 'snake', 'barkie', 'ctp'] }
    const records: JunkRecord[] = [
      { id: 'j1', roundId: 'r1', holeNumber: 3, playerId: 'p2', junkType: 'snake' },
    ]
    const result = calculateJunks(players, records, config)
    expect(result.netCents['p2']).toBe(-200) // pays 100 × 2
    expect(result.netCents['p1']).toBe(100)
    expect(result.netCents['p3']).toBe(100)
  })

  it('handles multiple junks in the same round', () => {
    const config: JunkConfig = { valueCents: 50, types: ['sandy', 'greenie', 'snake', 'barkie', 'ctp'] }
    const records: JunkRecord[] = [
      { id: 'j1', roundId: 'r1', holeNumber: 1, playerId: 'p1', junkType: 'sandy' },
      { id: 'j2', roundId: 'r1', holeNumber: 3, playerId: 'p2', junkType: 'snake' },
      { id: 'j3', roundId: 'r1', holeNumber: 7, playerId: 'p3', junkType: 'greenie' },
    ]
    const result = calculateJunks(players, records, config)
    // p1: +100 (sandy) + 50 (from p2 snake) − 50 (p3 greenie) = +100
    expect(result.netCents['p1']).toBe(100)
    // p2: −50 (p1 sandy) − 100 (snake) − 50 (p3 greenie) = −200
    expect(result.netCents['p2']).toBe(-200)
    // p3: −50 (p1 sandy) + 50 (p2 snake) + 100 (greenie) = +100
    expect(result.netCents['p3']).toBe(100)
  })

  it('ignores junk types not in config', () => {
    const config: JunkConfig = { valueCents: 100, types: ['sandy'] } // only sandy active
    const records: JunkRecord[] = [
      { id: 'j1', roundId: 'r1', holeNumber: 1, playerId: 'p1', junkType: 'greenie' },
    ]
    const result = calculateJunks(players, records, config)
    expect(result.netCents['p1']).toBe(0)
    expect(result.netCents['p2']).toBe(0)
  })
})

// ─── Payouts & Settlements ──────────────────────────────────────────────────

describe('calculateSkinsPayouts', () => {
  it('distributes pot proportionally to skins won', () => {
    const skinsResult = {
      skinsWon: { p1: 3, p2: 1, p3: 0 },
      holeResults: [
        { holeNumber: 1, winnerId: 'p1', carry: 0, skinsInPlay: 1 },
        { holeNumber: 2, winnerId: 'p1', carry: 0, skinsInPlay: 1 },
        { holeNumber: 3, winnerId: 'p1', carry: 0, skinsInPlay: 1 },
        { holeNumber: 4, winnerId: 'p2', carry: 0, skinsInPlay: 1 },
      ],
      totalSkins: 4,
      pendingCarry: 0,
    }
    const game: Game = {
      id: 'g1', type: 'skins', buyInCents: 1000,
      config: { mode: 'gross', carryovers: true } as SkinsConfig,
    }
    const payouts = calculateSkinsPayouts(skinsResult, game, 3)
    // Pot = 1000 × 3 = 3000. 4 weighted skins total. centsPerUnit = 750.
    const alicePayout = payouts.find(p => p.playerId === 'p1')!
    const bobPayout = payouts.find(p => p.playerId === 'p2')!
    expect(alicePayout.amountCents).toBe(2250) // 3 × 750
    expect(bobPayout.amountCents).toBe(750)    // 1 × 750
    expect(payouts.find(p => p.playerId === 'p3')).toBeUndefined() // no skins, no payout
  })

  it('handles remainder distribution', () => {
    const skinsResult = {
      skinsWon: { p1: 2, p2: 1 },
      holeResults: [
        { holeNumber: 1, winnerId: 'p1', carry: 0, skinsInPlay: 1 },
        { holeNumber: 2, winnerId: 'p1', carry: 0, skinsInPlay: 1 },
        { holeNumber: 3, winnerId: 'p2', carry: 0, skinsInPlay: 1 },
      ],
      totalSkins: 3,
      pendingCarry: 0,
    }
    const game: Game = {
      id: 'g1', type: 'skins', buyInCents: 1000,
      config: { mode: 'gross', carryovers: true } as SkinsConfig,
    }
    // Pot = 1000 × 2 = 2000. 3 weighted skins. centsPerUnit = 666. Remainder = 2000 − 1998 = 2.
    const payouts = calculateSkinsPayouts(skinsResult, game, 2)
    const total = payouts.reduce((s, p) => s + p.amountCents, 0)
    expect(total).toBe(2000) // entire pot distributed
  })

  it('increases pot and weights with presses', () => {
    const skinsResult = {
      skinsWon: { p1: 1 },
      holeResults: [
        { holeNumber: 5, winnerId: 'p1', carry: 0, skinsInPlay: 1 },
      ],
      totalSkins: 1,
      pendingCarry: 0,
    }
    const game: Game = {
      id: 'g1', type: 'skins', buyInCents: 1000,
      config: {
        mode: 'gross', carryovers: true,
        presses: [{ holeNumber: 3, playerId: 'p2' }],
      } as SkinsConfig,
    }
    // Press on hole 3, win on hole 5. Multiplier = 2^1 = 2.
    // totalPot = 1000 × 3 × (1 + 1) = 6000. weightedWon = 2. centsPerUnit = 3000.
    const payouts = calculateSkinsPayouts(skinsResult, game, 3)
    expect(payouts[0].amountCents).toBe(6000)
  })
})

describe('buildSettlements', () => {
  it('treasurer pays each non-treasurer winner', () => {
    const payouts = [
      { playerId: 'p1', amountCents: 2000, reason: '3 skins' },
      { playerId: 'p2', amountCents: 1000, reason: '1 skin' },
      { playerId: 'p3', amountCents: 0, reason: '' },
    ]
    // p3 is treasurer
    const settlements = buildSettlements(payouts.filter(p => p.amountCents > 0), 'p3')
    expect(settlements).toHaveLength(2)
    expect(settlements[0]).toEqual({ fromId: 'p3', toId: 'p1', amountCents: 2000, note: '3 skins' })
    expect(settlements[1]).toEqual({ fromId: 'p3', toId: 'p2', amountCents: 1000, note: '1 skin' })
  })

  it('excludes treasurer from the settlement list when they are a winner', () => {
    const payouts = [
      { playerId: 'p1', amountCents: 1500, reason: 'winner' },
      { playerId: 'p2', amountCents: 1500, reason: 'winner' },
    ]
    // p1 is treasurer
    const settlements = buildSettlements(payouts, 'p1')
    expect(settlements).toHaveLength(1)
    expect(settlements[0].toId).toBe('p2')
  })
})

describe('buildUnifiedSettlements', () => {
  it('nets bidirectional flows between same pair', () => {
    const payouts = [
      { playerId: 'p1', amountCents: 500, reason: 'game win' },
    ]
    const junkResult = {
      netCents: { p1: -200, p2: 200, p3: 0 },
      tallies: { p1: { sandy: 0, greenie: 0, snake: 1, barkie: 0, ctp: 0 },
                 p2: { sandy: 1, greenie: 0, snake: 0, barkie: 0, ctp: 0 },
                 p3: { sandy: 0, greenie: 0, snake: 0, barkie: 0, ctp: 0 } },
    }
    // Treasurer = p3
    // Game: p3 → p1: 500 (game)
    // Junk: p1 → p3: 200 (junk loss), p3 → p2: 200 (junk win)
    // Net: p3→p1: 500-200 = 300, p3→p2: 200
    const settlements = buildUnifiedSettlements(payouts, 'p3', junkResult)
    const toP1 = settlements.find(s => s.toId === 'p1')
    const toP2 = settlements.find(s => s.toId === 'p2')
    expect(toP1?.amountCents).toBe(300)
    expect(toP2?.amountCents).toBe(200)
  })
})

describe('calculateSideBetSettlements', () => {
  it('only processes resolved bets', () => {
    const bets: SideBet[] = [
      {
        id: 'sb1', roundId: 'r1', holeNumber: 5,
        description: 'CTP on 5', amountCents: 500,
        participants: ['p1', 'p2', 'p3'],
        winnerPlayerId: 'p1', status: 'resolved',
        createdAt: new Date(),
      },
      {
        id: 'sb2', roundId: 'r1', holeNumber: 10,
        description: 'Long drive', amountCents: 300,
        participants: ['p1', 'p2'],
        status: 'open',
        createdAt: new Date(),
      },
    ]
    const settlements = calculateSideBetSettlements(bets)
    // Only sb1 resolved: p2→p1 $5, p3→p1 $5
    expect(settlements).toHaveLength(2)
    expect(settlements.every(s => s.toId === 'p1')).toBe(true)
    expect(settlements[0].amountCents).toBe(500)
  })

  it('returns empty for cancelled bets', () => {
    const bets: SideBet[] = [
      {
        id: 'sb1', roundId: 'r1', holeNumber: 5,
        description: 'CTP', amountCents: 500,
        participants: ['p1', 'p2'],
        winnerPlayerId: 'p1', status: 'cancelled',
        createdAt: new Date(),
      },
    ]
    expect(calculateSideBetSettlements(bets)).toHaveLength(0)
  })
})

// ─── Formatting ─────────────────────────────────────────────────────────────

describe('fmtMoney', () => {
  it('formats cents as USD', () => {
    expect(fmtMoney(1500)).toBe('$15.00')
    expect(fmtMoney(99)).toBe('$0.99')
    expect(fmtMoney(0)).toBe('$0.00')
  })
})

describe('payment link generators', () => {
  it('venmoLink builds correct deep link', () => {
    const link = venmoLink('@alice', 1500, 'Golf skins')
    expect(link).toContain('venmo://paycharge')
    expect(link).toContain('txn=pay')
    expect(link).toContain('recipients=alice')
    expect(link).toContain('amount=15.00')
    expect(link).toContain('note=Golf%20skins')
  })

  it('cashAppLink builds correct URL', () => {
    const link = cashAppLink('$bob', 2000, 'Skins payout')
    expect(link).toContain('cash.app/$bob')
    expect(link).toContain('20.00')
  })

  it('zelleLink encodes identifier', () => {
    const link = zelleLink('bob@email.com')
    expect(link).toContain('zellepay.com')
    expect(link).toContain(encodeURIComponent('bob@email.com'))
  })

  it('paypalLink formats correctly', () => {
    const link = paypalLink('carol@email.com', 750)
    expect(link).toContain('paypal.com/paypalme')
    expect(link).toContain('7.50')
  })
})

describe('fmtAmount (token/points mode)', () => {
  it('renders points mode as "pts" (raw value, no cents conversion)', () => {
    expect(fmtAmount(25, 'points')).toBe('25 pts')
    expect(fmtAmount(0, 'points')).toBe('0 pts')
    expect(fmtAmount(150, 'points')).toBe('150 pts')
  })

  // Gimme surfaces points only (1 pt = $1); legacy money-mode values are stored
  // in cents, so fmtAmount converts them to points (never renders $).
  it('converts legacy money-mode cents to points (standard / high_roller / undefined)', () => {
    expect(fmtAmount(2500, 'standard')).toBe('25 pts')
    expect(fmtAmount(2500, 'high_roller')).toBe('25 pts')
    expect(fmtAmount(2500)).toBe('25 pts')
  })

  it('never renders a currency symbol', () => {
    expect(fmtAmount(1234, 'standard')).not.toContain('$')
    expect(fmtAmount(1234, 'standard')).toBe('12 pts') // 1234 cents -> 12 pts (rounded)
    expect(fmtAmount(25, 'points')).not.toContain('$')
  })
})

// ─── Settlement net-zero invariants ─────────────────────────────────────────
// The core promise: a pot game distributes EXACTLY the collected pot (buyIn × N)
// to winners, so that once losers are debited their buy-in, the round nets to
// zero. These lock that invariant in for the launch pot games. (Presses are
// gated off at launch — see featureFlags.SHOW_PRESSES — because they break it.)
describe('settlement net-zero invariants', () => {
  const POT = (buyInCents: number) => buyInCents * players.length

  it('Skins (no presses): payouts sum to the full pot', () => {
    const skinsResult = {
      skinsWon: { p1: 3, p2: 1, p3: 0 },
      holeResults: [
        { holeNumber: 1, winnerId: 'p1', carry: 0, skinsInPlay: 1 },
        { holeNumber: 2, winnerId: 'p1', carry: 0, skinsInPlay: 1 },
        { holeNumber: 3, winnerId: 'p1', carry: 0, skinsInPlay: 1 },
        { holeNumber: 4, winnerId: 'p2', carry: 0, skinsInPlay: 1 },
      ],
      totalSkins: 4,
      pendingCarry: 0,
    } as any
    const game: Game = { id: 'g', type: 'skins', buyInCents: 1000, stakesMode: 'points', config: {} as any }
    const sum = calculateSkinsPayouts(skinsResult, game, players.length).reduce((s, p) => s + p.amountCents, 0)
    expect(sum).toBe(POT(1000))
  })

  it('Skins WITH a press: settlement still nets to zero (ante scales with the pot)', () => {
    // A press at hole 5 doubles later holes and inflates the winners' pot. The old
    // flat buy-in ante left the pot short; the ante now scales with what's distributed.
    const skinsResult = {
      skinsWon: { p1: 1, p2: 1, p3: 0 },
      holeResults: [
        { holeNumber: 1, winnerId: 'p1', carry: 0, skinsInPlay: 1 }, // pre-press, ×1
        { holeNumber: 6, winnerId: 'p2', carry: 0, skinsInPlay: 1 }, // post-press, ×2
      ],
      totalSkins: 2,
      pendingCarry: 0,
    } as any
    const game: Game = { id: 'g', type: 'skins', buyInCents: 1000, stakesMode: 'points', config: { presses: [{ holeNumber: 5, playerId: 'p1' }] } as any }
    const payouts = calculateSkinsPayouts(skinsResult, game, players.length)
    // pot = base 3000 × (1 + 1 press) = 6000, distributed over weighted units 1 + 2 = 3.
    expect(payouts.reduce((s, p) => s + p.amountCents, 0)).toBe(6000)
    const net = netFromPayouts(payouts, players, game.buyInCents)
    expect(Object.values(net).reduce((s, n) => s + n, 0)).toBe(0) // nets to zero
    const out = buildDirectSettlements(net, null)
    expect(out.reduce((s, x) => s + x.amountCents, 0)).toBe(2000) // p2 collects, p3 pays
    expect(out.every(s => s.amountCents > 0 && s.fromId !== s.toId)).toBe(true)
  })

  it('BBB (points recorded): payouts sum to the full pot, remainder included', () => {
    const result = { pointsWon: { p1: 4, p2: 2, p3: 3 }, totalPoints: 9 } as any
    const game: Game = { id: 'g', type: 'bingo_bango_bongo', buyInCents: 1000, stakesMode: 'points', config: {} as any }
    const sum = calculateBBBPayouts(result, game, players).reduce((s, p) => s + p.amountCents, 0)
    expect(sum).toBe(POT(1000))
  })

  it('BBB (no points, refund): payouts still sum to the full pot', () => {
    const result = { pointsWon: { p1: 0, p2: 0, p3: 0 }, totalPoints: 0 } as any
    const game: Game = { id: 'g', type: 'bingo_bango_bongo', buyInCents: 900, stakesMode: 'points', config: {} as any }
    const sum = calculateBBBPayouts(result, game, players).reduce((s, p) => s + p.amountCents, 0)
    expect(sum).toBe(POT(900))
  })

  it('Wolf: payouts sum to the full pot (remainder distributed)', () => {
    const result = { netUnits: { p1: 2, p2: 1, p3: -3 } } as any
    const game: Game = { id: 'g', type: 'wolf', buyInCents: 1000, stakesMode: 'points', config: {} as any }
    const sum = calculateWolfPayouts(result, game, players).reduce((s, p) => s + p.amountCents, 0)
    expect(sum).toBe(POT(1000))
  })

  it('buildDirectSettlements (points mode, no treasurer): losers pay the winner, nets to zero', () => {
    // p2 (Bob) wins the whole 75-pt pot; p1 & p3 each lose their 25 buy-in.
    const gameNet = netFromPayouts([{ playerId: 'p2', amountCents: 75, reason: '3 skins' }], players, 25)
    const out = buildDirectSettlements(gameNet, null)
    expect(out.length).toBe(2)
    expect(out.every(s => s.toId === 'p2')).toBe(true) // both losers pay the winner directly
    expect(out.reduce((s, x) => s + x.amountCents, 0)).toBe(50) // = winner's net (75 − 25 buy-in)
    // net-zero: each debtor's −25 exactly funds the winner's +50
    expect(out.map(s => s.amountCents).sort()).toEqual([25, 25])
  })
})

// ─── Direct-settlement soundness across games (the single-engine invariant) ──
// The rework routes every points-mode round through one engine: a signed, zero-sum
// per-player net → debtor→creditor match. This locks the invariant that matters —
// the recorded settlements RECONSTRUCT each player's true net exactly — for pot
// games (net = payout − buy-in) AND unit games (real-cents net, buy-in 0). Unit
// games were previously mis-settled: losers were never debited.

type DirectSettlement = { fromId: string; toId: string; amountCents: number }

/**
 * Assert a points-mode settlement set is internally sound and faithful to `trueNet`:
 *  - trueNet is itself zero-sum,
 *  - every settlement is positive with no self-pay,
 *  - the settlements move exactly the winners' side of the ledger,
 *  - and received − paid reconstructs each player's true net.
 */
function assertDirectSettlementSound(settlements: DirectSettlement[], trueNet: Record<string, number>) {
  expect(Object.values(trueNet).reduce((s, x) => s + x, 0)).toBe(0) // trueNet zero-sum

  const recon: Record<string, number> = {}
  Object.keys(trueNet).forEach(id => (recon[id] = 0))
  for (const s of settlements) {
    expect(s.amountCents).toBeGreaterThan(0)
    expect(s.fromId).not.toBe(s.toId)
    recon[s.fromId] = (recon[s.fromId] ?? 0) - s.amountCents
    recon[s.toId] = (recon[s.toId] ?? 0) + s.amountCents
  }
  for (const id of Object.keys(trueNet)) expect(recon[id] ?? 0).toBe(trueNet[id]) // faithful reconstruction

  const winnersSide = Object.values(trueNet).filter(n => n > 0).reduce((s, x) => s + x, 0)
  expect(settlements.reduce((s, x) => s + x.amountCents, 0)).toBe(winnersSide) // minimal cash moved
}

describe('single settlement engine — direct (points) soundness', () => {
  it('classifies hammer/dots/wolf/banker as unit games; pot games are not', () => {
    expect(isUnitGame('hammer')).toBe(true)
    expect(isUnitGame('dots')).toBe(true)
    expect(isUnitGame('wolf')).toBe(true)
    expect(isUnitGame('banker')).toBe(true)
    expect(isUnitGame('skins')).toBe(false)
    expect(isUnitGame('best_ball')).toBe(false)
    expect(isUnitGame('nassau')).toBe(false)
    expect(isUnitGame('bingo_bango_bongo')).toBe(false)
    expect(isUnitGame('stableford')).toBe(false)
    expect(isUnitGame('quota')).toBe(false)
  })

  it('unitGameNet: wolf/banker scale signed units by the per-unit stake; hammer/dots pass through', () => {
    // wolf: units live in netUnits, scaled by buy-in (per-unit stake)
    expect(unitGameNet('wolf', 100, { netUnits: { p1: 2, p2: 1, p3: -3 } })).toEqual({ p1: 200, p2: 100, p3: -300 })
    // banker: units live in netCents (misnamed), scaled by buy-in
    expect(unitGameNet('banker', 50, { netCents: { p1: 3, p2: -1, p3: -2 } })).toEqual({ p1: 150, p2: -50, p3: -100 })
    // hammer/dots: netCents already in cents → unscaled
    expect(unitGameNet('hammer', 0, { netCents: { p1: 300, p2: -300 } })).toEqual({ p1: 300, p2: -300 })
    expect(unitGameNet('dots', 0, { netCents: { p1: 400, p2: -100, p3: -300 } })).toEqual({ p1: 400, p2: -100, p3: -300 })
  })

  it('POT game (skins): net = payout − buy-in, losers pay winners, reconstructs', () => {
    // p1 wins 3 skins, p2 wins 1, p3 none; buy-in 1000 → pot 3000.
    const payouts = [
      { playerId: 'p1', amountCents: 2250, reason: '3 skins' },
      { playerId: 'p2', amountCents: 750, reason: '1 skin' },
    ]
    const trueNet = netFromPayouts(payouts, players, 1000)
    expect(trueNet).toEqual({ p1: 1250, p2: -250, p3: -1000 })
    assertDirectSettlementSound(buildDirectSettlements(trueNet, null), trueNet)
  })

  it('UNIT game (hammer, 2p): loser is debited the winner exactly (was previously never settled)', () => {
    // Real bug the rework fixes: buy-in 0 + winner-only payouts meant p2 owed nothing.
    const hammerResult = { netCents: { p1: 300, p2: -300 }, holeResults: [], totalHolesPlayed: 6 } as any
    const trueNet: Record<string, number> = hammerResult.netCents
    const out = buildDirectSettlements({ ...trueNet }, null)
    expect(out).toEqual([{ fromId: 'p2', toId: 'p1', amountCents: 300, reason: 'Round settlement', source: 'game' }])
    assertDirectSettlementSound(out, trueNet)
  })

  it('UNIT game (dots, 3p): asymmetric losses are attributed by magnitude, not flattened', () => {
    // p1 +400, p2 −100, p3 −300 — a −300 must pay 3× a −100, not a flat share.
    const dotsResult = { netCents: { p1: 400, p2: -100, p3: -300 }, tallies: {} } as any
    const trueNet: Record<string, number> = dotsResult.netCents
    const out = buildDirectSettlements({ ...trueNet }, null)
    assertDirectSettlementSound(out, trueNet)
    expect(out.every(s => s.toId === 'p1')).toBe(true)
    expect(out.find(s => s.fromId === 'p2')?.amountCents).toBe(100)
    expect(out.find(s => s.fromId === 'p3')?.amountCents).toBe(300)
  })

  it('unit-game net + junk fold into one settlement set and still reconstruct', () => {
    const trueGameNet = { p1: 400, p2: -100, p3: -300 }
    const junkResult = calculateJunks(players, [{ id: 'j1', roundId: 'r1', playerId: 'p2', holeNumber: 4, junkType: 'greenie' }] as any, { types: ['greenie'], valueCents: 60 })
    const out = buildDirectSettlements({ ...trueGameNet }, junkResult)
    // combined net = game + junk
    const combined: Record<string, number> = {}
    ;[...players].forEach(p => (combined[p.id] = (trueGameNet as any)[p.id] + junkResult.netCents[p.id]))
    assertDirectSettlementSound(out, combined)
  })

  it('UNIT game (wolf): stake per unit is honored — a lone-wolf swing pays proportionally, not flattened', () => {
    // netUnits {p1:+2, p2:+1, p3:-3} at 100/unit → p3 owes 300 total (was flattened to a flat buy-in before).
    const wolfResult = { netUnits: { p1: 2, p2: 1, p3: -3 }, holeResults: [] } as any
    const trueNet = unitGameNet('wolf', 100, wolfResult)
    expect(trueNet).toEqual({ p1: 200, p2: 100, p3: -300 })
    const out = buildDirectSettlements(trueNet, null)
    assertDirectSettlementSound(out, trueNet)
    expect(out.every(s => s.fromId === 'p3')).toBe(true) // the −3 pays everyone
    expect(out.reduce((s, x) => s + x.amountCents, 0)).toBe(300)
  })

  it('UNIT game (banker): asymmetric per-hole units settle by magnitude', () => {
    // netCents holds ±1-per-hole units: p1 +4, p2 −3, p3 −1 at 25/unit.
    const bankerResult = { netCents: { p1: 4, p2: -3, p3: -1 }, holeResults: [] } as any
    const trueNet = unitGameNet('banker', 25, bankerResult)
    expect(trueNet).toEqual({ p1: 100, p2: -75, p3: -25 })
    const out = buildDirectSettlements(trueNet, null)
    assertDirectSettlementSound(out, trueNet)
    expect(out.find(s => s.fromId === 'p2')?.amountCents).toBe(75) // −3 pays 3× the −1
    expect(out.find(s => s.fromId === 'p3')?.amountCents).toBe(25)
  })
})
