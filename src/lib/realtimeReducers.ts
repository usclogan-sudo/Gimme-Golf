import type { HoleScore, BBBPoint, JunkRecord, SideBet, RoundParticipant, BuyIn, PropBet, PropWager, HoleDeclaration } from '../types'
import { rowToHoleScore, rowToBBBPoint, rowToJunkRecord, rowToSideBet, rowToRoundParticipant, rowToBuyIn, rowToPropBet, rowToPropWager, rowToHoleDeclaration } from './supabase'

type RealtimePayload = {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE'
  new: Record<string, any>
  old: Record<string, any>
}

/**
 * Apply a realtime payload to the hole_scores state.
 * Returns the new array (or the same reference if no change).
 */
export function applyHoleScorePayload(
  prev: HoleScore[],
  payload: RealtimePayload,
): HoleScore[] {
  const row = payload.new
  if (payload.eventType === 'INSERT') {
    if (prev.some(s => s.id === row.id)) return prev
    return [...prev, rowToHoleScore(row)]
  } else if (payload.eventType === 'UPDATE') {
    return prev.map(s => s.id === row.id ? rowToHoleScore(row) : s)
  } else if (payload.eventType === 'DELETE') {
    const oldRow = payload.old
    return prev.filter(s => s.id !== oldRow.id)
  }
  return prev
}

/**
 * Apply a realtime payload to the bbb_points state.
 */
/** Per-hole declarations (presses, Wolf picks, Hammer). These used to ride along
 *  inside the `rounds` UPDATE payload as part of game.config; now they are their own
 *  rows and need their own reducer, or a second device never sees the Wolf declare. */
export function applyHoleDeclarationPayload(
  prev: HoleDeclaration[],
  payload: { eventType: 'INSERT' | 'UPDATE' | 'DELETE'; new?: any; old?: any },
): HoleDeclaration[] {
  if (payload.eventType === 'DELETE') {
    const id = payload.old?.id
    return id ? prev.filter(d => d.id !== id) : prev
  }
  if (!payload.new) return prev
  const row = rowToHoleDeclaration(payload.new)
  // Upserts replace by (round, hole, kind[, player]) rather than by id, so match on
  // the natural key too — otherwise a replaced declaration would appear twice.
  const withoutStale = prev.filter(d =>
    d.id !== row.id &&
    !(d.kind === row.kind && d.holeNumber === row.holeNumber &&
      (row.kind === 'press' ? d.playerId === row.playerId : true)))
  return [...withoutStale, row]
}

export function applyBBBPointPayload(
  prev: BBBPoint[],
  payload: RealtimePayload,
): BBBPoint[] {
  const row = payload.new
  if (payload.eventType === 'INSERT') {
    if (prev.some(p => p.id === row.id)) return prev
    return [...prev, rowToBBBPoint(row)]
  } else if (payload.eventType === 'UPDATE') {
    return prev.map(p => p.id === row.id ? rowToBBBPoint(row) : p)
  } else if (payload.eventType === 'DELETE') {
    return prev.filter(p => p.id !== payload.old.id)
  }
  return prev
}

/**
 * Apply a realtime payload to the junk_records state.
 */
export function applyJunkRecordPayload(
  prev: JunkRecord[],
  payload: RealtimePayload,
): JunkRecord[] {
  const row = payload.new
  if (payload.eventType === 'INSERT') {
    if (prev.some(jr => jr.id === row.id)) return prev
    return [...prev, rowToJunkRecord(row)]
  } else if (payload.eventType === 'UPDATE') {
    return prev.map(jr => jr.id === row.id ? rowToJunkRecord(row) : jr)
  } else if (payload.eventType === 'DELETE') {
    return prev.filter(jr => jr.id !== payload.old.id)
  }
  return prev
}

/**
 * Apply a realtime payload to the side_bets state.
 */
export function applySideBetPayload(
  prev: SideBet[],
  payload: RealtimePayload,
): SideBet[] {
  const row = payload.new
  if (payload.eventType === 'INSERT') {
    if (prev.some(sb => sb.id === row.id)) return prev
    return [...prev, rowToSideBet(row)]
  } else if (payload.eventType === 'UPDATE') {
    return prev.map(sb => sb.id === row.id ? rowToSideBet(row) : sb)
  } else if (payload.eventType === 'DELETE') {
    return prev.filter(sb => sb.id !== payload.old.id)
  }
  return prev
}

/**
 * Apply a realtime payload to the round_participants state.
 */
export function applyRoundParticipantPayload(
  prev: RoundParticipant[],
  payload: RealtimePayload,
): RoundParticipant[] {
  const row = payload.new
  if (payload.eventType === 'INSERT') {
    const mapped = rowToRoundParticipant(row)
    // Keep active-member state to accepted only; a pending invite must not leak in.
    if (mapped.status !== 'accepted') return prev
    if (prev.some(p => p.id === mapped.id)) return prev
    return [...prev, mapped]
  } else if (payload.eventType === 'UPDATE') {
    const mapped = rowToRoundParticipant(row)
    // pending→accepted adds; accepted→declined/pending removes.
    if (mapped.status !== 'accepted') return prev.filter(p => p.id !== mapped.id)
    return prev.some(p => p.id === mapped.id)
      ? prev.map(p => p.id === mapped.id ? mapped : p)
      : [...prev, mapped]
  } else if (payload.eventType === 'DELETE') {
    return prev.filter(p => p.id !== payload.old.id)
  }
  return prev
}

/**
 * Apply a realtime payload to the buy_ins state (update only).
 */
export function applyBuyInPayload(
  prev: BuyIn[],
  payload: RealtimePayload,
): BuyIn[] {
  if (payload.eventType === 'UPDATE') {
    const row = payload.new
    return prev.map(b => b.id === row.id ? rowToBuyIn(row) : b)
  }
  return prev
}

/**
 * Apply a realtime payload to the prop_bets state.
 */
export function applyPropBetPayload(
  prev: PropBet[],
  payload: RealtimePayload,
): PropBet[] {
  const row = payload.new
  if (payload.eventType === 'INSERT') {
    if (prev.some(pb => pb.id === row.id)) return prev
    return [...prev, rowToPropBet(row)]
  } else if (payload.eventType === 'UPDATE') {
    return prev.map(pb => pb.id === row.id ? rowToPropBet(row) : pb)
  } else if (payload.eventType === 'DELETE') {
    return prev.filter(pb => pb.id !== payload.old.id)
  }
  return prev
}

/**
 * Apply a realtime payload to the prop_wagers state.
 */
export function applyPropWagerPayload(
  prev: PropWager[],
  payload: RealtimePayload,
): PropWager[] {
  const row = payload.new
  if (payload.eventType === 'INSERT') {
    if (prev.some(pw => pw.id === row.id)) return prev
    return [...prev, rowToPropWager(row)]
  } else if (payload.eventType === 'UPDATE') {
    return prev.map(pw => pw.id === row.id ? rowToPropWager(row) : pw)
  } else if (payload.eventType === 'DELETE') {
    return prev.filter(pw => pw.id !== payload.old.id)
  }
  return prev
}
