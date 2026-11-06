import { describe, it, expect } from 'vitest'
import { claimedSeatNames, joinedSeatCount, firstNameOf } from '../seats'

const ORG = 'org-uid'
const names: Record<string, string> = {
  'lee-uid': 'Lee Wetherington',
  'pat-uid': 'Pat',
  [ORG]: 'Jeff Logan',
}
const nameOf = (uid: string) => names[uid]

describe('claimedSeatNames', () => {
  it('labels a guest seat claimed by a registered user with the claimant first name', () => {
    const out = claimedSeatNames(
      [{ playerId: 'guest-seat', userId: 'lee-uid', status: 'accepted' }],
      nameOf, ORG,
    )
    expect(out).toEqual({ 'guest-seat': 'Lee' })
  })

  it('does not label a registered player sitting in their own seat', () => {
    const out = claimedSeatNames(
      [{ playerId: 'pat-uid', userId: 'pat-uid', status: 'accepted' }],
      nameOf, ORG,
    )
    expect(out).toEqual({})
  })

  it('ignores pending and declined rows, the organiser, and claimants with no display name', () => {
    const out = claimedSeatNames(
      [
        { playerId: 'seat-a', userId: 'lee-uid', status: 'pending' },
        { playerId: 'seat-b', userId: 'lee-uid', status: 'declined' },
        { playerId: 'seat-c', userId: ORG, status: 'accepted' },
        { playerId: 'seat-d', userId: 'nobody-uid', status: 'accepted' },
      ],
      nameOf, ORG,
    )
    expect(out).toEqual({})
  })

  it('keys by seat id, so renaming the seat later still resolves the claimant', () => {
    const out = claimedSeatNames(
      [{ playerId: 'guest-seat', userId: 'lee-uid' }],
      nameOf, ORG,
    )
    // The seat name is not part of the lookup; only its id is.
    expect(out['guest-seat']).toBe('Lee')
  })
})

describe('joinedSeatCount', () => {
  it('counts seats with an accepted row held by someone other than the organiser', () => {
    const n = joinedSeatCount(
      [
        { playerId: 'seat-a', userId: 'lee-uid', status: 'accepted' },
        { playerId: 'pat-uid', userId: 'pat-uid', status: 'accepted' },
        { playerId: 'seat-c', userId: 'x-uid', status: 'pending' },
        { playerId: 'seat-d', userId: ORG, status: 'accepted' },
      ],
      ORG,
    )
    expect(n).toBe(2)
  })

  it('is zero with no accepted rows', () => {
    expect(joinedSeatCount([], ORG)).toBe(0)
    expect(joinedSeatCount([{ playerId: 's', userId: 'u', status: 'pending' }], ORG)).toBe(0)
  })
})

describe('firstNameOf', () => {
  it('takes the first word and tolerates extra whitespace', () => {
    expect(firstNameOf('  Lee   Wetherington ')).toBe('Lee')
    expect(firstNameOf('Pat')).toBe('Pat')
  })
})
