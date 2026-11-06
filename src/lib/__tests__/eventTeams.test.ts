// Create Event Best Ball: nobody is paired automatically, every player must be
// placed, and each group must split evenly before Game Setup can proceed.

import { describe, it, expect } from 'vitest'
import { bestBallTeamStatus } from '../eventUtils'

const p = (id: string) => ({ id, name: id })
const eight = ['ann', 'bo', 'cy', 'dee', 'eve', 'fay', 'gus', 'hal'].map(p)
const groups = { ann: 1, bo: 1, cy: 1, dee: 1, eve: 2, fay: 2, gus: 2, hal: 2 }

describe('bestBallTeamStatus', () => {
  it('starts with everyone unassigned and invalid', () => {
    const s = bestBallTeamStatus(eight, groups, {})
    expect(s.valid).toBe(false)
    expect(s.unassigned.map(x => x.id)).toEqual(eight.map(x => x.id))
  })

  it('stays invalid while anyone is unplaced, naming who is left in roster order', () => {
    const s = bestBallTeamStatus(eight, groups, { ann: 'A', bo: 'B', cy: 'A', eve: 'A', fay: 'B', gus: 'A', hal: 'B' })
    expect(s.valid).toBe(false)
    expect(s.unassigned.map(x => x.id)).toEqual(['dee'])
  })

  it('requires each group to be split evenly, not just the field', () => {
    // Field is 4 v 4, but group 1 is 3 v 1 and group 2 is 1 v 3.
    const s = bestBallTeamStatus(eight, groups, { ann: 'A', bo: 'A', cy: 'A', dee: 'B', eve: 'A', fay: 'B', gus: 'B', hal: 'B' })
    expect(s.valid).toBe(false)
    expect(s.unassigned).toEqual([])
    expect(s.uneven).toEqual([1, 2])
  })

  it('is valid once every player is placed and every group is even', () => {
    const s = bestBallTeamStatus(eight, groups, { ann: 'A', bo: 'A', cy: 'B', dee: 'B', eve: 'A', fay: 'B', gus: 'A', hal: 'B' })
    expect(s.valid).toBe(true)
    expect(s.uneven).toEqual([])
  })

  it('ignores stale picks for players no longer on the roster', () => {
    const four = eight.slice(0, 4)
    const s = bestBallTeamStatus(four, groups, { ann: 'A', bo: 'A', cy: 'B', dee: 'B', eve: 'A' })
    expect(s.valid).toBe(true)
  })
})
