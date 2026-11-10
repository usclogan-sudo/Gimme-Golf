// A deep link into the shell must land on the same join and spectate flow the
// web uses, and nothing else: only gimme.gg hosts, only codes that look like
// codes, uppercased the way the app stores them.

import { describe, it, expect, vi } from 'vitest'

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false, getPlatform: () => 'web' } }))
vi.mock('@capacitor/app', () => ({ App: { getLaunchUrl: vi.fn(), addListener: vi.fn() } }))
vi.mock('@capacitor/status-bar', () => ({ StatusBar: {}, Style: { Dark: 'DARK' } }))
vi.mock('@capacitor/splash-screen', () => ({ SplashScreen: {} }))
vi.mock('../sentry', () => ({ Sentry: { setTag: vi.fn() } }))

import { parseDeepLink, isNative, nativePlatform } from '../native'

describe('parseDeepLink', () => {
  it('reads a join code from gimme.gg with or without www', () => {
    expect(parseDeepLink('https://gimme.gg/?join=abc123')).toEqual({ kind: 'join', code: 'ABC123' })
    expect(parseDeepLink('https://www.gimme.gg/?join=SEEDSK&utm=x')).toEqual({ kind: 'join', code: 'SEEDSK' })
  })

  it('reads a spectate code, join taking priority when both are present', () => {
    expect(parseDeepLink('https://gimme.gg/?spectate=seedev')).toEqual({ kind: 'spectate', code: 'SEEDEV' })
    expect(parseDeepLink('https://gimme.gg/?spectate=a1b2c3&join=z9y8x7')).toEqual({ kind: 'join', code: 'Z9Y8X7' })
  })

  it('ignores other hosts, missing codes, and codes that do not look like codes', () => {
    expect(parseDeepLink('https://evil.example/?join=ABC123')).toBeNull()
    expect(parseDeepLink('https://gimme.gg/privacy')).toBeNull()
    expect(parseDeepLink('https://gimme.gg/?join=')).toBeNull()
    expect(parseDeepLink('https://gimme.gg/?join=<script>')).toBeNull()
    expect(parseDeepLink('not a url')).toBeNull()
  })
})

describe('platform helpers on the web', () => {
  it('report web and not native', () => {
    expect(isNative()).toBe(false)
    expect(nativePlatform()).toBe('web')
  })
})
