// @vitest-environment happy-dom
//
// Finding 7, options panel: the "How to settle" and "Value per point" controls
// must render the first time Stableford is selected — not only after switching to
// another game and back.

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { GameSetup } from '../NewRound/NewRound'
import type { Player } from '../../types'

vi.mock('../../lib/supabase', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/supabase')>()
  return {
    ...actual,
    supabase: {
      from: () => ({
        select: () => ({
          order: () => Promise.resolve({ data: [], error: null }),
        }),
      }),
    },
  }
})

const players: Player[] = [
  { id: 'p1', name: 'Alice', handicapIndex: 10, tee: 'White', ghinNumber: '' },
  { id: 'p2', name: 'Bob', handicapIndex: 20, tee: 'White', ghinNumber: '' },
  { id: 'p3', name: 'Carol', handicapIndex: 5, tee: 'White', ghinNumber: '' },
]

function renderSetup(roster: Player[] = players) {
  return render(
    <GameSetup
      players={roster}
      initialStakesMode="points"
      scorerId="p1"
      onScorerChange={vi.fn()}
      onNext={vi.fn()}
      onBack={vi.fn()}
    />,
  )
}

describe('GameSetup — points formats settle controls', () => {
  it('renders "How to settle" and "Value per point" the first time Stableford is selected', () => {
    renderSetup()
    expect(screen.queryByText('How to settle')).toBeNull()

    fireEvent.click(screen.getByText(/More Games/))
    fireEvent.click(screen.getByText('📊 Stableford'))

    expect(screen.getByText('How to settle')).toBeDefined()
    expect(screen.getByText('Value per point')).toBeDefined()
    expect(screen.getByText('Per point')).toBeDefined()
    expect(screen.getByText('Split the total')).toBeDefined()
  })

  it('keeps the controls after switching to Skins and back to Stableford', () => {
    renderSetup()
    fireEvent.click(screen.getByText(/More Games/))
    fireEvent.click(screen.getByText('📊 Stableford'))
    expect(screen.getByText('How to settle')).toBeDefined()

    fireEvent.click(screen.getByText('⛳ Skins'))
    expect(screen.queryByText('How to settle')).toBeNull()

    fireEvent.click(screen.getByText('📊 Stableford'))
    expect(screen.getByText('How to settle')).toBeDefined()
    expect(screen.getByText('Value per point')).toBeDefined()
  })

  it('Nassau states the exposure for two players: the entry', () => {
    // Default points entry is 25 tokens.
    renderSetup(players.slice(0, 2))
    fireEvent.click(screen.getByText('🏳️ Nassau'))
    expect(screen.getByText('Most you can lose: 25 tokens.')).toBeDefined()
  })

  it('Nassau states the exposure for a group: the entry once per opponent', () => {
    renderSetup(players) // three players → two opponents
    fireEvent.click(screen.getByText('🏳️ Nassau'))
    expect(screen.getByText('Most you can lose: 50 tokens, 25 to each opponent.')).toBeDefined()
  })

  it('Wolf offers Blind Wolf (default on) and halved-hole carry-over (default off)', () => {
    renderSetup(players) // three players → Wolf allowed
    fireEvent.click(screen.getByText('🐺 Wolf'))
    const blind = screen.getByRole('switch', { name: /Blind Wolf/ })
    const carry = screen.getByRole('switch', { name: /Halved holes carry over/ })
    expect(blind.getAttribute('aria-checked')).toBe('true')
    expect(carry.getAttribute('aria-checked')).toBe('false')
    expect(screen.getByText(/Blind Wolf \(called before any tee shot\) wins/)).toBeDefined()
    expect(screen.getByText(/A halved hole pushes/)).toBeDefined()

    fireEvent.click(carry)
    fireEvent.click(blind)
    expect(carry.getAttribute('aria-checked')).toBe('true')
    expect(blind.getAttribute('aria-checked')).toBe('false')
    expect(screen.getByText(/carries its unit to the next decided hole/)).toBeDefined()
    expect(screen.queryByText(/Blind Wolf \(called before any tee shot\) wins/)).toBeNull()
  })

  it('Best Ball: Start stays disabled until every player is on a team, and nobody is paired automatically', () => {
    const four = [...players, { id: 'p4', name: 'Dave', handicapIndex: 8, tee: 'White', ghinNumber: '' }]
    renderSetup(four)
    fireEvent.click(screen.getByText('🤝 Best Ball'))

    const next = screen.getByRole('button', { name: /Next: Start Round/ }) as HTMLButtonElement
    expect(next.disabled).toBe(true)
    expect(screen.getByText('Still to assign: Alice, Bob, Carol, Dave.')).toBeDefined()
    // No silent pairing: every team button starts unpressed.
    const teamButtons = four.flatMap(p => screen.getAllByRole('button', { name: p.name }))
    expect(teamButtons).toHaveLength(8)
    expect(teamButtons.every(b => b.getAttribute('aria-pressed') === 'false')).toBe(true)

    // Assign three of four: still disabled, and the line names who is left.
    fireEvent.click(screen.getAllByRole('button', { name: 'Alice' })[0]) // Team A
    fireEvent.click(screen.getAllByRole('button', { name: 'Bob' })[0])   // Team A
    fireEvent.click(screen.getAllByRole('button', { name: 'Carol' })[1]) // Team B
    expect(next.disabled).toBe(true)
    expect(screen.getByText('Still to assign: Dave.')).toBeDefined()

    fireEvent.click(screen.getAllByRole('button', { name: 'Dave' })[1])  // Team B
    expect(screen.queryByText(/Still to assign/)).toBeNull()
    expect(next.disabled).toBe(false)
  })

  it('per point is the default and says it settles with each other player', () => {
    renderSetup()
    fireEvent.click(screen.getByText(/More Games/))
    fireEvent.click(screen.getByText('📊 Stableford'))
    // The option hint and the range hint both say so.
    expect(screen.getAllByText(/settle with each other player/).length).toBeGreaterThanOrEqual(1)
  })
})
