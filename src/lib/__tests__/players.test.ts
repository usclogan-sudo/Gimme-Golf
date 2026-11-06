import { describe, it, expect } from 'vitest'
import { findPlayerByName, guestCopyIds, recentFriendOrder } from '../players'
import type { Player } from '../../types'

const p = (id: string, name: string): Player => ({ id, name, handicapIndex: 10, tee: 'White', ghinNumber: '' })

describe('guestCopyIds', () => {
  const registered = [p('org-uid', 'Jeff Logan'), p('lee-uid', 'Lee Smith')]

  it('flags a guest row whose name matches a registered display name, ignoring case and spacing', () => {
    const guests = [p('g1', 'jeff  logan'), p('g2', 'Pat Jones')]
    expect(guestCopyIds(registered, guests)).toEqual(new Set(['g1']))
  })

  it('does not flag the registered row itself or guests that only match each other', () => {
    const guests = [p('org-uid', 'Jeff Logan'), p('g3', 'Bob'), p('g4', 'Bob')]
    expect(guestCopyIds(registered, guests).size).toBe(0)
  })
})

describe('recentFriendOrder', () => {
  // Rounds arrive most recent first; a player takes the position of the most
  // recent round they appear in, whatever the alphabet says.
  const rounds = [{ id: 'r-today' }, { id: 'r-last-week' }, { id: 'r-last-season' }]
  const roundPlayers = [
    { round_id: 'r-last-season', player_id: 'adam' },
    { round_id: 'r-last-season', player_id: 'me' },
    { round_id: 'r-last-week', player_id: 'zed' },
    { round_id: 'r-last-week', player_id: 'adam' },
    { round_id: 'r-today', player_id: 'me' },
    { round_id: 'r-today', player_id: 'kim' },
    { round_id: 'r-today', player_id: 'zed' },
  ]

  it('orders by the most recent round played with each player and drops the organiser', () => {
    expect(recentFriendOrder(rounds, roundPlayers, 'me')).toEqual(['kim', 'zed', 'adam'])
  })

  it('lists each player once and ignores rounds not in the window', () => {
    const out = recentFriendOrder([{ id: 'r-today' }], roundPlayers, 'me')
    expect(out).toEqual(['kim', 'zed'])
  })
})

describe('findPlayerByName', () => {
  it('matches ignoring case and whitespace', () => {
    expect(findPlayerByName(' lee   smith ', [p('a', 'Lee Smith')])?.id).toBe('a')
    expect(findPlayerByName('', [p('a', 'Lee Smith')])).toBeUndefined()
  })
})
