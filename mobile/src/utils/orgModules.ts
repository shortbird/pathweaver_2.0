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

/**
 * Is this module KNOWN to be off for the org? False when we cannot tell.
 *
 * For skipping a request the backend module gate would 404 (MODULE_ENFORCEMENT,
 * backend/modules/gate.py). Mirrors web moduleKnownOff: it is not
 * orgHasModule() negated. A payload without `effective_modules` answers false
 * here, because hiding a live feature is far worse than the speculative
 * request this exists to avoid; only a list that genuinely omits the key
 * suppresses the call.
 */
export function moduleKnownOff(org: OrgLike, key: string): boolean {
  return Boolean(org && Array.isArray(org.effective_modules) && !org.effective_modules.includes(key));
}

/**
 * The same question, asked of a school hub row (/api/sis/school/context).
 *
 * A parent usually has no `organization` of their own (they belong to the
 * school through their children), so the hub row's `modules` is the only
 * module list that reaches them. It is the FAMILY-surface slice of the org's
 * modules (sis_parent_service._hub_org_entry), so ask it only about family
 * keys (community, calendar, resources, attendance, classes, ...): a console
 * key is missing from it whether it is on or not. Null `modules` (the server
 * could not read the org) and a null row both mean "cannot tell".
 */
export function schoolModuleKnownOff(
  org: { modules?: string[] | null } | null | undefined,
  key: string,
): boolean {
  return Boolean(org && Array.isArray(org.modules) && !org.modules.includes(key));
}
