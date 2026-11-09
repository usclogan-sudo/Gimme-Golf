// The environment switch has one job: production is the default whenever the
// variable is missing or wrong, so no misbuild can show staging chrome or open
// the auth free QA harness to players.

import { describe, it, expect } from 'vitest'
import { parseAppEnv, showStagingRibbon, previewHarnessAllowed } from '../appEnv'

describe('parseAppEnv', () => {
  it('reads staging and local, trimming and ignoring case', () => {
    expect(parseAppEnv('staging')).toBe('staging')
    expect(parseAppEnv(' Staging ')).toBe('staging')
    expect(parseAppEnv('LOCAL')).toBe('local')
  })

  it('falls back to production for anything else', () => {
    expect(parseAppEnv(undefined)).toBe('production')
    expect(parseAppEnv('')).toBe('production')
    expect(parseAppEnv('prod')).toBe('production')
    expect(parseAppEnv('production')).toBe('production')
    expect(parseAppEnv(42)).toBe('production')
  })
})

describe('showStagingRibbon', () => {
  it('shows on staging only', () => {
    expect(showStagingRibbon('staging')).toBe(true)
    expect(showStagingRibbon('local')).toBe(false)
    expect(showStagingRibbon('production')).toBe(false)
  })
})

describe('previewHarnessAllowed', () => {
  it('opens the harness on staging and local, never production', () => {
    expect(previewHarnessAllowed('staging')).toBe(true)
    expect(previewHarnessAllowed('local')).toBe(true)
    expect(previewHarnessAllowed('production')).toBe(false)
  })

  it('an unset variable means production, so the harness stays closed', () => {
    expect(previewHarnessAllowed(parseAppEnv(undefined))).toBe(false)
  })
})
