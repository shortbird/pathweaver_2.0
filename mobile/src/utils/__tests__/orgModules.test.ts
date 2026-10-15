/**
 * orgHasModule / userInSisOrg: every org is an SIS org since 2026-10-15.
 * The server's effective_modules list is the answer when present; without it
 * any org answers 'sis' true (unless an explicit modules.sis=false says no),
 * and a user with no org (a platform user) is never in an SIS org.
 */
import { orgHasModule, userInSisOrg } from '../orgModules';

describe('orgHasModule', () => {
  it('reads the server list when the payload carries it', () => {
    expect(orgHasModule({ effective_modules: ['sis', 'quests'] }, 'sis')).toBe(true);
    expect(orgHasModule({ effective_modules: ['quests'] }, 'sis')).toBe(false);
  });

  it('answers sis true for an org with no flags at all', () => {
    expect(orgHasModule({ feature_flags: {} }, 'sis')).toBe(true);
    expect(orgHasModule({ feature_flags: null }, 'sis')).toBe(true);
  });

  it('no longer reads the retired sis_enabled flag', () => {
    expect(orgHasModule({ feature_flags: { sis_enabled: false } }, 'sis')).toBe(true);
  });

  it('lets an explicit modules.sis=false still win', () => {
    expect(orgHasModule({ feature_flags: { modules: { sis: false } } }, 'sis')).toBe(false);
  });

  it('answers false with no org', () => {
    expect(orgHasModule(null, 'sis')).toBe(false);
    expect(orgHasModule(undefined, 'sis')).toBe(false);
  });
});

describe('userInSisOrg', () => {
  it('is true for any org member and false for a platform user', () => {
    expect(userInSisOrg({ organization: { feature_flags: {} } } as any)).toBe(true);
    expect(userInSisOrg({ organization: null } as any)).toBe(false);
    expect(userInSisOrg(null)).toBe(false);
  });
});
