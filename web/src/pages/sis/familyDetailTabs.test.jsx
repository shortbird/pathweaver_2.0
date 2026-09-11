import { describe, it, expect } from 'vitest'

/**
 * The family drawer's Billing tab is finance-only.
 *
 * OPTIO-WEB-11 (2026-09-08, two campus coordinators): the drawer offered
 * Billing to everyone, and /api/sis/households/<id>/billing is FINANCE_ROLES,
 * so a coordinator clicking it got a 403, a "Could not load billing" toast and
 * a Sentry error -- against a backend that was refusing exactly what the role
 * exists to withhold. The tab list now follows canSeeFinance, the same gate the
 * sidebar and the staff modal use.
 */

import { familyTabsFor } from './FamilyDetailModal'

const orgUser = (...roles) => ({ id: 'u1', role: 'org_managed', org_roles: roles })
const keys = (user) => familyTabsFor(user).map((t) => t.key)

describe('family drawer tabs', () => {
  it('does not offer Billing to a campus coordinator', () => {
    expect(keys(orgUser('campus_coordinator'))).toEqual([
      'family', 'details', 'contacts', 'registration',
    ])
  })

  it('offers Billing to an org admin', () => {
    expect(keys(orgUser('org_admin'))).toContain('billing')
  })

  it('offers Billing to a superadmin', () => {
    expect(keys({ id: 'u1', role: 'superadmin' })).toContain('billing')
  })

  it('keeps Billing for someone who is BOTH coordinator and admin', () => {
    expect(keys(orgUser('campus_coordinator', 'org_admin'))).toContain('billing')
  })

  it('withholds only Billing -- the operational tabs stay', () => {
    const cc = keys(orgUser('campus_coordinator'))
    const admin = keys(orgUser('org_admin'))
    expect(admin.filter((k) => k !== 'billing')).toEqual(cc)
  })
})
