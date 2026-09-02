import { describe, it, expect } from 'vitest'
import {
  GAME_REGISTRY, ALL_GAMES, gameDef, scoreDerivedGames, decisionDerivedGames,
  isScoreDerived, isDecisionDerived, supportsPlayerCount, playerCountRequirement,
} from '../gameRegistry'
import { GAME_RULES } from '../../data/gameRules'
import type { GameType } from '../../types'

const ALL_TYPES: GameType[] = [
  'skins', 'best_ball', 'nassau', 'wolf', 'bingo_bango_bongo', 'hammer',
  'vegas', 'stableford', 'dots', 'banker', 'quota',
]

describe('§1 registry completeness', () => {
  it('declares every implemented game exactly once', () => {
    expect(ALL_GAMES).toHaveLength(ALL_TYPES.length)
    for (const t of ALL_TYPES) expect(GAME_REGISTRY[t]).toBeDefined()
  })

  it('keys match the ids they hold — a copy/paste guard', () => {
    for (const [key, def] of Object.entries(GAME_REGISTRY)) expect(def.id).toBe(key)
  })

  it('stays in step with the rules screen, so no game can be added to one and not the other', () => {
    expect(Object.keys(GAME_REGISTRY).sort()).toEqual(Object.keys(GAME_RULES).sort())
  })

  it('gives every decision-derived game a reason it cannot be deferred', () => {
    for (const g of decisionDerivedGames()) {
      expect(g.armReason, `${g.id} needs an armReason`).toBeTruthy()
    }
  })

  it('does not give score-derived games an arm reason', () => {
    for (const g of scoreDerivedGames()) expect(g.armReason).toBeUndefined()
  })
})

describe('§1 classification', () => {
  it('classes the score-derived games as rack-eligible', () => {
    // Pure functions of scores, frozen handicaps and teams — computable after the round.
    for (const id of ['skins', 'best_ball', 'nassau', 'vegas', 'stableford', 'banker', 'quota'] as GameType[]) {
      expect(isScoreDerived(id), id).toBe(true)
    }
  })

  it('classes the decision-derived games as arm-gate games', () => {
    // Each depends on something the scorecard never records.
    for (const id of ['wolf', 'hammer', 'bingo_bango_bongo', 'dots'] as GameType[]) {
      expect(isDecisionDerived(id), id).toBe(true)
    }
  })

  it('puts every game in exactly one class', () => {
    expect(scoreDerivedGames().length + decisionDerivedGames().length).toBe(ALL_TYPES.length)
    const overlap = scoreDerivedGames().filter(a => decisionDerivedGames().some(b => b.id === a.id))
    expect(overlap).toEqual([])
  })

  it('keeps Hammer in Class B — it is absent from both §1 tables in the spec', () => {
    // Flagged in the Phase 0 audit: hammerStates are mid-hole declarations that
    // appear nowhere on the card, so it lands in B under the §3.2 test.
    expect(gameDef('hammer').class).toBe('decision_derived')
  })
})

describe('supportsPlayerCount', () => {
  it('matches the constraints setup used to hard-code', () => {
    expect(supportsPlayerCount('best_ball', 3)).toBe(false)   // needs even
    expect(supportsPlayerCount('best_ball', 4)).toBe(true)
    expect(supportsPlayerCount('vegas', 2)).toBe(true)
    expect(supportsPlayerCount('vegas', 5)).toBe(false)
    expect(supportsPlayerCount('wolf', 2)).toBe(false)        // needs 3+
    expect(supportsPlayerCount('wolf', 3)).toBe(true)
    expect(supportsPlayerCount('banker', 2)).toBe(false)
    expect(supportsPlayerCount('banker', 3)).toBe(true)
    expect(supportsPlayerCount('hammer', 2)).toBe(true)       // exactly 2
    expect(supportsPlayerCount('hammer', 3)).toBe(false)
    expect(supportsPlayerCount('hammer', 4)).toBe(false)
  })

  it('leaves unconstrained games open from two players up', () => {
    for (const id of ['skins', 'nassau', 'stableford', 'quota', 'dots'] as GameType[]) {
      expect(supportsPlayerCount(id, 2), id).toBe(true)
      expect(supportsPlayerCount(id, 6), id).toBe(true)
    }
  })

  it('never allows a solo round', () => {
    for (const id of ALL_TYPES) expect(supportsPlayerCount(id, 1), id).toBe(false)
  })
})

describe('playerCountRequirement', () => {
  it('describes the constraint that failed', () => {
    expect(playerCountRequirement('hammer')).toBe('2 players only')
    expect(playerCountRequirement('best_ball')).toBe('2+ players, even number')
    expect(playerCountRequirement('wolf')).toBe('3+ players')
  })
})
