// A kill switch must fail open: anything short of an explicit "enabled: false"
// row leaves the capability on, so a broken read never locks players out. The
// notice banner is the one row where "enabled" means "show".

import { describe, it, expect, vi } from 'vitest'

vi.mock('../supabase', () => ({ supabase: {} }))

import {
  SWITCH_KEYS,
  defaultSwitches,
  parseSwitchRows,
  blockedMessage,
  noticeText,
  switchFromError,
} from '../switches'

describe('defaultSwitches', () => {
  it('turns every capability on and the notice off', () => {
    const s = defaultSwitches()
    for (const key of SWITCH_KEYS) {
      expect(s[key].enabled).toBe(key !== 'notice')
      expect(s[key].message).toBeNull()
    }
  })
})

describe('parseSwitchRows', () => {
  it('merges rows onto the defaults and ignores unknown keys and junk', () => {
    const s = parseSwitchRows([
      { key: 'scoring', enabled: false, message: '  Back at 3pm  ', updated_at: '2026-11-10T12:00:00Z' },
      { key: 'something_else', enabled: false },
      null,
      'nope',
    ])
    expect(s.scoring).toEqual({ key: 'scoring', enabled: false, message: 'Back at 3pm', updatedAt: '2026-11-10T12:00:00Z' })
    expect(s.new_rounds.enabled).toBe(true)
    expect(s.joining.enabled).toBe(true)
  })

  it('treats a missing or non boolean enabled as the default', () => {
    const s = parseSwitchRows([{ key: 'joining', enabled: 'false' }, { key: 'notice', message: 'hi' }])
    expect(s.joining.enabled).toBe(true)
    expect(s.notice.enabled).toBe(false)
  })

  it('returns the defaults for anything that is not an array', () => {
    expect(parseSwitchRows(null).scoring.enabled).toBe(true)
    expect(parseSwitchRows(undefined).new_rounds.enabled).toBe(true)
    expect(parseSwitchRows({ key: 'scoring', enabled: false }).scoring.enabled).toBe(true)
  })
})

describe('blockedMessage', () => {
  it('is null while the switch is on', () => {
    expect(blockedMessage(defaultSwitches(), 'new_rounds')).toBeNull()
  })

  it('uses the admin message when there is one, else the built in line', () => {
    const custom = parseSwitchRows([{ key: 'new_rounds', enabled: false, message: 'Course closed today.' }])
    expect(blockedMessage(custom, 'new_rounds')).toBe('Course closed today.')
    const plain = parseSwitchRows([{ key: 'settle_up', enabled: false, message: '' }])
    expect(blockedMessage(plain, 'settle_up')).toMatch(/Payment links are paused/)
  })
})

describe('noticeText', () => {
  it('shows only when on and non empty', () => {
    expect(noticeText(defaultSwitches())).toBeNull()
    expect(noticeText(parseSwitchRows([{ key: 'notice', enabled: true, message: '' }]))).toBeNull()
    expect(noticeText(parseSwitchRows([{ key: 'notice', enabled: false, message: 'Hidden' }]))).toBeNull()
    expect(noticeText(parseSwitchRows([{ key: 'notice', enabled: true, message: 'Rain delay' }]))).toBe('Rain delay')
  })
})

describe('switchFromError', () => {
  it('reads the key out of the database hint', () => {
    expect(switchFromError({ hint: 'feature_switch:scoring' })).toBe('scoring')
    expect(switchFromError({ hint: 'feature_switch:bogus' })).toBeNull()
    expect(switchFromError({ hint: null })).toBeNull()
    expect(switchFromError(undefined)).toBeNull()
  })
})
