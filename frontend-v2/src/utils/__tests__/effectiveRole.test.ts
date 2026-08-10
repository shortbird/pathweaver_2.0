/**
 * effectiveRole — the one place that answers "what role is this user, really".
 *
 * Org-managed users carry their actual role in org_role (and possibly several
 * in org_roles); platform users carry it in role. Five call sites used to
 * re-derive this independently; these tests pin the shared behavior they all
 * relied on.
 */

import { effectiveRoleOf, userHasRole } from '../effectiveRole';

describe('effectiveRoleOf', () => {
  it('returns null for no user', () => {
    expect(effectiveRoleOf(null)).toBeNull();
    expect(effectiveRoleOf(undefined)).toBeNull();
  });

  it('returns the platform role for a platform user', () => {
    expect(effectiveRoleOf({ role: 'student', org_role: null } as any)).toBe('student');
    expect(effectiveRoleOf({ role: 'parent', org_role: null } as any)).toBe('parent');
    expect(effectiveRoleOf({ role: 'superadmin', org_role: null } as any)).toBe('superadmin');
  });

  it('returns org_role for an org_managed user', () => {
    expect(effectiveRoleOf({ role: 'org_managed', org_role: 'student' } as any)).toBe('student');
    expect(effectiveRoleOf({ role: 'org_managed', org_role: 'org_admin' } as any)).toBe('org_admin');
  });

  it('does not let org_role shadow a real platform role', () => {
    // Only org_managed users defer to org_role — a platform parent with a
    // stray org_role stays a parent.
    expect(effectiveRoleOf({ role: 'parent', org_role: 'student' } as any)).toBe('parent');
  });

  it('falls back to role when an org_managed user has no org_role', () => {
    expect(effectiveRoleOf({ role: 'org_managed', org_role: null } as any)).toBe('org_managed');
  });
});

describe('userHasRole', () => {
  it('is false for no user', () => {
    expect(userHasRole(null, 'advisor')).toBe(false);
  });

  it('matches the platform role', () => {
    expect(userHasRole({ role: 'superadmin' } as any, 'superadmin', 'org_admin')).toBe(true);
    expect(userHasRole({ role: 'student' } as any, 'superadmin', 'org_admin')).toBe(false);
  });

  it('matches the legacy org_role', () => {
    expect(userHasRole({ role: 'org_managed', org_role: 'advisor' } as any, 'advisor')).toBe(true);
  });

  it('matches any entry of the org_roles array (multi-role org users)', () => {
    // A teacher who is also a parent: primary org_role is parent, advisor
    // rides in org_roles. A primary-role check would miss them.
    const user = { role: 'org_managed', org_role: 'parent', org_roles: ['parent', 'advisor'] } as any;
    expect(userHasRole(user, 'advisor')).toBe(true);
    expect(userHasRole(user, 'org_admin')).toBe(false);
  });

  it('ignores a non-array org_roles', () => {
    expect(userHasRole({ role: 'student', org_roles: 'advisor' } as any, 'advisor')).toBe(false);
  });
});
