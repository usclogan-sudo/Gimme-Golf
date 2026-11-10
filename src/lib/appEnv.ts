/**
 * Which environment this build is for. Set at build time through VITE_APP_ENV.
 *
 *   production  gimme.gg. The default when the variable is unset or unknown, so
 *               a misconfigured build can never show staging chrome to players.
 *   staging     the staging Vercel project pointed at the staging database.
 *   local       npm run dev against a local stack or staging.
 */
export type AppEnv = 'production' | 'staging' | 'local'

export function parseAppEnv(raw: unknown): AppEnv {
  const v = typeof raw === 'string' ? raw.trim().toLowerCase() : ''
  return v === 'staging' || v === 'local' ? v : 'production'
}

export function appEnv(): AppEnv {
  return parseAppEnv(import.meta.env.VITE_APP_ENV)
}

/** The brass Staging ribbon shows on staging only. Local runs stay clean. */
export function showStagingRibbon(env: AppEnv): boolean {
  return env === 'staging'
}

/** The ?preview=result-card QA harness bypasses auth, so production never serves it. */
export function previewHarnessAllowed(env: AppEnv): boolean {
  return env === 'staging' || env === 'local'
}
