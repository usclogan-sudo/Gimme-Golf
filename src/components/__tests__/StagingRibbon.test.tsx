// @vitest-environment happy-dom

import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StagingRibbon } from '../StagingRibbon'

afterEach(() => vi.unstubAllEnvs())

describe('StagingRibbon', () => {
  it('renders a brass Staging line on staging', () => {
    render(<StagingRibbon env="staging" />)
    const ribbon = screen.getByTestId('staging-ribbon')
    expect(ribbon.textContent).toBe('Staging')
    expect(ribbon.getAttribute('aria-label')).toBe('Staging environment')
    expect(ribbon.style.background.toLowerCase()).toContain('c2a24c')
  })

  it('renders nothing on production or local', () => {
    const { container, rerender } = render(<StagingRibbon env="production" />)
    expect(container.innerHTML).toBe('')
    rerender(<StagingRibbon env="local" />)
    expect(container.innerHTML).toBe('')
  })

  it('reads VITE_APP_ENV when no env prop is given', () => {
    vi.stubEnv('VITE_APP_ENV', 'staging')
    const { unmount } = render(<StagingRibbon />)
    expect(screen.getByTestId('staging-ribbon')).toBeDefined()
    unmount()

    vi.stubEnv('VITE_APP_ENV', '')
    const { container } = render(<StagingRibbon />)
    expect(container.innerHTML).toBe('')
  })
})
