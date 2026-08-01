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
})
