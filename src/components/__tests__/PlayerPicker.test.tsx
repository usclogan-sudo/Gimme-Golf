// @vitest-environment happy-dom
//
// Finding 2. Select Players: a guest added just now must render pinned with the
// other selected players, not inside the collapsed "Show all players" list; and
// adding a guest whose name matches someone already here asks first.

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { PlayerPicker } from '../NewRound/NewRound'
import type { Course } from '../../types'

// A chainable, thenable stand-in for a supabase query: every builder method
// returns the chain, and awaiting it resolves to the table's canned rows.
const tables: Record<string, any[]> = {
  user_profiles: [
    { user_id: 'u2', display_name: 'Bob', handicap_index: 10, tee: 'White' },
    { user_id: 'u3', display_name: 'Carol', handicap_index: 5, tee: 'White' },
  ],
  players: [
    { id: 'g1', name: 'Pat Guest', handicap_index: 18, tee: 'White', ghin_number: '' },
  ],
  rounds: [],
  round_players: [],
}
const inserted: any[] = []
function chain(table: string) {
  const c: any = {}
  const self = () => c
  for (const m of ['select', 'not', 'limit', 'eq', 'order', 'in', 'maybeSingle', 'single']) c[m] = self
  c.insert = (row: any) => { inserted.push({ table, row }); return c }
  c.then = (res: any, rej: any) => Promise.resolve({ data: tables[table] ?? [], error: null }).then(res, rej)
  return c
}
vi.mock('../../lib/supabase', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/supabase')>()
  return { ...actual, supabase: { from: (table: string) => chain(table) } }
})

const course: Course = {
  id: 'c1', name: 'Test Course',
  tees: [{ name: 'White', rating: 72, slope: 130 }, { name: 'Blue', rating: 74, slope: 135 }],
  holes: [], createdAt: new Date(),
}

function renderPicker(playerTees: Record<string, string> = {}) {
  return render(
    <PlayerPicker
      userId="u1"
      course={course}
      onNext={vi.fn()}
      onBack={vi.fn()}
      stakesMode="points"
      playerTees={playerTees}
      onPlayerTeesChange={vi.fn()}
    />,
  )
}

const addGuest = async (name: string) => {
  fireEvent.click(screen.getByText('👤 Add a guest'))
  fireEvent.change(screen.getByPlaceholderText('Name'), { target: { value: name } })
  fireEvent.click(screen.getByText('Add'))
}

describe('PlayerPicker — selected players are pinned (Finding 2)', () => {
  it('a newly added guest renders under "In this round", not behind "Show all players"', async () => {
    renderPicker()
    // Only "You" is selected to start; Bob/Carol/Pat are unselected non-friends,
    // collapsed behind the button — so Bob is not on screen yet, by design.
    await waitFor(() => expect(screen.getByText(/Show all players/)).toBeDefined())
    expect(screen.queryByText('Bob')).toBeNull()

    await addGuest('Dave')
    await waitFor(() => expect(screen.getByText('Dave')).toBeDefined())

    expect(screen.getByText('2 players selected')).toBeDefined()
    // Dave is inside the pinned tier, above the collapsed list.
    const pinned = screen.getByText('In this round').parentElement as HTMLElement
    expect(within(pinned).getByText('Dave')).toBeDefined()
    // The self-player has no profile name here, so both its name and its badge read "You".
    expect(within(pinned).getAllByText('You').length).toBeGreaterThanOrEqual(1)
    const showAll = screen.getByText(/Show all players/)
    expect(pinned.compareDocumentPosition(showAll) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(inserted.some(i => i.table === 'players' && i.row.name === 'Dave')).toBe(true)
  })

  it('search never hides a selected row: the pinned tier stays while searching', async () => {
    renderPicker()
    await waitFor(() => expect(screen.getByText(/Show all players/)).toBeDefined())
    fireEvent.click(screen.getByText(/Show all players/))
    fireEvent.click(screen.getByText('Carol'))
    // Search for someone else entirely.
    fireEvent.change(screen.getByPlaceholderText('Search players…'), { target: { value: 'pat' } })
    const pinned = screen.getByText('In this round').parentElement as HTMLElement
    expect(within(pinned).getByText('Carol')).toBeDefined()
    expect(screen.getByText('Pat Guest')).toBeDefined()
    expect(screen.queryByText('Bob')).toBeNull()
    // A search that matches a selected player does not list them twice.
    fireEvent.change(screen.getByPlaceholderText('Search players…'), { target: { value: 'carol' } })
    expect(screen.getAllByText('Carol')).toHaveLength(1)
    expect(screen.getByText(/No players match/)).toBeDefined()
  })

  it('a new guest defaults to the organiser\'s tee', async () => {
    renderPicker({ u1: 'Blue' })
    await waitFor(() => expect(screen.getByText(/Show all players/)).toBeDefined())
    fireEvent.click(screen.getByText('👤 Add a guest'))
    expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('Blue')
    fireEvent.change(screen.getByPlaceholderText('Name'), { target: { value: 'Dana' } })
    fireEvent.click(screen.getByText('Add'))
    await waitFor(() => expect(inserted.some(i => i.row.name === 'Dana' && i.row.tee === 'Blue')).toBe(true))
  })

  it('selecting a player from the full list pins them too', async () => {
    renderPicker()
    await waitFor(() => expect(screen.getByText(/Show all players/)).toBeDefined())
    fireEvent.click(screen.getByText(/Show all players/))
    fireEvent.click(screen.getByText('Carol'))
    const pinned = screen.getByText('In this round').parentElement as HTMLElement
    expect(within(pinned).getByText('Carol')).toBeDefined()
    // And she is no longer listed a second time under All Players.
    expect(screen.getAllByText('Carol')).toHaveLength(1)
  })
})

describe('PlayerPicker — duplicate guest names (Finding 2)', () => {
  it('asks before adding a guest whose name matches a registered player, case-insensitively', async () => {
    renderPicker()
    await waitFor(() => expect(screen.getByText(/Show all players/)).toBeDefined())
    // Bob is on the list (collapsed), so the check must still catch him.
    await addGuest('  bob ')
    // The copy uses the name as typed (trimmed), in both places and on the button.
    const prompt = screen.getByText(/A player named/)
    expect(prompt.textContent).toBe('A player named bob is already here. Select them, or add a new bob anyway.')
    expect(screen.getByText('Select bob')).toBeDefined()
    expect(screen.getByText('Add anyway')).toBeDefined()
    // Nothing was written yet.
    expect(inserted.some(i => i.row.name === 'bob')).toBe(false)
  })

  it('"Select Bob" selects the existing player instead of creating a second one', async () => {
    renderPicker()
    await waitFor(() => expect(screen.getByText(/Show all players/)).toBeDefined())
    await addGuest('Bob')
    expect(screen.getByText(/A player named/).textContent)
      .toBe('A player named Bob is already here. Select them, or add a new Bob anyway.')
    fireEvent.click(screen.getByText('Select Bob'))
    const pinned = screen.getByText('In this round').parentElement as HTMLElement
    expect(within(pinned).getByText('Bob')).toBeDefined()
    expect(screen.queryByPlaceholderText('Name')).toBeNull() // form closed
    // Expand the rest: Bob is not listed a second time, and nothing was inserted.
    fireEvent.click(screen.getByText(/Show all players/))
    expect(screen.getAllByText('Bob')).toHaveLength(1)
    expect(inserted.some(i => i.row.name === 'Bob')).toBe(false)
  })

  it('"Add anyway" goes ahead and creates the guest', async () => {
    renderPicker()
    await waitFor(() => expect(screen.getByText(/Show all players/)).toBeDefined())
    await addGuest('Pat Guest')
    fireEvent.click(screen.getByText('Add anyway'))
    // The new Pat is pinned; the original stays in the collapsed list.
    await waitFor(() => {
      const pinned = screen.getByText('In this round').parentElement as HTMLElement
      expect(within(pinned).getByText('Pat Guest')).toBeDefined()
    })
    fireEvent.click(screen.getByText(/Show all players/))
    expect(screen.getAllByText('Pat Guest')).toHaveLength(2)
    expect(inserted.filter(i => i.row.name === 'Pat Guest')).toHaveLength(1)
  })
})
