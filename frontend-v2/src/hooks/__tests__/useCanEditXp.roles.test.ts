/**
 * Guard: the mobile XP_GUIDE_ROLES matches the server's.
 *
 * The mobile list happened to be right when the web one drifted (see
 * frontend/src/hooks/__tests__/useCanEditXp.roles.test.jsx for that story), and
 * "happened to be right" is not a property worth relying on. Both clients now
 * read the server's constant in a test rather than trusting a copy.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

import { XP_GUIDE_ROLES } from '../useCanEditXp';

const XP_PERMISSIONS = join(
  __dirname, '..', '..', '..', '..', 'backend', 'utils', 'xp_permissions.py');

function serverGuideRoles(): string[] {
  const src = readFileSync(XP_PERMISSIONS, 'utf8');
  const block = src.match(/XP_GUIDE_ROLES\s*=\s*frozenset\(\{([^}]*)\}\)/);
  if (!block) {
    throw new Error(
      'Could not find XP_GUIDE_ROLES in backend/utils/xp_permissions.py. If it ' +
      'moved, update this test rather than deleting it: the point is that the ' +
      'client list cannot change without the server list changing.');
  }
  return [...block[1].matchAll(/'([^']+)'/g)].map((m) => m[1]).sort();
}

describe('XP_GUIDE_ROLES matches the backend', () => {
  it('finds the server constant', () => {
    expect(serverGuideRoles().length).toBeGreaterThan(0);
  });

  it('is exactly the same set of roles', () => {
    expect([...XP_GUIDE_ROLES].sort()).toEqual(serverGuideRoles());
  });
});
