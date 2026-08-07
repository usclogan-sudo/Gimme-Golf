import { useCallback, useEffect, useState } from 'react'
import { WEB_PUSH_ENABLED } from '../lib/featureFlags'
import { pushSupported, subscribeToPush, unsubscribeFromPush, VAPID_PUBLIC_KEY } from '../lib/push'

type PushStatus = 'unsupported' | 'disabled' | 'default' | 'granted' | 'denied'

/**
 * Web Push registration (groundwork). While WEB_PUSH_ENABLED is false this is a
 * no-op: `status` reports 'disabled' and subscribe/unsubscribe do nothing, so the
 * app never prompts for permission. Once the flag is on (and VITE_VAPID_PUBLIC_KEY
 * is set + the Edge sender is deployed), a Settings toggle can call `subscribe()`.
 */
export function usePushRegistration(userId: string | null) {
  const enabled = WEB_PUSH_ENABLED && !!VAPID_PUBLIC_KEY && pushSupported()
  const [status, setStatus] = useState<PushStatus>(() => {
    if (!WEB_PUSH_ENABLED) return 'disabled'
    if (!pushSupported()) return 'unsupported'
    return Notification.permission as PushStatus
  })
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!enabled) return
    setStatus(Notification.permission as PushStatus)
  }, [enabled])

  const subscribe = useCallback(async () => {
    if (!enabled || !userId) return false
    setBusy(true)
    try {
      const sub = await subscribeToPush(userId)
      setStatus(Notification.permission as PushStatus)
      return !!sub
    } finally {
      setBusy(false)
    }
  }, [enabled, userId])

  const unsubscribe = useCallback(async () => {
    if (!userId || !pushSupported()) return
    setBusy(true)
    try {
      await unsubscribeFromPush(userId)
      setStatus(Notification.permission as PushStatus)
    } finally {
      setBusy(false)
    }
  }, [userId])

  return { enabled, status, busy, subscribe, unsubscribe }
}
