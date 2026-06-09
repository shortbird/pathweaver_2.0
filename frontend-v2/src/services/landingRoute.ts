/**
 * Where a freshly-authenticated user should land.
 *
 * Parents must open onto the Family tab — not the student Home/dashboard, which
 * is meaningless for them (bug reports: "Parents should never see this home
 * page", "Parent accounts should go to the family tab when the app is opened").
 *
 * Kept as plain functions (not hooks) so the non-React OAuth code paths in
 * authStore can use the same logic as the index redirect. Mirrors the role
 * derivation in `useIsParent` (org_managed users carry their real role in
 * `org_role`), minus the superadmin preview shell, which doesn't apply at launch.
 */
import type { User } from '@/src/stores/authStore';

export function isParentUser(user: User | null | undefined): boolean {
  if (!user) return false;
  const role = user.org_role && user.role === 'org_managed' ? user.org_role : user.role;
  return (
    role === 'parent' ||
    (user as any).has_dependents === true ||
    (user as any).has_linked_students === true
  );
}

/** expo-router href for the user's home tab. */
export function landingRouteForUser(user: User | null | undefined): string {
  // Superadmins default into the Student preview shell (see previewRoleStore),
  // so they land on the student dashboard even if the account has dependents.
  if (user?.role === 'superadmin') return '/(app)/(tabs)/dashboard';
  return isParentUser(user) ? '/(app)/(tabs)/family' : '/(app)/(tabs)/dashboard';
}
