// Screen heartbeat: the trail a hung or killed tab leaves behind.
//
// On 6 November a Create Event tab stopped responding with nothing in Sentry.
// Breadcrumbs only leave the browser attached to a captured error, and a hang
// throws nothing, so the tab died silently. This writes the current screen and a
// timestamp to localStorage once a second while a screen that would lose work is
// mounted. A normal exit (navigating away in the app, or the page's pagehide)
// clears or marks the record clean. On the next launch an unclean record becomes
// one Sentry event naming the screen and how long it had been alive.

import { useEffect } from 'react'
import { Sentry } from './sentry'

export const HEARTBEAT_KEY = 'gimme_heartbeat'
const INTERVAL_MS = 1000

export interface HeartbeatRecord {
  screen: string
  startedAt: number
  lastBeatAt: number
  /** Set by pagehide: the page left normally. */
  clean?: boolean
}

let timer: ReturnType<typeof setInterval> | null = null
let current: { screen: string; startedAt: number } | null = null
let pagehideBound = false

function read(): HeartbeatRecord | null {
  try {
    const raw = localStorage.getItem(HEARTBEAT_KEY)
    return raw ? (JSON.parse(raw) as HeartbeatRecord) : null
  } catch {
    return null
  }
}

function write(record: HeartbeatRecord | null): void {
  try {
    if (record) localStorage.setItem(HEARTBEAT_KEY, JSON.stringify(record))
    else localStorage.removeItem(HEARTBEAT_KEY)
  } catch {
    // Storage full or blocked: diagnostics never break the app.
  }
}

function beat(): void {
  if (!current) return
  write({ screen: current.screen, startedAt: current.startedAt, lastBeatAt: Date.now() })
}

function onPageHide(): void {
  const record = read()
  if (record) write({ ...record, clean: true })
}

/** Start (or re-target) the heartbeat for `screen`. */
export function startHeartbeat(screen: string): void {
  if (typeof window === 'undefined') return
  if (!pagehideBound) {
    window.addEventListener('pagehide', onPageHide)
    pagehideBound = true
  }
  if (current?.screen === screen) return
  current = { screen, startedAt: Date.now() }
  beat()
  if (timer === null) timer = setInterval(beat, INTERVAL_MS)
}

/** Stop the heartbeat and clear the record: the screen was left normally. */
export function stopHeartbeat(): void {
  if (timer !== null) { clearInterval(timer); timer = null }
  current = null
  write(null)
}

/** The record a previous page load left behind, if any. Does not clear it. */
export function readHeartbeat(): HeartbeatRecord | null {
  return read()
}

/**
 * Call once at launch, before any screen starts its own heartbeat. An unclean
 * record from the previous page load becomes one Sentry event; the record is
 * cleared either way. Returns the record that was reported, or null.
 */
export function reportUncleanExit(): HeartbeatRecord | null {
  const record = read()
  write(null)
  if (!record || record.clean) return null
  const secondsAlive = Math.max(0, Math.round((record.lastBeatAt - record.startedAt) / 1000))
  const secondsAgo = Math.max(0, Math.round((Date.now() - record.lastBeatAt) / 1000))
  Sentry.captureMessage(`tab died on ${record.screen}`, {
    level: 'warning',
    tags: { area: 'heartbeat', screen: record.screen },
    extra: { secondsAlive, secondsSinceLastBeat: secondsAgo, lastBeatAt: new Date(record.lastBeatAt).toISOString() },
  })
  return record
}

/** Keep a heartbeat going while `screen` is non-null. */
export function useHeartbeat(screen: string | null): void {
  useEffect(() => {
    if (!screen) return
    startHeartbeat(screen)
    return () => { stopHeartbeat() }
  }, [screen])
}

/** Test hook. */
export function _resetHeartbeatForTests(): void {
  if (timer !== null) { clearInterval(timer); timer = null }
  current = null
  if (pagehideBound && typeof window !== 'undefined') {
    window.removeEventListener('pagehide', onPageHide)
    pagehideBound = false
  }
  write(null)
}
