/**
 * Partner organizations that use the simplified course-enrollment dashboard
 * (/onfire) instead of the full org-management dashboard.
 *
 * OnFire Learning sells one-off Optio course purchases to homeschool families.
 * Their org_admin only needs to (1) see active enrollments and (2) register new
 * students, so they get a focused two-tab page in place of the usual dashboard.
 *
 * Blocks P4: this is a per-org flag now — `feature_flags.simplified_partner_dashboard`
 * on the org row (/me embeds it for members). The hardcoded id below is the
 * transition fallback until the flag is set on OnFire's row
 * (docs/blocks/P4_NOTES.md). Delete it once that write has shipped.
 */
export const ONFIRE_ORG_ID = '1c675e5e-b455-452e-94cb-5927a3a9f407'

export const SIMPLIFIED_PARTNER_ORG_IDS = [ONFIRE_ORG_ID]

/** Legacy fallback, by org id only. */
export const isSimplifiedPartnerOrg = (orgId) =>
  !!orgId && SIMPLIFIED_PARTNER_ORG_IDS.includes(orgId)

/** The real question: does this user's org run the simplified dashboard? */
export const usesSimplifiedPartnerDashboard = (user) =>
  Boolean(user?.organization?.feature_flags?.simplified_partner_dashboard)
  || isSimplifiedPartnerOrg(user?.organization_id)
