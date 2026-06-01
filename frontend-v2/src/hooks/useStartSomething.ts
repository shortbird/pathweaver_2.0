/**
 * useStartSomething - the role-aware "Optio button" action, in one place.
 *
 * The center tab button (the Optio logo) opens a different "start something"
 * flow per role. This hook encapsulates that mapping so other affordances (the
 * Home/dashboard FAB, empty-state CTAs, etc.) trigger the exact same thing
 * instead of each re-deciding:
 *   - observer -> post a bounty (their only authoring action)
 *   - parent   -> parent action sheet (capture / invite observer / add kid / bounty)
 *   - everyone else (student, superadmin) -> student "Start something new" sheet
 *
 * The sheets themselves are owned by the headless hosts (StartSomethingFab /
 * ParentStartSomethingFab) mounted in (tabs)/_layout.tsx; this hook just flips
 * the matching store open (or navigates, for observers).
 */
import { useCallback } from 'react';
import { router } from 'expo-router';
import { useAuthStore } from '@/src/stores/authStore';
import { usePreviewRoleStore } from '@/src/stores/previewRoleStore';
import { useStartSomethingStore } from '@/src/stores/startSomethingStore';
import { useParentStartSomethingStore } from '@/src/stores/parentStartSomethingStore';

export function useIsObserver(): boolean {
  const user = useAuthStore((s) => s.user);
  const previewRole = usePreviewRoleStore((s) => s.previewRole);
  // Superadmin can preview other role shells without swapping tokens.
  if (user?.role === 'superadmin' && previewRole) return previewRole === 'observer';
  if (!user) return false;
  const role = user.org_role && user.role === 'org_managed' ? user.org_role : user.role;
  return role === 'observer';
}

export function useIsParent(): boolean {
  const user = useAuthStore((s) => s.user);
  const previewRole = usePreviewRoleStore((s) => s.previewRole);
  if (user?.role === 'superadmin' && previewRole) return previewRole === 'parent';
  if (!user) return false;
  const role = user.org_role && user.role === 'org_managed' ? user.org_role : user.role;
  return (
    role === 'parent' ||
    (user as any).has_dependents === true ||
    (user as any).has_linked_students === true
  );
}

/** Returns a callback that runs the role-appropriate "start something" action. */
export function useStartSomething(): () => void {
  const isObserver = useIsObserver();
  const isParent = useIsParent();
  const openParent = useParentStartSomethingStore((s) => s.open);
  const openStudent = useStartSomethingStore((s) => s.open);

  return useCallback(() => {
    if (isObserver) {
      router.push('/(app)/bounties/create' as any);
      return;
    }
    if (isParent) {
      openParent();
      return;
    }
    openStudent();
  }, [isObserver, isParent, openParent, openStudent]);
}
