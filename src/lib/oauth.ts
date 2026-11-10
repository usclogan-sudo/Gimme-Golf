// Google and Apple sign in through Supabase's hosted OAuth flow.
//
// On the web the page simply leaves for the provider and comes back to the
// origin with the session in the URL, which the Supabase client reads on load.
//
// Inside the native shell that round trip cannot happen in the WebView: Google
// refuses to sign in inside an embedded browser, and the WebView has no way to
// receive the redirect. So the shell opens the provider in the system browser
// sheet (SFSafariViewController on iOS, a Custom Tab on Android), asks Supabase
// to send the result to the app's own URL scheme, gimme://auth/callback, and
// src/lib/native.ts hands that URL to completeAuthCallback, which installs the
// session and closes the sheet.
//
// Supabase side: gimme://auth/callback must be on the project's redirect URL
// allow list, and each provider needs its credentials on the Providers page.

import { Capacitor } from '@capacitor/core'
import { Browser } from '@capacitor/browser'
import { supabase } from './supabase'

export type OAuthProvider = 'google' | 'apple'

export const NATIVE_AUTH_CALLBACK = 'gimme://auth/callback'

function inShell(): boolean {
  try {
    return Capacitor.isNativePlatform()
  } catch {
    return false
  }
}

/** Starts the provider flow. Resolves with an error line to show, or null. */
export async function signInWithProvider(provider: OAuthProvider): Promise<{ error: string | null }> {
  if (inShell()) {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: NATIVE_AUTH_CALLBACK,
        skipBrowserRedirect: true,
        queryParams: provider === 'google' ? { prompt: 'select_account' } : undefined,
      },
    })
    if (error) return { error: error.message }
    if (!data?.url) return { error: 'Sign in could not start. Try again.' }
    try {
      await Browser.open({ url: data.url, presentationStyle: 'popover' })
    } catch {
      return { error: 'Could not open the sign in page.' }
    }
    return { error: null }
  }

  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: `${window.location.origin}/` },
  })
  return { error: error?.message ?? null }
}

export interface AuthCallback {
  code?: string
  accessToken?: string
  refreshToken?: string
  error?: string
}

/** The pieces of a gimme://auth/callback URL, or null for any other URL. */
export function parseAuthCallback(raw: string): AuthCallback | null {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  if (url.protocol !== 'gimme:') return null
  // Custom scheme URLs parse with the first segment as the host.
  const path = `${url.hostname}${url.pathname}`.replace(/\/+$/, '')
  if (path !== 'auth/callback') return null

  const query = url.searchParams
  const hash = new URLSearchParams(url.hash.startsWith('#') ? url.hash.slice(1) : url.hash)
  const out: AuthCallback = {}
  const code = query.get('code') ?? hash.get('code')
  if (code) out.code = code
  const access = hash.get('access_token') ?? query.get('access_token')
  const refresh = hash.get('refresh_token') ?? query.get('refresh_token')
  if (access) out.accessToken = access
  if (refresh) out.refreshToken = refresh
  const err = query.get('error_description') ?? hash.get('error_description') ?? query.get('error') ?? hash.get('error')
  if (err) out.error = err
  return out
}

/**
 * Finishes a native sign in. Returns true when the URL was an auth callback,
 * whether or not it succeeded, so the caller knows not to treat it as a deep
 * link. Any failure surfaces through the auth listener as "still signed out".
 */
export async function completeAuthCallback(raw: string): Promise<boolean> {
  const cb = parseAuthCallback(raw)
  if (!cb) return false
  try { await Browser.close() } catch { /* already closed */ }
  if (cb.error) return true
  try {
    if (cb.code) {
      await supabase.auth.exchangeCodeForSession(cb.code)
    } else if (cb.accessToken && cb.refreshToken) {
      await supabase.auth.setSession({ access_token: cb.accessToken, refresh_token: cb.refreshToken })
    }
  } catch {
    // The listener stays signed out; the user can try again.
  }
  return true
}
