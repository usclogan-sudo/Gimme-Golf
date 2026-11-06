import { StrictMode, lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { initSentry, Sentry } from './lib/sentry'
import { passwordRecoveryInProgress } from './lib/supabase'
import { reloadHeld, markUpdatePending } from './lib/swUpdate'
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
// Reachable at /?preview=result-card. Removing the query param returns to the app.
const previewParam = new URLSearchParams(window.location.search).get('preview')
const PreviewComponent =
  previewParam === 'result-card'
    ? lazy(() => import('./components/ResultCard/ResultCardPreview').then(m => ({ default: m.ResultCardPreview })))
    : null

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Sentry.ErrorBoundary fallback={() => <RecoveryScreen />}>
      {PreviewComponent ? (
        <Suspense fallback={<div style={{ minHeight: '100vh', background: '#16263B' }} />}>
          <PreviewComponent />
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

    // When the new SW takes control, reload to get fresh assets — except during a
    // password reset, or while a screen is holding the reload (a setup wizard in
    // progress, a scorecard with unsaved taps; see lib/swUpdate.ts). The password
    // flow depends on a URL hash that exists for exactly one page load, so reloading
    // through it throws the user back to the home screen with no way to finish. A
    // wizard reload is the same loss in a different coat: on 6 November two Create
    // Event attempts went to the spinner and came back reset. Held reloads are
    // parked behind an "Update ready" line the user taps when they are ready.
    let refreshing = false
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return
      if (passwordRecoveryInProgress() || reloadHeld()) {
        markUpdatePending()
        return
      }
      refreshing = true
      window.location.reload()
    })
  })

  // Safety net for a deferred update: the old page may still lazy-load a chunk
  // whose hashed file the new deploy no longer serves. Vite raises this event when
  // that import fails; reloading is the only thing that fixes it.
  window.addEventListener('vite:preloadError', (event) => {
    event.preventDefault()
    window.location.reload()
  })
}
