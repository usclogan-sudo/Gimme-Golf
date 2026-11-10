// @vitest-environment happy-dom

// The nonce is what binds an Apple identity token to one sign in: Apple gets
// the hash, Supabase gets the raw value. Both halves must be right or every
// native sign in fails with a message that says nothing useful.

import { describe, it, expect, vi } from 'vitest'

const { signInWithOAuth } = vi.hoisted(() => ({
  signInWithOAuth: vi.fn(async () => ({ error: null })),
}))

vi.mock('@capacitor/core', () => ({ Capacitor: { getPlatform: () => 'web' } }))
vi.mock('@capacitor-community/apple-sign-in', () => ({ SignInWithApple: { authorize: vi.fn() } }))
vi.mock('../supabase', () => ({ supabase: { auth: { signInWithOAuth } } }))

import { randomNonce, sha256Hex, appleNativeAvailable, signInWithApple } from '../appleAuth'

describe('randomNonce', () => {
  it('is the requested length, alphanumeric, and different each time', () => {
    const a = randomNonce()
    const b = randomNonce()
    expect(a).toHaveLength(32)
    expect(a).toMatch(/^[A-Za-z0-9]+$/)
    expect(a).not.toBe(b)
    expect(randomNonce(16)).toHaveLength(16)
  })
})

describe('sha256Hex', () => {
  it('matches a known digest', async () => {
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
    expect(await sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
  })
})

describe('signInWithApple off iOS', () => {
  it('uses the hosted OAuth flow with a redirect back to the app origin', async () => {
    expect(appleNativeAvailable()).toBe(false)
    const res = await signInWithApple()
    expect(res.error).toBeNull()
    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider: 'apple',
      options: { redirectTo: `${window.location.origin}/` },
    })
  })
})
