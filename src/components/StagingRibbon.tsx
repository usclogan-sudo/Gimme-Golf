import { appEnv, showStagingRibbon, type AppEnv } from '../lib/appEnv'

/**
 * A thin brass line across the top of every screen on staging, so nobody
 * mistakes a staging session for the real thing. Renders nothing elsewhere.
 * Sits in normal flow above the app so it pushes content down rather than
 * covering a header.
 */
export function StagingRibbon({ env = appEnv() }: { env?: AppEnv }) {
  if (!showStagingRibbon(env)) return null
  return (
    <div
      role="status"
      aria-label="Staging environment"
      data-testid="staging-ribbon"
      style={{
        background: '#C2A24C',
        color: '#16263B',
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        textAlign: 'center',
        lineHeight: '18px',
        height: 18,
      }}
    >
      Staging
    </div>
  )
}
