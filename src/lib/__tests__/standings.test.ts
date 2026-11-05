import { describe, it, expect } from 'vitest'
import { gameStandings } from '../standings'
import { calculateNassauMatch } from '../gameLogic'
import type { Player, Game, CourseSnapshot, HoleScore, NassauConfig } from '../../types'

const players: Player[] = [
  { id: 'p1', name: 'Alice', handicapIndex: 10, tee: 'White', ghinNumber: '' },
  { id: 'p2', name: 'Bob', handicapIndex: 20, tee: 'White', ghinNumber: '' },
  { id: 'p3', name: 'Carol', handicapIndex: 5, tee: 'White', ghinNumber: '' },
]
const game = (type: Game['type'], config: unknown = {}, stakesMode: Game['stakesMode'] = 'points'): Game =>
  ({ id: 'g', type, buyInCents: 10, stakesMode, config: config as Game['config'] })

const labels = (s: ReturnType<typeof gameStandings>) => s.entries.map(e => `${e.position}. ${e.player.name} ${e.label}`)

describe('gameStandings — every game ranks and displays on its own result (Finding 9)', () => {
  it('skins: skins won', () => {
    const s = gameStandings(game('skins'), players, {
      skins: { skinsWon: { p1: 1, p2: 3, p3: 0 }, holeResults: [], totalSkins: 4, pendingCarry: 0 },
    })
    expect(s.metric).toBe('Skins')
    expect(labels(s)).toEqual(['1. Bob 3 skins', '2. Alice 1 skin', '3. Carol 0 skins'])
    expect(s.entries.map(e => e.label).some(l => /\(|E\b|\+\d+\)$/.test(l))).toBe(false) // no score-to-par anywhere
  })

  it('wolf: units; banker: units', () => {
    const w = gameStandings(game('wolf'), players, { wolf: { holeResults: [], netUnits: { p1: 2, p2: -4, p3: 2 }, unresolvedHoles: [], carryPending: 0 } })
    expect(labels(w)).toEqual(['1. Alice +2 u', '1. Carol +2 u', '3. Bob -4 u'])
    const b = gameStandings(game('banker'), players, { banker: { holeResults: [], netCents: { p1: -1, p2: 1, p3: 0 } } })
    expect(b.metric).toBe('Units')
    expect(b.entries[0].player.name).toBe('Bob')
  })

  it('BBB, Stableford, Quota, Dots: their own points or net', () => {
    expect(labels(gameStandings(game('bingo_bango_bongo'), players, { bbb: { pointsWon: { p1: 5, p2: 7, p3: 2 }, totalPoints: 14, unknownPlayerIds: [] } })))
      .toEqual(['1. Bob 7 pt', '2. Alice 5 pt', '3. Carol 2 pt'])
    expect(labels(gameStandings(game('stableford'), players, { stableford: { points: { p1: 20, p2: 18, p3: 21 }, holePoints: {}, winner: 'p3' } })))
      .toEqual(['1. Carol 21 pt', '2. Alice 20 pt', '3. Bob 18 pt'])
    expect(labels(gameStandings(game('quota'), players, { quota: { stablefordPoints: {}, quotas: {}, netPoints: { p1: 2, p2: -3, p3: 0 }, winner: 'p1' } })))
      .toEqual(['1. Alice +2', '2. Carol 0', '3. Bob -3'])
    const d = gameStandings(game('dots', {}, 'standard'), players, { dots: { netCents: { p1: 300, p2: -100, p3: -200 }, tallies: {} } })
    expect(labels(d)).toEqual(['1. Alice +3', '2. Bob -1', '3. Carol -2'])
  })

  it('hammer: holes up between the two players', () => {
    const two = players.slice(0, 2)
    const s = gameStandings(game('hammer'), two, {
      hammer: {
        netCents: { p1: 200, p2: -200 }, totalHolesPlayed: 3,
        holeResults: [
          { holeNumber: 1, hammerState: null, winnerId: 'p1', amountCents: 100 },
          { holeNumber: 2, hammerState: null, winnerId: 'p1', amountCents: 100 },
          { holeNumber: 3, hammerState: null, winnerId: 'p2', amountCents: 100 },
        ],
      },
    })
    expect(s.metric).toBe('Holes up')
    expect(labels(s)).toEqual(['1. Alice 1 UP', '2. Bob 1 DN'])
  })

  it('best ball: holes up for each player\'s team', () => {
    const four = [...players, { id: 'p4', name: 'Dave', handicapIndex: 15, tee: 'White', ghinNumber: '' }]
    const s = gameStandings(game('best_ball', { scoring: 'match', mode: 'net', teams: { p1: 'A', p2: 'A', p3: 'B', p4: 'B' } }), four, {
      bestBall: { holesWon: { A: 4, B: 2, tied: 1 }, totalScore: { A: 30, B: 31 }, winner: 'A', holeResults: [] },
    })
    expect(s.entries[0].label).toBe('2 UP · Team A')
    expect(s.entries[2].label).toBe('2 DN · Team B')
    expect(s.entries.map(e => e.position)).toEqual([1, 1, 3, 3])
  })

  it('nassau match play: the player\'s own leg status for two, net legs up for a group', () => {
    const snapshot: CourseSnapshot = {
      courseId: 'c', courseName: 'T', tees: [{ name: 'White', rating: 72, slope: 130 }],
      holes: Array.from({ length: 18 }, (_, i) => ({ number: i + 1, par: 4, strokeIndex: i + 1, yardages: { White: 400 } })),
    }
    const cfg: NassauConfig = { mode: 'gross', scoring: 'match' }
    const two = players.slice(0, 2)
    const scores: HoleScore[] = []
    for (let h = 1; h <= 3; h++) { scores.push({ id: `a${h}`, roundId: 'r', playerId: 'p1', holeNumber: h, grossScore: 4 }); scores.push({ id: `b${h}`, roundId: 'r', playerId: 'p2', holeNumber: h, grossScore: 5 }) }
    const m2 = calculateNassauMatch(two, scores, snapshot, cfg, { p1: 0, p2: 0 }, 10)
    const s2 = gameStandings(game('nassau', cfg), two, { nassauMatch: m2 })
    expect(s2.entries[0].player.name).toBe('Alice')
    expect(s2.entries[0].label).toBe('3 UP · — · 3 UP')
    expect(s2.entries[1].label).toBe('3 DN · — · 3 DN')

    // Group: Alice beats both on the whole front (closed 5&4 by hole 5), so +2 legs.
    const groupScores: HoleScore[] = []
    for (let h = 1; h <= 9; h++) {
      groupScores.push({ id: `a${h}`, roundId: 'r', playerId: 'p1', holeNumber: h, grossScore: 3 })
      groupScores.push({ id: `b${h}`, roundId: 'r', playerId: 'p2', holeNumber: h, grossScore: 4 })
      groupScores.push({ id: `c${h}`, roundId: 'r', playerId: 'p3', holeNumber: h, grossScore: 4 })
    }
    const m3 = calculateNassauMatch(players, groupScores, snapshot, cfg, { p1: 0, p2: 0, p3: 0 }, 10)
    const s3 = gameStandings(game('nassau', cfg), players, { nassauMatch: m3 })
    expect(s3.metric).toBe('Net legs')
    expect(s3.entries[0].label).toBe('+2 legs')
    expect(s3.entries[0].player.name).toBe('Alice')
  })

  it('shows a dash for everyone, unranked, when the game has no result yet', () => {
    const s = gameStandings(game('skins'), players, { skins: { skinsWon: {}, holeResults: [], totalSkins: 0, pendingCarry: 0 } })
    expect(s.hasResult).toBe(false)
    expect(s.entries.every(e => e.label === '—' && e.position === 0 && e.value === null)).toBe(true)
    const none = gameStandings(game('wolf'), players, {})
    expect(none.entries.every(e => e.label === '—')).toBe(true)
    expect(gameStandings(null, players, {}).entries.every(e => e.label === '—')).toBe(true)
  })
})
