import { describe, it, expect } from 'vitest'
import { isPublicPath } from './publicPaths'

/**
 * A signed-out visitor on any of these must not be sent to /login when the
 * app-load session check fails. Each line here is a link handed to people with
 * no session; /offer/<slug> and /student/welcome were missing on 2026-09-30,
 * and opening Raleigh's class link in a private window landed on the login
 * screen.
 */
describe('isPublicPath', () => {
  it.each([
    '/offer/latticework',
    '/start-school/abc123',
    '/student/welcome',
    '/staff/welcome',
    '/enroll/abc123',
    '/invitation/xyz',
    '/poe/showcase',
    '/login/arete',
    '/kiosk',
    '/',
  ])('%s stays put', (path) => {
    expect(isPublicPath(path)).toBe(true)
  })

  it.each(['/dashboard', '/my-classes', '/organization', '/admin/billing', '/offer'])(
    '%s goes to login', (path) => {
      expect(isPublicPath(path)).toBe(false)
    })
})
