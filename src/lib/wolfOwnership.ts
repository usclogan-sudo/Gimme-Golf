// §6 — Wolf ownership.
//
// Wolf's partner pick is the one decision in the app that is worth money and lives
// nowhere on the scorecard. Until now the picker rendered as interactive on every
// device at once with no ownership binding, so any player could choose the Wolf's
// partner, and a hole that completed with no pick resolved silently as if the Wolf
// had never played.
//
// Three rules close that, and they compose into a single ordering — DECLARE, then
// SCORE:
//   1. only the Wolf may declare (this module's `canDeclareWolf`)
//   2. a hole cannot be left while a declaration is outstanding
//   3. a score write on a Wolf hole is rejected until the declaration exists
//
// Kept as pure functions so the write-path guard and the UI cannot drift apart:
// both ask the same question of the same data.
import { wolfForHole } from './gameLogic'
import type { Game, WolfConfig } from '../types'

export interface WolfHoleState {
  /** This round is Wolf and the hole has an owner. */
  isWolfHole: boolean
  /** Player whose turn it is to be Wolf on this hole. */
  wolfId: string | null
  /** A partner or Lone Wolf declaration exists for this hole. */
  declared: boolean
}

/** Who owns this hole's Wolf decision, and whether they have made it yet. */
export function getWolfHoleState(game: Game | undefined | null, holeNumber: number): WolfHoleState {
  if (!game || game.type !== 'wolf') return { isWolfHole: false, wolfId: null, declared: false }
  const config = game.config as WolfConfig
  const wolfId = wolfForHole(config.wolfOrder ?? [], holeNumber) || null
  // A Lone Wolf declaration is `{ partnerId: null }` — present but null. Only an
  // ABSENT entry means undeclared, so `!= null` on partnerId would be wrong here.
  const declared = config.holeDecisions?.[holeNumber] !== undefined
  return { isWolfHole: wolfId !== null, wolfId, declared }
}

/**
 * May this device declare the Wolf decision for this hole?
 *
 * The rule is ownership: the pick belongs to the Wolf. `claimedPlayerIds` is the set
 * of roster players who have a device of their own in the round (an accepted
 * participant).
 *
 * The fallback matters as much as the rule. When the Wolf has NO device — an
 * unregistered player whose scores the organiser enters — nobody could ever declare,
 * and because rule 3 rejects scores until a declaration exists, the round would
 * deadlock on the first hole that player is Wolf. So an unclaimed Wolf's pick falls
 * to the scoremaster. Ownership is enforced exactly where it can be: multi-device
 * rounds, which is where the defect actually bit.
 */
export function canDeclareWolf(input: {
  wolfId: string | null
  myPlayerId: string | undefined
  claimedPlayerIds: Iterable<string>
  isScoremaster: boolean
}): boolean {
  const { wolfId, myPlayerId, claimedPlayerIds, isScoremaster } = input
  if (!wolfId) return false
  if (myPlayerId === wolfId) return true
  const claimed = claimedPlayerIds instanceof Set ? claimedPlayerIds : new Set(claimedPlayerIds)
  if (claimed.has(wolfId)) return false   // the Wolf is here — it is their call, not yours
  return isScoremaster                     // nobody is holding this Wolf; the organiser stands in
}

/**
 * §6 rule 3 — may a score be written for this hole yet?
 *
 * Enforced in the write path rather than the UI so a second device, a queued offline
 * write, or a stale render cannot slip a score in ahead of the declaration. Returns
 * a reason when blocked so the caller can name the player everyone is waiting on.
 */
export function scoreWriteBlocked(
  game: Game | undefined | null,
  holeNumber: number,
  playerName: (playerId: string) => string,
): { blocked: boolean; reason?: string; wolfId?: string } {
  const { isWolfHole, wolfId, declared } = getWolfHoleState(game, holeNumber)
  if (!isWolfHole || declared) return { blocked: false }
  return {
    blocked: true,
    wolfId: wolfId!,
    reason: `${playerName(wolfId!)} needs to pick a partner or go Lone Wolf before hole ${holeNumber} can be scored.`,
  }
}
