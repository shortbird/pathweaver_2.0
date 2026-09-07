import { describe, it, expect, afterEach, vi } from 'vitest'
import { marketingUrl, PROD_MARKETING_URL } from './marketingUrl'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('marketingUrl', () => {
  // The regression this guards: with a relative default, /schools is not a
  // route on app.optioeducation.com, so the link fell through the router to
  // NotFoundRedirect and anonymous visitors were sent to `/` instead of the
  // real Schools page on the marketing site.
  it('is absolute by default, so links leave the app host', () => {
    expect(marketingUrl('/schools')).toBe(`${PROD_MARKETING_URL}/schools`)
    expect(marketingUrl('/schools')).toMatch(/^https:\/\/www\.optioeducation\.com/)
  })

  it('keeps the fragment intact', () => {
    expect(marketingUrl('/academy#free-class')).toBe(
      `${PROD_MARKETING_URL}/academy#free-class`
    )
  })

  it('honours VITE_MARKETING_URL for a local astro dev server', () => {
    vi.stubEnv('VITE_MARKETING_URL', 'http://localhost:4321')
    expect(marketingUrl('/academy')).toBe('http://localhost:4321/academy')
  })

  it('never returns a bare relative path', () => {
    for (const p of ['/schools', '/academy', '/academy#how-it-works']) {
      expect(marketingUrl(p).startsWith('http')).toBe(true)
    }
  })
})
