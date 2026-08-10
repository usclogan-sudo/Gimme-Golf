// Centralized, crash-proof sharing. Every card/image share goes through here — no
// component calls navigator.share directly (UX Build Spec v2.0 §2b). navigator.share
// rejects with NotAllowedError on desktop Chrome, Firefox, most in-app webviews, and
// whenever the user declines the OS prompt; letting that reject unhandled from an
// event handler is what white-screened the app. This never throws.

import { Sentry } from './sentry'

export type ShareResult = 'shared' | 'downloaded' | 'copied' | 'cancelled'

/**
 * Try the native share sheet, else download the PNG, else copy a fallback link.
 * Always resolves — never rejects — so callers can react to the outcome with a toast.
 */
export async function shareCard(
  blob: Blob,
  filename: string,
  fallbackUrl: string,
  text?: string,
): Promise<ShareResult> {
  const safeName = filename.replace(/[^a-z0-9-]/gi, '-').toLowerCase() + '.png'
  const file = new File([blob], safeName, { type: 'image/png' })

  // 1) Native share sheet, when the platform can share a file.
  if (typeof navigator !== 'undefined' && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], ...(text ? { text } : {}) })
      return 'shared'
    } catch (err) {
      // User dismissed the sheet — not an error, don't fall through to a download.
      if ((err as Error)?.name === 'AbortError') return 'cancelled'
      // NotAllowedError / anything else → fall through to download.
    }
  }

  // 2) Download the image.
  try {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = safeName
    a.click()
    URL.revokeObjectURL(url)
    return 'downloaded'
  } catch (err) {
    Sentry.captureException(err, { tags: { area: 'share', step: 'download' } })
  }

  // 3) Last resort: copy a link.
  try {
    await navigator.clipboard.writeText(fallbackUrl)
    return 'copied'
  } catch (err) {
    Sentry.captureException(err, { tags: { area: 'share', step: 'clipboard' } })
    return 'cancelled'
  }
}
