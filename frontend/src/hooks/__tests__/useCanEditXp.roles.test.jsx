/**
 * Guard: the client's XP_GUIDE_ROLES matches the server's.
 *
 * `lock_xp_editing` is an org toggle, and when it is on only certain roles may
 * set a task's XP. The server decides (backend/utils/xp_permissions.py); the
 * client list exists purely so a locked org never renders a control whose save
 * would be refused. Two lists, one rule — so they have to be the same list.
 *
 * They were not. The web hook delegated to `isStaffUser`, which is WIDER than
 * the server's set: it also returns true for `campus_coordinator` and for any
 * user carrying `has_advisor_assignments`. That came in with 70adf776, which
 * chose isStaffUser because it "additionally covers guardians marked
 * has_advisor_assignments" — a bonus never added to the server. The result was
 * a control offered to people the API turns away.
 *
 * It stayed invisible because only one org has the flag on and it has no
 * campus coordinators. So this test reads the server's constant rather than
 * trusting either list.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

import { XP_GUIDE_ROLES } from '../useCanEditXp'

const XP_PERMISSIONS = join(__dirname, '..', '..', '..', '..', 'backend', 'utils', 'xp_permissions.py')

/** The roles named in the server's XP_GUIDE_ROLES frozenset. */
function serverGuideRoles() {
  const src = readFileSync(XP_PERMISSIONS, 'utf8')
  const block = src.match(/XP_GUIDE_ROLES\s*=\s*frozenset\(\{([^}]*)\}\)/)
  if (!block) {
    throw new Error(
      'Could not find XP_GUIDE_ROLES in backend/utils/xp_permissions.py. If it ' +
      'was renamed or restructured, update this test — do not delete it; the ' +
      'whole point is that the two lists cannot be changed independently.')
  }
  return [...block[1].matchAll(/'([^']+)'/g)].map((m) => m[1]).sort()
}

describe('XP_GUIDE_ROLES matches the backend', () => {
  it('finds the server constant', () => {
    expect(serverGuideRoles().length).toBeGreaterThan(0)
  })

  it('is exactly the same set of roles', () => {
    expect([...XP_GUIDE_ROLES].sort()).toEqual(serverGuideRoles())
  })

  it('includes campus_coordinator, and only because the server does', () => {
    // This is what the guard was built for and it worked: the note here said
    // adding coordinators was the likely next change and to do it in
    // xp_permissions.py first. That happened on 2026-09-04, this test went red
    // pointing at the client list, and the client followed. Kept as a named
    // case because it is the entry most likely to be "tidied" back out.
    const server = serverGuideRoles()
    expect(server).toContain('campus_coordinator')
    expect(XP_GUIDE_ROLES).toContain('campus_coordinator')
  })
})
