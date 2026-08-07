// Web Push client helpers (groundwork). None of this runs while WEB_PUSH_ENABLED is
// false — usePushRegistration guards every entry point. Kept isolated so the future
// turn-on phase only has to set VITE_VAPID_PUBLIC_KEY and flip the flag.

import { v4 as uuidv4 } from 'uuid'
import { supabase, pushDeviceSubscriptionToRow } from './supabase'
import type { PushDeviceSubscription } from '../types'

/** Public VAPID key, base64url. Empty until the turn-on phase configures it. */
export const VAPID_PUBLIC_KEY = (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined) ?? ''

/** True only where the browser can actually do Web Push. */
export function pushSupported(): boolean {
  return typeof window !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window
}

/** VAPID keys are transmitted base64url; the subscribe call needs a Uint8Array. */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const output = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i)
  return output
}

/**
 * Ask permission, subscribe via the active service worker, and upsert the row into
 * push_subscriptions. Returns the stored subscription, or null if permission was
 * denied / the environment can't subscribe. Callers must gate on WEB_PUSH_ENABLED.
 */
export async function subscribeToPush(userId: string): Promise<PushDeviceSubscription | null> {
  if (!pushSupported() || !VAPID_PUBLIC_KEY) return null

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return null

  const registration = await navigator.serviceWorker.ready
  const existing = await registration.pushManager.getSubscription()
  const sub = existing ?? await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
  })

  const json = sub.toJSON()
  const row: PushDeviceSubscription = {
    id: uuidv4(),
    userId,
    platform: 'web',
    endpoint: sub.endpoint,
    p256dh: json.keys?.p256dh,
    auth: json.keys?.auth,
    userAgent: navigator.userAgent,
    createdAt: new Date(),
    lastSeenAt: new Date(),
  }

  // One row per (user, endpoint): upsert so a re-subscribe refreshes rather than dupes.
  await supabase.from('push_subscriptions').upsert(
    pushDeviceSubscriptionToRow(row),
    { onConflict: 'user_id,endpoint' },
  )
  return row
}

/** Unsubscribe locally and drop the stored row. */
export async function unsubscribeFromPush(userId: string): Promise<void> {
  if (!pushSupported()) return
  const registration = await navigator.serviceWorker.ready
  const sub = await registration.pushManager.getSubscription()
  if (!sub) return
  await sub.unsubscribe()
  await supabase.from('push_subscriptions').delete()
    .eq('user_id', userId)
    .eq('endpoint', sub.endpoint)
}
