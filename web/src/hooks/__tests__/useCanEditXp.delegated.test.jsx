/**
 * In family scope, "may this person set XP?" is a question about the CHILD's
 * school. The contexts describe the signed-in parent, so the hook answered for
 * the wrong school until 2026-09-25: a platform parent (no org, XP editable)
 * working as a child at a school that locks XP was shown a picker the server
 * then refused. Delegated, the server's can_edit_xp is the answer.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import useCanEditXp from '../useCanEditXp'
import api from '../../services/api'
import { AuthContext } from '../../contexts/AuthContext'
import { OrganizationContext } from '../../contexts/OrganizationContext'
import FamilyScopeContext from '../../contexts/FamilyScopeContext'

vi.mock('../../services/api', () => ({ default: { get: vi.fn(), post: vi.fn() } }))

const scopeFor = (childId) => ({
  hasFamily: true,
  children: [],
  isLoading: false,
  selectedChild: childId ? { id: childId, firstName: 'Kid' } : null,
  selectedChildId: childId,
  isScoped: !!childId,
  enterScope: () => {},
  exitScope: () => {},
})

const wrapperFor = ({ user, featureFlags = {}, childId }) => {
  const Wrapper = ({ children }) => (
    <AuthContext.Provider value={{ user }}>
      <OrganizationContext.Provider value={{ organization: { id: 'org-1', feature_flags: featureFlags } }}>
        <FamilyScopeContext.Provider value={scopeFor(childId)}>
          {children}
        </FamilyScopeContext.Provider>
      </OrganizationContext.Provider>
    </AuthContext.Provider>
  )
  return Wrapper
}

beforeEach(() => vi.clearAllMocks())

describe('useCanEditXp in family scope', () => {
  it("follows the child's school when it locks XP, even though the parent's does not", async () => {
    api.get.mockResolvedValue({ data: { success: true, requires_success_criteria: false, can_edit_xp: false } })
    const { result } = renderHook(() => useCanEditXp(), {
      wrapper: wrapperFor({ user: { role: 'parent' }, childId: 'child-1' }),
    })

    await waitFor(() => expect(result.current).toBe(false))
    expect(api.get).toHaveBeenCalledWith('/api/tasks/authoring-rules', {
      params: { student_id: 'child-1' },
    })
  })

  it("follows the child's school when it allows XP, even though the parent's locks it", async () => {
    api.get.mockResolvedValue({ data: { success: true, requires_success_criteria: false, can_edit_xp: true } })
    const { result } = renderHook(() => useCanEditXp(), {
      wrapper: wrapperFor({
        user: { role: 'org_managed', org_role: 'parent', org_roles: ['parent'] },
        featureFlags: { lock_xp_editing: true },
        childId: 'child-1',
      }),
    })

    // Before the answer arrives: the parent's own context (locked -> false).
    expect(result.current).toBe(false)
    await waitFor(() => expect(result.current).toBe(true))
  })

  it('falls back to the context answer when the rules request fails', async () => {
    api.get.mockRejectedValue(new Error('offline'))
    const { result } = renderHook(() => useCanEditXp(), {
      wrapper: wrapperFor({ user: { role: 'parent' }, childId: 'child-1' }),
    })
    await waitFor(() => expect(api.get).toHaveBeenCalled())
    expect(result.current).toBe(true)
  })

  it('does not ask the server when nobody is delegated', () => {
    const { result } = renderHook(() => useCanEditXp(), {
      wrapper: wrapperFor({ user: { role: 'parent' }, featureFlags: { lock_xp_editing: true }, childId: null }),
    })
    expect(result.current).toBe(false)
    expect(api.get).not.toHaveBeenCalled()
  })
})
