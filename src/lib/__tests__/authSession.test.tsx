// @vitest-environment happy-dom
//
// The app must not remount on auth events that carry nothing new. auth-js fires
// SIGNED_IN on every tab visibility change and TOKEN_REFRESHED hourly; on 6
// November each one replaced the session object, flipped the profile spinner,
// and unmounted the screen in progress.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act, waitFor } from '@testing-library/react'
import { useEffect } from 'react'
import type { Session } from '@supabase/supabase-js'
import { classifyAuthChange, useGuardedSession, useSessionProfile, type AuthChangeKind } from '../authSession'
import type { UserProfile } from '../../types'

vi.mock('../sentry', () => ({
  addBreadcrumb: vi.fn(),
}))
import { addBreadcrumb } from '../sentry'

function makeSession(userId: string, token: string): Session {
  return {
    access_token: token,
    refresh_token: `r-${token}`,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { id: userId, aud: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '' } as Session['user'],
  }
}

function makeProfile(userId: string): UserProfile {
  return { userId, isAdmin: false, adminOnly: false, onboardingComplete: true, tee: 'White' }
}

describe('classifyAuthChange', () => {
  const a1 = makeSession('a', 't1')
  it('names each kind of change', () => {
    expect(classifyAuthChange(undefined, a1)).toBe('first')
    expect(classifyAuthChange(null, a1)).toBe('first')
    expect(classifyAuthChange(a1, makeSession('a', 't1'))).toBe('same')
    expect(classifyAuthChange(a1, makeSession('a', 't2'))).toBe('token')
    expect(classifyAuthChange(a1, makeSession('b', 't1'))).toBe('user')
    expect(classifyAuthChange(a1, null)).toBe('signed-out')
  })
})

// A harness that mirrors App: the guarded session feeds the profile hook, the
// spinner replaces the tree while loading, and a probe counts its own mounts.
let mounts = 0
function Probe({ label }: { label: string }) {
  useEffect(() => { mounts += 1 }, [])
  return <div data-testid="probe">{label}</div>
}

let applyRef: ((next: Session | null, eventName: string) => AuthChangeKind) | null = null
let sessionRefs: (Session | null | undefined)[] = []
const fetchProfile = vi.fn(async (userId: string) => makeProfile(userId))

function Harness() {
  const [session, applySession] = useGuardedSession()
  applyRef = applySession
  sessionRefs.push(session)
  const { profile, loading } = useSessionProfile(session, fetchProfile)
  if (session === undefined || loading) return <div data-testid="spinner">loading</div>
  if (!session) return <div data-testid="signed-out">signed out</div>
  return <Probe label={`${profile?.userId ?? '-'}:${session.access_token}`} />
}

describe('useGuardedSession + useSessionProfile', () => {
  beforeEach(() => {
    mounts = 0
    applyRef = null
    sessionRefs = []
    fetchProfile.mockClear()
    vi.mocked(addBreadcrumb).mockClear()
  })

  async function mountSignedIn() {
    render(<Harness />)
    expect(screen.getByTestId('spinner')).toBeDefined()
    act(() => { applyRef!(makeSession('a', 't1'), 'INITIAL_SESSION') })
    await waitFor(() => expect(screen.getByTestId('probe').textContent).toBe('a:t1'))
    expect(mounts).toBe(1)
    expect(fetchProfile).toHaveBeenCalledTimes(1)
  }

  it('SIGNED_IN with the same user and token keeps the session reference and never shows the spinner', async () => {
    await mountSignedIn()
    const before = sessionRefs[sessionRefs.length - 1]
    const renders = sessionRefs.length

    let kind: AuthChangeKind | undefined
    act(() => { kind = applyRef!(makeSession('a', 't1'), 'SIGNED_IN') })

    expect(kind).toBe('same')
    expect(sessionRefs.length).toBe(renders) // no re-render at all
    expect(sessionRefs[sessionRefs.length - 1]).toBe(before)
    expect(screen.queryByTestId('spinner')).toBeNull()
    expect(fetchProfile).toHaveBeenCalledTimes(1)
    expect(mounts).toBe(1)
    expect(addBreadcrumb).toHaveBeenLastCalledWith('auth', 'SIGNED_IN', expect.objectContaining({ kind: 'same', changed: false }))
  })

  it('TOKEN_REFRESHED with a new token updates the token and refreshes the profile without unmounting', async () => {
    await mountSignedIn()

    act(() => { applyRef!(makeSession('a', 't2'), 'TOKEN_REFRESHED') })

    // The new token is live immediately and the tree stayed mounted.
    expect(screen.getByTestId('probe').textContent).toBe('a:t2')
    expect(screen.queryByTestId('spinner')).toBeNull()
    await waitFor(() => expect(fetchProfile).toHaveBeenCalledTimes(2))
    expect(mounts).toBe(1)
    expect(addBreadcrumb).toHaveBeenLastCalledWith('auth', 'TOKEN_REFRESHED', expect.objectContaining({ kind: 'token', changed: true }))
  })

  it('a different user goes through the full reload path: spinner, new profile, remount', async () => {
    await mountSignedIn()

    act(() => { applyRef!(makeSession('b', 't9'), 'SIGNED_IN') })

    expect(screen.getByTestId('spinner')).toBeDefined()
    await waitFor(() => expect(screen.getByTestId('probe').textContent).toBe('b:t9'))
    expect(fetchProfile).toHaveBeenCalledTimes(2)
    expect(fetchProfile).toHaveBeenLastCalledWith('b')
    expect(mounts).toBe(2)
    expect(addBreadcrumb).toHaveBeenLastCalledWith('auth', 'SIGNED_IN', expect.objectContaining({ kind: 'user', changed: true }))
  })

  it('sign out clears the profile and renders the signed out tree', async () => {
    await mountSignedIn()
    act(() => { applyRef!(null, 'SIGNED_OUT') })
    await waitFor(() => expect(screen.getByTestId('signed-out')).toBeDefined())
    // A second SIGNED_OUT while already signed out is dropped.
    const renders = sessionRefs.length
    act(() => { applyRef!(null, 'SIGNED_OUT') })
    expect(sessionRefs.length).toBe(renders)
  })

  it('a failed background refresh keeps the profile already on screen', async () => {
    await mountSignedIn()
    fetchProfile.mockRejectedValueOnce(new Error('network'))
    act(() => { applyRef!(makeSession('a', 't3'), 'TOKEN_REFRESHED') })
    await waitFor(() => expect(fetchProfile).toHaveBeenCalledTimes(2))
    expect(screen.getByTestId('probe').textContent).toBe('a:t3')
    expect(screen.queryByTestId('spinner')).toBeNull()
  })
})
