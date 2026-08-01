/**
 * useCanEditXp — the org-level "only teachers set XP" gate on mobile.
 */

import { renderHook, act } from '@testing-library/react-native';
import { useCanEditXp } from '../useCanEditXp';
import { useAuthStore } from '@/src/stores/authStore';

const setUser = (user: any) => {
  act(() => {
    useAuthStore.setState({ user, isAuthenticated: !!user, isLoading: false });
  });
};

const orgWith = (flags: Record<string, any>) => ({ id: 'org-1', feature_flags: flags });

describe('useCanEditXp', () => {
  afterEach(() => setUser(null));

  it('allows editing when there is no user', () => {
    setUser(null);
    expect(renderHook(() => useCanEditXp()).result.current).toBe(true);
  });

  it('allows editing for a platform user with no organization', () => {
    setUser({ role: 'student', org_role: null, organization: null });
    expect(renderHook(() => useCanEditXp()).result.current).toBe(true);
  });

  it('allows editing when the org has not set the flag', () => {
    setUser({ role: 'org_managed', org_role: 'student', organization: orgWith({}) });
    expect(renderHook(() => useCanEditXp()).result.current).toBe(true);
  });

  it('blocks an org student when the flag is on', () => {
    setUser({
      role: 'org_managed',
      org_role: 'student',
      organization: orgWith({ lock_xp_editing: true }),
    });
    expect(renderHook(() => useCanEditXp()).result.current).toBe(false);
  });

  it.each(['advisor', 'org_admin'])('still allows %s when the flag is on', (orgRole) => {
    setUser({
      role: 'org_managed',
      org_role: orgRole,
      organization: orgWith({ lock_xp_editing: true }),
    });
    expect(renderHook(() => useCanEditXp()).result.current).toBe(true);
  });

  it('still allows superadmin when the flag is on', () => {
    setUser({
      role: 'superadmin',
      org_role: null,
      organization: orgWith({ lock_xp_editing: true }),
    });
    expect(renderHook(() => useCanEditXp()).result.current).toBe(true);
  });

  it('allows a teacher who is also a parent (multi-role org user)', () => {
    // A primary-role check would read org_role='parent' and wrongly hide the
    // XP control from someone who actually teaches.
    setUser({
      role: 'org_managed',
      org_role: 'parent',
      org_roles: ['parent', 'advisor'],
      organization: orgWith({ lock_xp_editing: true }),
    });
    expect(renderHook(() => useCanEditXp()).result.current).toBe(true);
  });

  it('still blocks a parent who only parents', () => {
    setUser({
      role: 'org_managed',
      org_role: 'parent',
      org_roles: ['parent'],
      organization: orgWith({ lock_xp_editing: true }),
    });
    expect(renderHook(() => useCanEditXp()).result.current).toBe(false);
  });
});
