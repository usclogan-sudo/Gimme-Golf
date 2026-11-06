// Service worker update coordination.
//
// A new deploy installs a fresh service worker, which takes control and (in
// main.tsx) reloads the page so the new assets are picked up. Mid-wizard that
// reload is a reset: on 6 November two Create Event attempts, both inside the half
// hour after a deploy, went to the loading spinner and came back on the first
// screen with everything lost. Screens that would lose work hold the reload here;
// when an update arrives during a hold, it is parked and the user applies it from
// a small "Update ready" line when they choose.

import { useSyncExternalStore } from 'react'

const holds = new Map<string, number>()
let pending = false
const listeners = new Set<() => void>()

function emit() {
  for (const l of listeners) l()
}

/** Hold the automatic reload. Returns the release function; call it on unmount. */
export function holdReload(reason: string): () => void {
  holds.set(reason, (holds.get(reason) ?? 0) + 1)
  let released = false
  return () => {
    if (released) return
    released = true
    const n = (holds.get(reason) ?? 1) - 1
    if (n <= 0) holds.delete(reason)
    else holds.set(reason, n)
  }
}

export function reloadHeld(): boolean {
  return holds.size > 0
}

/** An update took control while the reload was held; show the line. */
export function markUpdatePending(): void {
  if (pending) return
  pending = true
  emit()
}

export function isUpdatePending(): boolean {
  return pending
}

export function applyUpdate(): void {
  window.location.reload()
}

function subscribe(l: () => void): () => void {
  listeners.add(l)
  return () => { listeners.delete(l) }
}

export function useUpdatePending(): boolean {
  return useSyncExternalStore(subscribe, isUpdatePending, () => false)
}

/** Test hook: clear holds and the pending flag. */
export function _resetSwUpdateForTests(): void {
  holds.clear()
  pending = false
  listeners.clear()
}
