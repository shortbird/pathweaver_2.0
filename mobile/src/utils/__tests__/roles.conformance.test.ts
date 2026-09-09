import cases from '@shared/roleCases.json';

import {
  effectiveRoleOf,
  effectiveRolesOf,
  userHasRole,
  VALID_ROLES,
  VALID_ORG_ROLES,
} from '../effectiveRole';

/**
 * The mobile half of the role conformance (QF-01).
 *
 * This is the side the corpus was written for. Until 2026-09-07 this app
 * resolved an org-managed user by reading `org_role` alone and ignoring
 * `org_roles`, where the server treats the array as taking precedence -- so a
 * user whose roles lived only in the array would have resolved to the literal
 * string 'org_managed' on a phone and to their real role on the web and on the
 * server. Every org-managed account in prod carries org_role, so it was latent;
 * it was also one migration away from being real.
 *
 * Imports through `../effectiveRole` on purpose, not straight from @shared: the
 * thing worth protecting is what the app's own modules get.
 */

describe('role resolution conforms to the server', () => {
  it('is testing something', () => {
    expect(cases.cases.length).toBeGreaterThanOrEqual(15);
  });

  it('knows the same role vocabulary as UserRole/OrgRole', () => {
    expect([...VALID_ROLES].sort()).toEqual(cases.validRoles);
    expect([...VALID_ORG_ROLES].sort()).toEqual(cases.validOrgRoles);
    expect(VALID_ORG_ROLES).toContain('campus_coordinator');
    expect(VALID_ROLES).not.toContain('campus_coordinator');
  });

  it.each(cases.cases.map((c) => [c.why, c] as const))(
    'effectiveRoleOf: %s',
    (_why, c) => {
      expect(effectiveRoleOf(c.user)).toBe(c.effectiveRole);
    },
  );

  it.each(cases.cases.map((c) => [c.why, c] as const))(
    'effectiveRolesOf: %s',
    (_why, c) => {
      expect(effectiveRolesOf(c.user)).toEqual(c.effectiveRoles);
    },
  );

  it('answers null for no user rather than calling them a student', () => {
    expect(effectiveRoleOf(null)).toBeNull();
    expect(effectiveRoleOf(undefined)).toBeNull();
    expect(effectiveRolesOf(null)).toEqual([]);
  });

  it('userHasRole reads all three shapes a role arrives in', () => {
    expect(userHasRole({ role: 'advisor' }, 'advisor')).toBe(true);
    expect(userHasRole({ role: 'org_managed', org_role: 'advisor' }, 'advisor')).toBe(true);
    expect(userHasRole({ role: 'org_managed', org_roles: ['parent', 'advisor'] }, 'advisor')).toBe(true);
    expect(userHasRole({ role: 'org_managed', org_roles: ['parent'] }, 'advisor')).toBe(false);
    expect(userHasRole(null, 'advisor')).toBe(false);
    // Variadic: any of the listed roles is a match.
    expect(userHasRole({ role: 'org_managed', org_role: 'parent' }, 'advisor', 'parent')).toBe(true);
  });
});
