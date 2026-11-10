import * as Sentry from '@sentry/react'
import { appEnv } from './appEnv'

declare const __APP_VERSION__: string
declare const __APP_PLATFORM__: string

export const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'unknown'
export const APP_PLATFORM = typeof __APP_PLATFORM__ !== 'undefined' ? __APP_PLATFORM__ : 'web'

export function initSentry() {
  const dsn = import.meta.env.VITE_SENTRY_DSN
  if (!dsn) return

  Sentry.init({
    dsn,
    // Vite's MODE is "production" for every Vercel build, previews included,
    // so staging errors were indistinguishable from production ones. VITE_APP_ENV
    // is set per Vercel environment and defaults to production when unset.
    environment: appEnv(),
    release: `gimme-${APP_PLATFORM}@${APP_VERSION}`,
    sampleRate: 1.0,
  })

  Sentry.setTag('app.platform', APP_PLATFORM)
  Sentry.setTag('app.version', APP_VERSION)

  startLongTaskObserver()
}

/** A plain breadcrumb: wizard step changes and the like, so an event has a trail. */
export function addBreadcrumb(category: string, message: string, data?: Record<string, unknown>): void {
  Sentry.addBreadcrumb({ category, message, data, level: 'info' })
}

/**
 * Record main-thread tasks over `thresholdMs` as breadcrumbs. The 6 November
 * Create Event report had no trail at all: Sentry here has no tracing, so a hang
 * leaves nothing. This is the cheapest trace that still says "the thread was busy
 * for 1.4 s right after the step changed". Safari has no longtask entry type; it
 * simply returns.
 */
export function startLongTaskObserver(thresholdMs = 200): void {
  if (typeof PerformanceObserver === 'undefined') return
  try {
    if (!PerformanceObserver.supportedEntryTypes?.includes('longtask')) return
    const observer = new PerformanceObserver(list => {
      for (const entry of list.getEntries()) {
        if (entry.duration < thresholdMs) continue
        Sentry.addBreadcrumb({
          category: 'performance',
          message: 'long task',
          level: 'warning',
          data: { durationMs: Math.round(entry.duration), startMs: Math.round(entry.startTime) },
        })
      }
    })
    observer.observe({ type: 'longtask', buffered: true })
  } catch {
    // Observation is best effort; never let diagnostics break the app.
  }
}

/** Attach the signed-in user to all subsequent Sentry events. Call on auth success. */
export function setSentryUser(userId: string, isAnonymous = false) {
  Sentry.setUser({ id: userId, segment: isAnonymous ? 'anonymous' : 'authenticated' })
}

/** Detach the user context. Call on sign-out. */
export function clearSentryUser() {
  Sentry.setUser(null)
}

/**
 * Report a Supabase `{ error }` return value to Sentry without disrupting the
 * caller's existing error-handling flow. Use at write sites where today an
 * error gets converted to a generic UI message and disappears — like the FK
 * race in startRound, where the Postgres-side detail
 * ("violates foreign key constraint fk_round_players_round") never made it
 * past the catch block.
 *
 * No-ops when error is null/undefined so it's safe to call unconditionally
 * after every `{ error } = await supabase...` destructure.
 */
export function reportSupabaseError(
  error: unknown,
  op: string,
  context?: Record<string, unknown>,
): void {
  if (!error) return
  const { error: err, code, details, hint } = toSupabaseError(error)
  Sentry.captureException(err, {
    tags: { area: 'supabase', op, ...(code ? { code } : {}) },
    extra: { ...context, code, details, hint },
    // Every wrapped error shares this function's stack frame, so Sentry would
    // otherwise group all of them into one issue. Group by operation and
    // Postgres code instead; fall back to the message when there is no code.
    fingerprint: ['supabase', op, code ?? err.message],
  })
}

/**
 * Supabase returns `{ code, details, hint, message }` plain objects, not Error
 * instances. Captured raw, Sentry titles the issue with the minified caller
 * name and the text "Object captured as exception with keys ...", which is
 * useless in the issue list and in alert emails. Wrap it in a real Error named
 * SupabaseError whose message is the Postgres message. Real Error instances
 * (network failures and the like) pass through untouched.
 */
export function toSupabaseError(error: unknown): {
  error: Error
  code?: string
  details?: string | null
  hint?: string | null
} {
  if (error instanceof Error) return { error }
  if (typeof error === 'object' && error !== null) {
    const o = error as Record<string, unknown>
    const message = typeof o.message === 'string' ? o.message : JSON.stringify(error)
    const code = o.code == null ? undefined : String(o.code)
    const wrapped = new Error(message)
    wrapped.name = 'SupabaseError'
    return {
      error: wrapped,
      code,
      details: typeof o.details === 'string' ? o.details : null,
      hint: typeof o.hint === 'string' ? o.hint : null,
    }
  }
  const wrapped = new Error(String(error))
  wrapped.name = 'SupabaseError'
  return { error: wrapped }
}

export { Sentry }
