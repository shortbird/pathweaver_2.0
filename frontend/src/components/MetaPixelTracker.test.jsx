import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const { trackPageView, trackEvent } = vi.hoisted(() => ({
  trackPageView: vi.fn(),
  trackEvent: vi.fn(),
}))
vi.mock('../utils/metaPixel', () => ({ trackPageView, trackEvent }))

const { useAuth } = vi.hoisted(() => ({ useAuth: vi.fn() }))
vi.mock('../contexts/AuthContext', () => ({ useAuth }))

import MetaPixelTracker from './MetaPixelTracker'

const renderAt = (pathname) => render(
  <MemoryRouter initialEntries={[pathname]}>
    <MetaPixelTracker />
  </MemoryRouter>
)

beforeEach(() => {
  vi.clearAllMocks()
  useAuth.mockReturnValue({ isAuthenticated: false, loading: false })
  window.__optioLoadMetaPixel = vi.fn(() => false)
})

describe('MetaPixelTracker', () => {
  it('tracks an anonymous view of a marketing page', () => {
    renderAt('/poe')
    expect(trackPageView).toHaveBeenCalled()
    expect(trackEvent).toHaveBeenCalledWith('ViewContent', { content_name: 'Pipe Organ Encounter' })
  })

  // A PageView sends the full document location. On /poe/showcase that URL
  // carries the access key, and the page itself is minors' schoolwork — so the
  // pixel must not load at all, not merely skip the ViewContent event.
  it('never loads the pixel on the key-gated POE showcase', () => {
    renderAt('/poe/showcase?key=s3cret')
    expect(window.__optioLoadMetaPixel).not.toHaveBeenCalled()
    expect(trackPageView).not.toHaveBeenCalled()
    expect(trackEvent).not.toHaveBeenCalled()
  })

  it('still never tracks signed-in browsing', () => {
    useAuth.mockReturnValue({ isAuthenticated: true, loading: false })
    renderAt('/poe')
    expect(trackPageView).not.toHaveBeenCalled()
  })
})
