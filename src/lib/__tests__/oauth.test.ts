// @vitest-environment happy-dom

// The shell cannot take an OAuth redirect in its WebView, so the flow has to
// go out to the system browser and come back through gimme://auth/callback.
// These tests pin both halves: the request shape on each platform, and the
// parsing of what comes back.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const state = vi.hoisted(() => ({ native: false }))
const mocks = vi.hoisted(() => ({
  signInWithOAuth: vi.fn(async () => ({ data: { url: 'https://auth.example/authorize' }, error: null })),
  exchangeCodeForSession: vi.fn(async () => ({ data: {}, error: null })),
  setSession: vi.fn(async () => ({ data: {}, error: null })),
  open: vi.fn(async () => {}),
  close: vi.fn(async () => {}),
}))

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => state.native } }))
vi.mock('@capacitor/browser', () => ({ Browser: { open: mocks.open, close: mocks.close } }))
vi.mock('../supabase', () => ({
  supabase: { auth: { signInWithOAuth: mocks.signInWithOAuth, exchangeCodeForSession: mocks.exchangeCodeForSession, setSession: mocks.setSession } },
}))

import { signInWithProvider, parseAuthCallback, completeAuthCallback, NATIVE_AUTH_CALLBACK } from '../oauth'

beforeEach(() => {
  state.native = false
  Object.values(mocks).forEach(m => m.mockClear())
})

describe('signInWithProvider on the web', () => {
  it('lets Supabase redirect the page back to the origin', async () => {
    const res = await signInWithProvider('google')
    expect(res.error).toBeNull()
    expect(mocks.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/` },
    })
    expect(mocks.open).not.toHaveBeenCalled()
  })
})

describe('signInWithProvider in the shell', () => {
  it('asks for the app scheme callback, skips the WebView redirect, opens the system browser', async () => {
    state.native = true
    const res = await signInWithProvider('google')
    expect(res.error).toBeNull()
    const calls = mocks.signInWithOAuth.mock.calls as unknown as Array<[{ provider: string; options: Record<string, unknown> }]>
    const call = calls[0][0]
    expect(call.provider).toBe('google')
    expect(call.options.redirectTo).toBe(NATIVE_AUTH_CALLBACK)
    expect(call.options.skipBrowserRedirect).toBe(true)
    expect(mocks.open).toHaveBeenCalledWith({ url: 'https://auth.example/authorize', presentationStyle: 'popover' })
  })

  it('reports a provider error instead of opening anything', async () => {
    state.native = true
    mocks.signInWithOAuth.mockResolvedValueOnce({ data: { url: null }, error: { message: 'Provider is not enabled' } } as never)
    const res = await signInWithProvider('apple')
    expect(res.error).toBe('Provider is not enabled')
    expect(mocks.open).not.toHaveBeenCalled()
  })
})

describe('parseAuthCallback', () => {
  it('reads a PKCE code from the query', () => {
    expect(parseAuthCallback('gimme://auth/callback?code=abc123')).toEqual({ code: 'abc123' })
  })

  it('reads implicit tokens from the fragment', () => {
    expect(parseAuthCallback('gimme://auth/callback#access_token=AT&refresh_token=RT&token_type=bearer'))
      .toEqual({ accessToken: 'AT', refreshToken: 'RT' })
  })

  it('reads a provider error', () => {
    expect(parseAuthCallback('gimme://auth/callback?error=access_denied&error_description=User%20cancelled'))
      .toEqual({ error: 'User cancelled' })
  })

  it('ignores every other URL', () => {
    expect(parseAuthCallback('https://gimme.gg/?join=ABC123')).toBeNull()
    expect(parseAuthCallback('gimme://something/else?code=x')).toBeNull()
    expect(parseAuthCallback('nope')).toBeNull()
  })
})

describe('completeAuthCallback', () => {
  it('exchanges a code, closes the browser, and reports the URL as handled', async () => {
    expect(await completeAuthCallback('gimme://auth/callback?code=abc')).toBe(true)
    expect(mocks.close).toHaveBeenCalled()
    expect(mocks.exchangeCodeForSession).toHaveBeenCalledWith('abc')
  })

  it('installs implicit tokens', async () => {
    expect(await completeAuthCallback('gimme://auth/callback#access_token=AT&refresh_token=RT')).toBe(true)
    expect(mocks.setSession).toHaveBeenCalledWith({ access_token: 'AT', refresh_token: 'RT' })
  })

  it('leaves non callback URLs alone', async () => {
    expect(await completeAuthCallback('https://gimme.gg/?join=ABC123')).toBe(false)
    expect(mocks.close).not.toHaveBeenCalled()
  })
})
