import { describe, it, expect, beforeEach, vi } from 'vitest'

// initGa keeps module state (`initialized`), so every case loads a fresh copy.
async function loadWithHost(hostname) {
  vi.resetModules()
  Object.defineProperty(window, 'location', {
    value: { hostname, href: `https://${hostname}/` },
    writable: true,
    configurable: true,
  })
  window.dataLayer = undefined
  return import('./googleAnalytics')
}

const configCalls = () =>
  (window.dataLayer || []).filter((args) => args[0] === 'config')

describe('googleAnalytics host gate', () => {
  beforeEach(() => {
    document.head.innerHTML = ''
  })

  // The SPA has served from app.optioeducation.com since the 2026-09-01
  // cutover. For two weeks this gate still named only www, so no sign_up or
  // generate_lead from the app reached GA while the marketing site kept the
  // property looking healthy.
  it('fires on the app host', async () => {
    const { initGa } = await loadWithHost('app.optioeducation.com')
    initGa()
    expect(configCalls()).toHaveLength(1)
    expect(document.head.querySelector('script[src*="googletagmanager.com/gtag/js"]')).not.toBeNull()
  })

  it('still fires on www for any build served there', async () => {
    const { initGa } = await loadWithHost('www.optioeducation.com')
    initGa()
    expect(configCalls()).toHaveLength(1)
  })

  it('stays silent on the SIS console: staff, not acquisition', async () => {
    const { initGa } = await loadWithHost('sis.optioeducation.com')
    initGa()
    expect(window.dataLayer).toBeUndefined()
    expect(document.head.querySelector('script')).toBeNull()
  })

  it('stays silent on localhost and preview hosts', async () => {
    for (const host of ['localhost', 'optio-dev-frontend-r3v8.onrender.com']) {
      const { initGa, gaTrackEvent } = await loadWithHost(host)
      initGa()
      gaTrackEvent('sign_up', { method: 'email' })
      expect(window.dataLayer).toBeUndefined()
    }
  })

  it('denies ad storage before config on the app host (minors)', async () => {
    const { initGa } = await loadWithHost('app.optioeducation.com')
    initGa()
    const [consent] = window.dataLayer
    expect(consent[0]).toBe('consent')
    expect(consent[2]).toMatchObject({ ad_storage: 'denied', analytics_storage: 'granted' })
  })
})
