/**
 * Partner organizations that use the simplified course-enrollment dashboard
 * (/onfire) instead of the full org-management dashboard.
 *
 * OnFire Learning sells one-off Optio course purchases to homeschool families.
 * Their org_admin only needs to (1) see active enrollments and (2) register new
 * students, so they get a focused two-tab page in place of the usual dashboard.
 */
export const ONFIRE_ORG_ID = '1c675e5e-b455-452e-94cb-5927a3a9f407'

export const SIMPLIFIED_PARTNER_ORG_IDS = [ONFIRE_ORG_ID]

export const isSimplifiedPartnerOrg = (orgId) =>
  !!orgId && SIMPLIFIED_PARTNER_ORG_IDS.includes(orgId)
