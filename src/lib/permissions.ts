import type { Round, RoundParticipant, EventParticipant } from '../types'

export interface ScorecardPermissions {
  isCreator: boolean
  isGameMaster: boolean
  isScoremasterRole: boolean
  selfEntryOnly: boolean
  myParticipant: RoundParticipant | undefined
  myEventParticipant: EventParticipant | undefined
  myRosterPlayerId: string | undefined
  isEventManager: boolean
  isGroupScorekeeper: boolean
  isScoreMaster: boolean
  groupHasActiveScorekeeper: boolean
  canApproveScores: boolean
  readOnly: boolean
  myEventGroupNumber: number | undefined
}

export function computeScorecardPermissions(
  userId: string,
  round: Pick<Round, 'createdBy' | 'gameMasterId'> | null,
  roundParticipants: RoundParticipant[],
  eventParticipants: EventParticipant[],
  isEventRound: boolean,
  readOnlyProp: boolean,
  rosterPlayerIds: string[] = [],
): ScorecardPermissions {
  const isCreator = userId === round?.createdBy
  const isGameMaster = userId === round?.gameMasterId
  const isScoremasterRole = isCreator || isGameMaster

  // Only an *accepted* participant counts as an active member (pending/declined
  // invitees get no scoring access until they accept).
  const myParticipant = roundParticipants.find(p => p.userId === userId && p.status === 'accepted')

  // Only an accepted event participant counts (pending invitees get no access).
  const myEventParticipant = eventParticipants.find(ep => ep.userId === userId && ep.status === 'accepted')

  // THE BASELINE RIGHT, AND WHY IT DERIVES FROM IDENTITY
  //
  // A registered user's player id IS their auth uuid (see the self-player synthesis
  // in NewRound), so a roster slot carrying this user's own id is unambiguously
  // theirs. That fact alone earns the right to enter their own score.
  //
  // Previously every scoring right flowed from a membership row, and on 6 September
  // six of thirteen players had none — they had been added to the roster at setup and
  // never invited. The self-entry fallback in Scorecard was meant to rescue exactly
  // that case, but it was gated on `myEventParticipant`, the very row whose absence
  // was the failure, so it could never fire. The card rendered normally and silently
  // ignored them; players described it as "watching" without knowing they had been
  // demoted.
  //
  // So: identity grants the baseline. Membership rows grant ADDITIONAL powers —
  // scorekeeper, manager, cross-group editing — and must never be required for a
  // person to record their own strokes.
  const myRosterPlayerId = rosterPlayerIds.includes(userId) ? userId : undefined

  // Anyone who owns a slot but holds no scoremaster role edits only their own card.
  // Covering the roster case here is what keeps the baseline narrow: without it a
  // membership-less player would fall through to the creator branch below and be
  // handed edit rights over the whole field.
  const selfEntryOnly = !isScoremasterRole && (!!myParticipant || !!myRosterPlayerId)

  const isEventManager = myEventParticipant?.role === 'manager' || isCreator
  const isGroupScorekeeper = myEventParticipant?.role === 'scorekeeper'
  const canApproveScores = isEventRound && (isEventManager || isGroupScorekeeper || isScoremasterRole)
  const myEventGroupNumber = myEventParticipant?.groupNumber

  // Score Master = event manager or creator in event context (cross-group edit access)
  const isScoreMaster = isEventRound && (isEventManager || isScoremasterRole)

  // Does the current player's group have an active (joined) scorekeeper?
  // True when a scorekeeper EventParticipant exists for this group and it's not the player themselves
  const groupHasActiveScorekeeper = isEventRound && myEventGroupNumber != null &&
    eventParticipants.some(ep =>
      ep.role === 'scorekeeper' &&
      ep.groupNumber === myEventGroupNumber &&
      ep.userId !== userId
    )

  const readOnly = readOnlyProp ||
    (!isScoremasterRole && !myParticipant && !myEventParticipant && !myRosterPlayerId)

  return {
    isCreator,
    isGameMaster,
    isScoremasterRole,
    selfEntryOnly,
    myParticipant,
    myEventParticipant,
    myRosterPlayerId,
    isEventManager,
    isGroupScorekeeper,
    isScoreMaster,
    groupHasActiveScorekeeper,
    canApproveScores,
    readOnly,
    myEventGroupNumber,
  }
}
