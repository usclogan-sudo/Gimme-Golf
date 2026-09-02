// Reading and writing per-hole declarations (§ config hoist).
//
// Declarations are stored as rows keyed on (round, hole, kind) rather than nested
// inside `rounds.game.config`, because deferred game selection means there may be no
// chosen game at the moment a press or a Wolf pick is made.
//
// The settlement engine still speaks the old config shapes — `presses[]`,
// `holeDecisions{}`, `hammerStates{}` — and deliberately continues to. Those
// functions are pure, well tested, and the subject of §2.2's zero-sum guarantees;
// rewriting their signatures to chase a storage change would be a large, risky diff
// for no behavioural gain. Instead this module PROJECTS rows back into those shapes
// at the point of use. The engine stays untouched, and storage is free to change
// again later.
import type {
  HoleDeclaration, Press, WolfConfig, HammerHoleState, HammerPayload, WolfPartnerPayload,
} from '../types'

/** Presses, in hole order, as the settlement engine expects them. */
export function toPresses(declarations: HoleDeclaration[]): Press[] {
  return declarations
    .filter(d => d.kind === 'press' && d.playerId)
    .map(d => ({ holeNumber: d.holeNumber, playerId: d.playerId! }))
    .sort((a, b) => a.holeNumber - b.holeNumber || a.playerId.localeCompare(b.playerId))
}

/**
 * Wolf decisions keyed by hole.
 *
 * A Lone Wolf pick is `{ partnerId: null }` — present, with a null partner — and an
 * absent key is what "undeclared" means. The projection must preserve that
 * distinction exactly, because §6 blocks scoring on the difference between them.
 */
export function toHoleDecisions(declarations: HoleDeclaration[]): NonNullable<WolfConfig['holeDecisions']> {
  const out: NonNullable<WolfConfig['holeDecisions']> = {}
  for (const d of declarations) {
    if (d.kind !== 'wolf_partner') continue
    const { partnerId } = d.payload as unknown as WolfPartnerPayload
    out[d.holeNumber] = { partnerId: partnerId ?? null }
  }
  return out
}

/** Hammer states keyed by hole. */
export function toHammerStates(declarations: HoleDeclaration[]): Record<number, HammerHoleState> {
  const out: Record<number, HammerHoleState> = {}
  for (const d of declarations) {
    if (d.kind !== 'hammer' || !d.playerId) continue
    const p = d.payload as unknown as HammerPayload
    out[d.holeNumber] = {
      hammerHolder: d.playerId,
      value: p.value,
      presses: p.presses,
      declined: p.declined,
      ...(p.declinedBy ? { declinedBy: p.declinedBy } : {}),
    }
  }
  return out
}

/**
 * Fold declarations into a game's config so existing settlement code sees what it
 * expects, whichever storage the facts came from.
 *
 * Declarations WIN over anything still in the config blob. During the transition a
 * round can carry both — legacy config values written before the hoist, and rows
 * written after — and the rows are the newer truth. A game with no declarations at
 * all keeps its config untouched, which is what makes legacy rounds settle exactly
 * as they did before.
 */
export function withDeclarations<T extends { type: string; config: any }>(
  game: T,
  declarations: HoleDeclaration[],
): T {
  if (declarations.length === 0) return game
  switch (game.type) {
    case 'skins':
    case 'nassau': {
      const presses = toPresses(declarations)
      return presses.length ? { ...game, config: { ...game.config, presses } } : game
    }
    case 'wolf': {
      const holeDecisions = toHoleDecisions(declarations)
      return Object.keys(holeDecisions).length
        ? { ...game, config: { ...game.config, holeDecisions } }
        : game
    }
    case 'hammer': {
      const hammerStates = toHammerStates(declarations)
      return Object.keys(hammerStates).length
        ? { ...game, config: { ...game.config, hammerStates } }
        : game
    }
    default:
      return game
  }
}

/** Teams from the roster rows, in the `Record<playerId, 'A'|'B'>` shape team games
 *  read. Falls back to whatever the game config already carries when no roster row
 *  has a team, so legacy rounds are unaffected. */
export function toTeams(
  roundPlayers: { playerId: string; team?: 'A' | 'B' }[],
  fallback: Record<string, 'A' | 'B'> = {},
): Record<string, 'A' | 'B'> {
  const assigned = roundPlayers.filter(rp => rp.team)
  if (assigned.length === 0) return fallback
  const out: Record<string, 'A' | 'B'> = {}
  for (const rp of assigned) out[rp.playerId] = rp.team!
  return out
}
