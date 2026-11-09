// @vitest-environment happy-dom
//
// A tab left open across a deploy asks for a chunk the new build no longer
// serves. main.tsx reloads on vite:preloadError, and with preventDefault set the
// import resolves to undefined. The screen wrapper must keep Suspense on its
// fallback rather than throw into the route boundary.

import { describe, it, expect, vi } from 'vitest'
import { Suspense } from 'react'
import { render, screen, act } from '@testing-library/react'
import { lazyScreen } from '../lazyScreen'

function Hello() {
  return <p>hello</p>
}

const tick = () => act(() => new Promise<void>(r => setTimeout(r, 0)))

describe('lazyScreen', () => {
  it('renders the picked export once the module arrives', async () => {
    const Screen = lazyScreen(() => Promise.resolve({ Hello }), m => m.Hello)
    render(<Suspense fallback={<p>loading</p>}><Screen /></Suspense>)
    expect(screen.getByText('loading')).toBeDefined()
    await tick()
    expect(screen.getByText('hello')).toBeDefined()
  })

  it('stays on the fallback and throws nothing when the import resolves to undefined', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const Screen = lazyScreen(
      () => Promise.resolve(undefined as unknown as { Hello: typeof Hello }),
      m => m.Hello,
    )
    render(<Suspense fallback={<p>loading</p>}><Screen /></Suspense>)
    await tick()
    await tick()
    expect(screen.getByText('loading')).toBeDefined()
    expect(screen.queryByText('hello')).toBeNull()
    expect(consoleError).not.toHaveBeenCalled()
    consoleError.mockRestore()
  })
})
