// The native shell. Everything here is a no op on the web, so the same bundle
// serves gimme.gg and the store builds. Capacitor serves the bundle from the
// app package, so there is no service worker and no "Update ready" line: a
// new build arrives through the store.
//
// Deep links: a tap on gimme.gg/?join=CODE or ?spectate=CODE in a text or an
// email opens the installed app (Universal Links on iOS, App Links on Android)
// and lands here as an appUrlOpen event. The web app already reads those
// query parameters on load, so the link is replayed as an in app navigation
// and the existing flow takes it from there.

import { Capacitor } from '@capacitor/core'
import { App as CapApp } from '@capacitor/app'
import { StatusBar, Style } from '@capacitor/status-bar'
import { SplashScreen } from '@capacitor/splash-screen'
import { Sentry } from './sentry'
import { completeAuthCallback } from './oauth'

export type NativePlatform = 'ios' | 'android' | 'web'

export function isNative(): boolean {
  try {
    return Capacitor.isNativePlatform()
  } catch {
    return false
  }
}

export function nativePlatform(): NativePlatform {
  try {
    const p = Capacitor.getPlatform()
    return p === 'ios' || p === 'android' ? p : 'web'
  } catch {
    return 'web'
  }
}

export interface DeepLink {
  kind: 'join' | 'spectate'
  code: string
}

/** The join or spectate code carried by a gimme.gg link, or null. */
export function parseDeepLink(raw: string): DeepLink | null {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  const host = url.hostname.toLowerCase()
  if (host !== 'gimme.gg' && host !== 'www.gimme.gg' && host !== 'localhost') return null
  const join = url.searchParams.get('join')?.trim().toUpperCase()
  if (join && /^[A-Z0-9]{4,12}$/.test(join)) return { kind: 'join', code: join }
  const spectate = url.searchParams.get('spectate')?.trim().toUpperCase()
  if (spectate && /^[A-Z0-9]{4,12}$/.test(spectate)) return { kind: 'spectate', code: spectate }
  return null
}

/** Replays a deep link as the query the web app already understands. */
export function navigateToDeepLink(link: DeepLink): void {
  const target = `/?${link.kind}=${encodeURIComponent(link.code)}`
  window.location.href = target
}

let started = false

/** Called once from main.tsx. Safe to call on the web; it returns at once. */
export function initNative(): void {
  if (started || !isNative()) return
  started = true

  Sentry.setTag('app.shell', nativePlatform())

  StatusBar.setStyle({ style: Style.Dark }).catch(() => {})
  if (nativePlatform() === 'android') {
    StatusBar.setBackgroundColor({ color: '#16263B' }).catch(() => {})
  }

  // A URL reaching the app is one of two things: the system browser handing
  // back a Google or Apple sign in on gimme://auth/callback, or a tapped
  // gimme.gg link into a round.
  const handleUrl = async (url: string) => {
    if (await completeAuthCallback(url)) return
    const link = parseDeepLink(url)
    if (link) navigateToDeepLink(link)
  }

  // The app opened from a link while closed: Capacitor queues the URL for us.
  CapApp.getLaunchUrl()
    .then(launch => { if (launch?.url) void handleUrl(launch.url) })
    .catch(() => {})

  // The app opened from a link while already running.
  CapApp.addListener('appUrlOpen', ({ url }) => { void handleUrl(url) })

  // Let the first paint land before the splash goes, so there is no flash of
  // white between the navy launch screen and the navy app header.
  window.requestAnimationFrame(() => {
    setTimeout(() => { SplashScreen.hide().catch(() => {}) }, 150)
  })
}
