// Session identity and profile loading, kept apart from App so the behaviour
// has a test.
//
// Background (6 November). App replaced its session object on every Supabase
// auth event. auth-js fires SIGNED_IN with the stored session every time the tab
// goes hidden and visible again, and TOKEN_REFRESHED about once an hour. Each
// new object re-ran the profile effect, which flipped the full screen spinner on,
// and the spinner unmounted the whole screen tree. A wizard, join screen or
// scorecard in progress came back reset, with no page load and no deploy.
//
// Rules here:
//   * same user, same access token: not a change. The session reference is kept.
//   * same user, new access token: the token is swapped in. No spinner.
//   * different user, or signed out: a genuine change. The spinner is allowed.
//   * the profile is keyed on the user id. It refreshes in the background on a
//     token refresh and shows the spinner only when no profile for that user is
//     loaded yet.

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import type { UserProfile } from '../types'
import { addBreadcrumb } from './sentry'

export type AuthChangeKind = 'first' | 'same' | 'token' | 'user' | 'signed-out'

/** How `next` relates to `prev`. `undefined` prev means "not checked yet". */
export function classifyAuthChange(prev: Session | null | undefined, next: Session | null): AuthChangeKind {
  if (!next) return 'signed-out'
  if (!prev) return 'first'
  if (prev.user?.id !== next.user?.id) return 'user'
  if (prev.access_token !== next.access_token) return 'token'
  return 'same'
}

/** Whether a change of this kind should replace the stored session object. */
export function authChangeReplacesSession(kind: AuthChangeKind): boolean {
  return kind !== 'same'
}

/**
 * Session state whose setter ignores events that carry nothing new. Returns the
 * session and `applySession(next, eventName)`, which classifies the change,
 * records a breadcrumb, and only calls setState when something changed. The
 * returned kind lets the caller react to a genuine change (first session, new
 * user, sign out) without re-deriving it.
 */
export function useGuardedSession(): [Session | null | undefined, (next: Session | null, eventName: string) => AuthChangeKind] {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const sessionRef = useRef(session)
  sessionRef.current = session

  const applySession = useCallback((next: Session | null, eventName: string): AuthChangeKind => {
    const kind = classifyAuthChange(sessionRef.current, next)
    const changed = authChangeReplacesSession(kind)
    addBreadcrumb('auth', eventName, { kind, changed, userId: next?.user?.id ?? null })
    // 'signed-out' on an already signed out app is still a no-op for state, but
    // `undefined` (not checked yet) → null is the first real answer and must land.
    if (kind === 'signed-out' && sessionRef.current === null) return kind
    if (!changed) return kind
    sessionRef.current = next
    setSession(next)
    return kind
  }, [])

  return [session, applySession]
}

export interface SessionProfileState {
  profile: UserProfile | null
  setProfile: React.Dispatch<React.SetStateAction<UserProfile | null>>
  /** True only while no profile for the current user is loaded yet. */
  loading: boolean
  error: boolean
  retry: () => void
}

/**
 * The profile for the signed in user. Keyed on the user id, so a token refresh
 * re-fetches in the background without touching `loading`; a user change shows
 * the spinner. `afterFetch` runs on every successful fetch and may return an
 * adjusted profile (App uses it to auto-complete onboarding for anonymous
 * guests and to route admin-only accounts).
 */
export function useSessionProfile(
  session: Session | null | undefined,
  fetchProfile: (userId: string) => Promise<UserProfile>,
  afterFetch?: (profile: UserProfile, session: Session) => Promise<UserProfile | void> | UserProfile | void,
): SessionProfileState {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const profileRef = useRef(profile)
  profileRef.current = profile
  const sessionRef = useRef(session)
  sessionRef.current = session
  const afterFetchRef = useRef(afterFetch)
  afterFetchRef.current = afterFetch
  const [attempt, setAttempt] = useState(0)

  const userId = session?.user?.id ?? null
  const accessToken = session?.access_token ?? null

  useEffect(() => {
    if (session === undefined) return // still checking auth; keep the initial spinner
    if (!userId) {
      setProfile(null)
      setLoading(false)
      return
    }
    const alreadyLoaded = profileRef.current?.userId === userId
    if (!alreadyLoaded) {
      setLoading(true)
      setError(false)
    }
    let cancelled = false
    fetchProfile(userId).then(async fetched => {
      const current = sessionRef.current
      let next = fetched
      if (current && afterFetchRef.current) {
        const adjusted = await afterFetchRef.current(fetched, current)
        if (adjusted) next = adjusted
      }
      if (cancelled) return
      setProfile(next)
      setLoading(false)
    }).catch(() => {
      if (cancelled) return
      // A failed background refresh keeps the profile we have; only a first
      // load with nothing to show becomes the error screen.
      if (!alreadyLoaded) setError(true)
      setLoading(false)
    })
    return () => { cancelled = true }
    // accessToken is a deliberate dependency: a token refresh re-fetches the
    // profile in the background. session itself is not, so same-token events
    // (which useGuardedSession already drops) can never re-run this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, accessToken, attempt, session === undefined])

  const retry = useCallback(() => setAttempt(a => a + 1), [])

  return { profile, setProfile, loading, error, retry }
}
