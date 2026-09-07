import { describe, it, expect, afterEach, vi } from 'vitest'
import { canonicalUrl, PROD_APP_URL } from './canonicalUrl'

function setLocation({ hostname, origin }) {
  Object.defineProperty(window, 'location', {
    value: { hostname, origin },
    writable: true,
    configurable: true,
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('canonicalUrl', () => {
  it('names the host actually serving the page', () => {
    setLocation({
      hostname: 'app.optioeducation.com',
      origin: 'https://app.optioeducation.com',
    })
    expect(canonicalUrl('/portfolio/emma')).toBe(
      'https://app.optioeducation.com/portfolio/emma'
    )
  })

  // The regression this file exists for: www 301s these paths to app, so a
  // canonical on www points at a redirect back to the page that declared it.
  it('never emits a www canonical from the app host', () => {
    setLocation({
      hostname: 'app.optioeducation.com',
      origin: 'https://app.optioeducation.com',
    })
    expect(canonicalUrl('/catalog')).not.toContain('www.optioeducation.com')
  })

  it('falls back to the prod app origin off-Optio hosts', () => {
    setLocation({ hostname: 'localhost', origin: 'http://localhost:3000' })
    expect(canonicalUrl('/portfolio/emma')).toBe(
      `${PROD_APP_URL}/portfolio/emma`
    )

    setLocation({
      hostname: 'optio-dev-frontend-r3v8.onrender.com',
      origin: 'https://optio-dev-frontend-r3v8.onrender.com',
    })
    expect(canonicalUrl('/catalog')).toBe(`${PROD_APP_URL}/catalog`)
  })

  it('keeps the sis host on itself rather than rewriting to app', () => {
    setLocation({
      hostname: 'sis.optioeducation.com',
      origin: 'https://sis.optioeducation.com',
    })
    expect(canonicalUrl('/catalog')).toBe('https://sis.optioeducation.com/catalog')
  })

  it('tolerates a missing leading slash', () => {
    setLocation({
      hostname: 'app.optioeducation.com',
      origin: 'https://app.optioeducation.com',
    })
    expect(canonicalUrl('catalog')).toBe('https://app.optioeducation.com/catalog')
  })
})
