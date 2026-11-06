import type { Player } from '../types'

const normalise = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase()

/**
 * The player already on a list whose name matches `name`, ignoring case and
 * stray whitespace. Used before adding a guest so "bob" doesn't become a second
 * Bob beside the registered one (usability Finding 2). A registered match is
 * the case most worth catching: picking the guest copy loses the account link.
 */
export function findPlayerByName(name: string, players: Player[]): Player | undefined {
  const key = normalise(name)
  if (!key) return undefined
  return players.find(p => normalise(p.name) === key)
}

/**
 * Ids of guest rows whose name matches a registered player's display name. Two
 * "Jeff Logan" entries at the same handicap on Create Event were telling nobody
 * which one carried the account; the guest one is labelled "guest copy" from this.
 * Guest rows that match each other but no registered player are left alone.
 */
/**
 * Player ids from the organiser's recent rounds, most recently played with
 * first. `rounds` must already be in most-recent-first order; a player keeps the
 * position of the first (most recent) round they appear in. The organiser is
 * left out: they have their own pinned row.
 */
export function recentFriendOrder(
  rounds: { id: string }[],
  roundPlayers: { round_id: string; player_id: string }[],
  userId: string,
): string[] {
  const byRound = new Map<string, string[]>()
  for (const rp of roundPlayers) {
    if (!rp.player_id || rp.player_id === userId) continue
    const list = byRound.get(rp.round_id) ?? []
    list.push(rp.player_id)
    byRound.set(rp.round_id, list)
  }
  const seen = new Set<string>()
  const out: string[] = []
  for (const r of rounds) {
    for (const pid of byRound.get(r.id) ?? []) {
      if (seen.has(pid)) continue
      seen.add(pid)
      out.push(pid)
    }
  }
  return out
}

export function guestCopyIds(registered: Player[], guests: Player[]): Set<string> {
  const registeredNames = new Set(registered.map(p => normalise(p.name)).filter(Boolean))
  const registeredIds = new Set(registered.map(p => p.id))
  const out = new Set<string>()
  for (const g of guests) {
    if (registeredIds.has(g.id)) continue
    if (registeredNames.has(normalise(g.name))) out.add(g.id)
  }
  return out
}
