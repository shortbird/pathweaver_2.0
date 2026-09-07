/**
 * The one place that answers "what role is this user, really".
 *
 * The rule now lives in `@shared/roles`, shared with the web app and
 * conformance tested against `backend/utils/roles.py` through
 * `shared/roleCases.json`. This module re-exports it so the ~five call sites
 * that already import from here do not all have to move at once, and so the
 * mobile-only notes below stay attached to it.
 *
 * WHAT CHANGED IN THE SHARE (2026-09-07): the copy that used to live here read
 * only the legacy `org_role` field. The server treats `org_roles` as taking
 * precedence, so an org user whose roles live only in that array resolved to
 * the literal string 'org_managed' here and to their real role everywhere
 * else. Latent rather than live — every org-managed user in prod carries
 * org_role — but it was one migration away from being real.
 *
 * Plain functions, not hooks, so non-React paths (landingRoute, authStore) can
 * share them. The superadmin preview shell (previewRoleStore) is deliberately
 * NOT handled here — only useIsObserver/useIsParent layer that on.
 */

export {
  effectiveRoleOf,
  effectiveRolesOf,
  userHasRole,
  VALID_ROLES,
  VALID_ORG_ROLES,
} from '@shared/roles';
export type { RoleShape } from '@shared/roles';
