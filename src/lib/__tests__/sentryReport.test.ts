// Supabase hands back plain { code, details, hint, message } objects. Captured
// raw, Sentry titles the issue with a minified function name. The reporter must
// wrap them in a named Error and group by operation and Postgres code.

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@sentry/react', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  addBreadcrumb: vi.fn(),
  setTag: vi.fn(),
  setUser: vi.fn(),
  init: vi.fn(),
}))

import * as Sentry from '@sentry/react'
import { reportSupabaseError, toSupabaseError } from '../sentry'

const capture = Sentry.captureException as unknown as ReturnType<typeof vi.fn>

const pgError = {
  code: '23514',
  details: null,
  hint: null,
  message: 'new row for relation "junk_records" violates check constraint "junk_records_junk_type_check"',
}

describe('toSupabaseError', () => {
  it('wraps a Postgrest object in a SupabaseError carrying the message and code', () => {
    const { error, code, details, hint } = toSupabaseError(pgError)
    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe('SupabaseError')
    expect(error.message).toBe(pgError.message)
    expect(code).toBe('23514')
    expect(details).toBeNull()
    expect(hint).toBeNull()
  })

  it('passes a real Error through untouched', () => {
    const net = new TypeError('Failed to fetch')
    expect(toSupabaseError(net).error).toBe(net)
  })

  it('copes with a string or an object with no message', () => {
    expect(toSupabaseError('boom').error.message).toBe('boom')
    expect(toSupabaseError({ status: 500 }).error.message).toBe('{"status":500}')
  })
})

describe('reportSupabaseError', () => {
  beforeEach(() => capture.mockClear())

  it('does nothing for a null error', () => {
    reportSupabaseError(null, 'noop')
    expect(capture).not.toHaveBeenCalled()
  })

  it('captures the wrapped error with area, op and code tags and a stable fingerprint', () => {
    reportSupabaseError(pgError, 'safeWrite.insert junk record', { roundId: 'r1' })
    expect(capture).toHaveBeenCalledTimes(1)
    const [err, hint] = capture.mock.calls[0]
    expect((err as Error).name).toBe('SupabaseError')
    expect((err as Error).message).toBe(pgError.message)
    expect(hint.tags).toEqual({ area: 'supabase', op: 'safeWrite.insert junk record', code: '23514' })
    expect(hint.extra).toMatchObject({ roundId: 'r1', code: '23514' })
    expect(hint.fingerprint).toEqual(['supabase', 'safeWrite.insert junk record', '23514'])
  })

  it('falls back to the message in the fingerprint when there is no code', () => {
    reportSupabaseError(new TypeError('Failed to fetch'), 'load round')
    const [, hint] = capture.mock.calls[0]
    expect(hint.fingerprint).toEqual(['supabase', 'load round', 'Failed to fetch'])
    expect(hint.tags).toEqual({ area: 'supabase', op: 'load round' })
  })
})
