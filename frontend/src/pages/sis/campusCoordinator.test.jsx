import { describe, it, expect } from 'vitest'

/**
 * Campus coordinator chrome (iCreate, 2026-08-01: "we don't want the cc's to
 * have access to all the financial stuff").
 *
 * The backend's FINANCE_ROLES is the real gate; these helpers only decide what
 * the console renders. What they must get right is the overlap case: someone can
 * hold both org_admin and campus_coordinator, and the higher role has to win, or
 * making Kate a coordinator would silently take billing away from her.
 */

import { isSisAdmin, isCampusCoordinator, canSeeFinance, canSeeHr } from './sisRole'

const orgUser = (...roles) => ({ id: 'u1', role: 'org_managed', org_roles: roles })

describe('campus coordinator chrome', () => {
  it('gets the full console, like an admin', () => {
    expect(isSisAdmin(orgUser('campus_coordinator'))).toBe(true)
  })

  it('does not get the money pages', () => {
    expect(canSeeFinance(orgUser('campus_coordinator'))).toBe(false)
  })

  it('leaves an org admin with everything', () => {
    const admin = orgUser('org_admin')
    expect(isSisAdmin(admin)).toBe(true)
    expect(canSeeFinance(admin)).toBe(true)
    expect(isCampusCoordinator(admin)).toBe(false)
  })

  it('keeps finance for someone who is BOTH admin and coordinator', () => {
    const both = orgUser('campus_coordinator', 'org_admin')
    expect(isCampusCoordinator(both)).toBe(false)
    expect(canSeeFinance(both)).toBe(true)
  })

  it('keeps finance for a superadmin', () => {
    const su = { id: 'u1', role: 'superadmin' }
    expect(canSeeFinance(su)).toBe(true)
    expect(isCampusCoordinator(su)).toBe(false)
  })

  it('leaves teachers on the teacher portal', () => {
    const teacher = orgUser('advisor')
    expect(isSisAdmin(teacher)).toBe(false)
    expect(isCampusCoordinator(teacher)).toBe(false)
    expect(canSeeFinance(teacher)).toBe(false)
  })

  it('reads the legacy single org_role field too', () => {
    const legacy = { id: 'u1', role: 'org_managed', org_role: 'campus_coordinator' }
    expect(isSisAdmin(legacy)).toBe(true)
    expect(canSeeFinance(legacy)).toBe(false)
  })

  it('denies finance access to campus coordinator even if user.is_org_admin is true', () => {
    const userWithFlag = { id: 'u1', role: 'org_managed', org_role: 'campus_coordinator', org_roles: ['campus_coordinator'], is_org_admin: true }
    expect(isSisAdmin(userWithFlag)).toBe(true)
    expect(isCampusCoordinator(userWithFlag)).toBe(true)
    expect(canSeeFinance(userWithFlag)).toBe(false)
  })

  it('treats a signed-out visitor as nothing at all', () => {
    expect(isSisAdmin(null)).toBe(false)
    expect(isCampusCoordinator(null)).toBe(false)
    expect(canSeeFinance(null)).toBe(false)
    expect(canSeeHr(null)).toBe(false)
  })

  it('does not get the HR store (contracts, background checks)', () => {
    // iCreate requirements 2026-08-09: coordinators see operational info, not
    // employment paperwork. Same membership as finance today, separate helper
    // so neither gate can be widened on the other's behalf.
    expect(canSeeHr(orgUser('campus_coordinator'))).toBe(false)
    expect(canSeeHr(orgUser('org_admin'))).toBe(true)
    expect(canSeeHr(orgUser('campus_coordinator', 'org_admin'))).toBe(true)
    expect(canSeeHr({ id: 'u1', role: 'superadmin' })).toBe(true)
  })
})
