/**
 * Which building blocks the user's organization has switched on.
 *
 * /api/auth/me embeds `organization` with its server-computed
 * `effective_modules` (ARCHITECTURE_BLOCKS 4.1). Every org is an SIS org
 * (2026-10-15), so a payload built before that list existed still answers
 * 'sis' true for any org; `feature_flags.sis_enabled` is no longer read. A
 * platform user with no organization has only the core modules, so every
 * add-on answers false for them.
 */
import type { User } from '@/src/types/user';

type OrgLike = {
  effective_modules?: string[] | null;
  feature_flags?: Record<string, any> | null;
} | null | undefined;

export function orgHasModule(org: OrgLike, key: string): boolean {
  if (!org) return false;
  if (Array.isArray(org.effective_modules)) return org.effective_modules.includes(key);
  // An explicit modules.sis entry still wins, as on the backend.
  if (key === 'sis') return org.feature_flags?.modules?.sis !== false;
  return false;
}

/**
 * Is this user's organization on the SIS console? A school there manages
 * its own roster: children arrive through registration and the office, not
 * through a parent's "Add a child" in the app (a child added that way lands
 * outside the family's household).
 */
export function userInSisOrg(user: Pick<User, 'organization'> | null | undefined): boolean {
  return orgHasModule((user as any)?.organization, 'sis');
}
