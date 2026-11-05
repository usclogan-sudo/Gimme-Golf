// @vitest-environment happy-dom

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { JoinRound } from '../JoinRound/JoinRound'

// ─── Supabase mock ──────────────────────────────────────────────────────────

let rpcHandler: (name: string, params: any) => Promise<{ data: any; error: any }>

vi.mock('../../lib/supabase', () => ({
  supabase: {
    rpc: vi.fn((...args: any[]) => rpcHandler(args[0], args[1])),
  },
}))

vi.mock('../../lib/sentry', () => ({
  reportSupabaseError: vi.fn(),
}))

import { reportSupabaseError } from '../../lib/sentry'

const onJoined = vi.fn()
const onCancel = vi.fn()

function renderJoinRound(props?: Partial<{ userId: string; initialCode: string }>) {
  return render(
    <JoinRound
      userId={props?.userId ?? 'user-1'}
      initialCode={props?.initialCode}
      onJoined={onJoined}
      onCancel={onCancel}
    />,
  )
}

// A round where our user (user-1) has no seat yet: Alice is taken by someone
// else, Bob and Charlie are open guest seats.
const mockRoundData = {
  id: 'round-1',
  course_snapshot: { courseName: 'Augusta National' },
  game: { type: 'skins' },
  players: [
    { id: 'p1', name: 'Alice' },
    { id: 'p2', name: 'Bob' },
    { id: 'p3', name: 'Charlie' },
  ],
  participants: [
    { id: 'rp-1', user_id: 'other-user', player_id: 'p1', status: 'accepted' },
  ],
  registered_player_ids: [],
  current_hole: 5,
}

/** Serve `round` from get_round_by_invite and `join` from join_round. */
function serveRound(round: any, join: { data: any; error: any } = { data: { id: 'rp-new' }, error: null }) {
  rpcHandler = async (name: string) => {
    if (name === 'get_event_by_invite') return { data: null, error: { message: 'not found' } }
    if (name === 'get_round_by_invite') return { data: round, error: null }
    if (name === 'join_round') return join
    return { data: null, error: null }
  }
}

async function lookup(code = 'XYZ789') {
  const input = screen.getByPlaceholderText('ABC123') as HTMLInputElement
  fireEvent.change(input, { target: { value: code } })
  fireEvent.click(screen.getByText('Find Round'))
}

const buttonFor = (name: string) => screen.getByText(name).closest('button') as HTMLButtonElement

beforeEach(() => {
  vi.clearAllMocks()
  rpcHandler = async () => ({ data: null, error: null })
})

// ─── Initial render ─────────────────────────────────────────────────────────

describe('initial code entry screen', () => {
  it('renders invite code input and Find Round button', () => {
    renderJoinRound()
    expect(screen.getByPlaceholderText('ABC123')).toBeDefined()
    expect(screen.getByText('Find Round')).toBeDefined()
  })

  it('Find Round button disabled when code < 6 chars', () => {
    renderJoinRound()
    const input = screen.getByPlaceholderText('ABC123') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'ABC' } })
    const btn = screen.getByText('Find Round') as HTMLButtonElement
    expect(btn.disabled).toBe(true)
  })

  it('Find Round button enabled when code = 6 chars', () => {
    renderJoinRound()
    const input = screen.getByPlaceholderText('ABC123') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'ABCDEF' } })
    const btn = screen.getByText('Find Round') as HTMLButtonElement
    expect(btn.disabled).toBe(false)
  })

  it('input uppercases and strips non-alphanumeric', () => {
    renderJoinRound()
    const input = screen.getByPlaceholderText('ABC123') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'ab-c1 2!' } })
    expect(input.value).toBe('ABC12')
  })

  it('Cancel button calls onCancel', () => {
    renderJoinRound()
    fireEvent.click(screen.getByText('Cancel'))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})

// ─── Round lookup ───────────────────────────────────────────────────────────

describe('after successful round lookup', () => {
  beforeEach(() => serveRound(mockRoundData))

  it('shows round preview with course name and game type', async () => {
    renderJoinRound()
    await lookup()

    await waitFor(() => {
      expect(screen.getByText('Augusta National')).toBeDefined()
    })
    expect(screen.getByText('Skins')).toBeDefined()
    expect(screen.getByText('3 players')).toBeDefined()
    expect(screen.getByText('Hole 5')).toBeDefined()
  })

  it('shows player picker with claimed/available states', async () => {
    renderJoinRound()
    await lookup()

    await waitFor(() => {
      expect(screen.getByText('Alice')).toBeDefined()
    })

    // Alice is claimed by another user
    expect(screen.getByText('Already claimed')).toBeDefined()
    // Bob and Charlie are open
    expect(screen.getByText('Bob')).toBeDefined()
    expect(screen.getByText('Charlie')).toBeDefined()
    expect(screen.getByText('Which player are you?')).toBeDefined()
  })

  it('claimed player buttons are disabled', async () => {
    renderJoinRound()
    await lookup()

    await waitFor(() => {
      expect(screen.getByText('Alice')).toBeDefined()
    })

    expect(buttonFor('Alice').disabled).toBe(true)
    expect(buttonFor('Charlie').disabled).toBe(false)
  })
})

// ─── Seat binding rules (client mirror of join_round / join_event) ──────────

describe('seat binding rules', () => {
  it('rule 1: a seat that is a registered account is reserved for that account', async () => {
    serveRound({
      ...mockRoundData,
      players: [
        { id: 'p1', name: 'Alice' },
        { id: 'reg-9', name: 'Dana' },  // registered user, not us
      ],
      participants: [],
      registered_player_ids: ['reg-9'],
    })
    renderJoinRound()
    await lookup()

    await waitFor(() => {
      expect(screen.getByText('Dana')).toBeDefined()
    })
    expect(buttonFor('Dana').disabled).toBe(true)
    expect(screen.getByText('Registered player')).toBeDefined()
    // Alice (guest seat, no rows) is still open
    expect(buttonFor('Alice').disabled).toBe(false)
  })

  it('rule 2: when my uid is on the roster, only my seat renders and it reads as mine', async () => {
    serveRound({
      ...mockRoundData,
      players: [
        { id: 'p1', name: 'Alice' },
        { id: 'user-1', name: 'Me' },
        { id: 'p3', name: 'Charlie' },
      ],
      participants: [],
      registered_player_ids: ['user-1'],
    })
    renderJoinRound()
    await lookup()

    await waitFor(() => {
      expect(screen.getByText('Me')).toBeDefined()
    })
    expect(screen.getByRole('heading', { name: 'Your seat' })).toBeDefined()
    expect(screen.getByText('This is your seat. Tap it to continue.')).toBeDefined()
    expect(screen.queryByText('Alice')).toBeNull()
    expect(screen.queryByText('Charlie')).toBeNull()
    expect(screen.queryByText('Which player are you?')).toBeNull()
    expect(buttonFor('Me').disabled).toBe(false)
  })

  it('rule 2: tapping my seat joins as my own uid', async () => {
    const joinCalls: any[] = []
    rpcHandler = async (name: string, params: any) => {
      if (name === 'get_event_by_invite') return { data: null, error: { message: 'not found' } }
      if (name === 'get_round_by_invite') return {
        data: {
          ...mockRoundData,
          players: [{ id: 'p1', name: 'Alice' }, { id: 'user-1', name: 'Me' }],
          participants: [],
          registered_player_ids: ['user-1'],
        },
        error: null,
      }
      if (name === 'join_round') { joinCalls.push(params); return { data: { id: 'rp-new' }, error: null } }
      return { data: null, error: null }
    }
    renderJoinRound()
    await lookup()

    await waitFor(() => {
      expect(screen.getByText('Me')).toBeDefined()
    })
    fireEvent.click(buttonFor('Me'))

    await waitFor(() => {
      expect(onJoined).toHaveBeenCalledWith('round-1')
    })
    expect(joinCalls).toHaveLength(1)
    expect(joinCalls[0].p_player_id).toBe('user-1')
  })

  it('rule 3: when I already hold an accepted seat, only that seat renders', async () => {
    serveRound({
      ...mockRoundData,
      participants: [
        { id: 'rp-1', user_id: 'other-user', player_id: 'p1', status: 'accepted' },
        { id: 'rp-2', user_id: 'user-1', player_id: 'p2', status: 'accepted' },
      ],
    })
    renderJoinRound()
    await lookup()

    await waitFor(() => {
      expect(screen.getByText('Bob')).toBeDefined()
    })
    expect(screen.getByText('This is your seat. Tap it to continue.')).toBeDefined()
    expect(screen.queryByText('Alice')).toBeNull()
    expect(screen.queryByText('Charlie')).toBeNull()
    expect(screen.getByText('Continue →')).toBeDefined()
  })

  it('rule 3: a pending invite for me does not pin me to a seat', async () => {
    serveRound({
      ...mockRoundData,
      participants: [
        { id: 'rp-2', user_id: 'user-1', player_id: 'p2', status: 'pending' },
      ],
    })
    renderJoinRound()
    await lookup()

    await waitFor(() => {
      expect(screen.getByText('Bob')).toBeDefined()
    })
    // Still the full picker — a pending row is an invitation, not a seat.
    expect(screen.getByText('Which player are you?')).toBeDefined()
    expect(screen.getByText('Alice')).toBeDefined()
    expect(screen.getByText('Charlie')).toBeDefined()
  })

  it('rule 4: a pending row by someone else makes the seat taken; a declined row frees it', async () => {
    serveRound({
      ...mockRoundData,
      participants: [
        { id: 'rp-1', user_id: 'other-user', player_id: 'p1', status: 'pending' },
        { id: 'rp-3', user_id: 'third-user', player_id: 'p3', status: 'declined' },
      ],
    })
    renderJoinRound()
    await lookup()

    await waitFor(() => {
      expect(screen.getByText('Alice')).toBeDefined()
    })
    expect(buttonFor('Alice').disabled).toBe(true)
    expect(buttonFor('Charlie').disabled).toBe(false)
    expect(buttonFor('Bob').disabled).toBe(false)
  })

  it('rows without a status field are treated as accepted (pre-status data)', async () => {
    serveRound({
      ...mockRoundData,
      participants: [{ id: 'rp-1', user_id: 'other-user', player_id: 'p1' }],
    })
    renderJoinRound()
    await lookup()

    await waitFor(() => {
      expect(screen.getByText('Alice')).toBeDefined()
    })
    expect(buttonFor('Alice').disabled).toBe(true)
  })
})

// ─── Error handling ─────────────────────────────────────────────────────────

describe('error handling', () => {
  it('shows "Invalid or expired" for not-found errors', async () => {
    rpcHandler = async (name: string) => {
      if (name === 'get_event_by_invite') return { data: null, error: { message: 'not found' } }
      if (name === 'get_round_by_invite') return { data: null, error: null }
      return { data: null, error: null }
    }

    renderJoinRound()
    await lookup('BADCOD')

    await waitFor(() => {
      expect(screen.getByText('Invalid or expired invite code')).toBeDefined()
    })
  })

  it('shows RPC error message for other failures', async () => {
    rpcHandler = async (name: string) => {
      if (name === 'get_event_by_invite') return { data: null, error: { message: 'not found' } }
      if (name === 'get_round_by_invite') return { data: null, error: { message: 'Server unreachable' } }
      return { data: null, error: null }
    }

    renderJoinRound()
    await lookup('BADCOD')

    await waitFor(() => {
      expect(screen.getByText('Server unreachable')).toBeDefined()
    })
  })
})

// ─── Join flow ──────────────────────────────────────────────────────────────

describe('join flow', () => {
  it('calls onJoined with roundId after successful join', async () => {
    serveRound(mockRoundData)
    renderJoinRound()
    await lookup()

    await waitFor(() => {
      expect(screen.getByText('Charlie')).toBeDefined()
    })

    fireEvent.click(buttonFor('Charlie'))

    await waitFor(() => {
      expect(onJoined).toHaveBeenCalledWith('round-1')
    })
  })

  it('normalises the legacy "already claimed" refusal to a plain sentence', async () => {
    serveRound(mockRoundData, { data: null, error: { message: 'Player already claimed by another user' } })
    renderJoinRound()
    await lookup()

    await waitFor(() => {
      expect(screen.getByText('Charlie')).toBeDefined()
    })
    fireEvent.click(buttonFor('Charlie'))

    await waitFor(() => {
      expect(screen.getByText('This seat is already claimed by another player.')).toBeDefined()
    })
    expect(reportSupabaseError).not.toHaveBeenCalled()
  })

  it.each([
    'This seat belongs to a registered player.',
    'You already have a seat in this round.',
    'This seat is already claimed by another player.',
  ])('shows the RPC refusal "%s" verbatim and does not report it', async (refusal) => {
    serveRound(mockRoundData, { data: null, error: { message: refusal } })
    renderJoinRound()
    await lookup()

    await waitFor(() => {
      expect(screen.getByText('Charlie')).toBeDefined()
    })
    fireEvent.click(buttonFor('Charlie'))

    await waitFor(() => {
      expect(screen.getByText(refusal)).toBeDefined()
    })
    expect(refusal.endsWith('!')).toBe(false)
    expect(reportSupabaseError).not.toHaveBeenCalled()
  })

  it('reports unexpected join failures to Sentry', async () => {
    serveRound(mockRoundData, { data: null, error: { message: 'connection reset' } })
    renderJoinRound()
    await lookup()

    await waitFor(() => {
      expect(screen.getByText('Charlie')).toBeDefined()
    })
    fireEvent.click(buttonFor('Charlie'))

    await waitFor(() => {
      expect(screen.getByText('connection reset')).toBeDefined()
    })
    expect(reportSupabaseError).toHaveBeenCalledTimes(1)
  })
})

// ─── "Enter a different code" navigation ────────────────────────────────────

describe('navigation', () => {
  it('"Enter a different code" returns to code entry', async () => {
    serveRound(mockRoundData)
    renderJoinRound()
    await lookup()

    await waitFor(() => {
      expect(screen.getByText(/different code/)).toBeDefined()
    })

    fireEvent.click(screen.getByText(/different code/))
    expect(screen.getByPlaceholderText('ABC123')).toBeDefined()
  })
})
