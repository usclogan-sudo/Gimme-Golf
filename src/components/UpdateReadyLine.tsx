import { useUpdatePending, applyUpdate } from '../lib/swUpdate'
import { isNative } from '../lib/native'

/**
 * A one-line, non-blocking notice that a new build is ready. Shown only when the
 * service worker took control while a screen was holding the automatic reload
 * (see swUpdate.ts). Tapping applies the reload; the user picks the moment.
 */
export function UpdateReadyLine() {
  const pending = useUpdatePending()
  // The store build has no service worker; updates come through the store.
  if (!pending || isNative()) return null
  return (
    <button
      type="button"
      onClick={applyUpdate}
      className="fixed top-0 inset-x-0 z-50 h-7 flex items-center justify-center gap-2 bg-brass text-navy text-xs font-semibold tracking-wide active:opacity-90"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      aria-live="polite"
    >
      Update ready <span className="font-normal">· tap to refresh when you&apos;re at a good stopping point</span>
    </button>
  )
}
