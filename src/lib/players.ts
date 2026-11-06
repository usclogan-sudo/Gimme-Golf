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
