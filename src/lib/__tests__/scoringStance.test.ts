import { getScoringStance } from '../scoringStance'
import type { StanceInput } from '../scoringStance'
import type { RoundParticipant, EventParticipant } from '../../types'

const rp = { id: 'rp-1', roundId: 'r-1', userId: 'u-1', playerId: 'pl-1', status: 'accepted' } as RoundParticipant
const ep = { id: 'ep-1', eventId: 'e-1', userId: 'u-1', playerId: 'pl-1', role: 'player', status: 'accepted' } as EventParticipant

function stance(perms: Partial<StanceInput['perms']> = {}, rest: Partial<StanceInput> = {}) {
  return getScoringStance({
    perms: {
      isScoremasterRole: false, isScoreMaster: false, isGroupScorekeeper: false,
      groupHasActiveScorekeeper: false, myRosterPlayerId: undefined,
      myParticipant: undefined, myEventParticipant: undefined, myPendingInvite: false,
      myEventGroupNumber: undefined, readOnly: false,
      ...perms,
    },
    isEventRound: true,
    ...rest,
  })
}

describe('scoring stance', () => {
  it('names the organiser, and running it outranks playing', () => {
    const s = stance({ isScoreMaster: true, myRosterPlayerId: 'u-1' })
    expect(s.kind).toBe('organizer')
    expect(s.action).toBeUndefined()
  })

  it('names the scorekeeper with their group', () => {
    const s = stance({ isGroupScorekeeper: true, myEventGroupNumber: 2 })
    expect(s.kind).toBe('scorekeeper')
    expect(s.badge).toBe('Scorekeeper · G2')
    expect(s.headline).toContain('group 2')
  })

  it('says who holds the pen and offers it back', () => {
    const s = stance(
      { myEventParticipant: ep, groupHasActiveScorekeeper: true },
      { scorekeeperName: 'Ravi' })
    expect(s.kind).toBe('scored_for')
    expect(s.headline).toBe('Ravi is keeping your score.')
    expect(s.action).toBe('take_over')
  })

  it('hands the card back once the player takes it', () => {
    const s = stance(
      { myEventParticipant: ep, groupHasActiveScorekeeper: true },
      { scorekeeperName: 'Ravi', selfScoringOverride: true })
    expect(s.kind).toBe('self')
  })

  it('still names the state when the scorekeeper is unknown', () => {
    const s = stance({ myEventParticipant: ep, groupHasActiveScorekeeper: true })
    expect(s.kind).toBe('scored_for')
    expect(s.headline).toContain('Someone in your group')
  })

  it('confirms self-entry rather than leaving it implied', () => {
    expect(stance({ myParticipant: rp }).kind).toBe('self')
    expect(stance({ myRosterPlayerId: 'u-1' }).kind).toBe('self')
  })

  // The 6 September case, and the whole reason this module exists: these next two
  // rendered the identical word and are completely different situations.
  it('distinguishes an uninvited roster player from an outsider', () => {
    const invited = stance({ myPendingInvite: true })
    const outsider = stance({})
    expect(invited.kind).toBe('invited')
    expect(invited.action).toBe('join')
    expect(outsider.kind).toBe('following')
    expect(outsider.action).toBeUndefined()
    expect(invited.headline).not.toBe(outsider.headline)
  })

  it('treats following along as legitimate, not as an error', () => {
    const s = stance({ readOnly: true })
    expect(s.kind).toBe('following')
    expect(s.headline).toContain('not playing')
  })

  it('works outside events, where the creator is the organiser', () => {
    const s = getScoringStance({
      perms: {
        isScoremasterRole: true, isScoreMaster: false, isGroupScorekeeper: false,
        groupHasActiveScorekeeper: false, myRosterPlayerId: undefined,
        myParticipant: undefined, myEventParticipant: undefined, myPendingInvite: false,
        myEventGroupNumber: undefined, readOnly: false,
      },
      isEventRound: false,
    })
    expect(s.kind).toBe('organizer')
  })
})
