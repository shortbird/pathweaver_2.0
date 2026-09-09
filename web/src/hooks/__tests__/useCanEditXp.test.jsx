import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import useCanEditXp from '../useCanEditXp'
import { AuthContext } from '../../contexts/AuthContext'
import { OrganizationContext } from '../../contexts/OrganizationContext'

const wrapperFor = (user, featureFlags) => ({ children }) => (
  <AuthContext.Provider value={{ user }}>
    <OrganizationContext.Provider value={{ organization: { id: 'org-1', feature_flags: featureFlags } }}>
      {children}
    </OrganizationContext.Provider>
  </AuthContext.Provider>
)

const canEdit = (user, featureFlags) =>
  renderHook(() => useCanEditXp(), { wrapper: wrapperFor(user, featureFlags) }).result.current

describe('useCanEditXp', () => {
  it('allows editing with no providers at all (platform default)', () => {
    expect(renderHook(() => useCanEditXp()).result.current).toBe(true)
  })

  it('allows editing when the org has not set the flag', () => {
    expect(canEdit({ role: 'org_managed', org_role: 'student' }, {})).toBe(true)
  })

  it('allows editing when the flag is explicitly false', () => {
    expect(canEdit({ role: 'org_managed', org_role: 'student' }, { lock_xp_editing: false })).toBe(true)
  })

  it('blocks org students when the flag is on', () => {
    expect(canEdit({ role: 'org_managed', org_role: 'student' }, { lock_xp_editing: true })).toBe(false)
  })

  it('blocks parents when the flag is on', () => {
    expect(canEdit({ role: 'parent' }, { lock_xp_editing: true })).toBe(false)
  })

  it.each(['advisor', 'org_admin'])('still allows %s when the flag is on', (orgRole) => {
    expect(canEdit({ role: 'org_managed', org_role: orgRole }, { lock_xp_editing: true })).toBe(true)
  })

  it('still allows superadmin when the flag is on', () => {
    expect(canEdit({ role: 'superadmin', org_role: null }, { lock_xp_editing: true })).toBe(true)
  })

  it('allows a teacher who is also a parent (multi-role org user)', () => {
    // org_roles is the real shape for iCreate staff; a primary-role check would
    // read org_role='parent' and wrongly hide the XP control from a teacher.
    expect(
      canEdit(
        { role: 'org_managed', org_role: 'parent', org_roles: ['parent', 'advisor'] },
        { lock_xp_editing: true }
      )
    ).toBe(true)
  })

  it('blocks a guardian flagged as advising students, because the server does', () => {
    // This asserted `true` until 2026-09-03, and it was the client disagreeing
    // with the server. has_advisor_assignments only means the user has rows in
    // advisor_student_assignments; it puts nothing into get_effective_roles, so
    // is_xp_guide_user says no and the save is refused. The old behaviour came
    // in with 70adf776, which reached for isStaffUser because it "additionally
    // covers guardians marked has_advisor_assignments" -- a bonus that was
    // never added to the server.
    //
    // Still refused after the 2026-09-04 widening, which added
    // campus_coordinator and nothing else: has_advisor_assignments is a count
    // of rows, not a role, so get_effective_roles never yields 'advisor' for
    // them and the save is rejected.
    expect(
      canEdit({ role: 'parent', has_advisor_assignments: true }, { lock_xp_editing: true })
    ).toBe(false)
  })

  it('allows a campus coordinator', () => {
    // Asserted false for one day. The drift was real -- the client was letting
    // coordinators through while the server refused them -- but the resolution
    // (2026-09-04) was to widen the SERVER, not narrow the client: a
    // coordinator has everything an org admin has minus the money, and XP is
    // not money. See XP_GUIDE_ROLES in backend/utils/xp_permissions.py.
    expect(
      canEdit(
        { role: 'org_managed', org_role: 'campus_coordinator', org_roles: ['campus_coordinator'] },
        { lock_xp_editing: true }
      )
    ).toBe(true)
  })

  it('still blocks a parent who only parents', () => {
    expect(
      canEdit(
        { role: 'org_managed', org_role: 'parent', org_roles: ['parent'] },
        { lock_xp_editing: true }
      )
    ).toBe(false)
  })
})
