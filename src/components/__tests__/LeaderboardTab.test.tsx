// @vitest-environment happy-dom
//
// Roster rows show who holds a claimed guest seat: the seat keeps the name the
// organiser typed, with "claimed by {first name}" underneath.

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LeaderboardTab } from '../Scorecard/LeaderboardTab'
import type { Player, CourseSnapshot, HoleScore } from '../../types'

vi.mock('../../lib/supabase', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/supabase')>()
  return { ...actual, supabase: { from: () => ({ select: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) }) } }
})

const snapshot = {
  courseId: 'c1',
  courseName: 'Test Links',
  tees: [],
  holes: Array.from({ length: 18 }, (_, i) => ({ number: i + 1, par: 4, strokeIndex: i + 1 })),
} as unknown as CourseSnapshot

const players: Player[] = [
  { id: 'org-uid', name: 'Jeff Logan', handicapIndex: 10, tee: 'White', ghinNumber: '' },
  { id: 'guest-seat', name: "Lee's buddy", handicapIndex: 12, tee: 'White', ghinNumber: '' },
]

const holeScores: HoleScore[] = [
  { id: 's1', roundId: 'r', playerId: 'org-uid', holeNumber: 1, grossScore: 4 } as HoleScore,
  { id: 's2', roundId: 'r', playerId: 'guest-seat', holeNumber: 1, grossScore: 5 } as HoleScore,
]

const nullResults = {
  skinsResult: null, bestBallResult: null, nassauResult: null, wolfResult: null, bbbResult: null,
  hammerResult: null, vegasResult: null, stablefordResult: null, bankerResult: null, quotaResult: null,
}

describe('LeaderboardTab — claimed guest seats', () => {
  it('shows "claimed by {first name}" under the seat name and keeps the seat name as typed', () => {
    render(
      <LeaderboardTab
        snapshot={snapshot}
        players={players}
        holeScores={holeScores}
        courseHcps={{ 'org-uid': 10, 'guest-seat': 12 }}
        game={null}
        round={null}
        {...nullResults}
        claimedBy={{ 'guest-seat': 'Lee' }}
      />,
    )
    expect(screen.getByText("Lee's buddy")).toBeDefined()
    expect(screen.getByText('claimed by Lee')).toBeDefined()
    expect(screen.queryByText('claimed by Jeff')).toBeNull()
  })

  it('shows nothing extra when no seat is claimed', () => {
    render(
      <LeaderboardTab
        snapshot={snapshot}
        players={players}
        holeScores={holeScores}
        courseHcps={{}}
        game={null}
        round={null}
        {...nullResults}
      />,
    )
    expect(screen.queryByText(/claimed by/)).toBeNull()
  })
})
