import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * The CSP in index.html is what actually decides whether error reporting works.
 *
 * Between 2026-06-12 and 2026-08-31 Sentry was wired correctly in every other
 * respect -- SDK bundled, DSN valid and active, initSentry() called from
 * main.jsx -- but its ingest host was missing from connect-src, so the browser
 * refused every envelope. Sentry received 0 events from the web app for 2.5
 * months and nothing failed loudly; the only symptom was a console message on
 * a page nobody was reading.
 *
 * A host in script-src is NOT enough: connect-src governs fetch/XHR/beacon,
 * which is how every SDK ships its payload.
 */
const html = readFileSync(resolve(__dirname, '../../index.html'), 'utf8')

const connectSrc = (() => {
  const csp = html.match(/http-equiv="Content-Security-Policy"\s+content="([\s\S]*?)"\s*>/)
  if (!csp) throw new Error('No Content-Security-Policy meta tag found in index.html')
  const directive = csp[1].split(';').map(s => s.trim()).find(d => d.startsWith('connect-src'))
  if (!directive) throw new Error('CSP has no connect-src directive')
  return directive
})()

describe('index.html CSP allows the telemetry we actually ship', () => {
  it('permits Sentry ingest, or every error report is blocked in the browser', () => {
    expect(connectSrc).toMatch(/ingest\.us\.sentry\.io/)
  })

  it('permits PostHog, which carries analytics and session replay', () => {
    expect(connectSrc).toContain('https://us.i.posthog.com')
  })

  it('permits the production API origin', () => {
    expect(connectSrc).toContain('https://api.optioeducation.com')
  })
})
