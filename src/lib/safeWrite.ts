import type { PostgrestSingleResponse, PostgrestResponse } from '@supabase/supabase-js'
import { reportSupabaseError } from './sentry'

type SupabaseResult = PostgrestSingleResponse<any> | PostgrestResponse<any>

/**
 * Wraps a Supabase write call to ensure errors are surfaced (console + Sentry).
 * Use for fire-and-forget writes where you don't need the result but want to
 * know if something went wrong.
 *
 * Usage:
 *   safeWrite(supabase.from('table').insert(data), 'insert notification')
 */
export async function safeWrite(
  promise: PromiseLike<SupabaseResult>,
  label: string
): Promise<boolean> {
  try {
    const result = await promise
    if (result.error) {
      console.error(`[safeWrite] ${label}:`, describeWriteError(result.error))
      reportSupabaseError(result.error, `safeWrite.${label}`)
      return false
    }
    return true
  } catch (err) {
    console.error(`[safeWrite] ${label}:`, err)
    reportSupabaseError(err, `safeWrite.${label}.exception`)
    return false
  }
}

/**
 * Turn a Supabase/Postgres error into something a human can act on.
 *
 * Every write failure used to reach the user as "Please try again", while the part
 * that actually named the problem — the constraint, the code — sat one line away in
 * the console. On 6 September that turned a one-line foreign key violation into a
 * two-hour diagnosis. A raw constraint name in front of a golfer is not elegant, but
 * it is the difference between a bug that gets reported usefully and one that gets
 * described as "it didn't work", so the code is included deliberately.
 */
export function describeWriteError(
  err: unknown,
  fallback = 'Something went wrong. Please try again.',
): string {
  const e = err as { message?: string; code?: string; details?: string; hint?: string } | null
  if (!e || typeof e !== 'object') return fallback
  const detail = [e.message, e.details].filter(Boolean).join(' — ')
  if (!detail) return fallback
  return e.code ? `${detail} (${e.code})` : detail
}
