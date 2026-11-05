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
