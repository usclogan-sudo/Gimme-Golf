vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn(() => ({})) }))

import { vi, describe, it, expect } from 'vitest'
import {
  applyHoleScorePayload,
  applyBBBPointPayload,
  applyRoundParticipantPayload,
  applyBuyInPayload,
  applyHoleDeclarationPayload,
} from '../realtimeReducers'
import type { HoleScore, BBBPoint, RoundParticipant, BuyIn } from '../../types'

// ─── applyHoleScorePayload ──────────────────────────────────────────────────

describe('applyHoleScorePayload', () => {
  const existing: HoleScore[] = [
    { id: 'hs-1', roundId: 'r-1', playerId: 'p-1', holeNumber: 1, grossScore: 4 },
    { id: 'hs-2', roundId: 'r-1', playerId: 'p-2', holeNumber: 1, grossScore: 5 },
  ]

  it('INSERT adds new score', () => {
    const payload = {
      eventType: 'INSERT' as const,
      new: { id: 'hs-3', round_id: 'r-1', player_id: 'p-3', hole_number: 1, gross_score: 3 },
      old: {},
    }
    const result = applyHoleScorePayload(existing, payload)
    expect(result).toHaveLength(3)
    expect(result[2].id).toBe('hs-3')
    expect(result[2].grossScore).toBe(3)
  })

  it('INSERT deduplicates — returns same ref if id exists', () => {
    const payload = {
      eventType: 'INSERT' as const,
      new: { id: 'hs-1', round_id: 'r-1', player_id: 'p-1', hole_number: 1, gross_score: 4 },
      old: {},
    }
    const result = applyHoleScorePayload(existing, payload)
    expect(result).toBe(existing) // same reference — no change
  })

  it('UPDATE replaces matching score', () => {
    const payload = {
      eventType: 'UPDATE' as const,
      new: { id: 'hs-1', round_id: 'r-1', player_id: 'p-1', hole_number: 1, gross_score: 3, score_status: 'approved' },
      old: { id: 'hs-1', score_status: 'pending' },
    }
    const result = applyHoleScorePayload(existing, payload)
    expect(result).toHaveLength(2)
    expect(result[0].grossScore).toBe(3)
    expect(result[0].scoreStatus).toBe('approved')
    // Other score unchanged
    expect(result[1]).toBe(existing[1])
  })

  it('UPDATE does not add if id not found — returns new array with same items', () => {
    const payload = {
      eventType: 'UPDATE' as const,
      new: { id: 'hs-999', round_id: 'r-1', player_id: 'p-1', hole_number: 5, gross_score: 6 },
      old: {},
    }
    const result = applyHoleScorePayload(existing, payload)
    expect(result).toHaveLength(2)
  })

  it('DELETE removes matching score', () => {
    const payload = {
      eventType: 'DELETE' as const,
      new: {},
      old: { id: 'hs-1' },
    }
    const result = applyHoleScorePayload(existing, payload)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('hs-2')
  })

  it('DELETE with unknown id returns new array (no change)', () => {
    const payload = {
      eventType: 'DELETE' as const,
      new: {},
      old: { id: 'hs-999' },
    }
    const result = applyHoleScorePayload(existing, payload)
    expect(result).toHaveLength(2)
  })

  // ─── Race condition: offline edit vs realtime ─────────────────────────
  it('simulates offline→online race: realtime UPDATE wins over stale local state', () => {
    // User A enters score 4 on hole 1
    const state: HoleScore[] = [
      { id: 'hs-1', roundId: 'r-1', playerId: 'p-1', holeNumber: 1, grossScore: 4, updatedAt: '2025-06-01T12:00:00Z' },
    ]
    // While User A was offline, User B corrected the score to 5 via realtime
    const realtimePayload = {
      eventType: 'UPDATE' as const,
      new: { id: 'hs-1', round_id: 'r-1', player_id: 'p-1', hole_number: 1, gross_score: 5, updated_at: '2025-06-01T12:01:00Z', score_status: 'approved' },
      old: { id: 'hs-1', score_status: 'pending' },
    }
    const afterRealtime = applyHoleScorePayload(state, realtimePayload)
    // The realtime update should replace the local value
    expect(afterRealtime[0].grossScore).toBe(5)
    expect(afterRealtime[0].updatedAt).toBe('2025-06-01T12:01:00Z')
  })

  it('multiple rapid INSERTs do not duplicate', () => {
    let state = [...existing]
    const payload = {
      eventType: 'INSERT' as const,
      new: { id: 'hs-new', round_id: 'r-1', player_id: 'p-3', hole_number: 2, gross_score: 4 },
      old: {},
    }
    state = applyHoleScorePayload(state, payload)
    state = applyHoleScorePayload(state, payload) // duplicate
    state = applyHoleScorePayload(state, payload) // duplicate
    expect(state).toHaveLength(3) // only added once
  })
})

// ─── applyBBBPointPayload ───────────────────────────────────────────────────

describe('applyBBBPointPayload', () => {
  const existing: BBBPoint[] = [
    { id: 'bp-1', roundId: 'r-1', holeNumber: 1, bingo: 'p1', bango: 'p2', bongo: 'p3' },
  ]

  it('INSERT adds new point', () => {
    const result = applyBBBPointPayload(existing, {
      eventType: 'INSERT',
      new: { id: 'bp-2', round_id: 'r-1', hole_number: 2, bingo: 'p2', bango: 'p1', bongo: 'p3' },
      old: {},
    })
    expect(result).toHaveLength(2)
  })

  it('INSERT deduplicates', () => {
    const result = applyBBBPointPayload(existing, {
      eventType: 'INSERT',
      new: { id: 'bp-1', round_id: 'r-1', hole_number: 1, bingo: 'p1', bango: 'p2', bongo: 'p3' },
      old: {},
    })
    expect(result).toBe(existing)
  })

  it('UPDATE replaces', () => {
    const result = applyBBBPointPayload(existing, {
      eventType: 'UPDATE',
      new: { id: 'bp-1', round_id: 'r-1', hole_number: 1, bingo: 'p3', bango: 'p2', bongo: 'p1' },
      old: {},
    })
    expect(result[0].bingo).toBe('p3')
  })

  it('DELETE removes', () => {
    const result = applyBBBPointPayload(existing, {
      eventType: 'DELETE',
      new: {},
      old: { id: 'bp-1' },
    })
    expect(result).toHaveLength(0)
  })
})

// ─── applyRoundParticipantPayload ───────────────────────────────────────────

describe('applyRoundParticipantPayload', () => {
  const existing: RoundParticipant[] = [
    { id: 'rp-1', roundId: 'r-1', userId: 'u-1', playerId: 'p-1', status: 'accepted' },
  ]

  it('INSERT adds new participant', () => {
    const result = applyRoundParticipantPayload(existing, {
      eventType: 'INSERT',
      new: { id: 'rp-2', round_id: 'r-1', user_id: 'u-2', player_id: 'p-2', joined_at: '2025-06-01T12:00:00Z' },
      old: {},
    })
    expect(result).toHaveLength(2)
    expect(result[1].userId).toBe('u-2')
    expect(result[1].joinedAt).toEqual(new Date('2025-06-01T12:00:00Z'))
  })

  it('INSERT deduplicates', () => {
    const result = applyRoundParticipantPayload(existing, {
      eventType: 'INSERT',
      new: { id: 'rp-1', round_id: 'r-1', user_id: 'u-1', player_id: 'p-1' },
      old: {},
    })
    expect(result).toBe(existing)
  })

  it('DELETE removes participant', () => {
    const result = applyRoundParticipantPayload(existing, {
      eventType: 'DELETE',
      new: {},
      old: { id: 'rp-1' },
    })
    expect(result).toHaveLength(0)
  })
})

// ─── applyBuyInPayload ─────────────────────────────────────────────────────

describe('applyBuyInPayload', () => {
  const existing: BuyIn[] = [
    { id: 'bi-1', roundId: 'r-1', playerId: 'p-1', amountCents: 500, status: 'unpaid' },
  ]

  it('UPDATE replaces matching buy-in', () => {
    const result = applyBuyInPayload(existing, {
      eventType: 'UPDATE',
      new: { id: 'bi-1', round_id: 'r-1', player_id: 'p-1', amount_cents: 500, status: 'paid', paid_at: '2025-06-01T12:00:00Z' },
      old: {},
    })
    expect(result[0].status).toBe('paid')
    expect(result[0].paidAt).toEqual(new Date('2025-06-01T12:00:00Z'))
  })

  it('INSERT is ignored (buy_ins only subscribes to UPDATE)', () => {
    const result = applyBuyInPayload(existing, {
      eventType: 'INSERT',
      new: { id: 'bi-2', round_id: 'r-1', player_id: 'p-2', amount_cents: 500, status: 'pending' },
      old: {},
    })
    expect(result).toBe(existing) // same reference
  })
})

// ─── Offline→online full scenario ───────────────────────────────────────────

describe('offline→online race condition scenario', () => {
  it('realtime update during offline period results in correct final state', () => {
    // Initial state: score on hole 1 is 4
    let scores: HoleScore[] = [
      { id: 'hs-1', roundId: 'r-1', playerId: 'p-1', holeNumber: 1, grossScore: 4, updatedAt: '2025-06-01T12:00:00Z' },
    ]

    // Step 1: User A goes offline and edits score to 5 (optimistic local update)
    scores = scores.map(s => s.id === 'hs-1' ? { ...s, grossScore: 5, updatedAt: '2025-06-01T12:00:00Z' } : s)
    // The offline queue would have: { table: 'hole_scores', method: 'update', _expectedUpdatedAt: '2025-06-01T12:00:00Z', data: { gross_score: 5 } }

    // Step 2: While offline, User B updates the same score to 6 via their device
    // Realtime delivers this when User A reconnects
    const realtimeFromUserB = {
      eventType: 'UPDATE' as const,
      new: { id: 'hs-1', round_id: 'r-1', player_id: 'p-1', hole_number: 1, gross_score: 6, updated_at: '2025-06-01T12:01:00Z' },
      old: { id: 'hs-1' },
    }
    scores = applyHoleScorePayload(scores, realtimeFromUserB)
    // Realtime wins — score is now 6 with newer timestamp
    expect(scores[0].grossScore).toBe(6)
    expect(scores[0].updatedAt).toBe('2025-06-01T12:01:00Z')

    // Step 3: User A's offline queue flushes, but _expectedUpdatedAt is '2025-06-01T12:00:00Z'
    // which doesn't match the current '2025-06-01T12:01:00Z' in the DB
    // → Supabase returns 0 rows → flush treats as "resolved" (synced, not failed)
    // → Score stays at 6 (correct!)

    // Step 4: If the flush somehow triggered another realtime event, it wouldn't change anything
    // because the DB already has gross_score=6
    const duplicateRealtime = {
      eventType: 'UPDATE' as const,
      new: { id: 'hs-1', round_id: 'r-1', player_id: 'p-1', hole_number: 1, gross_score: 6, updated_at: '2025-06-01T12:01:00Z' },
      old: { id: 'hs-1' },
    }
    scores = applyHoleScorePayload(scores, duplicateRealtime)
    expect(scores[0].grossScore).toBe(6) // still 6
  })

  it('new participant joining while offline is handled on reconnect', () => {
    let participants: RoundParticipant[] = [
      { id: 'rp-1', roundId: 'r-1', userId: 'u-1', playerId: 'p-1', status: 'accepted' },
    ]

    // While offline, another user joins
    const joinPayload = {
      eventType: 'INSERT' as const,
      new: { id: 'rp-2', round_id: 'r-1', user_id: 'u-2', player_id: 'p-2', joined_at: '2025-06-01T12:05:00Z' },
      old: {},
    }
    participants = applyRoundParticipantPayload(participants, joinPayload)
    expect(participants).toHaveLength(2)
    expect(participants[1].userId).toBe('u-2')
  })
})

describe('applyHoleDeclarationPayload', () => {
  const row = (over: Record<string, any> = {}) => ({
    id: 'd1', round_id: 'r1', hole_number: 1, kind: 'wolf_partner',
    player_id: 'p1', payload: { partnerId: 'p2' }, ...over,
  })

  it('adds an incoming declaration', () => {
    const out = applyHoleDeclarationPayload([], { eventType: 'INSERT', new: row() })
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ id: 'd1', kind: 'wolf_partner', holeNumber: 1 })
  })

  it('replaces a declaration on the same hole rather than duplicating it', () => {
    // An upsert from another device arrives with a NEW id but the same natural key.
    const prev = applyHoleDeclarationPayload([], { eventType: 'INSERT', new: row() })
    const out = applyHoleDeclarationPayload(prev, {
      eventType: 'UPDATE', new: row({ id: 'd2', payload: { partnerId: null } }),
    })
    expect(out).toHaveLength(1)
    expect(out[0].payload).toEqual({ partnerId: null })
  })

  it('keeps presses from different players on the same hole', () => {
    const a = applyHoleDeclarationPayload([], {
      eventType: 'INSERT', new: row({ id: 'a', kind: 'press', player_id: 'p1', payload: {} }),
    })
    const out = applyHoleDeclarationPayload(a, {
      eventType: 'INSERT', new: row({ id: 'b', kind: 'press', player_id: 'p2', payload: {} }),
    })
    expect(out).toHaveLength(2)
  })

  it('removes a deleted declaration', () => {
    const prev = applyHoleDeclarationPayload([], { eventType: 'INSERT', new: row() })
    expect(applyHoleDeclarationPayload(prev, { eventType: 'DELETE', old: { id: 'd1' } })).toEqual([])
  })

  it('ignores a delete for something it does not hold', () => {
    const prev = applyHoleDeclarationPayload([], { eventType: 'INSERT', new: row() })
    expect(applyHoleDeclarationPayload(prev, { eventType: 'DELETE', old: { id: 'zzz' } })).toHaveLength(1)
  })
})
