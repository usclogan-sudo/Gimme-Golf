// One answer to "which scores count", shared by the game engine, the leaderboard
// tables and the hole view, so gross and thru never disagree with the standings
// above them.
//
// Event rounds carry a status per score: a player's own entry is `pending` until
// a manager or scorekeeper approves it; a scorekeeper's or manager's entry is
// `approved` on write; `rejected` means re-enter. Ordinary rounds have no status
// (undefined), which counts as approved.

import type { HoleScore, Player } from '../types'

export function isApprovedScore(s: HoleScore): boolean {
  return s.scoreStatus !== 'rejected' && s.scoreStatus !== 'pending'
}

export function isPendingScore(s: HoleScore): boolean {
  return s.scoreStatus === 'pending'
}

/** The set the game engine scores from. */
export function approvedOnly(scores: HoleScore[]): HoleScore[] {
  return scores.filter(isApprovedScore)
}

/** playerId → number of their scores still awaiting approval. */
export function pendingCountByPlayer(scores: HoleScore[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const s of scores) {
    if (!isPendingScore(s)) continue
    out[s.playerId] = (out[s.playerId] ?? 0) + 1
  }
  return out
}

/**
 * Players with no usable score on `hole`. A pending score is present: the player
 * has played the hole, it just has not been approved yet. A rejected score is
 * missing: the player has been asked to enter it again.
 */
export function missingScorePlayers(players: Player[], scores: HoleScore[], hole: number): Player[] {
  return players.filter(p => !scores.some(s =>
    s.playerId === p.id && s.holeNumber === hole && s.scoreStatus !== 'rejected',
  ))
}
