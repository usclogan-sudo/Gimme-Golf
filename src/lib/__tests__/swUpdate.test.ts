import { describe, it, expect, beforeEach } from 'vitest'
import { holdReload, reloadHeld, markUpdatePending, isUpdatePending, _resetSwUpdateForTests } from '../swUpdate'

describe('swUpdate', () => {
  beforeEach(() => _resetSwUpdateForTests())

  it('is not held by default', () => {
    expect(reloadHeld()).toBe(false)
  })

  it('holds while any screen holds, and releases when the last release is called', () => {
    const releaseA = holdReload('event-setup')
    const releaseB = holdReload('scorecard')
    expect(reloadHeld()).toBe(true)
    releaseA()
    expect(reloadHeld()).toBe(true)
    releaseB()
    expect(reloadHeld()).toBe(false)
  })

  it('counts repeated holds for the same reason and ignores a double release', () => {
    const r1 = holdReload('scorecard')
    const r2 = holdReload('scorecard')
    r1()
    r1()
    expect(reloadHeld()).toBe(true)
    r2()
    expect(reloadHeld()).toBe(false)
  })

  it('parks an update until the user applies it', () => {
    expect(isUpdatePending()).toBe(false)
    markUpdatePending()
    expect(isUpdatePending()).toBe(true)
  })
})
