export const MAX_PER_GROUP = 5

/**
 * Auto-assign players to groups using round-robin distribution.
 * If all players fit in one group, they all go to group 1.
 */
export function autoAssignGroups(
  playerIds: string[],
  maxPerGroup: number = MAX_PER_GROUP,
): Record<string, number> {
  const groups: Record<string, number> = {}
  if (playerIds.length <= maxPerGroup) {
    playerIds.forEach(id => { groups[id] = 1 })
  } else {
    const numGroups = Math.ceil(playerIds.length / maxPerGroup)
    playerIds.forEach((id, i) => { groups[id] = (i % numGroups) + 1 })
  }
  return groups
}

/**
 * How the organiser wants foursomes decided.
 *
 * Foursomes are about who you walk the course with, not how the game scores — an
 * event scores every player individually regardless. So this is a pairing tool, and
 * both modes are legitimate: sometimes you know exactly who is playing with whom,
 * sometimes you want the draw to decide.
 */
export type GroupMode = 'manual' | 'random'

/** Fisher-Yates. `rng` is injectable so the shuffle can be tested deterministically. */
function shuffled<T>(items: T[], rng: () => number = Math.random): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/**
 * Draw foursomes at random, in even sizes.
 *
 * Distinct from `autoAssignGroups`, which is deterministic round-robin over selection
 * order — that is a *distribution*, not a draw, and re-running it gives the same
 * answer every time. This actually shuffles, so tapping Shuffle again produces a
 * different draw, which is the whole point of offering it.
 */
export function randomAssignGroups(
  playerIds: string[],
  maxPerGroup: number = MAX_PER_GROUP,
  rng: () => number = Math.random,
): Record<string, number> {
  return autoAssignGroups(shuffled(playerIds, rng), maxPerGroup)
}

/**
 * Place any players who do not yet have a group, leaving existing assignments alone.
 *
 * This is what makes manual mode usable. Assigning sixteen people by hand and then
 * adding a seventeenth must not discard the previous fifteen decisions — so a roster
 * change tops up rather than reassigning. Newcomers land in the smallest group that
 * has room, which keeps foursomes even without moving anyone the organiser has
 * already placed.
 */
export function fillMissingGroups(
  groups: Record<string, number>,
  playerIds: string[],
  maxPerGroup: number = MAX_PER_GROUP,
): Record<string, number> {
  const live = new Set(playerIds)
  // Drop players who have left the roster, or their stale group keeps a foursome
  // looking full.
  const next: Record<string, number> = {}
  for (const [id, g] of Object.entries(groups)) if (live.has(id)) next[id] = g

  const missing = playerIds.filter(id => next[id] === undefined)
  if (missing.length === 0) return next

  const counts = new Map<number, number>()
  for (const g of Object.values(next)) counts.set(g, (counts.get(g) ?? 0) + 1)

  // At least enough groups to hold everyone, so a top-up can never overflow.
  const groupCount = Math.max(
    counts.size,
    Math.ceil(playerIds.length / maxPerGroup),
    1,
  )
  for (let g = 1; g <= groupCount; g++) if (!counts.has(g)) counts.set(g, 0)

  for (const id of missing) {
    let best = 1
    let bestCount = Infinity
    for (let g = 1; g <= groupCount; g++) {
      const c = counts.get(g) ?? 0
      if (c < bestCount) { best = g; bestCount = c }
    }
    next[id] = best
    counts.set(best, bestCount + 1)
  }
  return next
}

export type TeamSide = 'A' | 'B'

export interface BestBallTeamStatus {
  /** Every player placed, and every group split evenly with at least one a side. */
  valid: boolean
  /** Players on the roster with no team yet, in roster order. */
  unassigned: { id: string; name: string }[]
  /** Group numbers whose A and B sides are not the same size (after everyone is placed). */
  uneven: number[]
}

/**
 * Best Ball inside an event is played within each foursome, so each group
 * needs its own even split. Nobody is paired automatically: an unassigned
 * player blocks the step until the organiser places them.
 */
export function bestBallTeamStatus(
  players: { id: string; name: string }[],
  groups: Record<string, number>,
  teams: Record<string, TeamSide | undefined>,
): BestBallTeamStatus {
  const unassigned = players.filter(p => teams[p.id] !== 'A' && teams[p.id] !== 'B')
  const counts = new Map<number, { a: number; b: number }>()
  for (const p of players) {
    const g = groups[p.id] ?? 1
    const c = counts.get(g) ?? { a: 0, b: 0 }
    if (teams[p.id] === 'A') c.a += 1
    else if (teams[p.id] === 'B') c.b += 1
    counts.set(g, c)
  }
  const uneven = [...counts.entries()]
    .filter(([, c]) => c.a !== c.b || c.a < 1)
    .map(([g]) => g)
    .sort((x, y) => x - y)
  return { valid: unassigned.length === 0 && uneven.length === 0, unassigned, uneven }
}

/**
 * Validate group assignments: no group exceeds max size.
 */
export function validateGroups(
  groups: Record<string, number>,
  maxPerGroup: number = MAX_PER_GROUP,
): { valid: boolean; oversizedGroups: number[] } {
  const counts = new Map<number, number>()
  for (const groupNum of Object.values(groups)) {
    counts.set(groupNum, (counts.get(groupNum) ?? 0) + 1)
  }
  const oversizedGroups: number[] = []
  for (const [groupNum, count] of counts) {
    if (count > maxPerGroup) oversizedGroups.push(groupNum)
  }
  return { valid: oversizedGroups.length === 0, oversizedGroups }
}

/**
 * Auto-assign shotgun starting holes evenly across groups.
 * E.g., 4 groups on 18 holes → starts at holes 1, 5, 10, 14
 */
export function autoAssignShotgunStarts(
  numGroups: number,
  totalHoles: number,
): Record<number, number> {
  const starts: Record<number, number> = {}
  if (numGroups <= 1) return starts
  const spacing = Math.floor(totalHoles / numGroups)
  for (let i = 0; i < numGroups; i++) {
    starts[i + 1] = (i * spacing) + 1
  }
  return starts
}
