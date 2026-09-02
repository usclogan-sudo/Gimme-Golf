import { describe, it, expect } from 'vitest'
import { getWolfHoleState, canDeclareWolf, scoreWriteBlocked } from '../wolfOwnership'
import type { Game, WolfConfig } from '../../types'

const names: Record<string, string> = { p1: 'Alice', p2: 'Bob', p3: 'Carol' }
const nameOf = (id: string) => names[id] ?? id

const mkWolf = (holeDecisions: WolfConfig['holeDecisions'] = {}): Game => ({
  id: 'g1', type: 'wolf', buyInCents: 100,
  config: { mode: 'net', wolfOrder: ['p1', 'p2', 'p3'], holeDecisions } as WolfConfig,
})

const skins: Game = {
  id: 'g2', type: 'skins', buyInCents: 100,
  config: { mode: 'gross', carryovers: true } as any,
}

describe('§6 getWolfHoleState', () => {
  it('rotates the Wolf through the roster by hole', () => {
    expect(getWolfHoleState(mkWolf(), 1).wolfId).toBe('p1')
    expect(getWolfHoleState(mkWolf(), 2).wolfId).toBe('p2')
    expect(getWolfHoleState(mkWolf(), 3).wolfId).toBe('p3')
    expect(getWolfHoleState(mkWolf(), 4).wolfId).toBe('p1')
  })

  it('is not a Wolf hole in a non-Wolf round', () => {
    expect(getWolfHoleState(skins, 1).isWolfHole).toBe(false)
    expect(getWolfHoleState(undefined, 1).isWolfHole).toBe(false)
    expect(getWolfHoleState(null, 1).isWolfHole).toBe(false)
  })

  it('counts a partner pick as declared', () => {
    expect(getWolfHoleState(mkWolf({ 1: { partnerId: 'p2' } }), 1).declared).toBe(true)
  })

  it('counts Lone Wolf as declared — a null partner is a decision, not an absence', () => {
    expect(getWolfHoleState(mkWolf({ 1: { partnerId: null } }), 1).declared).toBe(true)
  })

  it('counts an absent entry as undeclared', () => {
    expect(getWolfHoleState(mkWolf({ 2: { partnerId: 'p3' } }), 1).declared).toBe(false)
  })
})

describe('§6 canDeclareWolf — non-Wolf devices cannot mutate the selection', () => {
  const claimed = ['p1', 'p2', 'p3']

  it('lets the Wolf declare on their own device', () => {
    expect(canDeclareWolf({ wolfId: 'p1', myPlayerId: 'p1', claimedPlayerIds: claimed, isScoremaster: false })).toBe(true)
  })

  it('refuses every other player, even a teammate', () => {
    expect(canDeclareWolf({ wolfId: 'p1', myPlayerId: 'p2', claimedPlayerIds: claimed, isScoremaster: false })).toBe(false)
    expect(canDeclareWolf({ wolfId: 'p1', myPlayerId: 'p3', claimedPlayerIds: claimed, isScoremaster: false })).toBe(false)
  })

  it('refuses the scoremaster when the Wolf is present on their own device', () => {
    // The organiser runs the round, but the pick is still not theirs to make.
    expect(canDeclareWolf({ wolfId: 'p1', myPlayerId: 'p2', claimedPlayerIds: claimed, isScoremaster: true })).toBe(false)
  })

  it('falls back to the scoremaster when the Wolf has no device of their own', () => {
    // p3 is an unregistered player the organiser is scoring for. Without this the
    // round deadlocks: nobody can declare, and scores are rejected until someone does.
    expect(canDeclareWolf({ wolfId: 'p3', myPlayerId: 'p1', claimedPlayerIds: ['p1', 'p2'], isScoremaster: true })).toBe(true)
  })

  it('does not extend that fallback to a non-scoremaster', () => {
    expect(canDeclareWolf({ wolfId: 'p3', myPlayerId: 'p2', claimedPlayerIds: ['p1', 'p2'], isScoremaster: false })).toBe(false)
  })

  it('handles a solo device round, where the organiser is every player', () => {
    expect(canDeclareWolf({ wolfId: 'p2', myPlayerId: 'p1', claimedPlayerIds: ['p1'], isScoremaster: true })).toBe(true)
  })

  it('refuses when there is no Wolf for the hole', () => {
    expect(canDeclareWolf({ wolfId: null, myPlayerId: 'p1', claimedPlayerIds: claimed, isScoremaster: true })).toBe(false)
  })

  it('refuses a spectator with no player identity', () => {
    expect(canDeclareWolf({ wolfId: 'p1', myPlayerId: undefined, claimedPlayerIds: claimed, isScoremaster: false })).toBe(false)
  })
})

describe('§6 scoreWriteBlocked — score writes reject until the declaration exists', () => {
  it('blocks a Wolf hole with no declaration and names the player being waited on', () => {
    const r = scoreWriteBlocked(mkWolf(), 1, nameOf)
    expect(r.blocked).toBe(true)
    expect(r.wolfId).toBe('p1')
    expect(r.reason).toBe('Alice needs to pick a partner or go Lone Wolf before hole 1 can be scored.')
  })

  it('allows the write once a partner is picked', () => {
    expect(scoreWriteBlocked(mkWolf({ 1: { partnerId: 'p2' } }), 1, nameOf).blocked).toBe(false)
  })

  it('allows the write once Lone Wolf is declared', () => {
    expect(scoreWriteBlocked(mkWolf({ 1: { partnerId: null } }), 1, nameOf).blocked).toBe(false)
  })

  it('blocks per hole, not per round', () => {
    const game = mkWolf({ 1: { partnerId: 'p2' } })
    expect(scoreWriteBlocked(game, 1, nameOf).blocked).toBe(false)
    expect(scoreWriteBlocked(game, 2, nameOf).blocked).toBe(true)
    expect(scoreWriteBlocked(game, 2, nameOf).wolfId).toBe('p2')
  })

  it('never blocks a non-Wolf round', () => {
    expect(scoreWriteBlocked(skins, 1, nameOf).blocked).toBe(false)
    expect(scoreWriteBlocked(undefined, 1, nameOf).blocked).toBe(false)
  })
})
