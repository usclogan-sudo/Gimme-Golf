// @vitest-environment happy-dom
//
// Findings 3 and 4. The live freeze happened in a Wolf round, on a hole with
// scores but no partner pick, when the ⋮ header menu was opened. These tests
// render everything that menu and its children show — the menu, the Rules modal,
// the End Round dialog, the QR modal — plus the two Wolf surfaces on the hole
// view, against exactly that round state. None of it may throw.

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ScorecardHeaderMenu } from '../Scorecard/ScorecardHeaderMenu'
import { WolfHolePanel, WolfHoleOutcome } from '../Scorecard/WolfPanels'
import { NumberPad } from '../Scorecard/NumberPad'
import { GameRulesModal } from '../GameRulesModal'
import { ConfirmModal } from '../ConfirmModal'
import { InviteQRModal } from '../InviteQR'
import { InlineErrorBoundary } from '../InlineErrorBoundary'
import { calculateWolf } from '../../lib/gameLogic'
import type { Player, HoleScore, CourseSnapshot, WolfConfig } from '../../types'

vi.mock('../../lib/sentry', () => ({
  Sentry: { captureException: vi.fn() },
  reportSupabaseError: vi.fn(),
}))

const players: Player[] = [
  { id: 'p1', name: 'Alice', handicapIndex: 10, tee: 'White', ghinNumber: '' },
  { id: 'p2', name: 'Bob', handicapIndex: 20, tee: 'White', ghinNumber: '' },
  { id: 'p3', name: 'Carol', handicapIndex: 5, tee: 'White', ghinNumber: '' },
]
const snapshot: CourseSnapshot = {
  courseId: 'c1', courseName: 'Test', tees: [{ name: 'White', rating: 72, slope: 130 }],
  holes: Array.from({ length: 18 }, (_, i) => ({ number: i + 1, par: 4, strokeIndex: i + 1, yardages: { White: 400 } })),
}
const hs = (playerId: string, holeNumber: number, grossScore: number): HoleScore =>
  ({ id: `${playerId}-${holeNumber}`, roundId: 'r1', playerId, holeNumber, grossScore })

// The state that froze live: hole 1 fully scored, no pick recorded.
const unresolvedConfig: WolfConfig = { mode: 'gross', wolfOrder: ['p1', 'p2', 'p3'], blindWolf: true }
const unresolvedScores = [hs('p1', 1, 4), hs('p2', 1, 5), hs('p3', 1, 5)]
const unresolvedResult = calculateWolf(players, unresolvedScores, snapshot, unresolvedConfig, { p1: 0, p2: 0, p3: 0 })

describe('header menu and its children against a Wolf round with an unresolved hole', () => {
  it('renders the menu with every item and fires the callbacks', () => {
    const onRules = vi.fn(), onEndRound = vi.fn(), onQR = vi.fn()
    render(
      <ScorecardHeaderMenu
        showQR onQR={onQR}
        showSpectatorLink onSpectatorLink={vi.fn()}
        showPhotoImport onPhotoImport={vi.fn()}
        showRules onRules={onRules}
        showSettleUp={false} onSettleUp={vi.fn()}
        showEndRound onEndRound={onEndRound}
      />,
    )
    fireEvent.click(screen.getByText('Rules'))
    fireEvent.click(screen.getByText('End Round'))
    fireEvent.click(screen.getByText('📷 QR code'))
    expect(onRules).toHaveBeenCalledTimes(1)
    expect(onEndRound).toHaveBeenCalledTimes(1)
    expect(onQR).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('Settle Up')).toBeNull()
  })

  it('renders the Wolf rules modal, and it describes the options that exist', () => {
    render(<GameRulesModal gameType="wolf" onClose={vi.fn()} />)
    expect(screen.getByText('Wolf')).toBeDefined()
    expect(screen.getByText(/Blind Wolf \(if turned on at setup\)/)).toBeDefined()
    expect(screen.getByText(/halved holes carry over/)).toBeDefined()
    expect(screen.getByText(/the hole waits, the scores are kept/)).toBeDefined()
  })

  it('renders the End Round dialog and the QR modal', () => {
    render(
      <>
        <ConfirmModal open title="End Round?" message="8 of 18 holes scored (10 incomplete). You can still view results in Settle Up." onConfirm={vi.fn()} onCancel={vi.fn()} />
        <InviteQRModal url="https://example.test/?join=ABC123" code="ABC123" onClose={vi.fn()} />
      </>,
    )
    expect(screen.getByText('End Round?')).toBeDefined()
    expect(screen.getByText(/Players scan this QR code/)).toBeDefined()
  })

  it('the Wolf panel shows the recovery state with the pick buttons live for a scorekeeper', () => {
    const onPick = vi.fn()
    render(
      <WolfHolePanel players={players} config={unresolvedConfig} holeScores={unresolvedScores} holeNumber={1} canRecordLatePick onPick={onPick} />,
    )
    expect(screen.getByText('Who did Alice pick?')).toBeDefined()
    expect(screen.getByText(/The scores are kept/)).toBeDefined()
    expect(screen.getByText('Bob')).toBeDefined()
    expect(screen.getByText('Lone Wolf')).toBeDefined()
    // Blind Wolf cannot be called after the fact.
    expect(screen.queryByText(/Blind Wolf/)).toBeNull()
    fireEvent.click(screen.getByText('Bob'))
    expect(onPick).toHaveBeenCalledWith(1, { partnerId: 'p2' })
    fireEvent.click(screen.getByText('Lone Wolf'))
    expect(onPick).toHaveBeenCalledWith(1, { partnerId: null })
  })

  it('the Wolf panel tells a non-scorekeeper to wait, with no buttons', () => {
    render(
      <WolfHolePanel players={players} config={unresolvedConfig} holeScores={unresolvedScores} holeNumber={1} canRecordLatePick={false} onPick={vi.fn()} />,
    )
    expect(screen.getByText('Who did Alice pick?')).toBeDefined()
    expect(screen.getByText(/Waiting on the organiser or scorekeeper/)).toBeDefined()
    expect(screen.queryByText('Bob')).toBeNull()
  })

  it('the Wolf panel offers Blind Wolf only before any score, and only when enabled', () => {
    const onPick = vi.fn()
    const { unmount } = render(
      <WolfHolePanel players={players} config={unresolvedConfig} holeScores={[]} holeNumber={1} canRecordLatePick onPick={onPick} />,
    )
    fireEvent.click(screen.getByText('Blind Wolf (3×)'))
    expect(onPick).toHaveBeenCalledWith(1, { partnerId: null, blind: true })
    unmount()
    render(
      <WolfHolePanel players={players} config={{ ...unresolvedConfig, blindWolf: false }} holeScores={[]} holeNumber={1} canRecordLatePick onPick={onPick} />,
    )
    expect(screen.queryByText(/Blind Wolf/)).toBeNull()
  })

  it('the Wolf panel locks a recorded pick once scoring has started', () => {
    render(
      <WolfHolePanel
        players={players}
        config={{ ...unresolvedConfig, holeDecisions: { 1: { partnerId: 'p2' } } }}
        holeScores={unresolvedScores}
        holeNumber={1}
        canRecordLatePick
        onPick={vi.fn()}
      />,
    )
    expect(screen.getByText('Locked — scoring has started.')).toBeDefined()
    expect(screen.getByText('Alice + Bob')).toBeDefined()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('the outcome line says the hole is waiting, not forfeited', () => {
    render(
      <WolfHoleOutcome players={players} config={unresolvedConfig} result={unresolvedResult} holeScores={unresolvedScores} holeNumber={1} />,
    )
    expect(screen.getByText(/Hole 1 is waiting on Alice's pick — the scores are kept/)).toBeDefined()
  })

  it('the outcome line reads "wins the hole" with correct grammar, and names blind wolf', () => {
    const cfg: WolfConfig = { ...unresolvedConfig, holeDecisions: { 1: { partnerId: null, blind: true } } }
    const result = calculateWolf(players, unresolvedScores, snapshot, cfg, { p1: 0, p2: 0, p3: 0 })
    render(<WolfHoleOutcome players={players} config={cfg} result={result} holeScores={unresolvedScores} holeNumber={1} />)
    expect(screen.getByText('Alice (blind wolf, 3×) wins the hole · 3 units each')).toBeDefined()
  })

  it('nothing throws on degenerate state: empty rotation, ghost partner, one player', () => {
    const degenerate: WolfConfig[] = [
      { mode: 'gross', wolfOrder: [] },
      { mode: 'gross', wolfOrder: ['ghost'] },
      { mode: 'gross', wolfOrder: ['p1'], holeDecisions: { 1: { partnerId: 'ghost' } } },
    ]
    for (const cfg of degenerate) {
      const result = calculateWolf(players, unresolvedScores, snapshot, cfg, { p1: 0, p2: 0, p3: 0 })
      const { unmount } = render(
        <>
          <WolfHolePanel players={players} config={cfg} holeScores={unresolvedScores} holeNumber={1} canRecordLatePick onPick={vi.fn()} />
          <WolfHoleOutcome players={players} config={cfg} result={result} holeScores={unresolvedScores} holeNumber={1} />
        </>,
      )
      unmount()
    }
    const solo = render(
      <WolfHolePanel players={[players[0]]} config={{ mode: 'gross', wolfOrder: ['p1'] }} holeScores={[]} holeNumber={1} canRecordLatePick onPick={vi.fn()} />,
    )
    expect(screen.getByText('Wolf needs at least one other player.')).toBeDefined()
    solo.unmount()
  })

  it('a thrown render inside the boundary shows a plain fallback instead of taking the screen down', () => {
    const Boom = () => { throw new Error('boom') }
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<InlineErrorBoundary label="the menu"><Boom /></InlineErrorBoundary>)
    expect(screen.getByRole('alert').textContent).toContain('Something went wrong showing the menu')
    expect(screen.getByText('Try again')).toBeDefined()
    spy.mockRestore()
  })
})

describe('NumberPad — Clear score', () => {
  it('shows Clear score only when the player has a score, and calls onClear then onClose', () => {
    const onClear = vi.fn(), onClose = vi.fn()
    const { unmount } = render(
      <NumberPad playerName="Alice" holeNumber={1} par={4} currentValue={5} hasScore onSelect={vi.fn()} onClear={onClear} onClose={onClose} />,
    )
    fireEvent.click(screen.getByText('Clear score'))
    expect(onClear).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
    unmount()
    render(
      <NumberPad playerName="Alice" holeNumber={1} par={4} currentValue={4} hasScore={false} onSelect={vi.fn()} onClear={onClear} onClose={onClose} />,
    )
    expect(screen.queryByText('Clear score')).toBeNull()
  })
})
