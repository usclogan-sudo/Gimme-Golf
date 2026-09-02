// §1 — the game registry.
//
// One static table where every game declares its class. The class drives every
// downstream behaviour in the deferred-selection spec:
//
//   score_derived   (Class A) — a pure function of hole scores, frozen handicaps and
//                   teams. Can be computed at any time, including after the round, so
//                   it is eligible for the post-round rack.
//   decision_derived (Class B) — depends on choices or events that never reach the
//                   scorecard and cannot be reconstructed afterwards, so it must be
//                   armed before the hole it applies to.
//
// §1 is explicit that `class` is the ONLY thing code should branch on for this. No
// `if (gameType === 'wolf')` scattered around deciding what is deferrable.
//
// The registry also owns roster constraints, which were previously five ad-hoc
// booleans in NewRound. A registry nothing reads is worse than no registry.
import type { GameType } from '../types'

export type GameClass = 'score_derived' | 'decision_derived'

export interface GameDefinition {
  id: GameType
  label: string
  class: GameClass
  minPlayers: number
  /** null = no ceiling beyond the roster cap. */
  maxPlayers: number | null
  /** Player count must be even (two balanced sides). */
  evenPlayersOnly: boolean
  /** Plays as two sides rather than individuals. */
  requiresTeams: boolean
  /** Why this game cannot be deferred. Class B only — shown in the arm gate, and it
   *  documents the classification at the point of decision. */
  armReason?: string
}

/** Roster ceiling enforced by invite_to_round. */
export const MAX_ROSTER = 6

export const GAME_REGISTRY: Record<GameType, GameDefinition> = {
  // ── Class A: score-derived, eligible for the post-round rack ───────────────
  skins: {
    id: 'skins', label: 'Skins', class: 'score_derived',
    minPlayers: 2, maxPlayers: null, evenPlayersOnly: false, requiresTeams: false,
  },
  best_ball: {
    id: 'best_ball', label: 'Best Ball', class: 'score_derived',
    minPlayers: 2, maxPlayers: null, evenPlayersOnly: true, requiresTeams: true,
  },
  nassau: {
    id: 'nassau', label: 'Nassau', class: 'score_derived',
    minPlayers: 2, maxPlayers: null, evenPlayersOnly: false, requiresTeams: false,
  },
  vegas: {
    id: 'vegas', label: 'Vegas', class: 'score_derived',
    minPlayers: 2, maxPlayers: null, evenPlayersOnly: true, requiresTeams: true,
  },
  stableford: {
    id: 'stableford', label: 'Stableford', class: 'score_derived',
    minPlayers: 2, maxPlayers: null, evenPlayersOnly: false, requiresTeams: false,
  },
  banker: {
    id: 'banker', label: 'Banker', class: 'score_derived',
    minPlayers: 3, maxPlayers: null, evenPlayersOnly: false, requiresTeams: false,
  },
  quota: {
    id: 'quota', label: 'Quota', class: 'score_derived',
    minPlayers: 2, maxPlayers: null, evenPlayersOnly: false, requiresTeams: false,
  },

  // ── Class B: decision-derived, must be armed before the hole ───────────────
  wolf: {
    id: 'wolf', label: 'Wolf', class: 'decision_derived',
    minPlayers: 3, maxPlayers: null, evenPlayersOnly: false, requiresTeams: false,
    armReason: 'The partner pick and Lone Wolf call are commitments made before the hole resolves.',
  },
  hammer: {
    id: 'hammer', label: 'Hammer', class: 'decision_derived',
    minPlayers: 2, maxPlayers: 2, evenPlayersOnly: true, requiresTeams: false,
    armReason: 'Throwing and declining the hammer are declarations made mid-hole.',
  },
  bingo_bango_bongo: {
    id: 'bingo_bango_bongo', label: 'Bingo Bango Bongo', class: 'decision_derived',
    minPlayers: 2, maxPlayers: null, evenPlayersOnly: false, requiresTeams: false,
    armReason: 'Needs shot-order data — first on, closest, first in — that scores do not carry.',
  },
  dots: {
    id: 'dots', label: 'Dots', class: 'decision_derived',
    minPlayers: 2, maxPlayers: null, evenPlayersOnly: false, requiresTeams: false,
    armReason: 'Greenies, sandies and the rest are per-hole events, not scores.',
  },
}

export const ALL_GAMES: GameDefinition[] = Object.values(GAME_REGISTRY)

export function gameDef(id: GameType): GameDefinition {
  return GAME_REGISTRY[id]
}

/** Games the group can pick from the rack after the round. */
export function scoreDerivedGames(): GameDefinition[] {
  return ALL_GAMES.filter(g => g.class === 'score_derived')
}

/** Games the arm gate must offer, because they cannot be reconstructed later. */
export function decisionDerivedGames(): GameDefinition[] {
  return ALL_GAMES.filter(g => g.class === 'decision_derived')
}

export function isScoreDerived(id: GameType): boolean {
  return GAME_REGISTRY[id].class === 'score_derived'
}

export function isDecisionDerived(id: GameType): boolean {
  return GAME_REGISTRY[id].class === 'decision_derived'
}

/**
 * Can this game be played by this many players? Replaces the per-game booleans that
 * were inlined in NewRound, so the rack and the arm gate cannot disagree with setup
 * about what is playable.
 */
export function supportsPlayerCount(id: GameType, count: number): boolean {
  const g = GAME_REGISTRY[id]
  if (count < g.minPlayers) return false
  if (g.maxPlayers != null && count > g.maxPlayers) return false
  if (g.evenPlayersOnly && count % 2 !== 0) return false
  return true
}

/** Why a game is unavailable at this roster size, for the disabled-state tooltip. */
export function playerCountRequirement(id: GameType): string {
  const g = GAME_REGISTRY[id]
  if (g.maxPlayers === g.minPlayers) return `${g.minPlayers} players only`
  if (g.evenPlayersOnly) return `${g.minPlayers}+ players, even number`
  return `${g.minPlayers}+ players`
}
