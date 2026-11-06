// @vitest-environment happy-dom
//
// A missing hole score must never be drawn as a number. The read-only row shows
// a dash and says "no score yet"; the editable row keeps par as a highlighted
// suggestion with nothing selected until a tap lands.

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ReadOnlyScore, InlineScorePad } from '../Scorecard/ScoreCells'
import { FreshnessLine } from '../FreshnessLine'
import { PullToRefresh } from '../PullToRefresh'

describe('ReadOnlyScore', () => {
  it('renders a dash and "no score yet" when there is no row, never a number', () => {
    const { container } = render(<ReadOnlyScore gross={null} par={4} />)
    expect(screen.getByLabelText('No score yet').textContent).toBe('—')
    expect(screen.getByText('no score yet')).toBeDefined()
    expect(container.textContent).not.toMatch(/\d/)
  })

  it('renders the score when a row exists, faded while pending', () => {
    const { rerender } = render(<ReadOnlyScore gross={4} par={4} />)
    expect(screen.getByText('4')).toBeDefined()
    expect(screen.queryByText('no score yet')).toBeNull()
    rerender(<ReadOnlyScore gross={4} par={4} pending />)
    expect(screen.getByText('4').className).toContain('opacity-50')
  })
})

describe('InlineScorePad', () => {
  it('with no score: nothing is selected, par carries the suggestion underline', () => {
    render(<InlineScorePad value={4} par={4} hasScore={false} onChange={vi.fn()} onMore={vi.fn()} />)
    const buttons = screen.getAllByRole('button')
    expect(buttons.every(b => b.getAttribute('aria-pressed') === 'false')).toBe(true)
    expect(screen.getByLabelText('Score 4').className).toContain('border-b-brass')
    expect(screen.getByLabelText('More score options').textContent).toBe('···')
  })

  it('with a score: that chip is pressed and a tap reports the new value', () => {
    const onChange = vi.fn()
    render(<InlineScorePad value={5} par={4} hasScore onChange={onChange} onMore={vi.fn()} />)
    expect(screen.getByLabelText('Score 5').getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByLabelText('Score 4').getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(screen.getByLabelText('Score 3'))
    expect(onChange).toHaveBeenCalledWith(3)
  })

  it('an out of range score lights the more button with the value', () => {
    render(<InlineScorePad value={9} par={4} hasScore onChange={vi.fn()} onMore={vi.fn()} />)
    const more = screen.getByLabelText('More score options')
    expect(more.getAttribute('aria-pressed')).toBe('true')
    expect(more.textContent).toBe('9')
  })
})

describe('FreshnessLine', () => {
  it('shows the label and a Refresh control that calls back', async () => {
    const onRefresh = vi.fn(() => Promise.resolve())
    render(<FreshnessLine label="Updated 12s ago" onRefresh={onRefresh} showRefresh />)
    expect(screen.getByText('Updated 12s ago')).toBeDefined()
    fireEvent.click(screen.getByLabelText('Refresh'))
    expect(onRefresh).toHaveBeenCalledTimes(1)
  })

  it('reads Reconnecting with no control when told to hide it', () => {
    render(<FreshnessLine label="Reconnecting" onRefresh={vi.fn()} showRefresh={false} />)
    expect(screen.getByText('Reconnecting')).toBeDefined()
    expect(screen.queryByLabelText('Refresh')).toBeNull()
  })
})

describe('PullToRefresh', () => {
  const touch = (y: number) => ({ touches: [{ clientY: y }] })

  it('refreshes after a pull past the threshold from the top of the page', async () => {
    const onRefresh = vi.fn(() => Promise.resolve())
    const { container } = render(<PullToRefresh onRefresh={onRefresh}><p>board</p></PullToRefresh>)
    const root = container.firstElementChild as HTMLElement
    fireEvent.touchStart(root, touch(100))
    fireEvent.touchMove(root, touch(140))
    expect(screen.getByText('Pull to refresh')).toBeDefined()
    fireEvent.touchMove(root, touch(190))
    expect(screen.getByText('Release to refresh')).toBeDefined()
    fireEvent.touchEnd(root)
    expect(onRefresh).toHaveBeenCalledTimes(1)
  })

  it('a short pull does nothing', () => {
    const onRefresh = vi.fn()
    const { container } = render(<PullToRefresh onRefresh={onRefresh}><p>board</p></PullToRefresh>)
    const root = container.firstElementChild as HTMLElement
    fireEvent.touchStart(root, touch(100))
    fireEvent.touchMove(root, touch(130))
    fireEvent.touchEnd(root)
    expect(onRefresh).not.toHaveBeenCalled()
  })
})
