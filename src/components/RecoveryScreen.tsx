// Branded fallback shown when the app tree throws (UX Build Spec v2.0 §2a). No stack
// trace, no apology — states what happened and what to do, in brand voice, on the
// navy/cream/brass palette. Uses inline colors (not tokens) so it renders even if a
// stylesheet is what failed to load.

const NAVY = '#16263B'
const CREAM = '#F2ECDD'
const CREAM_DIM = '#D9D2C2'
const BRASS = '#C2A24C'

export function RecoveryScreen({ onRetry }: { onRetry?: () => void }) {
  const reload = () => window.location.reload()
  const home = () => {
    // Drop any deep-link params and go back to the app root.
    window.location.href = window.location.origin + window.location.pathname
  }
  return (
    <div
      style={{
        minHeight: '100vh',
        background: NAVY,
        color: CREAM,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        fontFamily: 'Inter, system-ui, sans-serif',
        textAlign: 'center',
      }}
    >
      <div style={{ maxWidth: 360, width: '100%' }}>
        <div
          style={{
            fontFamily: '"Playfair Display", Georgia, serif',
            fontSize: 30,
            lineHeight: 1.1,
            marginBottom: 12,
          }}
        >
          Something didn't load.
        </div>
        <p style={{ color: CREAM_DIM, fontSize: 15, lineHeight: 1.5, marginBottom: 28 }}>
          Your round is saved. Reload and pick up where you left off.
        </p>
        <button
          onClick={onRetry ?? reload}
          style={{
            width: '100%',
            height: 52,
            background: CREAM,
            color: NAVY,
            fontWeight: 700,
            border: 'none',
            borderRadius: 14,
            fontSize: 16,
            cursor: 'pointer',
            marginBottom: 12,
          }}
        >
          Reload
        </button>
        <button
          onClick={home}
          style={{
            width: '100%',
            height: 48,
            background: 'transparent',
            color: BRASS,
            fontWeight: 600,
            border: `1px solid rgba(242,236,221,0.20)`,
            borderRadius: 14,
            fontSize: 15,
            cursor: 'pointer',
          }}
        >
          Back to rounds
        </button>
      </div>
    </div>
  )
}
