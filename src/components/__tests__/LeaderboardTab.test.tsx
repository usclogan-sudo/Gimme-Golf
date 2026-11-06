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

describe('LeaderboardTab — approved scores and pending rows', () => {
  it('counts only approved scores in gross and thru, and marks a player with a pending score', () => {
    const scores: HoleScore[] = [
      { id: 'a1', roundId: 'r', playerId: 'org-uid', holeNumber: 1, grossScore: 4, scoreStatus: 'approved' } as HoleScore,
      { id: 'a2', roundId: 'r', playerId: 'org-uid', holeNumber: 2, grossScore: 5, scoreStatus: 'approved' } as HoleScore,
      { id: 'b1', roundId: 'r', playerId: 'guest-seat', holeNumber: 1, grossScore: 5, scoreStatus: 'approved' } as HoleScore,
      { id: 'b2', roundId: 'r', playerId: 'guest-seat', holeNumber: 2, grossScore: 6, scoreStatus: 'pending' } as HoleScore,
    ]
    render(
      <LeaderboardTab
        snapshot={snapshot}
        players={players}
        holeScores={scores}
        courseHcps={{ 'org-uid': 10, 'guest-seat': 12 }}
        game={null}
        round={null}
        {...nullResults}
      />,
    )
    const rowOf = (name: string) => screen.getByText(name).closest('tr')!
    // Jeff: two approved → thru 2, gross 9.
    expect(rowOf('Jeff Logan').textContent).toContain('2')
    expect(rowOf('Jeff Logan').textContent).toContain('9')
    // Guest: one approved, one pending → thru 1, gross 5, marked pending and faded.
    const guest = rowOf("Lee's buddy")
    expect(screen.getByText('1 pending')).toBeDefined()
    expect(guest.className).toContain('opacity-60')
    const cells = Array.from(guest.querySelectorAll('td')).map(td => td.textContent)
    expect(cells[2]).toBe('1')
    expect(cells[3]).toBe('5')
  })

  it('prints course handicap and tee beside each name', () => {
    render(
      <LeaderboardTab
        snapshot={snapshot}
        players={players}
        holeScores={holeScores}
        courseHcps={{ 'org-uid': -8, 'guest-seat': 18 }}
        teeByPlayer={{ 'org-uid': 'Blue', 'guest-seat': 'White' }}
        game={null}
        round={null}
        {...nullResults}
      />,
    )
    expect(screen.getByText('+8 · Blue')).toBeDefined()
    expect(screen.getByText('18 · White')).toBeDefined()
  })
})
