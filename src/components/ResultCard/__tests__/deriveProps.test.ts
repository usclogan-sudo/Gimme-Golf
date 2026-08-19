import { describe, it, expect } from 'vitest'
import { buildResultCardProps } from '../deriveProps'

const players = [
  { id: 'a', name: 'A-Aron' },
  { id: 'b', name: 'Beth' },
  { id: 'c', name: 'Cy' },
]

const base = {
  roundId: 'r1',
  courseName: 'Pebble',
  date: new Date('2026-08-01T00:00:00Z'),
  formats: ['Skins'],
  holesPlayed: 18,
  players,
  isPoints: true,
}

describe('buildResultCardProps — net from settlement records', () => {
  it('nets each player across from/to and ranks by net desc', () => {
    // A collects 120 from B and C splits: B→A 80, C→A 40.
    const props = buildResultCardProps({
      ...base,
      settlements: [
        { fromPlayerId: 'b', toPlayerId: 'a', amountCents: 80 },
        { fromPlayerId: 'c', toPlayerId: 'a', amountCents: 40 },
      ],
    })
    const byId = Object.fromEntries(props.standings.map(s => [s.playerId, s]))
    expect(byId.a.net).toBe(120)
    expect(byId.b.net).toBe(-80)
    expect(byId.c.net).toBe(-40)
    expect(byId.a.position).toBe(1)
    expect(byId.c.position).toBe(2)
    expect(byId.b.position).toBe(3)
  })

  it('maps settlement player ids to display names', () => {
    const props = buildResultCardProps({
      ...base,
      settlements: [{ fromPlayerId: 'b', toPlayerId: 'a', amountCents: 50 }],
    })
    expect(props.settlements[0]).toEqual({ fromName: 'Beth', toName: 'A-Aron', amount: 50 })
  })

  it('gives tied nets the same position (standard competition ranking)', () => {
    const props = buildResultCardProps({
      ...base,
      settlements: [
        { fromPlayerId: 'c', toPlayerId: 'a', amountCents: 30 },
        { fromPlayerId: 'c', toPlayerId: 'b', amountCents: 30 },
      ],
    })
    const byId = Object.fromEntries(props.standings.map(s => [s.playerId, s]))
    expect(byId.a.position).toBe(1)
    expect(byId.b.position).toBe(1)
    expect(byId.c.position).toBe(3) // two tied at 1 → next distinct skips to 3
  })
})

describe('buildResultCardProps — money mode + payout fallback', () => {
  it('divides cents by 100 in money mode', () => {
    const props = buildResultCardProps({
      ...base,
      isPoints: false,
      settlements: [{ fromPlayerId: 'b', toPlayerId: 'a', amountCents: 1200 }],
    })
    const byId = Object.fromEntries(props.standings.map(s => [s.playerId, s]))
    expect(byId.a.net).toBe(12)
    expect(byId.b.net).toBe(-12)
  })

  it('falls back to payouts − buy-in when there are no settlement records', () => {
    const props = buildResultCardProps({
      ...base,
      settlements: [],
      payouts: [{ playerId: 'a', amountCents: 30 }],
      buyInCents: 10,
    })
    const byId = Object.fromEntries(props.standings.map(s => [s.playerId, s]))
    expect(byId.a.net).toBe(20) // won 30 − 10 buy-in
    expect(byId.b.net).toBe(-10)
    expect(byId.c.net).toBe(-10)
  })
})
