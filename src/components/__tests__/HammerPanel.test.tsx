// @vitest-environment happy-dom
//
// The Hammer hole panel in each state it can be in. A declined hammer settles the
// hole and must read as settled; a pending throw must state both numbers.

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { HammerPanel, signedAmount } from '../Scorecard/HammerPanel'
import type { Player, HammerHoleState } from '../../types'

const players: Player[] = [
  { id: 'p1', name: 'Alice', handicapIndex: 10, tee: 'White', ghinNumber: '' },
  { id: 'p2', name: 'Bob', handicapIndex: 20, tee: 'White', ghinNumber: '' },
]

function renderPanel(state: HammerHoleState | null, holeScored = false, netCents: Record<string, number> = { p1: 0, p2: 0 }) {
  const onThrow = vi.fn(), onDecline = vi.fn()
  render(
    <HammerPanel
      players={players}
      baseValueCents={1}
      state={state}
      holeScored={holeScored}
      netCents={netCents}
      readOnly={false}
      stakesMode="points"
      onThrow={onThrow}
      onDecline={onDecline}
    />,
  )
  return {
    onThrow, onDecline,
    throwBtn: screen.getByRole('button', { name: 'Throw Hammer' }) as HTMLButtonElement,
    declineBtn: screen.getByRole('button', { name: 'Decline' }) as HTMLButtonElement,
  }
}

describe('HammerPanel', () => {
  it('shows the pre-throw and accepted values while a throw is pending', () => {
    const { throwBtn, declineBtn } = renderPanel({ hammerHolder: 'p1', value: 2, presses: 1, declined: false })
    expect(screen.getByText('1 token, 2 tokens if accepted')).toBeDefined()
    expect(screen.getByText(/Alice threw the hammer/)).toBeDefined()
    expect(throwBtn.disabled).toBe(false)
    expect(declineBtn.disabled).toBe(false)
  })

  it('reads as settled after a decline, with both buttons disabled', () => {
    const { throwBtn, declineBtn, onThrow, onDecline } = renderPanel(
      { hammerHolder: 'p1', value: 2, presses: 1, declined: true, declinedBy: 'p2' },
      false,
      { p1: 1, p2: -1 },
    )
    expect(screen.getByText('Hammer · settled')).toBeDefined()
    expect(screen.getByText('Settled: 1 token')).toBeDefined()
    expect(screen.getByText(/Bob declined — Alice wins 1 token/)).toBeDefined()
    expect(throwBtn.disabled).toBe(true)
    expect(declineBtn.disabled).toBe(true)
    fireEvent.click(throwBtn)
    fireEvent.click(declineBtn)
    expect(onThrow).not.toHaveBeenCalled()
    expect(onDecline).not.toHaveBeenCalled()
  })

  it('reads as settled once both players have scored, with both buttons disabled', () => {
    const { throwBtn, declineBtn } = renderPanel({ hammerHolder: 'p1', value: 2, presses: 1, declined: false }, true)
    expect(screen.getByText('Hammer · settled')).toBeDefined()
    expect(screen.getByText('Settled: 2 tokens')).toBeDefined()
    expect(throwBtn.disabled).toBe(true)
    expect(declineBtn.disabled).toBe(true)
  })

  it('shows the loser with a minus sign in the running totals', () => {
    renderPanel(null, false, { p1: 3, p2: -3 })
    expect(screen.getByText('+3 tokens')).toBeDefined()
    expect(screen.getByText('−3 tokens')).toBeDefined()
  })

  it('open hole: throw is live, decline is not', () => {
    const { throwBtn, declineBtn, onThrow } = renderPanel(null)
    expect(screen.getByText('Hole value: 1 token')).toBeDefined()
    expect(throwBtn.disabled).toBe(false)
    expect(declineBtn.disabled).toBe(true)
    fireEvent.click(throwBtn)
    expect(onThrow).toHaveBeenCalledTimes(1)
  })
})

describe('signedAmount', () => {
  it('signs both directions and leaves zero bare', () => {
    expect(signedAmount(2, 'points')).toBe('+2 tokens')
    expect(signedAmount(-1, 'points')).toBe('−1 token')
    expect(signedAmount(0, 'points')).toBe('0 tokens')
  })
})
