// Sign in with Apple through Supabase Auth.
//
// iOS: the native sheet, through the community plugin, hands back an identity
// token that Supabase verifies against the nonce we generated. Apple is given
// the SHA-256 of the nonce and Supabase the raw value, which is how the token
// is bound to this one sign in. Everywhere else, including the Android shell
// and the web, Supabase's hosted OAuth flow handles the round trip.
//
// Supabase side: the Apple provider is enabled with the bundle id
// gg.gimme.app and the web Services ID both listed as authorized client ids.

import { Capacitor } from '@capacitor/core'
import { SignInWithApple } from '@capacitor-community/apple-sign-in'
import { supabase } from './supabase'
import { signInWithProvider } from './oauth'

export const APPLE_CLIENT_ID = 'gg.gimme.app'
export const APPLE_REDIRECT = 'https://www.gimme.gg/'

const NONCE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

export function randomNonce(length = 32): string {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  let out = ''
  for (const b of bytes) out += NONCE_ALPHABET[b % NONCE_ALPHABET.length]
  return out
}

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('')
}

export function appleNativeAvailable(): boolean {
  try {
    return Capacitor.getPlatform() === 'ios'
  } catch {
    return false
  }
}

/** Resolves with an error line to show, or null once the session is in place. */
export async function signInWithApple(): Promise<{ error: string | null }> {
  if (appleNativeAvailable()) {
    const rawNonce = randomNonce()
    const hashedNonce = await sha256Hex(rawNonce)
    let identityToken: string | undefined
    let givenName: string | null | undefined
    let familyName: string | null | undefined
    try {
      const result = await SignInWithApple.authorize({
        clientId: APPLE_CLIENT_ID,
        redirectURI: APPLE_REDIRECT,
        scopes: 'email name',
        state: randomNonce(16),
        nonce: hashedNonce,
      })
      identityToken = result.response.identityToken
      givenName = result.response.givenName
      familyName = result.response.familyName
    } catch (err) {
      const msg = (err as Error)?.message ?? ''
      // The user closed the sheet: not an error worth a red line.
      if (/cancel/i.test(msg) || /1001/.test(msg)) return { error: null }
      return { error: 'Apple sign in did not complete. Try again.' }
    }
    if (!identityToken) return { error: 'Apple did not return a sign in token.' }

    const { error } = await supabase.auth.signInWithIdToken({ provider: 'apple', token: identityToken, nonce: rawNonce })
    if (error) return { error: error.message }

    // Apple sends the name on the first authorization only. Keep it on the
    // user so onboarding can offer it as the display name.
    const fullName = [givenName, familyName].filter(Boolean).join(' ').trim()
    if (fullName) {
      await supabase.auth.updateUser({ data: { full_name: fullName } }).catch(() => {})
    }
    return { error: null }
  }

  // Android shell and the web: the hosted flow, through the system browser
  // when inside the shell.
  return signInWithProvider('apple')
}
