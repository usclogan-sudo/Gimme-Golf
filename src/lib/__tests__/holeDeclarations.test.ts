import { describe, it, expect } from 'vitest'
import { toPresses, toHoleDecisions, toHammerStates, withDeclarations, withTeams, toTeams } from '../holeDeclarations'
import type { HoleDeclaration, Game, SkinsConfig, WolfConfig } from '../../types'

const d = (over: Partial<HoleDeclaration>): HoleDeclaration => ({
  id: 'd1', roundId: 'r1', holeNumber: 1, kind: 'press', payload: {}, ...over,
})

describe('toPresses', () => {
  it('projects press rows into the engine shape, in hole order', () => {
    expect(toPresses([
      d({ id: 'a', kind: 'press', holeNumber: 7, playerId: 'p2' }),
      d({ id: 'b', kind: 'press', holeNumber: 3, playerId: 'p1' }),
    ])).toEqual([
      { holeNumber: 3, playerId: 'p1' },
      { holeNumber: 7, playerId: 'p2' },
    ])
  })

  it('keeps several presses on the same hole and orders them stably', () => {
    const out = toPresses([
      d({ id: 'a', kind: 'press', holeNumber: 4, playerId: 'pz' }),
      d({ id: 'b', kind: 'press', holeNumber: 4, playerId: 'pa' }),
    ])
    expect(out).toEqual([
      { holeNumber: 4, playerId: 'pa' },
      { holeNumber: 4, playerId: 'pz' },
    ])
  })

  it('ignores other declaration kinds', () => {
    expect(toPresses([d({ kind: 'wolf_partner', playerId: 'p1', payload: { partnerId: 'p2' } })])).toEqual([])
  })
})

describe('toHoleDecisions', () => {
  it('projects a partner pick', () => {
    expect(toHoleDecisions([
      d({ kind: 'wolf_partner', holeNumber: 1, playerId: 'p1', payload: { partnerId: 'p2' } }),
    ])).toEqual({ 1: { partnerId: 'p2' } })
  })

  it('preserves Lone Wolf as a present, null-partner decision', () => {
    // The §6 guards turn on the difference between this and an absent key.
    const out = toHoleDecisions([
      d({ kind: 'wolf_partner', holeNumber: 2, playerId: 'p2', payload: { partnerId: null } }),
    ])
    expect(out[2]).toEqual({ partnerId: null })
    expect(2 in out).toBe(true)
  })

  it('leaves an undeclared hole absent rather than null', () => {
    const out = toHoleDecisions([
      d({ kind: 'wolf_partner', holeNumber: 1, playerId: 'p1', payload: { partnerId: 'p2' } }),
    ])
    expect(3 in out).toBe(false)
  })
})

describe('toHammerStates', () => {
  it('projects a hammer state including the decline', () => {
    expect(toHammerStates([
      d({ kind: 'hammer', holeNumber: 5, playerId: 'p1',
          payload: { value: 400, presses: 2, declined: true, declinedBy: 'p2' } }),
    ])).toEqual({ 5: { hammerHolder: 'p1', value: 400, presses: 2, declined: true, declinedBy: 'p2' } })
  })

  it('omits declinedBy when nobody declined', () => {
    const out = toHammerStates([
      d({ kind: 'hammer', holeNumber: 1, playerId: 'p1', payload: { value: 100, presses: 0, declined: false } }),
    ])
    expect(out[1]).toEqual({ hammerHolder: 'p1', value: 100, presses: 0, declined: false })
    expect('declinedBy' in out[1]).toBe(false)
  })
})

describe('withDeclarations', () => {
  const skins = { id: 'g', type: 'skins', buyInCents: 100,
    config: { mode: 'gross', carryovers: true } as SkinsConfig } as Game

  it('folds presses into a skins config', () => {
    const out = withDeclarations(skins, [d({ kind: 'press', holeNumber: 4, playerId: 'p1' })])
    expect((out.config as SkinsConfig).presses).toEqual([{ holeNumber: 4, playerId: 'p1' }])
    expect((out.config as SkinsConfig).carryovers).toBe(true)  // untouched
  })

  it('leaves a legacy round exactly as it was when there are no declarations', () => {
    const legacy = { ...skins, config: { ...skins.config, presses: [{ holeNumber: 2, playerId: 'p9' }] } } as Game
    expect(withDeclarations(legacy, [])).toBe(legacy)   // same reference, no rewrite
  })

  it('lets declarations win over a stale config blob during the transition', () => {
    const legacy = { ...skins, config: { ...skins.config, presses: [{ holeNumber: 2, playerId: 'p9' }] } } as Game
    const out = withDeclarations(legacy, [d({ kind: 'press', holeNumber: 6, playerId: 'p1' })])
    expect((out.config as SkinsConfig).presses).toEqual([{ holeNumber: 6, playerId: 'p1' }])
  })

  it('folds wolf decisions', () => {
    const wolf = { id: 'g', type: 'wolf', buyInCents: 100,
      config: { mode: 'net', wolfOrder: ['p1', 'p2'] } as WolfConfig } as Game
    const out = withDeclarations(wolf, [
      d({ kind: 'wolf_partner', holeNumber: 1, playerId: 'p1', payload: { partnerId: null } }),
    ])
    expect((out.config as WolfConfig).holeDecisions).toEqual({ 1: { partnerId: null } })
    expect((out.config as WolfConfig).wolfOrder).toEqual(['p1', 'p2'])
  })

  it('ignores declarations irrelevant to the chosen game', () => {
    // A round can carry a Wolf pick and still settle as Skins once the rack lands.
    const out = withDeclarations(skins, [
      d({ kind: 'wolf_partner', holeNumber: 1, playerId: 'p1', payload: { partnerId: 'p2' } }),
    ])
    expect((out.config as SkinsConfig).presses).toBeUndefined()
  })
})

describe('toTeams', () => {
  it('reads teams off the roster rows', () => {
    expect(toTeams([
      { playerId: 'p1', team: 'A' }, { playerId: 'p2', team: 'B' },
    ])).toEqual({ p1: 'A', p2: 'B' })
  })

  it('falls back to the game config for a legacy round with no roster teams', () => {
    expect(toTeams([{ playerId: 'p1' }, { playerId: 'p2' }], { p1: 'A', p2: 'B' }))
      .toEqual({ p1: 'A', p2: 'B' })
  })

  it('prefers roster teams once any are assigned', () => {
    expect(toTeams([{ playerId: 'p1', team: 'B' }], { p1: 'A' })).toEqual({ p1: 'B' })
  })
})

describe('withTeams', () => {
  const bestBall = { id: 'g', type: 'best_ball', buyInCents: 100,
    config: { scoring: 'match', mode: 'net', teams: { p1: 'A', p2: 'B' } } } as unknown as Game

  it('prefers roster teams over the config blob', () => {
    const out = withTeams(bestBall, [{ playerId: 'p1', team: 'B' }, { playerId: 'p2', team: 'A' }])
    expect((out.config as any).teams).toEqual({ p1: 'B', p2: 'A' })
    expect((out.config as any).scoring).toBe('match')   // untouched
  })

  it('leaves a legacy round untouched when the roster carries no teams', () => {
    const out = withTeams(bestBall, [{ playerId: 'p1' }, { playerId: 'p2' }])
    expect(out).toBe(bestBall)   // same reference — no rewrite
  })

  it('does nothing for a game that has no teams', () => {
    const skinsGame = { id: 'g', type: 'skins', buyInCents: 100,
      config: { mode: 'gross', carryovers: true } } as unknown as Game
    expect(withTeams(skinsGame, [{ playerId: 'p1', team: 'A' }])).toBe(skinsGame)
  })

  it('applies to vegas as well as best ball', () => {
    const vegas = { id: 'g', type: 'vegas', buyInCents: 100,
      config: { mode: 'net', teams: {} } } as unknown as Game
    const out = withTeams(vegas, [{ playerId: 'p1', team: 'A' }])
    expect((out.config as any).teams).toEqual({ p1: 'A' })
  })
})
