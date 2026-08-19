import type { ResultCardProps } from './ResultCard'

/**
 * Single source of truth for turning a round's players + settlement records into
 * ResultCard props. Used by both SettleUp (the hero card) and RoundHistory (the
 * per-row outcome + expanded card) so the two screens can never drift.
 *
 * The card is points-only. `amountCents` already holds the point count in points
 * mode, so `toPoints` passes it through; in money mode it divides by 100 — exactly
 * how fmtAmount treats stored values.
 */
export interface DeriveResultCardInput {
  roundId: string
  courseName: string
  date: Date
  formats: string[]
  holesPlayed: number
  players: { id: string; name: string }[]
  settlements: { fromPlayerId: string; toPlayerId: string; amountCents: number }[]
  /** Live payouts — only used to derive net when a round has no settlement records yet. */
  payouts?: { playerId: string; amountCents: number }[]
  buyInCents?: number
  isPoints: boolean
}

export function buildResultCardProps(input: DeriveResultCardInput): ResultCardProps {
  const { players, settlements, payouts = [], buyInCents = 0, isPoints } = input
  const toPoints = (cents: number) => (isPoints ? cents : Math.round(cents / 100))
  const nameById = new Map(players.map(p => [p.id, p.name]))

  const netByPlayer = new Map<string, number>()
  players.forEach(p => netByPlayer.set(p.id, 0))
  if (settlements.length > 0) {
    settlements.forEach(r => {
      netByPlayer.set(r.fromPlayerId, (netByPlayer.get(r.fromPlayerId) ?? 0) - r.amountCents)
      netByPlayer.set(r.toPlayerId, (netByPlayer.get(r.toPlayerId) ?? 0) + r.amountCents)
    })
  } else {
    // Not yet settled — derive net from live payouts so the card matches the board.
    players.forEach(p => {
      const won = payouts.find(pay => pay.playerId === p.id)?.amountCents ?? 0
      netByPlayer.set(p.id, won - buyInCents)
    })
  }

  const ranked = players
    .map(p => ({ playerId: p.id, displayName: p.name, net: toPoints(netByPlayer.get(p.id) ?? 0) }))
    .sort((a, b) => b.net - a.net)
  // Standard competition ranking: ties share a position, the next distinct net skips.
  let pos = 0
  let lastNet: number | null = null
  const standings = ranked.map((p, i) => {
    if (lastNet === null || p.net !== lastNet) { pos = i + 1; lastNet = p.net }
    return { ...p, position: pos }
  })

  const settlementsOut = settlements.map(r => ({
    fromName: nameById.get(r.fromPlayerId) ?? 'Player',
    toName: nameById.get(r.toPlayerId) ?? 'Player',
    amount: toPoints(r.amountCents),
  }))

  return {
    round: {
      courseName: input.courseName,
      date: input.date,
      formats: input.formats,
      holesPlayed: input.holesPlayed,
    },
    standings,
    settlements: settlementsOut,
    roundId: input.roundId,
  }
}
