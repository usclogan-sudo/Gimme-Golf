import { StrictMode, lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { initSentry, Sentry } from './lib/sentry'
import './index.css'
import App from './App.tsx'
import { RecoveryScreen } from './components/RecoveryScreen'

initSentry()

// Error boundaries don't catch promise rejections thrown from event handlers — which
// is exactly what white-screened the app when navigator.share was denied. Log those
// and suppress them so a failed share (or any stray async reject) can never take the
// UI down. (UX Build Spec v2.0 §2a)
window.addEventListener('unhandledrejection', (event) => {
  Sentry.captureException(event.reason, { tags: { area: 'unhandled-rejection' } })
  event.preventDefault()
})

// Brand QA preview — bypasses auth and renders the result-card scenarios.
// Reachable at /golf-tracker/?preview=share-card. Removing the query param returns to the app.
const previewParam = new URLSearchParams(window.location.search).get('preview')
const ShareCardPreview = previewParam === 'share-card'
  ? lazy(() => import('./components/ShareCard/ShareCardPreview').then(m => ({ default: m.ShareCardPreview })))
  : null

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Sentry.ErrorBoundary fallback={() => <RecoveryScreen />}>
      {ShareCardPreview ? (
        <Suspense fallback={<div style={{ minHeight: '100vh', background: '#16263B' }} />}>
          <ShareCardPreview />
        </Suspense>
      ) : (
        <App />
      )}
    </Sentry.ErrorBoundary>
  </StrictMode>,
)

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then((reg) => {
      // Check for updates every 5 minutes
      setInterval(() => reg.update().catch(() => {}), 5 * 60 * 1000)

      // When a new SW is found and finishes installing, tell it to activate immediately
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing
        if (!newWorker) return
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            // New SW is ready — tell it to take over
            newWorker.postMessage('SKIP_WAITING')
          }
        })
      })
    }).catch(() => {})

    // When the new SW takes control, reload to get fresh assets
    let refreshing = false
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return
      refreshing = true
      window.location.reload()
    })
  })
}
