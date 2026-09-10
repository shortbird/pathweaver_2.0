import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

import { NAV_SECTIONS } from '../components/sis/SisSidebar'

// The badge polls two unread endpoints through react-query; these tests render
// the sidebar without a QueryClientProvider and only care about the nav items.
vi.mock('../../components/sis/InboxUnreadBadge', () => ({ default: () => null }))

/**
 * The sidebar's `adminOnly` flag and SisRoutes' `AdminRoute` wrapper are two
 * halves of one decision, and only the sidebar half was ever enforced.
 *
 * A page marked adminOnly is not OFFERED to a teacher, so the gap is invisible
 * in normal use — until a bookmark, an old notification link, or a typed URL
 * mounts it anyway. Then the page renders in full and its staff-admin fetches
 * 403 one after another: a blank screen for the teacher, and a burst of Sentry
 * errors that reads like an outage (OPTIO-WEB-10/X/Y/Z on /tasks, then
 * OPTIO-WEB-K on /curriculum, where the page let a teacher fill in the whole
 * curriculum form before the Save 403'd).
 *
 * /tasks was guarded when the first of those was fixed; the other eight
 * adminOnly paths were not, because nothing tied the lists together. This test
 * is that tie. Read the route file as text on purpose — rendering the router
 * would need every lazy page, an auth provider and an org provider, and would
 * still only prove the paths the test happened to visit.
 */

const ROUTES_SRC = fs.readFileSync(
  path.join(__dirname, 'SisRoutes.jsx'), 'utf8'
)

const adminOnlyPaths = () => NAV_SECTIONS
  .flatMap((section) => section.items || [])
  .filter((item) => item.adminOnly)
  .map((item) => item.path)

// The line registering `<Route path="people" ...>`, whatever it is wrapped in.
const routeLineFor = (navPath) => {
  const name = navPath.replace(/^\//, '')
  const line = ROUTES_SRC
    .split('\n')
    .find((l) => l.includes(`<Route path="${name}"`))
  return line
}

// Guards that are equal to or stricter than AdminRoute. canSeeFinance and
// canSeeHr are both `isSisAdmin && !isCampusCoordinator`, so a page behind
// either is already closed to everyone AdminRoute would turn away.
const ADMIN_OR_STRICTER = ['AdminRoute', 'FinanceRoute', 'HrRoute']

describe('SIS admin route guards', () => {
  it('marks at least the known front-office pages adminOnly', () => {
    // Guards against the inverse failure: a nav entry losing `adminOnly` would
    // otherwise make this whole suite pass by having nothing to check.
    expect(adminOnlyPaths()).toEqual(expect.arrayContaining([
      '/people', '/classes', '/curriculum', '/tasks', '/settings',
    ]))
  })

  it.each(adminOnlyPaths())('%s is registered behind an admin-tier guard', (navPath) => {
    const line = routeLineFor(navPath)
    expect(line, `no <Route path="${navPath.slice(1)}"> in SisRoutes.jsx`).toBeDefined()
    expect(
      ADMIN_OR_STRICTER.some((guard) => line.includes(`<${guard}>`)),
      `${navPath} is adminOnly in the sidebar but its route is not wrapped in `
      + `one of ${ADMIN_OR_STRICTER.join(', ')}. A teacher who reaches it by `
      + `bookmark or typed URL gets a page whose API calls all 403.`
    ).toBe(true)
  })
})
