// Every Vercel build runs with Vite MODE "production", previews included, so
// the Sentry environment must come from VITE_APP_ENV or staging errors land in
// the production bucket with no way to tell them apart.

import { describe, it, expect, vi, afterEach } from 'vitest'

vi.mock('@sentry/react', () => ({
  init: vi.fn(),
  setTag: vi.fn(),
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  addBreadcrumb: vi.fn(),
  setUser: vi.fn(),
}))

import * as Sentry from '@sentry/react'
import { initSentry } from '../sentry'

const init = Sentry.init as unknown as ReturnType<typeof vi.fn>

afterEach(() => {
  vi.unstubAllEnvs()
  init.mockClear()
})

function environmentPassed(): string | undefined {
  expect(init).toHaveBeenCalledTimes(1)
  return (init.mock.calls[0][0] as { environment?: string }).environment
}

describe('initSentry environment', () => {
  it('tags staging builds as staging', () => {
    vi.stubEnv('VITE_SENTRY_DSN', 'https://key@example.ingest.sentry.io/1')
    vi.stubEnv('VITE_APP_ENV', 'staging')
    initSentry()
    expect(environmentPassed()).toBe('staging')
  })

  it('tags an unset VITE_APP_ENV as production regardless of MODE', () => {
    vi.stubEnv('VITE_SENTRY_DSN', 'https://key@example.ingest.sentry.io/1')
    vi.stubEnv('VITE_APP_ENV', '')
    vi.stubEnv('MODE', 'test')
    initSentry()
    expect(environmentPassed()).toBe('production')
  })

  it('does nothing without a DSN', () => {
    vi.stubEnv('VITE_SENTRY_DSN', '')
    vi.stubEnv('VITE_APP_ENV', 'staging')
    initSentry()
    expect(init).not.toHaveBeenCalled()
  })
})
