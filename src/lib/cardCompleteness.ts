// §2.3 — partial-round eligibility.
//
// The post-round rack requires a COMPLETE card. A card is complete when every
// roster player has a score on every hole in the round's configured hole set — so a
// round configured as nine holes is complete at nine, not at eighteen.
//
// This module answers only "is the card complete, and if not, what exactly is
// missing". It deliberately does no settlement: partial settlement is not attempted
// and games that cannot compute are not hidden. Blocking is clearer to the group
// than a rack full of half-computed games, and a walked-in round is an edge case
// rather than the norm.
import { getPlayableHoleNumbers, roundToHolesConfig } from './holeUtils'
import type { HoleScore, Player, Round } from '../types'

/** One roster player and the holes they have no score for, in play order. */
export interface MissingEntry {
  playerId: string
  playerName: string
  holeNumbers: number[]
}

export interface CardCompleteness {
  complete: boolean
  /** Holes in the round's configured set (9 for a nine-hole round, 18 otherwise). */
  totalHoles: number
  /** Holes on which EVERY roster player has a score. */
  holesFullyScored: number
  /** Every player + hole with a missing entry. Empty when the card is complete. */
  missing: MissingEntry[]
}

/**
 * Report whether a round's card is complete, naming every gap.
 *
 * Pure and synchronous: it is a function of the round, its roster and the scores
 * passed in, so a caller can re-evaluate it on every keystroke and the block state
 * resolves the instant the last score lands, with no refetch.
 *
 * A round with no roster or no course snapshot is never complete — there is nothing
 * to be complete about.
 */
export function getCardCompleteness(
  round: Round,
  holeScores: HoleScore[],
  groupNumber?: number,
): CardCompleteness {
  const players: Player[] = round.players ?? []
  const snapshot = round.courseSnapshot

  if (!snapshot || players.length === 0) {
    return { complete: false, totalHoles: 0, holesFullyScored: 0, missing: [] }
  }

  const holeNums = getPlayableHoleNumbers(snapshot, roundToHolesConfig(round, groupNumber))

  // playerId → set of holes scored. Built once so the scan is O(scores + players×holes)
  // rather than a find() per cell.
  const scored = new Map<string, Set<number>>()
  for (const s of holeScores) {
    let set = scored.get(s.playerId)
    if (!set) scored.set(s.playerId, (set = new Set()))
    set.add(s.holeNumber)
  }

  const missing: MissingEntry[] = []
  for (const p of players) {
    const has = scored.get(p.id)
    const gaps = holeNums.filter(n => !has?.has(n))
    if (gaps.length > 0) missing.push({ playerId: p.id, playerName: p.name, holeNumbers: gaps })
  }

  const holesFullyScored = holeNums.filter(n =>
    players.every(p => scored.get(p.id)?.has(n))).length

  return {
    complete: missing.length === 0,
    totalHoles: holeNums.length,
    holesFullyScored,
    missing,
  }
}

/**
 * The block state's message: names every player and hole with a missing entry.
 * Returns null when the card is complete.
 */
export function describeMissing(c: CardCompleteness): string | null {
  if (c.complete) return null
  if (c.totalHoles === 0) return 'This round has no course or roster yet.'
  const parts = c.missing.map(m => {
    const holes = m.holeNumbers.length === 1
      ? `hole ${m.holeNumbers[0]}`
      : `holes ${m.holeNumbers.join(', ')}`
    return `${m.playerName} — ${holes}`
  })
  return `${c.holesFullyScored} of ${c.totalHoles} holes scored. Missing: ${parts.join('; ')}.`
}
