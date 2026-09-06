import { autoAssignGroups, randomAssignGroups, fillMissingGroups, validateGroups, MAX_PER_GROUP } from '../eventUtils'

// ─── autoAssignGroups ───────────────────────────────────────────────────────

describe('autoAssignGroups', () => {
  it('assigns all players to group 1 when count <= MAX_PER_GROUP', () => {
    const ids = ['p1', 'p2', 'p3']
    const groups = autoAssignGroups(ids)
    expect(Object.values(groups).every(g => g === 1)).toBe(true)
  })

  it('single player goes to group 1', () => {
    const groups = autoAssignGroups(['p1'])
    expect(groups.p1).toBe(1)
  })

  it('empty array returns empty object', () => {
    expect(autoAssignGroups([])).toEqual({})
  })

  it('5 players (exactly MAX_PER_GROUP) all in group 1', () => {
    const ids = Array.from({ length: 5 }, (_, i) => `p${i + 1}`)
    const groups = autoAssignGroups(ids)
    expect(Object.values(groups).every(g => g === 1)).toBe(true)
  })

  it('6 players splits into 2 groups via round-robin', () => {
    const ids = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6']
    const groups = autoAssignGroups(ids)
    // 6 / 5 = ceil → 2 groups
    // p1→1, p2→2, p3→1, p4→2, p5→1, p6→2
    expect(groups.p1).toBe(1)
    expect(groups.p2).toBe(2)
    expect(groups.p3).toBe(1)
    expect(groups.p4).toBe(2)
    expect(groups.p5).toBe(1)
    expect(groups.p6).toBe(2)
  })

  it('10 players splits into 2 groups (5 each)', () => {
    const ids = Array.from({ length: 10 }, (_, i) => `p${i + 1}`)
    const groups = autoAssignGroups(ids)
    const g1 = Object.entries(groups).filter(([, g]) => g === 1)
    const g2 = Object.entries(groups).filter(([, g]) => g === 2)
    expect(g1).toHaveLength(5)
    expect(g2).toHaveLength(5)
  })

  it('11 players splits into 3 groups', () => {
    const ids = Array.from({ length: 11 }, (_, i) => `p${i + 1}`)
    const groups = autoAssignGroups(ids)
    // ceil(11/5) = 3 groups, round-robin: 4+4+3
    const groupNums = new Set(Object.values(groups))
    expect(groupNums.size).toBe(3)
  })

  it('20 players in 4 groups of 5', () => {
    const ids = Array.from({ length: 20 }, (_, i) => `p${i + 1}`)
    const groups = autoAssignGroups(ids)
    const groupNums = new Set(Object.values(groups))
    expect(groupNums.size).toBe(4)
    for (let g = 1; g <= 4; g++) {
      const count = Object.values(groups).filter(v => v === g).length
      expect(count).toBe(5)
    }
  })

  it('no group exceeds maxPerGroup', () => {
    for (let n = 1; n <= 25; n++) {
      const ids = Array.from({ length: n }, (_, i) => `p${i + 1}`)
      const groups = autoAssignGroups(ids)
      const counts = new Map<number, number>()
      for (const g of Object.values(groups)) {
        counts.set(g, (counts.get(g) ?? 0) + 1)
      }
      for (const [, count] of counts) {
        expect(count).toBeLessThanOrEqual(MAX_PER_GROUP)
      }
    }
  })

  it('respects custom maxPerGroup', () => {
    const ids = ['p1', 'p2', 'p3', 'p4']
    const groups = autoAssignGroups(ids, 2)
    // 4/2 = 2 groups
    const groupNums = new Set(Object.values(groups))
    expect(groupNums.size).toBe(2)
  })

  it('every player is assigned exactly once', () => {
    const ids = Array.from({ length: 13 }, (_, i) => `p${i + 1}`)
    const groups = autoAssignGroups(ids)
    expect(Object.keys(groups).sort()).toEqual(ids.sort())
  })
})

// ─── validateGroups ─────────────────────────────────────────────────────────

describe('validateGroups', () => {
  it('valid when no group exceeds max', () => {
    const groups = { p1: 1, p2: 1, p3: 2, p4: 2 }
    const result = validateGroups(groups)
    expect(result.valid).toBe(true)
    expect(result.oversizedGroups).toEqual([])
  })

  it('invalid when a group exceeds max', () => {
    const groups: Record<string, number> = {}
    // 6 players in group 1
    for (let i = 1; i <= 6; i++) groups[`p${i}`] = 1
    const result = validateGroups(groups)
    expect(result.valid).toBe(false)
    expect(result.oversizedGroups).toContain(1)
  })

  it('identifies which groups are oversized', () => {
    const groups: Record<string, number> = {}
    for (let i = 1; i <= 6; i++) groups[`p${i}`] = 1
    for (let i = 7; i <= 12; i++) groups[`p${i}`] = 2
    groups.p13 = 3 // group 3 has 1 — fine
    const result = validateGroups(groups)
    expect(result.oversizedGroups.sort()).toEqual([1, 2])
  })

  it('empty groups is valid', () => {
    const result = validateGroups({})
    expect(result.valid).toBe(true)
  })

  it('respects custom maxPerGroup', () => {
    const groups = { p1: 1, p2: 1, p3: 1 }
    expect(validateGroups(groups, 2).valid).toBe(false)
    expect(validateGroups(groups, 3).valid).toBe(true)
  })

  it('autoAssignGroups output always passes validation', () => {
    for (let n = 1; n <= 25; n++) {
      const ids = Array.from({ length: n }, (_, i) => `p${i + 1}`)
      const groups = autoAssignGroups(ids)
      const result = validateGroups(groups)
      expect(result.valid).toBe(true)
    }
  })
})

// ─── Foursome modes ─────────────────────────────────────────────────────────

const ids16 = Array.from({ length: 16 }, (_, i) => `p${i + 1}`)
const sizes = (g: Record<string, number>) => {
  const m = new Map<number, number>()
  for (const n of Object.values(g)) m.set(n, (m.get(n) ?? 0) + 1)
  return [...m.entries()].sort((a, b) => a[0] - b[0]).map(([, c]) => c)
}

describe('randomAssignGroups', () => {
  /** Reverses the list: deterministic, and not the identity, so a real shuffle shows. */
  const reversingRng = () => 0

  it('splits sixteen players into four even foursomes', () => {
    expect(sizes(randomAssignGroups(ids16))).toEqual([4, 4, 4, 4])
  })

  it('places every player exactly once', () => {
    const g = randomAssignGroups(ids16)
    expect(Object.keys(g).sort()).toEqual([...ids16].sort())
  })

  it('respects the max group size', () => {
    expect(validateGroups(randomAssignGroups(ids16)).valid).toBe(true)
  })

  it('actually shuffles rather than distributing in order', () => {
    // With rng() = 0, Fisher-Yates rotates the list, so assignments must differ from
    // the deterministic round-robin over the original order.
    const drawn = randomAssignGroups(ids16, MAX_PER_GROUP, reversingRng)
    const ordered = autoAssignGroups(ids16)
    expect(drawn).not.toEqual(ordered)
  })

  it('gives different draws across calls', () => {
    // Guards against the draw secretly being deterministic. 16 players over 4 groups
    // makes a collision across ten draws vanishingly unlikely.
    const draws = new Set(Array.from({ length: 10 }, () => JSON.stringify(randomAssignGroups(ids16))))
    expect(draws.size).toBeGreaterThan(1)
  })

  it('handles a field that fits in one group', () => {
    expect(randomAssignGroups(['a', 'b', 'c'])).toEqual({ a: 1, b: 1, c: 1 })
  })

  it('handles an empty field', () => {
    expect(randomAssignGroups([])).toEqual({})
  })
})

describe('fillMissingGroups', () => {
  it('leaves every existing assignment alone', () => {
    // The point of manual mode: adding a player must not undo prior decisions.
    const manual = { p1: 3, p2: 3, p3: 1, p4: 1 }
    const out = fillMissingGroups(manual, ['p1', 'p2', 'p3', 'p4', 'p5'])
    expect(out.p1).toBe(3)
    expect(out.p2).toBe(3)
    expect(out.p3).toBe(1)
    expect(out.p4).toBe(1)
    expect(out.p5).toBeDefined()
  })

  it('puts a newcomer in the smallest foursome', () => {
    const out = fillMissingGroups({ a: 1, b: 1, c: 1, d: 2 }, ['a', 'b', 'c', 'd', 'e'])
    expect(out.e).toBe(2)
  })

  it('drops players who have left the roster', () => {
    // A stale entry would otherwise keep a foursome looking full.
    const out = fillMissingGroups({ a: 1, gone: 2 }, ['a'])
    expect(out).toEqual({ a: 1 })
  })

  it('is a no-op when everyone already has a group', () => {
    const g = { a: 1, b: 2 }
    expect(fillMissingGroups(g, ['a', 'b'])).toEqual(g)
  })

  it('opens enough foursomes for a field that cannot fit in the existing ones', () => {
    // One group of five exists; sixteen players need four.
    const out = fillMissingGroups({ p1: 1 }, ids16)
    expect(validateGroups(out).valid).toBe(true)
    expect(new Set(Object.values(out)).size).toBeGreaterThanOrEqual(4)
  })

  it('never exceeds the max group size when topping up', () => {
    const out = fillMissingGroups({}, ids16)
    expect(validateGroups(out).valid).toBe(true)
    expect(sizes(out)).toEqual([4, 4, 4, 4])
  })

  it('keeps the manual grouping stable across repeated roster edits', () => {
    let g = fillMissingGroups({}, ['a', 'b'])
    const first = { ...g }
    g = fillMissingGroups(g, ['a', 'b', 'c'])
    expect(g.a).toBe(first.a)
    expect(g.b).toBe(first.b)
    g = fillMissingGroups(g, ['a', 'b', 'c', 'd'])
    expect(g.a).toBe(first.a)
    expect(g.b).toBe(first.b)
  })
})
