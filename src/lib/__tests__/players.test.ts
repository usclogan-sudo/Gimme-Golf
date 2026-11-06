import { describe, it, expect } from 'vitest'
import { findPlayerByName, guestCopyIds } from '../players'
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

describe('findPlayerByName', () => {
  it('matches ignoring case and whitespace', () => {
    expect(findPlayerByName(' lee   smith ', [p('a', 'Lee Smith')])?.id).toBe('a')
    expect(findPlayerByName('', [p('a', 'Lee Smith')])).toBeUndefined()
  })
})
