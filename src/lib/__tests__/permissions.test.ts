import { computeScorecardPermissions } from '../permissions'
import type { RoundParticipant, EventParticipant } from '../../types'

const userId = 'user-1'

function makeRound(overrides: { createdBy?: string; gameMasterId?: string } = {}) {
  return { createdBy: overrides.createdBy ?? 'other-user', gameMasterId: overrides.gameMasterId ?? undefined }
}

function makeRoundParticipant(uid: string, status: RoundParticipant['status'] = 'accepted'): RoundParticipant {
  return { id: 'rp-1', roundId: 'r-1', userId: uid, playerId: 'pl-1', status }
}

function makeEventParticipant(uid: string, role: 'manager' | 'scorekeeper' | 'player', groupNumber?: number, status: EventParticipant['status'] = 'accepted'): EventParticipant {
  return { id: 'ep-1', eventId: 'e-1', userId: uid, playerId: 'pl-1', role, status, groupNumber }
}

// ─── Creator scenarios ──────────────────────────────────────────────────────

describe('creator scenarios', () => {
  it('has full scoremaster role', () => {
    const perms = computeScorecardPermissions(userId, makeRound({ createdBy: userId }), [], [], false, false)
    expect(perms.isCreator).toBe(true)
    expect(perms.isScoremasterRole).toBe(true)
  })

  it('is not readOnly even without participant record', () => {
    const perms = computeScorecardPermissions(userId, makeRound({ createdBy: userId }), [], [], false, false)
    expect(perms.readOnly).toBe(false)
  })

  it('can approve scores in event rounds', () => {
    const perms = computeScorecardPermissions(userId, makeRound({ createdBy: userId }), [], [], true, false)
    expect(perms.canApproveScores).toBe(true)
  })

  it('is always treated as event manager', () => {
    const perms = computeScorecardPermissions(userId, makeRound({ createdBy: userId }), [], [], true, false)
    expect(perms.isEventManager).toBe(true)
  })
})

// ─── Game master scenarios ──────────────────────────────────────────────────

describe('game master scenarios', () => {
  it('has scoremaster role', () => {
    const perms = computeScorecardPermissions(userId, makeRound({ gameMasterId: userId }), [], [], false, false)
    expect(perms.isGameMaster).toBe(true)
    expect(perms.isScoremasterRole).toBe(true)
  })

  it('is not readOnly', () => {
    const perms = computeScorecardPermissions(userId, makeRound({ gameMasterId: userId }), [], [], false, false)
    expect(perms.readOnly).toBe(false)
  })

  it('can approve in event rounds', () => {
    const perms = computeScorecardPermissions(userId, makeRound({ gameMasterId: userId }), [], [], true, false)
    expect(perms.canApproveScores).toBe(true)
  })
})

// ─── Self-entry participant ─────────────────────────────────────────────────

describe('self-entry participant', () => {
  it('is not readOnly', () => {
    const perms = computeScorecardPermissions(userId, makeRound(), [makeRoundParticipant(userId)], [], false, false)
    expect(perms.readOnly).toBe(false)
  })

  it('selfEntryOnly is true', () => {
    const perms = computeScorecardPermissions(userId, makeRound(), [makeRoundParticipant(userId)], [], false, false)
    expect(perms.selfEntryOnly).toBe(true)
  })

  it('a pending invitee is not treated as an active member', () => {
    const perms = computeScorecardPermissions(userId, makeRound(), [makeRoundParticipant(userId, 'pending')], [], false, false)
    expect(perms.myParticipant).toBeUndefined()
    expect(perms.selfEntryOnly).toBe(false)
    expect(perms.readOnly).toBe(true)
  })

  it('cannot approve scores alone', () => {
    const perms = computeScorecardPermissions(userId, makeRound(), [makeRoundParticipant(userId)], [], true, false)
    expect(perms.canApproveScores).toBe(false)
  })

  it('without event role, cannot approve even in event rounds', () => {
    const perms = computeScorecardPermissions(userId, makeRound(), [makeRoundParticipant(userId)], [], true, false)
    expect(perms.canApproveScores).toBe(false)
  })
})

// ─── Event roles ────────────────────────────────────────────────────────────

describe('event roles', () => {
  it('manager can approve', () => {
    const perms = computeScorecardPermissions(
      userId, makeRound(), [], [makeEventParticipant(userId, 'manager')], true, false,
    )
    expect(perms.canApproveScores).toBe(true)
    expect(perms.isEventManager).toBe(true)
  })

  it('scorekeeper can approve', () => {
    const perms = computeScorecardPermissions(
      userId, makeRound(), [], [makeEventParticipant(userId, 'scorekeeper')], true, false,
    )
    expect(perms.canApproveScores).toBe(true)
    expect(perms.isGroupScorekeeper).toBe(true)
  })

  it('a pending event invitee (even role=manager) gets no access', () => {
    const perms = computeScorecardPermissions(
      userId, makeRound(), [], [makeEventParticipant(userId, 'manager', undefined, 'pending')], true, false,
    )
    expect(perms.myEventParticipant).toBeUndefined()
    expect(perms.isEventManager).toBe(false)
    expect(perms.canApproveScores).toBe(false)
  })

  it('player (role=player) cannot approve', () => {
    const perms = computeScorecardPermissions(
      userId, makeRound(), [], [makeEventParticipant(userId, 'player')], true, false,
    )
    expect(perms.canApproveScores).toBe(false)
    expect(perms.isEventManager).toBe(false)
    expect(perms.isGroupScorekeeper).toBe(false)
  })

  it('scorekeeper gets correct myEventGroupNumber', () => {
    const perms = computeScorecardPermissions(
      userId, makeRound(), [], [makeEventParticipant(userId, 'scorekeeper', 3)], true, false,
    )
    expect(perms.myEventGroupNumber).toBe(3)
  })

  it('non-event round: canApproveScores always false', () => {
    const perms = computeScorecardPermissions(
      userId, makeRound(), [], [makeEventParticipant(userId, 'manager')], false, false,
    )
    expect(perms.canApproveScores).toBe(false)
  })
})

// ─── Viewer / edge cases ────────────────────────────────────────────────────

describe('viewer / edge cases', () => {
  it('no participant record + not creator/GM → readOnly', () => {
    const perms = computeScorecardPermissions(userId, makeRound(), [], [], false, false)
    expect(perms.readOnly).toBe(true)
  })

  it('readOnlyProp=true forces readOnly regardless', () => {
    const perms = computeScorecardPermissions(userId, makeRound({ createdBy: userId }), [], [], false, true)
    expect(perms.readOnly).toBe(true)
  })

  it('null round → all false except readOnly', () => {
    const perms = computeScorecardPermissions(userId, null, [], [], false, false)
    expect(perms.isCreator).toBe(false)
    expect(perms.isGameMaster).toBe(false)
    expect(perms.isScoremasterRole).toBe(false)
    expect(perms.readOnly).toBe(true)
  })

  it('empty participants → only creator/GM roles matter', () => {
    const perms = computeScorecardPermissions(userId, makeRound({ createdBy: userId }), [], [], false, false)
    expect(perms.selfEntryOnly).toBe(false)
    expect(perms.isCreator).toBe(true)
    expect(perms.readOnly).toBe(false)
  })

  it('user is both creator AND event participant', () => {
    const perms = computeScorecardPermissions(
      userId, makeRound({ createdBy: userId }), [], [makeEventParticipant(userId, 'player')], true, false,
    )
    expect(perms.isCreator).toBe(true)
    expect(perms.isEventManager).toBe(true) // creator is always event manager
    expect(perms.canApproveScores).toBe(true)
  })

  it('user is game master AND event scorekeeper', () => {
    const perms = computeScorecardPermissions(
      userId, makeRound({ gameMasterId: userId }), [], [makeEventParticipant(userId, 'scorekeeper', 2)], true, false,
    )
    expect(perms.isGameMaster).toBe(true)
    expect(perms.isGroupScorekeeper).toBe(true)
    expect(perms.canApproveScores).toBe(true)
    expect(perms.myEventGroupNumber).toBe(2)
  })
})

// ─── Baseline scoring rights come from identity, not membership ─────────────
//
// The 6 September regression: six of thirteen players were added to the roster at
// setup but never invited, so they held no participant row of any kind. The card
// rendered as normal and silently ignored their taps, which players experienced as
// "watching" without being told they had been demoted. These pin the rule that
// owning a roster slot is enough to record your own score.

describe('roster identity as the baseline right', () => {
  // A registered user's player id IS their auth uuid, so the roster slot is theirs.
  const roster = [userId, 'pl-2', 'pl-3']

  it('is not readOnly when on the roster with no participant rows at all', () => {
    const perms = computeScorecardPermissions(userId, makeRound(), [], [], true, false, roster)
    expect(perms.readOnly).toBe(false)
    expect(perms.myRosterPlayerId).toBe(userId)
  })

  it('stays readOnly when not on the roster and holding no membership', () => {
    const perms = computeScorecardPermissions(userId, makeRound(), [], [], true, false, ['pl-2', 'pl-3'])
    expect(perms.readOnly).toBe(true)
    expect(perms.myRosterPlayerId).toBeUndefined()
  })

  it('grants only self-entry, never rights over the rest of the field', () => {
    const perms = computeScorecardPermissions(userId, makeRound(), [], [], true, false, roster)
    expect(perms.selfEntryOnly).toBe(true)
    expect(perms.isEventManager).toBe(false)
    expect(perms.isGroupScorekeeper).toBe(false)
    expect(perms.isScoreMaster).toBe(false)
    expect(perms.canApproveScores).toBe(false)
  })

  it('does not demote the creator to self-entry just for being on the roster', () => {
    const perms = computeScorecardPermissions(
      userId, makeRound({ createdBy: userId }), [], [], true, false, roster)
    expect(perms.selfEntryOnly).toBe(false)
    expect(perms.isScoreMaster).toBe(true)
  })

  it('leaves an accepted participant unchanged when also on the roster', () => {
    const perms = computeScorecardPermissions(
      userId, makeRound(), [makeRoundParticipant(userId)], [], false, false, roster)
    expect(perms.selfEntryOnly).toBe(true)
    expect(perms.readOnly).toBe(false)
  })

  it('still honours an explicit readOnly prop — spectating stays spectating', () => {
    const perms = computeScorecardPermissions(userId, makeRound(), [], [], true, true, roster)
    expect(perms.readOnly).toBe(true)
  })

  it('does not rescue a pending invitee who is absent from the roster', () => {
    const pending = [makeEventParticipant(userId, 'player', 1, 'pending')]
    const perms = computeScorecardPermissions(userId, makeRound(), [], pending, true, false, ['pl-2'])
    expect(perms.readOnly).toBe(true)
  })

  it('defaults to the old behaviour when no roster is supplied', () => {
    const perms = computeScorecardPermissions(userId, makeRound(), [], [], true, false)
    expect(perms.readOnly).toBe(true)
    expect(perms.myRosterPlayerId).toBeUndefined()
  })
})
