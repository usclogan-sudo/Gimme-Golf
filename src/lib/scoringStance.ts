import type { ScorecardPermissions } from './permissions'

/**
 * What this person is, right now, in this round — and what they can do about it.
 *
 * WHY THIS EXISTS
 *
 * The scorecard used to describe every situation with a single word in a badge:
 * Spectating, View Only, Self-Entry, Score Master, Live. Six genuinely different
 * realities collapsed into five words with no explanation and no action, so a player
 * could not tell whether they were watching by choice or watching because something
 * had gone wrong. On 6 September six of thirteen players were in the `invited` state
 * below and saw the same word as a spouse following along on the cart path.
 *
 * Two of these are worth separating carefully, because they look identical on screen
 * and are opposite in kind:
 *
 *   `following`  — you are not in this round. A fact about the world. Read-only is
 *                  correct, permanent, and a legitimate thing to want.
 *   `scored_for` — you ARE playing; someone else is holding the pen as a favour. A
 *                  preference, not a permission, and you can take it back whenever
 *                  you like. Phones die and scorekeepers walk ahead.
 */
export type StanceKind =
  | 'organizer'
  | 'scorekeeper'
  | 'self'
  | 'scored_for'
  | 'invited'
  | 'following'

export interface ScoringStance {
  kind: StanceKind
  /** Short chip for the header. */
  badge: string
  /** One sentence, in plain language, saying what is true. */
  headline: string
  /** The action that changes the state, when one exists. */
  action?: 'join' | 'take_over'
  actionLabel?: string
}

export interface StanceInput {
  perms: Pick<ScorecardPermissions,
    | 'isScoremasterRole' | 'isScoreMaster' | 'isGroupScorekeeper' | 'groupHasActiveScorekeeper'
    | 'myRosterPlayerId' | 'myParticipant' | 'myEventParticipant' | 'myPendingInvite'
    | 'myEventGroupNumber' | 'readOnly'>
  isEventRound: boolean
  /** Display name of whoever is holding the pen, when someone is. */
  scorekeeperName?: string
  /** Set once the player has taken their own card back this session. */
  selfScoringOverride?: boolean
}

export function getScoringStance(input: StanceInput): ScoringStance {
  const { perms, isEventRound, scorekeeperName, selfScoringOverride } = input

  const ownsSlot = !!perms.myRosterPlayerId || !!perms.myParticipant || !!perms.myEventParticipant

  // Running the whole thing beats every other description of you, including playing.
  if (perms.isScoreMaster || (!isEventRound && perms.isScoremasterRole)) {
    return {
      kind: 'organizer',
      badge: 'Organizer',
      headline: "You're running this round — you can enter scores for anyone.",
    }
  }

  if (perms.isGroupScorekeeper) {
    const g = perms.myEventGroupNumber
    return {
      kind: 'scorekeeper',
      badge: g != null ? `Scorekeeper · G${g}` : 'Scorekeeper',
      headline: g != null
        ? `You're keeping score for group ${g}.`
        : "You're keeping score for your group.",
    }
  }

  // Someone else has the pen, but this is a favour rather than a restriction — the
  // way out is always offered.
  if (ownsSlot && perms.groupHasActiveScorekeeper && !selfScoringOverride) {
    return {
      kind: 'scored_for',
      badge: 'Scored for you',
      headline: scorekeeperName
        ? `${scorekeeperName} is keeping your score.`
        : 'Someone in your group is keeping your score.',
      action: 'take_over',
      actionLabel: 'Enter my own',
    }
  }

  if (ownsSlot) {
    return {
      kind: 'self',
      badge: 'Your card',
      headline: "You're keeping your own score.",
    }
  }

  // Added to the roster but never accepted. One tap from playing, and the whole
  // point of this module is that it must not look like the row below.
  if (perms.myPendingInvite) {
    return {
      kind: 'invited',
      badge: 'Not joined',
      headline: "You've been added to this round but haven't joined yet.",
      action: 'join',
      actionLabel: 'Join',
    }
  }

  return {
    kind: 'following',
    badge: 'Following',
    headline: "You're following along — you're not playing in this round.",
  }
}
