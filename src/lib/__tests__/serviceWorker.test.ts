// public/sw.js is plain script, not a module, so these tests read its source
// and check the two things that silently rotted after the move off GitHub
// Pages: the hashed asset pattern must match Vite's real file names, and the
// shell URLs must be root paths.

import { describe, it, expect } from 'vitest'
import source from '../../../public/sw.js?raw'

function hashedAssetPattern(): RegExp {
  const m = source.match(/const isHashedAsset = (\/.+\/)\.test\(url\.pathname\)/)
  if (!m) throw new Error('isHashedAsset pattern not found in sw.js')
  const body = m[1].slice(1, -1)
  return new RegExp(body)
}

describe('service worker', () => {
  it('treats Vite hashed chunks as immutable assets', () => {
    const re = hashedAssetPattern()
    expect(re.test('/assets/index-B67ftZRr.js')).toBe(true)
    expect(re.test('/assets/EventSetup-qX1FojdK.js')).toBe(true)
    expect(re.test('/assets/index-DNPTRpJJ.css')).toBe(true)
    expect(re.test('/assets/share-BwN_NiY-.js')).toBe(true)
  })

  it('leaves the shell, the worker itself and API calls to the network-first path', () => {
    const re = hashedAssetPattern()
    expect(re.test('/')).toBe(false)
    expect(re.test('/index.html')).toBe(false)
    expect(re.test('/sw.js')).toBe(false)
    expect(re.test('/manifest.json')).toBe(false)
    expect(re.test('/icon-192.png')).toBe(false)
  })

  it('precaches root paths, not the retired GitHub Pages subpath', () => {
    expect(source).not.toContain('/golf-tracker/')
    expect(source).toContain("'/offline.html'")
  })
})
